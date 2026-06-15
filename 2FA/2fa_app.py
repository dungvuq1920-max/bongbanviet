import tkinter as tk
from tkinter import font as tkfont
import hmac
import hashlib
import base64
import struct
import time
import threading


def get_totp(secret: str) -> tuple[str, int]:
    """Returns (6-digit code, seconds remaining in window)."""
    secret = secret.replace(" ", "").upper()
    key = base64.b32decode(secret, casefold=True)
    now = int(time.time())
    counter = now // 30
    remaining = 30 - (now % 30)
    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code = struct.unpack(">I", h[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % 1_000_000).zfill(6), remaining


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("2FA Code Generator")
        self.resizable(False, False)
        self.configure(bg="#1E1E2E")
        self._after_id = None
        self._build_ui()
        self.after(100, self._tick)

    # ── UI ────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        PAD = 20
        BG = "#1E1E2E"
        CARD = "#2A2A3E"
        ACC = "#7C3AED"
        FG = "#E2E8F0"
        MUTED = "#94A3B8"

        # Title
        title_f = tkfont.Font(family="Segoe UI", size=16, weight="bold")
        tk.Label(self, text="2FA Code Generator", bg=BG, fg=FG,
                 font=title_f).pack(pady=(PAD, 4))
        tk.Label(self, text="TOTP Authenticator", bg=BG, fg=MUTED,
                 font=("Segoe UI", 9)).pack(pady=(0, PAD))

        # Card frame
        card = tk.Frame(self, bg=CARD, bd=0, relief="flat",
                        padx=PAD, pady=PAD)
        card.pack(padx=PAD, pady=(0, PAD), fill="x")

        # Secret input
        tk.Label(card, text="Secret Key (Base32)", bg=CARD, fg=MUTED,
                 font=("Segoe UI", 9)).pack(anchor="w")

        entry_frame = tk.Frame(card, bg="#374151", bd=0)
        entry_frame.pack(fill="x", pady=(4, 12))

        self.secret_var = tk.StringVar()
        self.entry = tk.Entry(
            entry_frame, textvariable=self.secret_var,
            bg="#374151", fg=FG, insertbackground=FG,
            relief="flat", font=("Consolas", 12),
            show="•", bd=6
        )
        self.entry.pack(side="left", fill="x", expand=True)

        self.eye_btn = tk.Button(
            entry_frame, text="👁", bg="#374151", fg=MUTED,
            relief="flat", bd=0, cursor="hand2",
            command=self._toggle_visibility
        )
        self.eye_btn.pack(side="right", padx=(0, 4))

        # Get Code button
        self.get_btn = tk.Button(
            card, text="  Get Code  ",
            bg=ACC, fg="white", activebackground="#6D28D9",
            activeforeground="white", relief="flat",
            font=("Segoe UI", 11, "bold"),
            cursor="hand2", bd=0, pady=8,
            command=self._on_get
        )
        self.get_btn.pack(fill="x")

        # Result card
        res_card = tk.Frame(self, bg=CARD, bd=0, padx=PAD, pady=PAD)
        res_card.pack(padx=PAD, pady=(0, 4), fill="x")

        tk.Label(res_card, text="Your 2FA Code", bg=CARD, fg=MUTED,
                 font=("Segoe UI", 9)).pack(anchor="w")

        code_row = tk.Frame(res_card, bg=CARD)
        code_row.pack(fill="x", pady=(6, 0))

        self.code_f = tkfont.Font(family="Consolas", size=36, weight="bold")
        self.code_lbl = tk.Label(
            code_row, text="------", bg=CARD, fg=FG,
            font=self.code_f, cursor="hand2"
        )
        self.code_lbl.pack(side="left")
        self.code_lbl.bind("<Button-1>", self._copy_code)

        copy_f = tk.Frame(code_row, bg=CARD)
        copy_f.pack(side="right", anchor="center")

        self.copy_btn = tk.Button(
            copy_f, text="Copy", bg="#374151", fg=FG,
            relief="flat", font=("Segoe UI", 9),
            cursor="hand2", bd=0, padx=10, pady=4,
            command=self._copy_code
        )
        self.copy_btn.pack()

        self.copy_lbl = tk.Label(copy_f, text="", bg=CARD, fg="#4ADE80",
                                 font=("Segoe UI", 8))
        self.copy_lbl.pack()

        # Timer bar
        timer_frame = tk.Frame(self, bg=CARD, padx=PAD, pady=(0, PAD))
        timer_frame.pack(padx=PAD, pady=(0, PAD), fill="x")

        bar_row = tk.Frame(timer_frame, bg=CARD)
        bar_row.pack(fill="x")

        self.time_lbl = tk.Label(bar_row, text="--s", bg=CARD, fg=MUTED,
                                 font=("Segoe UI", 9))
        self.time_lbl.pack(side="right")

        tk.Label(bar_row, text="Expires in", bg=CARD, fg=MUTED,
                 font=("Segoe UI", 9)).pack(side="left")

        bar_bg = tk.Frame(timer_frame, bg="#374151", height=6)
        bar_bg.pack(fill="x", pady=(4, 0))

        self.bar = tk.Frame(bar_bg, bg=ACC, height=6)
        self.bar.place(relx=0, rely=0, relwidth=1.0, relheight=1.0)

        # Status
        self.status_lbl = tk.Label(self, text="Enter your secret key to begin",
                                   bg=BG, fg=MUTED, font=("Segoe UI", 8))
        self.status_lbl.pack(pady=(0, PAD))

        # Bind Enter key
        self.entry.bind("<Return>", lambda _: self._on_get())

        self._active = False
        self._current_code = ""

    # ── Logic ─────────────────────────────────────────────────────────────────

    def _on_get(self):
        secret = self.secret_var.get().strip()
        if not secret:
            self._set_status("Please enter a secret key.", error=True)
            return
        try:
            code, rem = get_totp(secret)
            self._current_code = code
            self.code_lbl.config(text=f"{code[:3]} {code[3:]}", fg="#E2E8F0")
            self._active = True
            self._set_status("Code generated. Click to copy.", error=False)
        except Exception:
            self._active = False
            self.code_lbl.config(text="------", fg="#94A3B8")
            self._set_status("Invalid secret key. Check and try again.", error=True)

    def _tick(self):
        if self._active:
            secret = self.secret_var.get().strip()
            try:
                code, rem = get_totp(secret)
                if code != self._current_code:
                    self._current_code = code
                    self.code_lbl.config(text=f"{code[:3]} {code[3:]}")
                self.time_lbl.config(text=f"{rem}s")
                ratio = rem / 30
                color = "#4ADE80" if ratio > 0.5 else "#FACC15" if ratio > 0.25 else "#F87171"
                self.bar.config(bg=color)
                self.bar.place(relwidth=ratio)
            except Exception:
                self._active = False

        self.after(500, self._tick)

    def _toggle_visibility(self):
        current = self.entry.cget("show")
        self.entry.config(show="" if current == "•" else "•")

    def _copy_code(self, _event=None):
        code = self._current_code.replace(" ", "")
        if not code:
            return
        self.clipboard_clear()
        self.clipboard_append(code)
        self.copy_lbl.config(text="Copied!")
        self.after(1500, lambda: self.copy_lbl.config(text=""))

    def _set_status(self, msg: str, error: bool = False):
        color = "#F87171" if error else "#94A3B8"
        self.status_lbl.config(text=msg, fg=color)


if __name__ == "__main__":
    app = App()
    app.mainloop()
