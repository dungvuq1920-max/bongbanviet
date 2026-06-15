
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Subtitle Translator Pro
- GUI kéo thả file/folder .srt
- Dịch hàng loạt Trung -> Việt
- Giữ nguyên timecode / index / định dạng SRT
- Dịch theo batch + chạy song song để tăng tốc
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import queue
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import srt
from dotenv import load_dotenv
from openai import OpenAI

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore
    DND_AVAILABLE = True
except Exception:
    DND_AVAILABLE = False
    TkinterDnD = tk.Tk  # type: ignore
    DND_FILES = None


APP_TITLE = "Subtitle Translator Pro"
DEFAULT_MODEL = "gpt-5-mini"
DEFAULT_BATCH_SIZE = 100
DEFAULT_WORKERS = 8
OUTPUT_SUFFIX = "_vi"
SUPPORTED_EXTENSIONS = {".srt"}


@dataclass
class AppConfig:
    api_key: str
    model: str
    batch_size: int
    workers: int
    output_dir: Path
    source_lang: str = "tiếng Trung"
    target_lang: str = "tiếng Việt"


def parse_json_array(text: str) -> list[str]:
    text = text.strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return [str(x) for x in data]
    except Exception:
        pass

    match = re.search(r"(\[[\s\S]*\])", text)
    if match:
        data = json.loads(match.group(1))
        if isinstance(data, list):
            return [str(x) for x in data]

    raise ValueError("Không parse được JSON array từ phản hồi mô hình.")


class SubtitleTranslator:
    def __init__(self, config: AppConfig, log: Callable[[str], None]):
        self.config = config
        self.log = log
        self.client = OpenAI(api_key=config.api_key)

    def _build_prompt(self, texts: list[str]) -> str:
        payload = [
            {"id": i + 1, "text": text}
            for i, text in enumerate(texts)
        ]
        return f"""
Bạn là công cụ dịch subtitle chuyên nghiệp.

Hãy dịch danh sách subtitle từ {self.config.source_lang} sang {self.config.target_lang}.

Yêu cầu bắt buộc:
- Giữ nguyên ý nghĩa tự nhiên, dễ đọc, phù hợp subtitle video.
- Không thêm chú thích, không giải thích.
- Không thêm số thứ tự.
- Không đổi số lượng phần tử.
- Nếu text có xuống dòng, cố gắng giữ xuống dòng tự nhiên khi phù hợp.
- Chỉ trả về JSON array của string.
- Mỗi phần tử đầu ra tương ứng đúng vị trí với đầu vào.

Đầu vào:
{json.dumps(payload, ensure_ascii=False)}

Chỉ trả về JSON array như ví dụ:
["câu 1", "câu 2"]
""".strip()

    def _translate_batch_once(self, texts: list[str]) -> list[str]:
        response = self.client.responses.create(
            model=self.config.model,
            input=self._build_prompt(texts),
        )
        output_text = getattr(response, "output_text", "") or ""
        translated = parse_json_array(output_text)
        if len(translated) != len(texts):
            raise ValueError(
                f"Số lượng câu trả về không khớp. input={len(texts)}, output={len(translated)}"
            )
        return translated

    def translate_batch(self, texts: list[str], retries: int = 3) -> list[str]:
        last_error = None
        for attempt in range(1, retries + 1):
            try:
                return self._translate_batch_once(texts)
            except Exception as exc:
                last_error = exc
                self.log(f"  ↳ Retry {attempt}/{retries} vì lỗi batch: {exc}")
                time.sleep(0.8 * attempt)

        self.log("  ↳ Fallback dịch từng dòng do batch lỗi.")
        translated: list[str] = []
        for text in texts:
            try:
                translated.append(self._translate_batch_once([text])[0])
            except Exception:
                translated.append(text)
        if last_error:
            self.log(f"  ↳ Đã fallback xong. Lỗi gốc: {last_error}")
        return translated

    def translate_srt_file(self, input_path: Path, output_path: Path) -> None:
        self.log(f"\n▶ Đang dịch: {input_path}")
        content = input_path.read_text(encoding="utf-8-sig")
        subtitles = list(srt.parse(content))

        if not subtitles:
            self.log("  ↳ File rỗng hoặc không parse được subtitle.")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(content, encoding="utf-8")
            return

        batches: list[tuple[int, list[srt.Subtitle]]] = []
        for start in range(0, len(subtitles), self.config.batch_size):
            batch = subtitles[start:start + self.config.batch_size]
            batches.append((start, batch))

        results: dict[int, list[str]] = {}
        lock = threading.Lock()

        def worker(start_index: int, batch_subs: list[srt.Subtitle]) -> tuple[int, list[str]]:
            texts = [sub.content for sub in batch_subs]
            translated = self.translate_batch(texts)
            with lock:
                self.log(f"  ↳ Batch {start_index + 1}-{start_index + len(batch_subs)} xong")
            return start_index, translated

        max_workers = max(1, self.config.workers)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(worker, start, batch): (start, batch)
                for start, batch in batches
            }
            for future in concurrent.futures.as_completed(future_map):
                start, _batch = future_map[future]
                batch_start, translated = future.result()
                results[batch_start] = translated

        translated_subs: list[srt.Subtitle] = []
        for start, batch in batches:
            translated_texts = results[start]
            for sub, new_text in zip(batch, translated_texts):
                translated_subs.append(
                    srt.Subtitle(
                        index=sub.index,
                        start=sub.start,
                        end=sub.end,
                        content=new_text,
                        proprietary=sub.proprietary,
                    )
                )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(srt.compose(translated_subs), encoding="utf-8")
        self.log(f"✅ Xong: {output_path}")


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1100x760")
        self.root.minsize(980, 680)

        load_dotenv()

        self.items: list[Path] = []
        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.running = False

        self.api_key_var = tk.StringVar(value=os.getenv("OPENAI_API_KEY", ""))
        self.model_var = tk.StringVar(value=DEFAULT_MODEL)
        self.batch_var = tk.StringVar(value=str(DEFAULT_BATCH_SIZE))
        self.workers_var = tk.StringVar(value=str(DEFAULT_WORKERS))
        self.output_var = tk.StringVar(value=str((Path.cwd() / "translated_output").resolve()))
        self.status_var = tk.StringVar(value="Sẵn sàng.")
        self.progress_var = tk.DoubleVar(value=0.0)

        self._build_ui()
        self._poll_log_queue()

    def _build_ui(self) -> None:
        container = ttk.Frame(self.root, padding=12)
        container.pack(fill="both", expand=True)

        top = ttk.Frame(container)
        top.pack(fill="x")

        ttk.Label(top, text="Subtitle Translator Pro", font=("Segoe UI", 18, "bold")).pack(anchor="w")
        sub = "GUI kéo thả .srt • Dịch cả folder • Batch + song song để tăng tốc"
        ttk.Label(top, text=sub).pack(anchor="w", pady=(2, 10))

        config_frame = ttk.LabelFrame(container, text="Cấu hình", padding=10)
        config_frame.pack(fill="x")

        self._row_entry(config_frame, 0, "OpenAI API Key", self.api_key_var, show="*")
        self._row_entry(config_frame, 1, "Model", self.model_var)
        self._row_entry(config_frame, 2, "Batch size", self.batch_var)
        self._row_entry(config_frame, 3, "Workers", self.workers_var)

        out_row = ttk.Frame(config_frame)
        out_row.grid(row=4, column=0, columnspan=3, sticky="ew", pady=6)
        out_row.columnconfigure(1, weight=1)
        ttk.Label(out_row, text="Output folder", width=18).grid(row=0, column=0, sticky="w")
        ttk.Entry(out_row, textvariable=self.output_var).grid(row=0, column=1, sticky="ew", padx=(8, 8))
        ttk.Button(out_row, text="Chọn...", command=self.choose_output_dir).grid(row=0, column=2)

        actions = ttk.Frame(container)
        actions.pack(fill="x", pady=(10, 10))
        ttk.Button(actions, text="Thêm file .srt", command=self.add_files).pack(side="left")
        ttk.Button(actions, text="Thêm folder", command=self.add_folder).pack(side="left", padx=6)
        ttk.Button(actions, text="Xóa danh sách", command=self.clear_items).pack(side="left", padx=6)
        ttk.Button(actions, text="Bắt đầu dịch", command=self.start_translate).pack(side="right")

        middle = ttk.PanedWindow(container, orient="horizontal")
        middle.pack(fill="both", expand=True)

        left = ttk.LabelFrame(middle, text="File / Folder đầu vào", padding=8)
        middle.add(left, weight=1)

        right = ttk.LabelFrame(middle, text="Log xử lý", padding=8)
        middle.add(right, weight=1)

        hint = "Kéo thả file hoặc folder vào đây"
        if not DND_AVAILABLE:
            hint += " (cần cài tkinterdnd2 để bật drag & drop)"
        ttk.Label(left, text=hint).pack(anchor="w", pady=(0, 6))

        list_frame = ttk.Frame(left)
        list_frame.pack(fill="both", expand=True)

        self.listbox = tk.Listbox(list_frame, selectmode="extended")
        self.listbox.pack(side="left", fill="both", expand=True)

        sb = ttk.Scrollbar(list_frame, orient="vertical", command=self.listbox.yview)
        sb.pack(side="right", fill="y")
        self.listbox.configure(yscrollcommand=sb.set)

        if DND_AVAILABLE:
            self.listbox.drop_target_register(DND_FILES)  # type: ignore[arg-type]
            self.listbox.dnd_bind("<<Drop>>", self.on_drop)  # type: ignore[attr-defined]

        self.log_text = tk.Text(right, wrap="word", height=20)
        self.log_text.pack(fill="both", expand=True)
        self.log_text.configure(state="disabled")

        bottom = ttk.Frame(container)
        bottom.pack(fill="x", pady=(10, 0))
        ttk.Progressbar(bottom, variable=self.progress_var, maximum=100).pack(fill="x")
        ttk.Label(bottom, textvariable=self.status_var).pack(anchor="w", pady=(6, 0))

    def _row_entry(self, parent: ttk.Frame, row: int, label: str, variable: tk.StringVar, show: str | None = None) -> None:
        frame = ttk.Frame(parent)
        frame.grid(row=row, column=0, columnspan=3, sticky="ew", pady=4)
        frame.columnconfigure(1, weight=1)
        ttk.Label(frame, text=label, width=18).grid(row=0, column=0, sticky="w")
        entry = ttk.Entry(frame, textvariable=variable, show=show or "")
        entry.grid(row=0, column=1, sticky="ew", padx=(8, 0))

    def choose_output_dir(self) -> None:
        path = filedialog.askdirectory()
        if path:
            self.output_var.set(path)

    def add_files(self) -> None:
        files = filedialog.askopenfilenames(filetypes=[("Subtitle files", "*.srt")])
        self._add_paths([Path(f) for f in files])

    def add_folder(self) -> None:
        folder = filedialog.askdirectory()
        if folder:
            self._add_paths([Path(folder)])

    def clear_items(self) -> None:
        self.items.clear()
        self.listbox.delete(0, "end")
        self.status_var.set("Đã xóa danh sách đầu vào.")

    def on_drop(self, event) -> None:
        data = self.root.tk.splitlist(event.data)
        self._add_paths([Path(p) for p in data])

    def _add_paths(self, paths: Iterable[Path]) -> None:
        existing = {p.resolve() for p in self.items}
        added = 0
        for path in paths:
            try:
                rp = path.resolve()
            except Exception:
                continue
            if rp not in existing:
                self.items.append(rp)
                self.listbox.insert("end", str(rp))
                existing.add(rp)
                added += 1
        self.status_var.set(f"Đã thêm {added} mục.")

    def _collect_srt_files(self) -> list[Path]:
        files: list[Path] = []
        for item in self.items:
            if item.is_file() and item.suffix.lower() in SUPPORTED_EXTENSIONS:
                files.append(item)
            elif item.is_dir():
                files.extend(sorted(p for p in item.rglob("*.srt") if p.is_file()))
        dedup: list[Path] = []
        seen = set()
        for f in files:
            rf = f.resolve()
            if rf not in seen:
                seen.add(rf)
                dedup.append(rf)
        return dedup

    def _make_output_path(self, input_path: Path, root_base: Path, output_root: Path) -> Path:
        try:
            rel = input_path.relative_to(root_base)
            return output_root / rel.parent / f"{input_path.stem}{OUTPUT_SUFFIX}{input_path.suffix}"
        except Exception:
            return output_root / f"{input_path.stem}{OUTPUT_SUFFIX}{input_path.suffix}"

    def log(self, message: str) -> None:
        self.log_queue.put(message)

    def _poll_log_queue(self) -> None:
        try:
            while True:
                message = self.log_queue.get_nowait()
                self.log_text.configure(state="normal")
                self.log_text.insert("end", message + "\n")
                self.log_text.see("end")
                self.log_text.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(120, self._poll_log_queue)

    def start_translate(self) -> None:
        if self.running:
            messagebox.showinfo(APP_TITLE, "Đang xử lý, vui lòng chờ.")
            return

        api_key = self.api_key_var.get().strip()
        if not api_key:
            messagebox.showerror(APP_TITLE, "Bạn chưa nhập OpenAI API Key.")
            return

        files = self._collect_srt_files()
        if not files:
            messagebox.showerror(APP_TITLE, "Chưa có file .srt nào để dịch.")
            return

        try:
            batch_size = max(1, int(self.batch_var.get().strip()))
            workers = max(1, int(self.workers_var.get().strip()))
        except ValueError:
            messagebox.showerror(APP_TITLE, "Batch size và Workers phải là số nguyên.")
            return

        output_dir = Path(self.output_var.get().strip()).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        config = AppConfig(
            api_key=api_key,
            model=self.model_var.get().strip() or DEFAULT_MODEL,
            batch_size=batch_size,
            workers=workers,
            output_dir=output_dir,
        )

        self.running = True
        self.progress_var.set(0)
        self.status_var.set("Đang xử lý...")

        thread = threading.Thread(
            target=self._run_translate,
            args=(config, files),
            daemon=True,
        )
        thread.start()

    def _run_translate(self, config: AppConfig, files: list[Path]) -> None:
        try:
            translator = SubtitleTranslator(config, self.log)

            total = len(files)
            for idx, input_path in enumerate(files, start=1):
                root_base = input_path.parent
                for item in self.items:
                    if item.is_dir():
                        try:
                            input_path.relative_to(item.resolve())
                            root_base = item.resolve()
                            break
                        except Exception:
                            continue

                output_path = self._make_output_path(input_path, root_base, config.output_dir)
                self.status_var.set(f"Đang dịch {idx}/{total}: {input_path.name}")
                translator.translate_srt_file(input_path, output_path)
                self.progress_var.set(idx * 100 / total)

            self.status_var.set("Hoàn tất.")
            self.log("\n🎉 Đã dịch xong toàn bộ file.")
            messagebox.showinfo(APP_TITLE, "Đã dịch xong toàn bộ subtitle.")
        except Exception as exc:
            self.log(f"\n❌ Lỗi: {exc}")
            messagebox.showerror(APP_TITLE, f"Xử lý thất bại:\n{exc}")
            self.status_var.set("Thất bại.")
        finally:
            self.running = False


def main() -> None:
    root = TkinterDnD.Tk() if DND_AVAILABLE else tk.Tk()  # type: ignore[attr-defined]
    style = ttk.Style()
    try:
        style.theme_use("clam")
    except Exception:
        pass
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
