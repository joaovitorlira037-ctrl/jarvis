@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Execute INICIAR_JARVIS.bat primeiro para preparar o ambiente.
  pause
  exit /b 1
)
.venv\Scripts\python.exe scripts\diagnose.py
pause
