@echo off
rem Comanda de barra: se queda mirando si hay comandas para imprimir. Editar solo la línea del nombre de la impresora (la clave ya viene incluida).
cd /d "%~dp0"
set NKT_LOCAL=l1
set COMANDERA_USB=NOMBRE EXACTO DE LA IMPRESORA DE LA BARRA
:otra_vez
node barra.js
rem si el programa se corta, espera 10 segundos y vuelve a arrancar
timeout /t 10 /nobreak >nul
goto otra_vez
