@echo off
rem Doble clic: muestra los nombres de las impresoras instaladas en esta PC.
cd /d "%~dp0"
echo Buscando impresoras...
echo.
node barra.js --listar
echo.
echo Anota el nombre EXACTO de la impresora de la barra.
pause
