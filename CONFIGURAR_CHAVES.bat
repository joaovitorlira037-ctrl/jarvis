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
echo As chaves devem ser salvas no arquivo .env que sera aberto no Bloco de Notas.
echo Depois de salvar, encerre o terminal do JARVIS com Ctrl+C e abra INICIAR_JARVIS.bat novamente.
notepad.exe ".env"
