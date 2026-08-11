@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ONE STEP Garmin Connector
echo.
echo ONE STEP Garmin Connector
echo.
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -m app.connect_member
) else (
  python -m app.connect_member
)
echo.
pause
