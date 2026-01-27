@echo off
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
