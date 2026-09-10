@echo off
cd /d "%~dp0"

echo Starting local API (wrangler dev) in a separate window...
start "OpenWF API (local)" cmd /k "cd apps\api && npm run dev"

echo Waiting for the local API to come up...
timeout /t 6 /nobreak >nul

echo Starting OpenWF Mod Manager pointed at the LOCAL API (127.0.0.1:8787)...
set VITE_API_BASE_URL=http://127.0.0.1:8787
call npm run dev:desktop

pause
