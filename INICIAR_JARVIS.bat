@echo off
setlocal
cd /d "%~dp0"
python scripts\launch.py
if errorlevel 1 (
  echo.
  echo O JARVIS nao conseguiu iniciar. Confira a mensagem acima.
  echo Se Python ou Node nao foram encontrados, feche esta janela e confirme a instalacao.
  pause
  exit /b 1
)
