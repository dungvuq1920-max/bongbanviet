@echo off
echo Installing PyInstaller...
pip install pyinstaller --quiet
echo Building EXE...
pyinstaller --onefile --windowed --name "2FA_Generator" 2fa_app.py
echo.
echo Done! EXE is in the "dist" folder.
pause
