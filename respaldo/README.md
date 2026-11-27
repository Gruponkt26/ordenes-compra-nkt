# Copia de seguridad de la base

Baja **todas las tablas** de la base (Supabase) y las guarda como archivos JSON, una carpeta por copia: `respaldos\2026-11-27_2300\`. Dentro hay un archivo por tabla y un `_resumen.json` con cuántas filas tiene cada una y qué tablas dieron error.

Solo **lee** la base. Nunca escribe ni borra nada en ella.

## Dónde se guarda
En la carpeta `respaldos`, al lado del programa, en la PC donde lo corras. **Eso solo no alcanza**: si la PC se rompe, se pierde todo junto. Por eso conviene una de estas dos cosas:
1. Poner la carpeta de copias **dentro de Google Drive u OneDrive** (cambiar `set CARPETA=` en `respaldar.bat`), para que se suba a la nube sola.
2. Copiar de vez en cuando la carpeta a un pendrive o disco externo.

Las copias contienen datos personales (clientes, empleados, sueldos): no las compartas ni las subas a GitHub. La carpeta `respaldos` ya está excluida de git.

Se conservan las copias de los últimos 30 días; las más viejas se borran solas.

## Instalarlo (en la PC de impresión, que está siempre prendida)
1. Tener Node.js instalado (ya lo está: se usa para la comandera). Hace falta la versión 18 o más.
2. Copiar esta carpeta `respaldo` a la PC.
3. Probarlo: doble clic en `respaldar.bat`. Después abrí `respaldo-log.txt` y la carpeta `respaldos`: tiene que haber una carpeta nueva con archivos `.json`.
4. Programarlo todos los días: **Programador de tareas de Windows** → *Crear tarea básica* → nombre «Respaldo NKT» → *Diariamente*, a una hora en que la PC esté prendida (por ejemplo, 04:00) → *Iniciar un programa* → elegir `respaldar.bat`. En las propiedades de la tarea, tildar *Ejecutar tanto si el usuario inició sesión como si no* y, si es notebook, *Iniciar la tarea solo si hay conexión de red*.

## Cómo saber que funciona
- `respaldo-log.txt` tiene una línea «Listo: N tablas guardadas…» por cada corrida.
- Revisá cada tanto que haya una carpeta con la fecha de ayer.
- Si alguna tabla dice `✗`, esa tabla **no** quedó respaldada ese día.

## Limitaciones (para tenerlas presentes)
- Baja lo que la clave pública de la app puede leer. Si una tabla estuviera protegida y no se pudiera leer, aparece con error.
- Las tablas se bajan una por una, no en un solo instante: si alguien carga datos justo durante la copia, puede quedar un pequeño desfasaje entre tablas.
- **Restaurar es manual** y no está automatizado a propósito: ante un problema, se mira la copia y se decide qué recuperar, con cuidado. Los archivos son JSON comunes, una fila por registro.
- No guarda lo que está fuera de la base (por ejemplo imágenes o archivos subidos a otro lado).
