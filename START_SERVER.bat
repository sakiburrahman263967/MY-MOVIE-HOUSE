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

echo [STARTING] Backend on http://localhost:3001
start "MY-MOVIE-HOUSE - BACKEND" cmd /k "cd /d "%~dp0backend" && node server.js"

timeout /t 3 >nul

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
timeout /t 5 >nul
exit
