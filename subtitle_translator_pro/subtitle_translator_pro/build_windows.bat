@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Building SubtitleTranslatorPro.exe
echo ==========================================

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python chua duoc cai hoac chua co trong PATH.
    pause
    exit /b 1
)

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

pyinstaller --noconfirm SubtitleTranslatorPro.spec

if errorlevel 1 (
    echo.
    echo [ERROR] Build that bai.
    pause
    exit /b 1
)

echo.
echo [OK] Build thanh cong.
echo File EXE nam tai:
echo %cd%\dist\SubtitleTranslatorPro.exe
pause
