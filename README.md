# 🛒 Compras Pro — Guía de instalación en Vercel

## ¿Qué necesitás?
- Una cuenta gratuita en [vercel.com](https://vercel.com) (se puede crear con Gmail)
- Una cuenta gratuita en [github.com](https://github.com) (opcional pero recomendado)

---

## Opción A — Subir directo desde la web (más fácil)

1. Abrí [vercel.com](https://vercel.com) y creá una cuenta gratis
2. Hacé clic en **"Add New Project"**
3. Elegí **"Upload"** y arrastrá toda la carpeta `compras-pro`
4. Vercel detecta que es un proyecto Vite automáticamente
5. Hacé clic en **Deploy** — ¡listo!
6. Te da un link tipo `compras-pro-xxx.vercel.app` — ese es el link de tu app

---

## Opción B — Via GitHub (recomendado para actualizaciones fáciles)

1. Creá un repo en GitHub y subí esta carpeta
2. En Vercel conectá tu cuenta de GitHub
3. Seleccioná el repo y hacé clic en Deploy
4. Cada vez que actualices el código en GitHub, Vercel actualiza la app solo

---

## ¿Cómo instalarla en el celular?

### Android (Chrome):
1. Abrí el link de la app en Chrome
2. Aparece un banner que dice **"Agregar a pantalla de inicio"** → tocalo
3. ¡Ya está instalada como app!

### iPhone (Safari):
1. Abrí el link en Safari
2. Tocá el botón de compartir (cuadradito con flechita ↑)
3. Elegí **"Agregar a pantalla de inicio"**
4. ¡Lista!

---

## Compartir con empleados

Simplemente mandales el link de Vercel por WhatsApp.
Ellos lo abren en el celu y lo instalan como app.

**Los datos de cada celular son independientes** (cada uno tiene su propio stock y historial guardado localmente).

---

## ⚠️ Nota sobre la IA
El asistente de IA usa la API de Anthropic (Claude).
Para que funcione en producción, necesitás configurar una API key:

1. Creá una cuenta en [console.anthropic.com](https://console.anthropic.com)
2. Generá una API key
3. En Vercel → Settings → Environment Variables → agregá:
   - Nombre: `VITE_ANTHROPIC_API_KEY`
   - Valor: tu API key

Luego en `src/App.jsx`, en el fetch de la IA, agregá el header:
```js
"x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
"anthropic-version": "2023-06-01",
"anthropic-dangerous-direct-browser-ipc": "true"
```

---

## ⚠️ Tabla nueva en Supabase: `aportes`

El módulo **🤝 Aportes de Socios** (Administración → Egresos → pestaña *Aportes*)
necesita una tabla propia. Creala una sola vez desde Supabase → SQL Editor:

```sql
create table if not exists aportes (
  id          text primary key,
  socio       text,
  local       text,
  monto       numeric,
  tipo_aporte text,
  notas       text,
  fecha       date,
  usuario     text,
  created_at  timestamptz default now()
);
```

Hasta que la tabla exista, el panel abre y funciona pero los aportes no se guardan
entre sesiones.

### ⚠️ Columna `local_cuenta` en `aportes` y `retiros`

Los aportes y retiros distinguen **a qué local le corresponde** el movimiento de **por qué
cuenta se movió la plata** (por ejemplo: un aporte para Kusama que el socio depositó en
Mercado Pago Nicolás, que es cuenta de Bodegón). Eso requiere una columna más en las dos
tablas. Corré esto en Supabase → SQL Editor:

```sql
alter table aportes add column if not exists local_cuenta text;
alter table retiros add column if not exists local_cuenta text;
```

Hasta que la columna exista, **los aportes y retiros no se van a guardar**: la app avisa en
pantalla con un cartel rojo indicando justamente esto. Los registros viejos, sin el dato,
se siguen comportando como antes (la cuenta se asume del mismo local del movimiento).

### Cómo se leen los aportes y los retiros

Los movimientos de socios **no son parte del resultado operativo**:

- **Resultado del mes** = ventas − gastos reales. No incluye ni aportes ni retiros.
  Es lo que el local genera por sí solo.
- **Movimientos de socios** = aportes (+) y retiros (−), en un bloque aparte debajo
  del resultado. Un retiro mayor a la ganancia del mes se marca con una alerta:
  esa diferencia sale del capital del local, no de la ganancia.
- **Disponibilidad de caja** = incluye todo, con su medio de pago, para que el
  efectivo y los bancos cuadren contra la realidad.

Ojo con los dos criterios de imputación, que conviven a propósito:

- El **resultado** se imputa por el local del movimiento — quién consumió el gasto, a qué
  local le corresponde el aporte o el retiro.
- La **disponibilidad** se imputa por el local de la cuenta — de dónde salió o entró la
  plata realmente.

Por eso un mismo movimiento puede figurar en el resultado de un local y en la
disponibilidad de otro. No está duplicado: responden preguntas distintas.

---

## Estructura del proyecto
```
compras-pro/
├── index.html          ← entrada principal
├── package.json        ← dependencias
├── vite.config.js      ← configuración con PWA
└── src/
    ├── main.jsx        ← punto de entrada React
    └── App.jsx         ← toda la aplicación
```
