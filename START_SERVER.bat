@echo off
chcp 65001 >nul
title MY-MOVIE-HOUSE LAUNCHER
cd /d "%~dp0"

echo ========================================
echo   MY MOVIE HOUSE - SERVER LAUNCHER
echo ========================================
echo.

:: Backend check
if not exist "backend\node_modules\" (
    echo [INFO] Backend node_modules not found. Installing...
    cd backend
    call npm install --no-audit --no-fund
    cd ..
    echo [DONE] Backend dependencies installed.
    echo.
)

:: Frontend check
if not exist "My-Movie-House-frontend\node_modules\" (
    echo [INFO] Frontend node_modules not found. Installing...
    cd My-Movie-House-frontend
    call npm install --no-audit --no-fund
    cd ..
    echo [DONE] Frontend dependencies installed.
    echo.
)

:: Clean up any leftover processes on ports 3001, 5173, 5174
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174 "') do taskkill /f /pid %%a >nul 2>&1

echo [STARTING] BDIX Stremio Addons on http://127.0.0.1:43003
start "MY-MOVIE-HOUSE - BDIX ADDONS" /min cmd /k "cd /d "%~dp0bdix-stremio-addons" && node index.js"

echo [STARTING] Backend on http://localhost:3001
start "MY-MOVIE-HOUSE - BACKEND" cmd /k "cd /d "%~dp0backend" && node server.js"

ping 127.0.0.1 -n 3 >nul

echo [STARTING] Frontend on http://localhost:5173
start "MY-MOVIE-HOUSE - FRONTEND" cmd /k "cd /d "%~dp0My-Movie-House-frontend" && npm run dev"

echo.
echo ========================================
echo   Both servers started in new windows
echo   Backend : http://localhost:3001
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Ei launcher window bondho korte paren.
ping 127.0.0.1 -n 5 >nul
exit
