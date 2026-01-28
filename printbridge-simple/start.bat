@echo off
title Flowp PrintBridge v1.0.4
cd /d "%~dp0"

echo.
echo ========================================
echo   Flowp PrintBridge v1.0.4
echo   With Logo and Coupon Support
echo ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting PrintBridge server...
echo.

REM Run node server - when this exits, cleanup will run
node server.js

REM Cleanup: Kill any remaining node processes from PrintBridge
echo.
echo Shutting down PrintBridge...
for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq Flowp PrintBridge" /fo list ^| find "PID"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Done.
timeout /t 2 >nul
