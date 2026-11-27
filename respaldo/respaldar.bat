@echo off
rem Copia de seguridad diaria de la base. La corre el Programador de tareas de Windows (ver README.md).
rem Para guardar en otra carpeta (por ejemplo una que se sincronice con Google Drive u OneDrive), cambiar la linea de "set CARPETA".
cd /d "%~dp0"
set CARPETA=%~dp0respaldos
node respaldar.js --carpeta "%CARPETA%" --guardar 30 >> respaldo-log.txt 2>&1
