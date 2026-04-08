@echo off
set PATH=C:\Program Files\nodejs;%PATH%

echo Starting Octopus Backend...
cd /d %~dp0src\backend
start cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Octopus Frontend...
cd /d %~dp0src\frontend
start cmd /k "npm run dev"

echo.
echo ========================================
echo  Octopus is starting...
echo  Backend: http://localhost:3000
echo  Frontend: http://localhost:3001
echo  API Docs: http://localhost:3000/docs
echo ========================================
echo.
pause
