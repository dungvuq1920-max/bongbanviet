# 2FA TOTP Generator - WinForms via PowerShell
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── TOTP implementation ────────────────────────────────────────────────────
Add-Type @"
using System;
using System.Security.Cryptography;
using System.Text;

public class TOTP {
    public static string GetCode(string secret) {
        secret = secret.Replace(" ", "").ToUpper();
        byte[] key = Base32Decode(secret);
        long counter = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30;
        byte[] msg = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian) Array.Reverse(msg);
        using (var hmac = new HMACSHA1(key)) {
            byte[] h = hmac.ComputeHash(msg);
            int offset = h[h.Length - 1] & 0x0F;
            int code = ((h[offset] & 0x7F) << 24) |
                       ((h[offset+1] & 0xFF) << 16) |
                       ((h[offset+2] & 0xFF) << 8) |
                        (h[offset+3] & 0xFF);
            return (code % 1000000).ToString("D6");
        }
    }

    public static int SecondsRemaining() {
        return 30 - (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 30);
    }

    private static byte[] Base32Decode(string s) {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        s = s.TrimEnd('=');
        int bits = 0, val = 0, idx = 0;
        byte[] output = new byte[s.Length * 5 / 8];
        foreach (char c in s) {
            val = (val << 5) | alphabet.IndexOf(c);
            bits += 5;
            if (bits >= 8) { output[idx++] = (byte)(val >> (bits - 8)); bits -= 8; }
        }
        return output;
    }
}
"@

# ── Colors & Fonts ─────────────────────────────────────────────────────────
$BG     = [System.Drawing.ColorTranslator]::FromHtml("#1E1E2E")
$CARD   = [System.Drawing.ColorTranslator]::FromHtml("#2A2A3E")
$ACC    = [System.Drawing.ColorTranslator]::FromHtml("#7C3AED")
$FG     = [System.Drawing.ColorTranslator]::FromHtml("#E2E8F0")
$MUTED  = [System.Drawing.ColorTranslator]::FromHtml("#94A3B8")
$GREEN  = [System.Drawing.ColorTranslator]::FromHtml("#4ADE80")
$YELLOW = [System.Drawing.ColorTranslator]::FromHtml("#FACC15")
$RED    = [System.Drawing.ColorTranslator]::FromHtml("#F87171")

$fontTitle  = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$fontSub    = New-Object System.Drawing.Font("Segoe UI", 9)
$fontLabel  = New-Object System.Drawing.Font("Segoe UI", 9)
$fontCode   = New-Object System.Drawing.Font("Consolas",  34, [System.Drawing.FontStyle]::Bold)
$fontBtn    = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$fontSmall  = New-Object System.Drawing.Font("Segoe UI",  8)

# ── Form ───────────────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text            = "2FA Code Generator"
$form.Size            = New-Object System.Drawing.Size(400, 480)
$form.StartPosition   = "CenterScreen"
$form.BackColor       = $BG
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox     = $false
$form.Icon            = [System.Drawing.SystemIcons]::Shield

function New-Label($text, $x, $y, $w, $h, $f, $fg, $bg) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text      = $text; $l.Location = "$x,$y"; $l.Size = "$w,$h"
    $l.Font      = $f;    $l.ForeColor = $fg;    $l.BackColor = $bg
    $l.TextAlign = "MiddleLeft"
    return $l
}

# Title
$lblTitle = New-Label "2FA Code Generator" 20 18 360 32 $fontTitle $FG $BG
$lblTitle.TextAlign = "MiddleCenter"
$form.Controls.Add($lblTitle)

$lblSub = New-Label "TOTP Authenticator" 20 50 360 20 $fontSub $MUTED $BG
$lblSub.TextAlign = "MiddleCenter"
$form.Controls.Add($lblSub)

# ── Input card ─────────────────────────────────────────────────────────────
$cardInput = New-Object System.Windows.Forms.Panel
$cardInput.Location = "16,80"; $cardInput.Size = "368,120"
$cardInput.BackColor = $CARD
$form.Controls.Add($cardInput)

$lInput = New-Label "Secret Key (Base32)" 16 12 200 18 $fontLabel $MUTED $CARD
$cardInput.Controls.Add($lInput)

$txtSecret = New-Object System.Windows.Forms.TextBox
$txtSecret.Location = "16,34"; $txtSecret.Size = "290,28"
$txtSecret.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#374151")
$txtSecret.ForeColor = $FG; $txtSecret.BorderStyle = "None"
$txtSecret.Font      = New-Object System.Drawing.Font("Consolas", 11)
$txtSecret.PasswordChar = [char]0x25CF
$cardInput.Controls.Add($txtSecret)

$btnEye = New-Object System.Windows.Forms.Button
$btnEye.Location = "312,32"; $btnEye.Size = "40,28"
$btnEye.Text = "👁"; $btnEye.FlatStyle = "Flat"
$btnEye.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#374151")
$btnEye.ForeColor = $MUTED; $btnEye.FlatAppearance.BorderSize = 0
$btnEye.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnEye.Add_Click({ if ($txtSecret.PasswordChar -eq [char]0x25CF) { $txtSecret.PasswordChar = [char]0 } else { $txtSecret.PasswordChar = [char]0x25CF } })
$cardInput.Controls.Add($btnEye)

$btnGet = New-Object System.Windows.Forms.Button
$btnGet.Location = "16,72"; $btnGet.Size = "336,36"
$btnGet.Text = "Get Code"; $btnGet.FlatStyle = "Flat"
$btnGet.BackColor = $ACC; $btnGet.ForeColor = "White"
$btnGet.Font = $fontBtn; $btnGet.FlatAppearance.BorderSize = 0
$btnGet.Cursor = [System.Windows.Forms.Cursors]::Hand
$cardInput.Controls.Add($btnGet)

# ── Result card ─────────────────────────────────────────────────────────────
$cardResult = New-Object System.Windows.Forms.Panel
$cardResult.Location = "16,212"; $cardResult.Size = "368,130"
$cardResult.BackColor = $CARD
$form.Controls.Add($cardResult)

$lResult = New-Label "Your 2FA Code" 16 12 200 18 $fontLabel $MUTED $CARD
$cardResult.Controls.Add($lResult)

$lblCode = New-Label "--- ---" 16 36 240 58 $fontCode $FG $CARD
$lblCode.Cursor = [System.Windows.Forms.Cursors]::Hand
$cardResult.Controls.Add($lblCode)

$btnCopy = New-Object System.Windows.Forms.Button
$btnCopy.Location = "268,46"; $btnCopy.Size = "80,28"
$btnCopy.Text = "Copy"; $btnCopy.FlatStyle = "Flat"
$btnCopy.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#374151")
$btnCopy.ForeColor = $FG; $btnCopy.Font = $fontLabel
$btnCopy.FlatAppearance.BorderSize = 0
$btnCopy.Cursor = [System.Windows.Forms.Cursors]::Hand
$cardResult.Controls.Add($btnCopy)

$lblCopied = New-Label "" 268 76 80 18 $fontSmall $GREEN $CARD
$lblCopied.TextAlign = "MiddleCenter"
$cardResult.Controls.Add($lblCopied)

# ── Timer card ──────────────────────────────────────────────────────────────
$cardTimer = New-Object System.Windows.Forms.Panel
$cardTimer.Location = "16,352"; $cardTimer.Size = "368,56"
$cardTimer.BackColor = $CARD
$form.Controls.Add($cardTimer)

$lExpire = New-Label "Expires in" 16 10 100 18 $fontSmall $MUTED $CARD
$cardTimer.Controls.Add($lExpire)

$lblSecs = New-Label "--s" 320 10 32 18 $fontSmall $MUTED $CARD
$lblSecs.TextAlign = "MiddleRight"
$cardTimer.Controls.Add($lblSecs)

$barBG = New-Object System.Windows.Forms.Panel
$barBG.Location = "16,32"; $barBG.Size = "336,8"
$barBG.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#374151")
$cardTimer.Controls.Add($barBG)

$bar = New-Object System.Windows.Forms.Panel
$bar.Location = "0,0"; $bar.Size = "336,8"
$bar.BackColor = $GREEN
$barBG.Controls.Add($bar)

# Status
$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = "16,418"; $lblStatus.Size = "368,20"
$lblStatus.Text = "Enter your secret key to begin"
$lblStatus.ForeColor = $MUTED; $lblStatus.BackColor = $BG
$lblStatus.Font = $fontSmall; $lblStatus.TextAlign = "MiddleCenter"
$form.Controls.Add($lblStatus)

# ── State ───────────────────────────────────────────────────────────────────
$script:active    = $false
$script:lastCode  = ""
$script:copyTimer = 0

function Update-Code {
    $sec = $txtSecret.Text.Trim()
    try {
        $code = [TOTP]::GetCode($sec)
        $script:lastCode = $code
        $lblCode.Text = "$($code.Substring(0,3)) $($code.Substring(3,3))"
        $lblCode.ForeColor = $FG
        $script:active = $true
        $lblStatus.Text = "Code updated. Click code or Copy to copy."
        $lblStatus.ForeColor = $MUTED
    } catch {
        $script:active = $false
        $lblCode.Text = "--- ---"
        $lblCode.ForeColor = $MUTED
        $lblStatus.Text = "Invalid secret key. Check and try again."
        $lblStatus.ForeColor = $RED
    }
}

$btnGet.Add_Click({ Update-Code })
$txtSecret.Add_KeyDown({ if ($_.KeyCode -eq "Return") { Update-Code } })

function Copy-Code {
    if ($script:lastCode -ne "") {
        [System.Windows.Forms.Clipboard]::SetText($script:lastCode)
        $lblCopied.Text = "Copied!"
        $script:copyTimer = 3
    }
}
$btnCopy.Add_Click({ Copy-Code })
$lblCode.Add_Click({ Copy-Code })

# ── Timer ───────────────────────────────────────────────────────────────────
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    if ($script:active) {
        $rem = [TOTP]::SecondsRemaining()
        $lblSecs.Text = "${rem}s"
        $ratio = $rem / 30.0
        $barW  = [int]($ratio * 336)
        $bar.Size = New-Object System.Drawing.Size([Math]::Max($barW,0), 8)
        $barColor = if ($ratio -gt 0.5) { $GREEN } elseif ($ratio -gt 0.25) { $YELLOW } else { $RED }
        $bar.BackColor = $barColor

        # Refresh code when window resets
        $sec = $txtSecret.Text.Trim()
        try {
            $newCode = [TOTP]::GetCode($sec)
            if ($newCode -ne $script:lastCode) {
                $script:lastCode = $newCode
                $lblCode.Text = "$($newCode.Substring(0,3)) $($newCode.Substring(3,3))"
            }
        } catch {}
    }

    if ($script:copyTimer -gt 0) {
        $script:copyTimer--
        if ($script:copyTimer -eq 0) { $lblCopied.Text = "" }
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run($form)
