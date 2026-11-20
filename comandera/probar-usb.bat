@echo off
rem Doble clic: te muestra las impresoras numeradas, elegis la de la barra por numero y imprime un ticket de prueba.
cd /d "%~dp0"
node prueba.js --elegir
echo.
pause
