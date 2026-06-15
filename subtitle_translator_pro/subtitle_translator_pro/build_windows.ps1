$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=========================================="
Write-Host "Building SubtitleTranslatorPro.exe"
Write-Host "=========================================="

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

if (Test-Path build) { Remove-Item build -Recurse -Force }
if (Test-Path dist) { Remove-Item dist -Recurse -Force }

pyinstaller --noconfirm SubtitleTranslatorPro.spec

Write-Host ""
Write-Host "[OK] Build thành công."
Write-Host "EXE: $PSScriptRoot\dist\SubtitleTranslatorPro.exe"
