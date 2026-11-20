@echo off
rem Doble clic: imprime un ticket de prueba en la impresora USB que elijas.
cd /d "%~dp0"
echo Escribi el nombre EXACTO de la impresora (como salio en ver-impresoras.bat) y apreta Enter:
set /p NOMBRE=Nombre: 
echo.
node prueba.js --usb "%NOMBRE%"
echo.
pause
