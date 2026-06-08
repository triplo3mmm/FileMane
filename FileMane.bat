@echo off
cd /d "C:\caminho\para\FileMane"
npm install
start "" cmd /k "npm start"
echo Aguardando inicialização...
timeout /t 3 /nobreak >nul
if "%~1"=="" (
  start "" "http://localhost:3000"
) else (
  start "" "%~1" "http://localhost:3000"
)