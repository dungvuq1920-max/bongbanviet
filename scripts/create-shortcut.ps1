$Shell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$ShortcutPath = Join-Path $DesktopPath "Bóng Bàn Việt.lnk"
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\Users\dungvuq1920\Desktop\BONGBANVIET\scripts\start-bongbanviet-local.ps1"""
$Shortcut.WorkingDirectory = "c:\Users\dungvuq1920\Desktop\BONGBANVIET"
$Shortcut.IconLocation = "c:\Users\dungvuq1920\Desktop\BONGBANVIET\favicon.ico"
$Shortcut.Description = "Khởi chạy local server và mở BongBanViet"
$Shortcut.Save()
Write-Host "✅ Tạo lối tắt thành công trên Desktop!"
