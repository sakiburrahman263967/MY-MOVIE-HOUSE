@echo off
title My-Movie-House - By Sakibur Rahman
echo ========================================================
echo   Starting My-Movie-House (Created by Sakibur Rahman)
echo ========================================================

start "My-Movie-House Backend" cmd /k "cd backend && npm start"
timeout /t 2 /nobreak >nul
start "My-Movie-House Frontend" cmd /k "cd My-Movie-House-frontend && npm run dev"

echo Backend running on http://localhost:3001
echo Frontend running on http://localhost:5173
echo.
pause
