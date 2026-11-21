@echo off
rem Abre la comanda de BARRA y la de COCINA, cada una en su ventana. Este es el que va en la carpeta Inicio de Windows.
rem Si la cocina no imprime en papel (interruptor apagado en la app), la ventana de cocina simplemente no hace nada.
cd /d "%~dp0"
start "Comanda de BARRA" "%~dp0iniciar-barra.bat"
timeout /t 3 /nobreak >nul
start "Comanda de COCINA" "%~dp0iniciar-cocina.bat"
