@echo off
:: Check for admin rights and request if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo   Requesting Administrator Privileges
    echo ========================================
    echo.
    echo Windows requires admin rights to build.
    echo Please click "Yes" on the prompt...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Change to script directory (in case we're elevated)
cd /d "%~dp0"

echo.
echo ========================================
echo   Flowp PrintBridge Builder
echo ========================================
echo.
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: npm install failed!
    echo Make sure you have Node.js installed.
    echo Download from: https://nodejs.org
    pause
    exit /b 1
)
echo.
echo Building PrintBridge...
call npm run build:portable
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo.
echo ========================================
echo   BUILD COMPLETE!
echo ========================================
echo.
echo Your FlowpPrintBridge.exe is in the "dist" folder.
echo.
start "" "%~dp0dist"
pause
