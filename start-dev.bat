@echo off
echo Starting backend server...
start "JiraBackend" cmd /k "cd /d %~dp0 && node server\index.js"

echo Starting frontend server...
start "JiraFrontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Both servers should be running:
echo - Backend: http://localhost:3001
echo - Frontend: http://localhost:5173
echo.
echo Press any key to exit this window (servers will keep running)
pause > nul