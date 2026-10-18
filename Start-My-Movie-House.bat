@echo off
setlocal enabledelayedexpansion
title My-Movie-House - By Sakibur Rahman
color 0b

echo ===================================================================
echo                     My-Movie-House
echo             Designed & Developed by Sakibur Rahman
echo ===================================================================
echo.

:: Auto-detect paths
if exist "%~dp0movie-site\backend" (
    set "BACKEND_DIR=%~dp0movie-site\backend"
    set "FRONTEND_DIR=%~dp0movie-site\My-Movie-House-frontend"
) else if exist "%~dp0backend" (
    set "BACKEND_DIR=%~dp0backend"
    set "FRONTEND_DIR=%~dp0My-Movie-House-frontend"
) else (
    echo [ERROR] Could not locate backend or frontend folders!
    echo Please make sure this file is placed inside or next to the movie-site directory.
    pause
    exit /b 1
)

:: Clear previous hanging processes on ports 3001 & 5173 to avoid conflicts
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a >nul 2>&1

echo [1/3] Starting Backend API Server (Port 3001)...
start "My-Movie-House - Backend" cmd /k "cd /d "!BACKEND_DIR!" && npm start"

echo [2/3] Waiting for Backend to initialize...
timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend Dev Server (Port 5173)...
start "My-Movie-House - Frontend" cmd /k "cd /d "!FRONTEND_DIR!" && npm run dev"

timeout /t 3 /nobreak >nul

echo Launching My-Movie-House in your browser...
start http://localhost:5173

echo.
echo ===================================================================
echo   My-Movie-House is now up and running!
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:3001
echo   - Author:   Sakibur Rahman
echo   - Settings: Addons & TMDB Key are saved permanently on disk
echo ===================================================================
echo You can minimize this window.
timeout /t 6 >nul
