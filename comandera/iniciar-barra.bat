@echo off
rem Comanda de barra: se queda mirando si hay comandas para imprimir. Editar las tres líneas de abajo.
cd /d "%~dp0"
set NKT_LOCAL=l1
set NKT_SUPABASE_KEY=PEGAR_ACA_LA_CLAVE
set COMANDERA_USB=NOMBRE EXACTO DE LA IMPRESORA DE LA BARRA
:otra_vez
node barra.js
rem si el programa se corta, espera 10 segundos y vuelve a arrancar
timeout /t 10 /nobreak >nul
goto otra_vez
