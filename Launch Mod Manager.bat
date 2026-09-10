@echo off
cd /d "%~dp0"
echo Starting OpenWF Mod Manager (dev mode)...
call npm run dev:desktop
pause
