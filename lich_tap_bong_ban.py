#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quản Lý Lịch Tập Bóng Bàn
Table Tennis Schedule & Attendance Manager
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog, colorchooser
import json
import os
import uuid
import csv
from datetime import datetime, date, timedelta

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lich_tap_data.json")

DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
DAY_FULL = {
    "T2": "Thứ Hai", "T3": "Thứ Ba", "T4": "Thứ Tư",
    "T5": "Thứ Năm", "T6": "Thứ Sáu", "T7": "Thứ Bảy", "CN": "Chủ Nhật"
}

TIME_SLOTS = [
    "15:00-15:30", "15:30-16:00", "16:00-16:30", "16:30-17:00",
    "17:00-17:30", "17:30-18:00", "18:00-18:30", "18:30-19:00",
    "19:00-19:30", "19:30-20:00"
]

DEFAULT_COLORS = [
    "#00BCD4", "#FF9800", "#4CAF50", "#CDDC39",
    "#9C27B0", "#7986CB", "#E8503A", "#2196F3",
    "#795548", "#F44336", "#009688", "#8BC34A"
]

BG = "#FAFAF8"
DARK = "#1A1A1A"
PRIMARY = "#D62B2B"
MUTED = "#6B6B6B"
BORDER = "#E5E5E3"
SURFACE = "#FFFFFF"


def get_week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("🏓 Quản Lý Lịch Tập Bóng Bàn")
        self.geometry("1380x800")
        self.minsize(1000, 640)
        self.configure(bg=BG)

        self.data = self._load_data()
        self.selected_student_id = None
        self.current_week = get_week_monday(date.today())
        self.mode = "schedule"
        self._cell_frames = {}  # key -> (Frame, date)

        self._apply_style()
        self._build_ui()

    # ── Data ──────────────────────────────────────────────────────────────────

    def _load_data(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"students": [], "schedule": {}, "attendance": []}

    def _save(self):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    def _get_student(self, sid):
        return next((s for s in self.data["students"] if s["id"] == sid), None)

    def _get_att_record(self, date_str, sid, time_slot):
        return next(
            (a for a in self.data.get("attendance", [])
             if a["date"] == date_str
             and a["student_id"] == sid
             and a["time_slot"] == time_slot),
            None
        )

    def _is_attended(self, date_str, sid, time_slot):
        return self._get_att_record(date_str, sid, time_slot) is not None

    # ── Style ─────────────────────────────────────────────────────────────────

    def _apply_style(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TNotebook", background=BG, borderwidth=0)
        style.configure("TNotebook.Tab", font=("Arial", 10, "bold"),
                        padding=[14, 6], background="#E5E5E3", foreground=DARK)
        style.map("TNotebook.Tab",
                  background=[("selected", SURFACE)],
                  foreground=[("selected", PRIMARY)])
        style.configure("Treeview", font=("Arial", 10), rowheight=30,
                        background=SURFACE, fieldbackground=SURFACE)
        style.configure("Treeview.Heading", font=("Arial", 10, "bold"),
                        background=DARK, foreground="white")

    # ── UI Layout ─────────────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Left sidebar ──
        self.sidebar = tk.Frame(self, bg=DARK, width=215)
        self.sidebar.pack(side=tk.LEFT, fill=tk.Y)
        self.sidebar.pack_propagate(False)

        tk.Label(self.sidebar, text="🏓 BÓNG BÀN VIỆT",
                 bg=DARK, fg="white", font=("Arial", 13, "bold"), pady=14
                 ).pack(fill=tk.X)

        # Mode buttons
        mf = tk.Frame(self.sidebar, bg=DARK, pady=4)
        mf.pack(fill=tk.X, padx=6)
        self.btn_sch = tk.Button(
            mf, text="📅  Lịch Cố Định",
            bg=PRIMARY, fg="white", font=("Arial", 9, "bold"),
            relief=tk.FLAT, cursor="hand2",
            command=lambda: self._set_mode("schedule")
        )
        self.btn_sch.pack(fill=tk.X, pady=2)

        self.btn_att = tk.Button(
            mf, text="✓  Điểm Danh",
            bg="#333", fg="white", font=("Arial", 9, "bold"),
            relief=tk.FLAT, cursor="hand2",
            command=lambda: self._set_mode("attendance")
        )
        self.btn_att.pack(fill=tk.X, pady=2)

        tk.Frame(self.sidebar, bg=PRIMARY, height=2).pack(fill=tk.X, padx=8, pady=6)
        tk.Label(self.sidebar, text="HỌC VIÊN", bg=DARK, fg=PRIMARY,
                 font=("Arial", 9, "bold"), pady=3).pack(fill=tk.X)

        # Scrollable student list
        sf_outer = tk.Frame(self.sidebar, bg=DARK)
        sf_outer.pack(fill=tk.BOTH, expand=True, padx=4)
        sf_canvas = tk.Canvas(sf_outer, bg=DARK, highlightthickness=0)
        sf_scroll = ttk.Scrollbar(sf_outer, orient=tk.VERTICAL, command=sf_canvas.yview)
        sf_canvas.configure(yscrollcommand=sf_scroll.set)
        sf_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        sf_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.student_list_frame = tk.Frame(sf_canvas, bg=DARK)
        sf_canvas.create_window((0, 0), window=self.student_list_frame, anchor="nw")
        self.student_list_frame.bind(
            "<Configure>",
            lambda e: sf_canvas.configure(scrollregion=sf_canvas.bbox("all"))
        )

        tk.Button(self.sidebar, text="＋  Thêm Học Viên",
                  bg=PRIMARY, fg="white", font=("Arial", 10, "bold"),
                  relief=tk.FLAT, cursor="hand2",
                  command=self._add_student
                  ).pack(fill=tk.X, padx=8, pady=8)

        # ── Main area ──
        main = tk.Frame(self, bg=BG)
        main.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.topbar = tk.Frame(main, bg="#EBEBEA", pady=7, padx=10)
        self.topbar.pack(fill=tk.X)
        self._build_topbar()

        self.nb = ttk.Notebook(main)
        self.nb.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

        self.tab_grid = tk.Frame(self.nb, bg=BG)
        self.nb.add(self.tab_grid, text="  📅 Lịch Tuần  ")

        self.tab_summary = tk.Frame(self.nb, bg=BG)
        self.nb.add(self.tab_summary, text="  📊 Tổng Kết & Xuất  ")

        self.nb.bind("<<NotebookTabChanged>>", self._on_tab_change)

        self.statusbar = tk.Label(main, text="Sẵn sàng",
                                  bg="#EBEBEA", fg=MUTED,
                                  font=("Arial", 9), anchor="w", padx=10)
        self.statusbar.pack(fill=tk.X, side=tk.BOTTOM)

        self._build_grid_tab()
        self._build_summary_tab()
        self._refresh_students()

    # ── Top Bar ───────────────────────────────────────────────────────────────

    def _build_topbar(self):
        for w in self.topbar.winfo_children():
            w.destroy()

        tk.Button(self.topbar, text="◀", bg="#EBEBEA", fg=DARK,
                  font=("Arial", 14), relief=tk.FLAT, cursor="hand2",
                  command=self._prev_week).pack(side=tk.LEFT)

        mon = self.current_week
        sun = mon + timedelta(days=6)
        tk.Label(
            self.topbar,
            text=f"  {mon.strftime('%d/%m/%Y')}  —  {sun.strftime('%d/%m/%Y')}  ",
            bg="#EBEBEA", fg=DARK, font=("Arial", 11, "bold")
        ).pack(side=tk.LEFT)

        tk.Button(self.topbar, text="▶", bg="#EBEBEA", fg=DARK,
                  font=("Arial", 14), relief=tk.FLAT, cursor="hand2",
                  command=self._next_week).pack(side=tk.LEFT)

        tk.Button(self.topbar, text="Tuần Này",
                  bg=DARK, fg="white", font=("Arial", 9),
                  relief=tk.FLAT, cursor="hand2",
                  command=self._this_week
                  ).pack(side=tk.LEFT, padx=10)

        if self.mode == "schedule":
            tip = "📅  Chọn học viên bên trái → Click ô để thêm/xóa lịch cố định  |  Chuột phải để xóa từng người"
            fg = PRIMARY
        else:
            tip = "✓  Click ô màu để TÍCH/BỎ điểm danh  |  Click ô trống để thêm buổi ngoài lịch  |  Chuột phải để ghi chú"
            fg = "#388E3C"

        tk.Label(self.topbar, text=tip, bg="#EBEBEA",
                 fg=fg, font=("Arial", 9, "italic")).pack(side=tk.LEFT, padx=12)

    def _set_mode(self, mode):
        self.mode = mode
        self.btn_sch.configure(bg=PRIMARY if mode == "schedule" else "#444")
        self.btn_att.configure(bg="#388E3C" if mode == "attendance" else "#444")
        self._build_topbar()
        self._draw_grid()
        self._update_status()

    def _prev_week(self):
        self.current_week -= timedelta(weeks=1)
        self._build_topbar()
        self._draw_grid()

    def _next_week(self):
        self.current_week += timedelta(weeks=1)
        self._build_topbar()
        self._draw_grid()

    def _this_week(self):
        self.current_week = get_week_monday(date.today())
        self._build_topbar()
        self._draw_grid()

    def _on_tab_change(self, _event):
        if self.nb.index(self.nb.select()) == 1:
            self._refresh_summary()

    def _update_status(self, msg=None):
        if msg:
            self.statusbar.configure(text=msg)
            return
        s = self._get_student(self.selected_student_id) if self.selected_student_id else None
        if s:
            mode_lbl = "Lịch cố định" if self.mode == "schedule" else "Điểm danh"
            self.statusbar.configure(text=f"Đang chọn: {s['name']}  |  Chế độ: {mode_lbl}")
        else:
            self.statusbar.configure(text="Sẵn sàng  —  Chọn học viên từ danh sách bên trái (chế độ Lịch Cố Định)")

    # ── Weekly Grid ───────────────────────────────────────────────────────────

    def _build_grid_tab(self):
        outer = tk.Frame(self.tab_grid, bg=BG)
        outer.pack(fill=tk.BOTH, expand=True)

        canvas = tk.Canvas(outer, bg=BG, highlightthickness=0)
        vsb = ttk.Scrollbar(outer, orient=tk.VERTICAL, command=canvas.yview)
        hsb = ttk.Scrollbar(outer, orient=tk.HORIZONTAL, command=canvas.xview)
        canvas.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        hsb.pack(side=tk.BOTTOM, fill=tk.X)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        canvas.bind("<MouseWheel>",
                    lambda e: canvas.yview_scroll(-1 if e.delta > 0 else 1, "units"))

        self._grid_canvas = canvas
        self._grid_inner = tk.Frame(canvas, bg=BG)
        canvas.create_window((0, 0), window=self._grid_inner, anchor="nw")
        self._grid_inner.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        self._draw_grid()

    def _draw_grid(self):
        frame = self._grid_inner
        for w in frame.winfo_children():
            w.destroy()
        self._cell_frames.clear()

        COL_W = 135
        ROW_H = 54

        # Corner
        tk.Label(frame, text="Giờ", bg=DARK, fg="white",
                 font=("Arial", 10, "bold"), width=12, height=2,
                 relief=tk.FLAT).grid(row=0, column=0, padx=1, pady=1, sticky="nsew")

        # Headers
        for ci, day_key in enumerate(DAYS):
            day_date = self.current_week + timedelta(days=ci)
            is_today = day_date == date.today()
            hdr_bg = PRIMARY if is_today else "#E65100"
            tk.Label(
                frame,
                text=f"{day_key}{'  ★' if is_today else ''}\n{day_date.strftime('%d/%m')}",
                bg=hdr_bg, fg="white",
                font=("Arial", 10, "bold"), width=15, height=2,
                relief=tk.FLAT
            ).grid(row=0, column=ci + 1, padx=1, pady=1, sticky="nsew")

        # Rows
        for ri, time_slot in enumerate(TIME_SLOTS):
            tk.Label(frame, text=time_slot,
                     bg="#F5F5F5", fg=DARK,
                     font=("Arial", 9), width=12, height=3,
                     relief=tk.FLAT
                     ).grid(row=ri + 1, column=0, padx=1, pady=1, sticky="nsew")

            for ci, day_key in enumerate(DAYS):
                day_date = self.current_week + timedelta(days=ci)
                cell = tk.Frame(frame, bg=SURFACE,
                                width=COL_W, height=ROW_H,
                                highlightthickness=1,
                                highlightbackground=BORDER)
                cell.grid(row=ri + 1, column=ci + 1, padx=1, pady=1, sticky="nsew")
                cell.grid_propagate(False)
                self._cell_frames[f"{day_key}_{time_slot}"] = (cell, day_date)
                self._render_cell(cell, day_key, time_slot, day_date)

    def _render_cell(self, cell: tk.Frame, day_key: str, time_slot: str, day_date: date):
        """Draw content of one grid cell. Safe to call from event handlers."""
        for w in cell.winfo_children():
            w.destroy()

        date_str = day_date.strftime("%d/%m/%Y")
        student_ids = self.data.get("schedule", {}).get(day_key, {}).get(time_slot, [])

        if self.mode == "attendance":
            self._render_cell_attendance(cell, day_key, time_slot, day_date, date_str, student_ids)
        else:
            self._render_cell_schedule(cell, day_key, time_slot, day_date, student_ids)

    # ── Schedule mode cell ────────────────────────────────────────────────────

    def _render_cell_schedule(self, cell, day_key, time_slot, day_date, student_ids):
        if not student_ids:
            cell.configure(bg=SURFACE, highlightbackground=BORDER)
            lbl = tk.Label(cell, bg=SURFACE, cursor="hand2",
                           text="", font=("Arial", 9), fg="#CCC")
            lbl.pack(fill=tk.BOTH, expand=True)
            lbl.bind("<Button-1>",
                     lambda e, dk=day_key, ts=time_slot, dd=day_date:
                     self._do_toggle_schedule(dk, ts, cell))
            return

        cell.configure(bg="#F0F0F0", highlightbackground="#BBBBBB")
        for sid in student_ids:
            student = self._get_student(sid)
            if not student:
                continue
            row = tk.Frame(cell, bg=student["color"], cursor="hand2")
            row.pack(fill=tk.X, expand=True, pady=1, padx=1)
            lbl = tk.Label(row, text=student["name"],
                           bg=student["color"], fg="white",
                           font=("Arial", 8, "bold"),
                           anchor="w", padx=4, cursor="hand2")
            lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
            for w in (row, lbl):
                w.bind("<Button-1>",
                       lambda e, dk=day_key, ts=time_slot:
                       self._do_toggle_schedule(dk, ts, cell))
                w.bind("<Button-3>",
                       lambda e, s=student, dk=day_key, ts=time_slot:
                       self._confirm_remove_schedule(s["id"], dk, ts))

    def _do_toggle_schedule(self, day_key, time_slot, cell):
        if not self.selected_student_id:
            messagebox.showinfo("Chọn học viên",
                                "Hãy click vào tên học viên ở bên trái trước,\n"
                                "sau đó click vào ô thời gian để thêm vào lịch.")
            return
        schedule = self.data.setdefault("schedule", {})
        slot = schedule.setdefault(day_key, {}).setdefault(time_slot, [])
        s = self._get_student(self.selected_student_id)
        if self.selected_student_id in slot:
            slot.remove(self.selected_student_id)
            self._update_status(f"Đã xóa {s['name']} khỏi {day_key} {time_slot}")
        else:
            slot.append(self.selected_student_id)
            self._update_status(f"Đã thêm {s['name']} vào {day_key} {time_slot}")
        self._save()
        day_date = self._cell_frames[f"{day_key}_{time_slot}"][1]
        self.after(1, lambda: self._render_cell(cell, day_key, time_slot, day_date))

    def _confirm_remove_schedule(self, sid, day_key, time_slot):
        s = self._get_student(sid)
        if messagebox.askyesno("Xóa khỏi lịch",
                               f"Xóa {s['name']} khỏi lịch cố định {day_key} {time_slot}?"):
            slot = self.data.get("schedule", {}).get(day_key, {}).get(time_slot, [])
            if sid in slot:
                slot.remove(sid)
                self._save()
                cell, day_date = self._cell_frames[f"{day_key}_{time_slot}"]
                self.after(1, lambda: self._render_cell(cell, day_key, time_slot, day_date))

    # ── Attendance mode cell ──────────────────────────────────────────────────

    def _render_cell_attendance(self, cell, day_key, time_slot, day_date, date_str, student_ids):
        """
        Render cell in attendance mode.
        - Students in fixed schedule: shown as toggleable rows.
        - Empty cell: show a '+' button to add any student ad-hoc.
        - Also collect any ad-hoc attendance records not in fixed schedule.
        """
        # Gather ad-hoc attendances (students who attended but not in fixed schedule)
        adhoc_ids = [
            a["student_id"]
            for a in self.data.get("attendance", [])
            if a["date"] == date_str
            and a["time_slot"] == time_slot
            and a["student_id"] not in student_ids
        ]
        all_ids = list(student_ids) + adhoc_ids

        if not all_ids:
            # Empty cell → "+" button to add any student
            cell.configure(bg=SURFACE, highlightbackground=BORDER)
            plus = tk.Label(cell, text="+", bg=SURFACE, fg="#BBBBBB",
                            font=("Arial", 16, "bold"), cursor="hand2")
            plus.pack(fill=tk.BOTH, expand=True)
            plus.bind("<Button-1>",
                      lambda e, dk=day_key, ts=time_slot, dd=day_date:
                      self._pick_student_for_attendance(dk, ts, dd))
            return

        cell.configure(bg="#ECFDF5", highlightbackground="#4CAF50")

        for sid in all_ids:
            student = self._get_student(sid)
            if not student:
                continue
            self._add_attendance_row(cell, day_key, time_slot, day_date, date_str, student,
                                     is_adhoc=(sid in adhoc_ids))

        # Small "+" to add another student even when cell is not empty
        add_btn = tk.Label(cell, text="＋", bg="#ECFDF5", fg="#4CAF50",
                           font=("Arial", 9, "bold"), cursor="hand2")
        add_btn.pack(side=tk.BOTTOM, fill=tk.X)
        add_btn.bind("<Button-1>",
                     lambda e, dk=day_key, ts=time_slot, dd=day_date:
                     self._pick_student_for_attendance(dk, ts, dd))

    def _add_attendance_row(self, cell, day_key, time_slot, day_date, date_str,
                            student, is_adhoc=False):
        attended = self._is_attended(date_str, student["id"], time_slot)
        has_note = bool((self._get_att_record(date_str, student["id"], time_slot) or {}).get("note"))

        row_bg = student["color"] if attended else "#DDDDDD"
        row_fg = "white" if attended else "#555"
        mark = "✓" if attended else "○"
        note_mark = " 📝" if has_note else ""

        row = tk.Frame(cell, bg=row_bg, cursor="hand2")
        row.pack(fill=tk.X, expand=True, pady=1, padx=1)

        chk = tk.Label(row, text=mark, bg=row_bg, fg=row_fg,
                       font=("Arial", 10, "bold"), width=2, cursor="hand2")
        chk.pack(side=tk.LEFT)

        name_lbl = tk.Label(row,
                            text=student["name"] + note_mark + (" *" if is_adhoc else ""),
                            bg=row_bg, fg=row_fg,
                            font=("Arial", 8, "bold"),
                            anchor="w", padx=2, cursor="hand2")
        name_lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # LEFT click → toggle attendance
        # Use after(1) to avoid destroying widget inside its own event handler
        def on_click(_e, dk=day_key, ts=time_slot, dd=day_date, s=student):
            self.after(1, lambda: self._toggle_attendance(dk, ts, dd, s))

        # RIGHT click → notes
        def on_right(_e, dk=day_key, ts=time_slot, dd=day_date, s=student):
            self._open_note_dialog(dk, ts, dd, s)

        for w in (row, chk, name_lbl):
            w.bind("<Button-1>", on_click)
            w.bind("<Button-3>", on_right)

    def _toggle_attendance(self, day_key, time_slot, day_date, student):
        """Toggle attendance and safely re-render the cell."""
        date_str = day_date.strftime("%d/%m/%Y")
        existing = self._get_att_record(date_str, student["id"], time_slot)

        if existing:
            self.data["attendance"].remove(existing)
            self._update_status(f"Bỏ tích: {student['name']} — {date_str} {time_slot}")
        else:
            self.data.setdefault("attendance", []).append({
                "date": date_str,
                "student_id": student["id"],
                "time_slot": time_slot,
                "note": ""
            })
            self._update_status(f"✓ Đã tích: {student['name']} — {date_str} {time_slot}")

        self._save()

        # Re-render cell (safe: called via after())
        info = self._cell_frames.get(f"{day_key}_{time_slot}")
        if info:
            cell, dd = info
            self._render_cell(cell, day_key, time_slot, dd)

    def _pick_student_for_attendance(self, day_key, time_slot, day_date):
        """Show popup to select which student to add attendance for."""
        students = self.data.get("students", [])
        if not students:
            messagebox.showinfo("Chưa có học viên",
                                "Hãy thêm học viên trước ở phần '+ Thêm Học Viên'.")
            return
        PickStudentDialog(
            self, students, day_key, time_slot, day_date,
            on_pick=lambda s: self.after(1, lambda: self._add_adhoc_attendance(
                day_key, time_slot, day_date, s))
        )

    def _add_adhoc_attendance(self, day_key, time_slot, day_date, student):
        date_str = day_date.strftime("%d/%m/%Y")
        if not self._is_attended(date_str, student["id"], time_slot):
            self.data.setdefault("attendance", []).append({
                "date": date_str,
                "student_id": student["id"],
                "time_slot": time_slot,
                "note": ""
            })
            self._save()
            self._update_status(f"✓ Thêm: {student['name']} — {date_str} {time_slot}")
        info = self._cell_frames.get(f"{day_key}_{time_slot}")
        if info:
            cell, dd = info
            self._render_cell(cell, day_key, time_slot, dd)

    def _open_note_dialog(self, day_key, time_slot, day_date, student):
        date_str = day_date.strftime("%d/%m/%Y")
        record = self._get_att_record(date_str, student["id"], time_slot)
        if not record:
            if messagebox.askyesno("Chưa điểm danh",
                                   f"Chưa có điểm danh của {student['name']} buổi này.\n"
                                   "Điểm danh ngay và thêm ghi chú?"):
                self.data.setdefault("attendance", []).append({
                    "date": date_str,
                    "student_id": student["id"],
                    "time_slot": time_slot,
                    "note": ""
                })
                self._save()
                record = self._get_att_record(date_str, student["id"], time_slot)
                info = self._cell_frames.get(f"{day_key}_{time_slot}")
                if info:
                    self._render_cell(info[0], day_key, time_slot, info[1])
            else:
                return

        def on_save():
            self._save()
            info = self._cell_frames.get(f"{day_key}_{time_slot}")
            if info:
                self.after(1, lambda: self._render_cell(info[0], day_key, time_slot, info[1]))

        NoteDialog(self, record, student, date_str, time_slot, on_save=on_save)

    # ── Students ──────────────────────────────────────────────────────────────

    def _add_student(self):
        color = DEFAULT_COLORS[len(self.data["students"]) % len(DEFAULT_COLORS)]
        dlg = StudentDialog(self, color=color)
        self.wait_window(dlg)
        if dlg.result:
            self.data["students"].append(dlg.result)
            self._save()
            self._refresh_students()

    def _refresh_students(self):
        for w in self.student_list_frame.winfo_children():
            w.destroy()
        for student in self.data["students"]:
            self._add_student_row(student)
        self._update_status()

    def _add_student_row(self, student):
        is_sel = student["id"] == self.selected_student_id
        row = tk.Frame(self.student_list_frame, bg=DARK, pady=2)
        row.pack(fill=tk.X)

        btn = tk.Button(
            row,
            text=("▶ " if is_sel else "   ") + student["name"],
            bg=student["color"], fg="white",
            font=("Arial", 9, "bold" if is_sel else "normal"),
            relief=tk.FLAT, cursor="hand2", anchor="w", padx=6,
            command=lambda s=student: self._select_student(s["id"])
        )
        btn.pack(side=tk.LEFT, fill=tk.X, expand=True)

        tk.Button(row, text="✎", bg=student["color"], fg="white",
                  font=("Arial", 9), relief=tk.FLAT, cursor="hand2", width=2,
                  command=lambda s=student: self._edit_student(s)
                  ).pack(side=tk.RIGHT, padx=1)
        tk.Button(row, text="✕", bg=student["color"], fg="white",
                  font=("Arial", 9), relief=tk.FLAT, cursor="hand2", width=2,
                  command=lambda s=student: self._delete_student(s)
                  ).pack(side=tk.RIGHT)

    def _select_student(self, sid):
        self.selected_student_id = None if self.selected_student_id == sid else sid
        self._refresh_students()
        self._update_status()

    def _edit_student(self, student):
        dlg = StudentDialog(self, student=student)
        self.wait_window(dlg)
        if dlg.result:
            student["name"] = dlg.result["name"]
            student["color"] = dlg.result["color"]
            student["note"] = dlg.result["note"]
            self._save()
            self._refresh_students()
            self._draw_grid()

    def _delete_student(self, student):
        if not messagebox.askyesno("Xác nhận xóa",
                                   f"Xóa học viên '{student['name']}'?\n"
                                   "Toàn bộ dữ liệu điểm danh sẽ bị xóa theo.",
                                   icon="warning"):
            return
        sid = student["id"]
        self.data["students"] = [s for s in self.data["students"] if s["id"] != sid]
        self.data["attendance"] = [a for a in self.data.get("attendance", [])
                                   if a["student_id"] != sid]
        for day in self.data.get("schedule", {}).values():
            for slot in day.values():
                if sid in slot:
                    slot.remove(sid)
        if self.selected_student_id == sid:
            self.selected_student_id = None
        self._save()
        self._refresh_students()
        self._draw_grid()

    # ── Summary Tab ───────────────────────────────────────────────────────────

    def _build_summary_tab(self):
        frame = self.tab_summary

        top = tk.Frame(frame, bg=BG, pady=10)
        top.pack(fill=tk.X, padx=12)
        tk.Label(top, text="Tổng Kết Số Buổi Tập",
                 bg=BG, font=("Arial", 15, "bold"), fg=DARK).pack(side=tk.LEFT)
        tk.Button(top, text="📥  Xuất CSV",
                  bg=PRIMARY, fg="white", font=("Arial", 10, "bold"),
                  relief=tk.FLAT, cursor="hand2",
                  command=self._export_csv).pack(side=tk.RIGHT, padx=5)
        tk.Button(top, text="🔄  Làm Mới",
                  bg=DARK, fg="white", font=("Arial", 10),
                  relief=tk.FLAT, cursor="hand2",
                  command=self._refresh_summary).pack(side=tk.RIGHT, padx=5)

        # Filter
        ff = tk.Frame(frame, bg=BG, pady=4)
        ff.pack(fill=tk.X, padx=12)
        tk.Label(ff, text="Từ ngày:", bg=BG, font=("Arial", 10)).pack(side=tk.LEFT)
        self.from_var = tk.StringVar()
        tk.Entry(ff, textvariable=self.from_var, width=11,
                 font=("Arial", 10)).pack(side=tk.LEFT, padx=4)
        tk.Label(ff, text="Đến ngày:", bg=BG, font=("Arial", 10)).pack(side=tk.LEFT)
        self.to_var = tk.StringVar()
        tk.Entry(ff, textvariable=self.to_var, width=11,
                 font=("Arial", 10)).pack(side=tk.LEFT, padx=4)
        tk.Button(ff, text="Lọc", bg="#FF9800", fg="white",
                  relief=tk.FLAT, font=("Arial", 10),
                  command=self._refresh_summary).pack(side=tk.LEFT, padx=5)
        tk.Label(ff, text="(dd/mm/yyyy — để trống = tất cả)",
                 bg=BG, fg=MUTED, font=("Arial", 9, "italic")).pack(side=tk.LEFT)

        # Tree
        tbl = tk.Frame(frame, bg=BG)
        tbl.pack(fill=tk.BOTH, expand=True, padx=12, pady=4)
        cols = ("name", "sessions", "last_date", "notes")
        self.tree = ttk.Treeview(tbl, columns=cols, show="headings", height=12)
        self.tree.heading("name", text="Học Viên")
        self.tree.heading("sessions", text="Số Buổi Đã Tập")
        self.tree.heading("last_date", text="Buổi Gần Nhất")
        self.tree.heading("notes", text="Có Ghi Chú")
        self.tree.column("name", width=200, anchor="w")
        self.tree.column("sessions", width=140, anchor="center")
        self.tree.column("last_date", width=160, anchor="center")
        self.tree.column("notes", width=120, anchor="center")
        vsb = ttk.Scrollbar(tbl, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # Detail panel
        dp = tk.Frame(frame, bg="#F0F0EE", relief=tk.GROOVE, bd=1)
        dp.pack(fill=tk.X, padx=12, pady=6)
        self.detail_text = tk.Text(dp, bg="#F0F0EE", fg=DARK,
                                   font=("Arial", 9), height=6,
                                   relief=tk.FLAT, state=tk.DISABLED,
                                   padx=10, pady=8)
        self.detail_text.pack(fill=tk.X)

        self._refresh_summary()

    def _filtered_atts(self, sid):
        atts = [a for a in self.data.get("attendance", []) if a["student_id"] == sid]
        try:
            if self.from_var.get().strip():
                fd = datetime.strptime(self.from_var.get().strip(), "%d/%m/%Y")
                atts = [a for a in atts if datetime.strptime(a["date"], "%d/%m/%Y") >= fd]
            if self.to_var.get().strip():
                td = datetime.strptime(self.to_var.get().strip(), "%d/%m/%Y")
                atts = [a for a in atts if datetime.strptime(a["date"], "%d/%m/%Y") <= td]
        except ValueError:
            pass
        return atts

    def _refresh_summary(self):
        self.tree.delete(*self.tree.get_children())
        for student in self.data.get("students", []):
            atts = self._filtered_atts(student["id"])
            total = len(atts)
            last = (
                max(atts, key=lambda a: datetime.strptime(a["date"], "%d/%m/%Y"))["date"]
                if atts else "Chưa có"
            )
            notes = sum(1 for a in atts if a.get("note"))
            self.tree.insert("", tk.END, iid=student["id"],
                             values=(student["name"], f"{total} buổi", last,
                                     f"{notes} buổi" if notes else "—"))

    def _on_tree_select(self, _event):
        sel = self.tree.selection()
        if not sel:
            return
        student = self._get_student(sel[0])
        if not student:
            return
        atts = sorted(self._filtered_atts(student["id"]),
                      key=lambda a: datetime.strptime(a["date"], "%d/%m/%Y"),
                      reverse=True)
        lines = [f"  {student['name']}  —  {len(atts)} buổi đã tập\n  " + "─" * 52]
        for a in atts[:12]:
            note_str = f"  📝 {a['note']}" if a.get("note") else ""
            lines.append(f"  • {a['date']}  {a['time_slot']}{note_str}")
        if len(atts) > 12:
            lines.append(f"\n  ... và {len(atts) - 12} buổi khác")
        self.detail_text.configure(state=tk.NORMAL)
        self.detail_text.delete("1.0", tk.END)
        self.detail_text.insert(tk.END, "\n".join(lines))
        self.detail_text.configure(state=tk.DISABLED)

    def _export_csv(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            initialfile=f"lich_tap_{date.today().strftime('%d%m%Y')}.csv",
            title="Xuất danh sách học viên"
        )
        if not path:
            return
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["Học Viên", "Số Buổi Đã Tập", "Buổi Đầu Tiên",
                        "Buổi Gần Nhất", "Lịch Sử Chi Tiết"])
            for student in self.data.get("students", []):
                atts = sorted(self._filtered_atts(student["id"]),
                              key=lambda a: datetime.strptime(a["date"], "%d/%m/%Y"))
                history = "  |  ".join(
                    f"{a['date']} {a['time_slot']}" + (f" [{a['note']}]" if a.get("note") else "")
                    for a in atts
                )
                w.writerow([student["name"], len(atts),
                            atts[0]["date"] if atts else "",
                            atts[-1]["date"] if atts else "",
                            history])
        messagebox.showinfo("Xuất thành công", f"Đã xuất:\n{path}")
        self._update_status(f"Đã xuất: {os.path.basename(path)}")


# ── Dialogs ───────────────────────────────────────────────────────────────────

class StudentDialog(tk.Toplevel):
    def __init__(self, parent, student=None, color=DEFAULT_COLORS[0]):
        super().__init__(parent)
        is_edit = student is not None
        self.title("Sửa Học Viên" if is_edit else "Thêm Học Viên Mới")
        self.geometry("410x320")
        self.configure(bg=BG)
        self.resizable(False, False)
        self.result = None
        self.color = student["color"] if is_edit else color
        self._sid = student["id"] if is_edit else str(uuid.uuid4())

        tk.Label(self, text="Sửa Học Viên" if is_edit else "Thêm Học Viên Mới",
                 bg=PRIMARY, fg="white",
                 font=("Arial", 13, "bold"), pady=10
                 ).pack(fill=tk.X)

        body = tk.Frame(self, bg=BG, padx=20)
        body.pack(fill=tk.BOTH, expand=True, pady=10)

        tk.Label(body, text="Tên học viên *", bg=BG,
                 font=("Arial", 10, "bold")).grid(row=0, column=0, sticky="w", pady=(5, 2))
        self.name_var = tk.StringVar(value=student["name"] if is_edit else "")
        tk.Entry(body, textvariable=self.name_var,
                 font=("Arial", 12), width=28).grid(row=1, column=0, sticky="ew", pady=(0, 10))

        tk.Label(body, text="Màu hiển thị", bg=BG,
                 font=("Arial", 10, "bold")).grid(row=2, column=0, sticky="w", pady=(0, 5))

        cf = tk.Frame(body, bg=BG)
        cf.grid(row=3, column=0, sticky="w", pady=(0, 10))
        self.clbl = tk.Label(cf, bg=self.color, width=8, height=2, relief=tk.GROOVE)
        self.clbl.pack(side=tk.LEFT, padx=(0, 10))

        pf = tk.Frame(cf, bg=BG)
        pf.pack(side=tk.LEFT)
        for i, c in enumerate(DEFAULT_COLORS[:6]):
            lbl = tk.Label(pf, bg=c, width=3, height=1, cursor="hand2", relief=tk.RAISED)
            lbl.grid(row=0, column=i, padx=2)
            lbl.bind("<Button-1>", lambda e, col=c: self._set_color(col))
        for i, c in enumerate(DEFAULT_COLORS[6:12]):
            lbl = tk.Label(pf, bg=c, width=3, height=1, cursor="hand2", relief=tk.RAISED)
            lbl.grid(row=1, column=i, padx=2, pady=2)
            lbl.bind("<Button-1>", lambda e, col=c: self._set_color(col))

        tk.Button(cf, text="Màu khác…", bg=DARK, fg="white",
                  relief=tk.FLAT, cursor="hand2",
                  command=self._pick_color).pack(side=tk.LEFT, padx=(8, 0))

        tk.Label(body, text="Ghi chú", bg=BG,
                 font=("Arial", 10, "bold")).grid(row=4, column=0, sticky="w", pady=(0, 2))
        self.note_var = tk.StringVar(value=student.get("note", "") if is_edit else "")
        tk.Entry(body, textvariable=self.note_var,
                 font=("Arial", 11), width=28).grid(row=5, column=0, sticky="ew")
        body.columnconfigure(0, weight=1)

        bf = tk.Frame(self, bg=BG, pady=12)
        bf.pack()
        tk.Button(bf, text="Hủy", bg="#E0E0E0", fg=DARK, relief=tk.FLAT,
                  font=("Arial", 11), width=8, command=self.destroy).pack(side=tk.LEFT, padx=6)
        tk.Button(bf, text="Lưu", bg=PRIMARY, fg="white", relief=tk.FLAT,
                  font=("Arial", 11, "bold"), width=8, command=self._submit).pack(side=tk.LEFT, padx=6)

        self.grab_set()
        self.focus()

    def _set_color(self, color):
        self.color = color
        self.clbl.configure(bg=color)

    def _pick_color(self):
        c = colorchooser.askcolor(color=self.color, title="Chọn màu", parent=self)[1]
        if c:
            self._set_color(c)

    def _submit(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showerror("Lỗi", "Vui lòng nhập tên học viên!", parent=self)
            return
        self.result = {
            "id": self._sid,
            "name": name,
            "color": self.color,
            "note": self.note_var.get().strip()
        }
        self.destroy()


class NoteDialog(tk.Toplevel):
    def __init__(self, parent, record, student, date_str, time_slot, on_save):
        super().__init__(parent)
        self.title("Ghi Chú Buổi Học")
        self.geometry("440x230")
        self.configure(bg=BG)
        self.resizable(False, False)
        self.record = record
        self.on_save = on_save

        tk.Label(self,
                 text=f"  {student['name']}  —  {date_str}  {time_slot}",
                 bg=student["color"], fg="white",
                 font=("Arial", 11, "bold"), pady=10, anchor="w"
                 ).pack(fill=tk.X)

        body = tk.Frame(self, bg=BG, padx=20, pady=15)
        body.pack(fill=tk.BOTH, expand=True)
        tk.Label(body, text="Ghi chú:", bg=BG,
                 font=("Arial", 11, "bold")).pack(anchor="w", pady=(0, 6))
        self.note_var = tk.StringVar(value=record.get("note", ""))
        entry = tk.Entry(body, textvariable=self.note_var, font=("Arial", 12), width=38)
        entry.pack(fill=tk.X)
        entry.focus()
        entry.select_range(0, tk.END)
        entry.bind("<Return>", lambda e: self._save())
        tk.Label(body, text="Ví dụ: Tập tốt, tập thêm forehand, vắng do bệnh…",
                 bg=BG, fg=MUTED, font=("Arial", 9, "italic")).pack(anchor="w", pady=(4, 0))

        bf = tk.Frame(self, bg=BG, pady=10)
        bf.pack()
        tk.Button(bf, text="Hủy", bg="#E0E0E0", fg=DARK, relief=tk.FLAT,
                  font=("Arial", 10), width=7, command=self.destroy).pack(side=tk.LEFT, padx=5)
        tk.Button(bf, text="Xóa Ghi Chú", bg="#888", fg="white", relief=tk.FLAT,
                  font=("Arial", 10), width=11, command=self._clear).pack(side=tk.LEFT, padx=5)
        tk.Button(bf, text="Lưu", bg=PRIMARY, fg="white", relief=tk.FLAT,
                  font=("Arial", 10, "bold"), width=7, command=self._save).pack(side=tk.LEFT, padx=5)
        self.grab_set()

    def _save(self):
        self.record["note"] = self.note_var.get().strip()
        self.on_save()
        self.destroy()

    def _clear(self):
        self.record["note"] = ""
        self.on_save()
        self.destroy()


class PickStudentDialog(tk.Toplevel):
    """Popup to pick a student when marking ad-hoc attendance on an empty cell."""
    def __init__(self, parent, students, day_key, time_slot, day_date, on_pick):
        super().__init__(parent)
        self.title("Chọn Học Viên Điểm Danh")
        self.geometry("320x400")
        self.configure(bg=BG)
        self.resizable(False, False)
        self.on_pick = on_pick

        date_str = day_date.strftime("%d/%m/%Y")
        tk.Label(self, text=f"Thêm điểm danh\n{day_key}  {date_str}  {time_slot}",
                 bg=PRIMARY, fg="white",
                 font=("Arial", 11, "bold"), pady=10
                 ).pack(fill=tk.X)

        tk.Label(self, text="Chọn học viên:", bg=BG,
                 font=("Arial", 10), pady=6).pack()

        sf = tk.Frame(self, bg=BG)
        sf.pack(fill=tk.BOTH, expand=True, padx=15, pady=5)

        canvas = tk.Canvas(sf, bg=BG, highlightthickness=0)
        vsb = ttk.Scrollbar(sf, orient=tk.VERTICAL, command=canvas.yview)
        canvas.configure(yscrollcommand=vsb.set)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        inner = tk.Frame(canvas, bg=BG)
        canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>",
                   lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

        for student in students:
            btn = tk.Button(
                inner, text=student["name"],
                bg=student["color"], fg="white",
                font=("Arial", 11, "bold"),
                relief=tk.FLAT, cursor="hand2",
                command=lambda s=student: self._pick(s)
            )
            btn.pack(fill=tk.X, pady=3)

        tk.Button(self, text="Hủy", bg="#E0E0E0", fg=DARK,
                  relief=tk.FLAT, font=("Arial", 10),
                  command=self.destroy).pack(pady=8)
        self.grab_set()

    def _pick(self, student):
        self.destroy()
        self.on_pick(student)


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = App()
    app.mainloop()
