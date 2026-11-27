# Prueba de comandas · Bodegón y Kusama

Plan para probar antes de arrancar en serio. Nada de esto se probó todavía con impresoras reales.

## Antes de empezar (una sola vez, en la PC de impresión)
1. Copiar el `barra.js` nuevo a la carpeta `comandera`.
2. En `iniciar-barra.bat` e `iniciar-cocina.bat`, borrar `set NKT_LOCAL=l1`.
3. Agregar `--con-pruebas` al final de la línea de `node` en los dos:
   - barra: `node barra.js --usb-guardada --con-pruebas`
   - cocina: `node barra.js --destino cocina --ip 192.168.1.222 --con-pruebas`
4. Cerrar y abrir `iniciar-todo.bat`.

## Prueba
**Bodegón** (desde una de sus PC)
1. Comandas del Bodegón → **🎮 Practicar (simulador)**.
2. Marchar una comanda con comida y bebida (sale en barra y en cocina).
3. Revisar: sale una sola vez en cada impresora y el encabezado dice "BODEGON - …".
4. Probar la pantalla de cocina, si la usan.

**Kusama** (desde la PC nueva)
1. Comandas de **Kusama** → 🎮 Practicar.
2. Marchar una comanda: sale en las mismas impresoras con "KUSAMA - …".
3. Cobrarla: no debe tocar la caja.

**Los dos a la vez**: marchar una de cada local casi juntas; no deben mezclarse ni salir duplicadas.

## Al terminar
1. En cada local: **🔄 Empezar de cero** y **Salir de la práctica**.
2. En la PC de impresión: sacar `--con-pruebas` de los dos `.bat` y reiniciar `iniciar-todo.bat`.
3. Mirar la caja del día de cada local: igual que antes de la prueba.

## Para arrancar en serio
- Interruptor de papel de cocina prendido en cada local.
- `iniciar-todo.bat` en la carpeta Inicio de Windows y la PC de impresión sin dormirse.
- Categorías de bebida marcadas en cada local (hecho).
- Impresora de cocina con IP fija.
- Un mozo o cajero de cada local con una comanda de práctica hecha.

## Abierto
- Pantalla de cocina del Bodegón: no se revisó.
- Verificación de caja: se retoma junto con las comandas (que el esperado salga de los cobros y un solo control al cerrar el turno).
- Si algo falla: volver a poner `set NKT_LOCAL=l1` en los `.bat` deja todo como antes.
