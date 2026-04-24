@echo off
echo ============================================
echo  Dang dong goi ung dung thanh file .exe ...
echo ============================================

REM Kiem tra Python
py --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Chua cai Python! Tai tai: https://python.org
    pause
    exit /b 1
)

REM Cai PyInstaller neu chua co
py -m pip show pyinstaller >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang cai PyInstaller...
    py -m pip install pyinstaller
)

echo.
echo Dang build...
py -m PyInstaller --onefile --windowed --name "LichTapBongBan" lich_tap_bong_ban.py

echo.
if exist "dist\LichTapBongBan.exe" (
    echo [THANH CONG] File exe da duoc tao tai: dist\LichTapBongBan.exe
    echo.
    echo Sao chep file .exe ra Desktop...
    copy "dist\LichTapBongBan.exe" "%USERPROFILE%\Desktop\LichTapBongBan.exe"
    echo Done! Mo file LichTapBongBan.exe tren Desktop de chay.
) else (
    echo [LOI] Build that bai. Kiem tra lai Python va PyInstaller.
)

pause
