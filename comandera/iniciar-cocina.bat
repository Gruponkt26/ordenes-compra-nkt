@echo off
rem Comanda de COCINA en papel: se queda mirando si hay comandas de cocina para imprimir y las manda a la impresora de red de la cocina.
rem Solo sirve si en la app esta prendido: Comandas > "Imprimir tambien en papel lo que va a la cocina". Editar la IP si cambia.
cd /d "%~dp0"
set NKT_LOCAL=l1
:otra_vez
node barra.js --destino cocina --ip 192.168.1.222
rem si el programa se corta, espera 10 segundos y vuelve a arrancar
timeout /t 10 /nobreak >nul
goto otra_vez
