@echo off
cd /d "%~dp0"

echo.
echo ========================================
echo   Flowp PrintBridge - Simple Edition
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
node server.js
pause
