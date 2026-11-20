@echo off
rem Prueba de impresion sin instalar nada. Doble clic para imprimir en 192.168.1.222,
rem o desde la consola:  probar-cocina.bat 192.168.1.50   (y opcional un segundo numero: 2 para la tabla CP850)
cd /d "%~dp0"
set IP=%1
if "%IP%"=="" set IP=192.168.1.222
set CP=%2
if "%CP%"=="" set CP=19
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0probar-cocina.ps1" -Ip %IP% -Codepage %CP%
echo.
pause
