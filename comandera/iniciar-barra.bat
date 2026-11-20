@echo off
rem Comanda de barra: se queda mirando si hay comandas para imprimir y las manda a la impresora USB elegida con probar-usb.bat.
rem Editar solo si hace falta: el codigo de local (l1 Bodegon, l2 Kusama, l3 Colantonios).
cd /d "%~dp0"
set NKT_LOCAL=l1
:otra_vez
node barra.js --usb-guardada
rem si el programa se corta, espera 10 segundos y vuelve a arrancar
timeout /t 10 /nobreak >nul
goto otra_vez
