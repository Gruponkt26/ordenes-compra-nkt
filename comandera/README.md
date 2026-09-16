# 🖨️ Comandera térmica

Puente entre la app y la impresora de la cocina. La app **nunca** le habla directo a la
impresora: un navegador no puede abrir un socket TCP, así que no hay forma de que le mande
ESC/POS por el puerto 9100. Este programita, corriendo en una PC del local, es el que lo
hace.

Hoy es sólo la parte de imprimir, con un ticket de prueba. Cuando exista el módulo de
comandas, lo que se suma acá es el bucle que mira la tabla en Supabase y manda a imprimir
lo que va apareciendo.

## La impresora

| | |
|---|---|
| Modelo | 3nstar, 80mm |
| IP | `192.168.1.222` |
| Puerto | 9100 (ESC/POS crudo) |

**Conviene fijarle la IP en el router.** Si la toma por DHCP y algún día cambia, la
comandera deja de imprimir sin avisar nada y es un dolor de cabeza encontrar por qué.

## Probarlo

Hace falta [Node.js](https://nodejs.org) en la PC — la versión LTS, con el instalador de
siempre, *Siguiente → Siguiente*.

Después, desde esta carpeta:

```
node prueba.js
```

Sale un ticket con acentos, una ñ, un plato largo que no entra en una línea, una aclaración
y el corte de papel. Es a propósito: son las cuatro cosas que suelen romperse.

En Windows también se puede hacer doble clic en **`probar.bat`**.

Para ver cómo quedaría sin gastar papel:

```
node prueba.js --simular
```

## Si algo sale mal

**No imprime nada.** El programa dice qué pasó: que no contesta (está apagada, o la PC no
está en la misma red), o que rechazó la conexión (la IP contesta pero no es la impresora).
Para descartar la red, desde la PC: `ping 192.168.1.222`.

**Los acentos salen como símbolos raros.** Es la tabla de caracteres. Viene en CP858, que
es lo habitual; si esa no es, probá con CP850:

```
node prueba.js --codepage 2
```

Si con 2 sale bien, hay que dejarlo fijo (ver abajo).

**El texto se corta a lo ancho.** El papel no es de 80mm o la impresora usa otra fuente.
Con 58mm son 32 caracteres: `node prueba.js --ancho 32`.

## Cambiar la configuración

Para una prueba, por parámetro:

```
node prueba.js --ip 192.168.1.50 --puerto 9100 --ancho 48 --codepage 2
```

Para dejarlo fijo, variables de entorno: `COMANDERA_IP`, `COMANDERA_PUERTO`,
`COMANDERA_ANCHO`, `COMANDERA_CODEPAGE`. Los valores por defecto están arriba de todo en
`comandera.js`.

## Cuando esto quede andando

Los pasos siguientes, en orden:

1. **Que arranque solo** con la PC: Programador de tareas de Windows → nueva tarea → *Al
   iniciar sesión*. Así nadie tiene que acordarse de abrirlo.
2. **El bucle contra Supabase**: mirar las comandas nuevas e imprimirlas.
3. **Evitar el ticket duplicado.** Si el puente corre en las dos PC, cada comanda sale dos
   veces. Se resuelve marcando la comanda como tomada *antes* de imprimir, de forma que la
   otra PC vea que ya está — y no simplemente corriéndolo en una sola máquina, porque
   entonces apagar esa PC deja la cocina sin comandas.

## Por qué no usa ninguna librería

Sólo usa `net`, que viene con Node. Esto corre en la PC de un local: cada dependencia es
una cosa más que puede faltar el día que haya que reinstalarlo apurado, en medio de un
servicio. Los acentos se convierten a mano con una tabla de veinte líneas en vez de traer
un paquete entero para eso.
