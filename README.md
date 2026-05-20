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
