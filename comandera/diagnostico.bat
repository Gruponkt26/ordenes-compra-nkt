@echo off
rem Doble clic: muestra datos de esta PC para entender por que no aparecen las impresoras. Sacale una foto a la pantalla.
cd /d "%~dp0"
echo === Windows ===
ver
echo.
echo === Node ===
node -v
echo.
echo === Impresoras (wmic) ===
wmic printer get name
echo.
echo === Impresoras (PowerShell) ===
powershell -NoProfile -Command "Get-WmiObject -Class Win32_Printer | ForEach-Object { $_.Name }"
echo.
echo === Lista del programa ===
node barra.js --listar
echo.
pause
