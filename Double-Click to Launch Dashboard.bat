@echo off
title Hotel Booking Dashboard Server
echo ========================================================
echo       LAUNCHING HOTEL BOOKING ANALYTICS DASHBOARD
echo ========================================================
echo.
cd /d "%~dp0"
python run_dashboard.py
if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Failed to run dashboard. Make sure Python is installed and added to PATH.
    pause
)
