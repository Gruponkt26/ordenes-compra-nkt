@echo off
rem Imprime la linea de acentos con 4 tablas distintas. Doble clic, o:  probar-acentos.bat 192.168.1.50
cd /d "%~dp0"
set IP=%1
if "%IP%"=="" set IP=192.168.1.222
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0probar-acentos.ps1" -Ip %IP%
echo.
pause
