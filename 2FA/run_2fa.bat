@echo off
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python not found. Please install Python from https://python.org
    pause
    exit /b
)
pythonw "%~dp02fa_app.py"
