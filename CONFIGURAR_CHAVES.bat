@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  copy ".env.example" ".env" >nul
  if errorlevel 1 (
    echo Nao foi possivel criar o arquivo .env.
    pause
    exit /b 1
  )
)
start "" notepad.exe ".env"
