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

## ⚠️ Columnas `clase` y `bien` en `aportes` y `retiros`

El módulo **🤝 Socios** permite registrar aportes y retiros de **bienes muebles** (una
heladera, mesas, un equipo), no sólo de plata. Eso necesita dos columnas más en cada tabla:

```sql
alter table aportes add column if not exists clase      text default 'dinero';
alter table aportes add column if not exists bien       text;
alter table aportes add column if not exists cotizacion numeric;
alter table aportes add column if not exists usd        numeric;
alter table retiros add column if not exists clase      text default 'dinero';
alter table retiros add column if not exists bien       text;
alter table retiros add column if not exists cotizacion numeric;
alter table retiros add column if not exists usd        numeric;
```

### La cuenta corriente va en dólares

Cada movimiento guarda además el **dólar blue del día** y su equivalente en USD, calculado
al cargarlo y **congelado**: es el valor de ese día y no se recalcula nunca más. Sin eso,
$800.000 puestos en 2024 y $800.000 puestos hoy figuran iguales en la cuenta corriente del
socio, y no lo son.

La cotización se carga a mano, con la última usada precargada. Se eligió a mano y no por
API porque el CSP de `vercel.json` sólo permite conectarse a Supabase: traerla automática
implicaría abrir el `connect-src` a un servicio externo que puede caerse o cambiar.

Un movimiento sin cotización suma en pesos pero no en dólares, y la cuenta corriente avisa
cuántos hay en esa situación para poder completarlos.

Hasta que existan, al guardar un movimiento aparece un aviso diciendo que faltan. Todo lo
ya cargado sigue funcionando: sin `clase` se lo toma como dinero, que es lo que era.

**Un bien no toca ninguna caja.** No entró ni salió plata, así que queda afuera de la
disponibilidad y del resultado del mes: sólo pesa en la cuenta corriente del socio. Por eso
al elegir "📦 Bien mueble" el formulario esconde el medio de pago y la cuenta, y pide en
cambio qué es y su valor estimado.

---

## ⚠️ Columna `pagos` en `adelantos`

Un adelanto de sueldo se puede repartir entre varios medios de pago (una parte en efectivo,
el resto por transferencia), igual que los sueldos. Eso necesita una columna más:

```sql
alter table adelantos add column if not exists pagos jsonb default '[]'::jsonb;
```

Hasta que la columna exista, al guardar un adelanto aparece un aviso diciendo justamente
que falta correr esto. Los adelantos ya cargados siguen funcionando: se leen por su
`medio_pago` de siempre.

---

## ⚠️ Tablas nuevas en Supabase: checklist

El **✅ Checklist** (módulo Locales → elegís un local → pestaña *Checklist*) es el
checklist operativo diario, con turno de apertura y de cierre. Necesita tres tablas y un
bucket de fotos. Creá las tablas una sola vez desde Supabase → SQL Editor:

```sql
-- Encargado y firma de cada local / turno / fecha
create table if not exists checklist_turnos (
  id         text primary key,
  local      text,
  fecha      date,
  turno      text,
  encargado  text,
  firmado    boolean default false,
  updated_at timestamptz default now()
);

-- Estado, hora, comentario y foto de cada tarea
create table if not exists checklist_items (
  id         text primary key,
  turno_id   text,
  local      text,
  fecha      date,
  turno      text,
  area_id    text,
  idx        integer,
  status     text,
  comentario text,
  foto_url   text,
  hora       text,
  usuario    text,
  updated_at timestamptz default now()
);

-- Tareas personalizadas de un local / área / turno (pisan la plantilla del código)
create table if not exists checklist_tareas (
  id         text primary key,
  local      text,
  area_id    text,
  turno      text,
  tareas     jsonb,
  updated_at timestamptz default now()
);
```

Y para las fotos: Supabase → **Storage** → **New bucket** → nombre `checklist`, marcado
como **público**. Sin el bucket todo lo demás funciona, pero al subir una foto avisa que
no se pudo.

Hasta que existan las tablas, la pestaña abre y se puede usar, pero nada se guarda entre
sesiones (y al tildar aparece un aviso diciéndolo).

Cómo está armado:

- Las **tareas base** de las 6 áreas (Salón, Depósito, Cocina, Baños, Patio y Vereda) están
  en el código, en `CHK_AREAS`, separadas por turno. El **Patio es sólo del Bodegón**.
- Si un local agrega o saca tareas, eso se guarda en `checklist_tareas` y pisa la plantilla
  **para ese local, esa área y ese turno**. Los demás locales no se tocan.
- El `id` de un ítem es `local_turno_fecha_area_idx`, así marcar y desmarcar pisa la misma
  fila en vez de acumular filas muertas.

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
