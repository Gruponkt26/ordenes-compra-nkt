// Copia de seguridad de la base (Supabase): baja TODAS las tablas y las guarda como archivos JSON en una carpeta con la fecha y la hora.
// No necesita instalar nada, solo Node.js. Solo LEE la base: nunca escribe ni borra nada en ella.
//
//   node respaldar.js                              → guarda en la carpeta "respaldos" (al lado de este archivo)
//   node respaldar.js --carpeta "D:\\Respaldos NKT"  → guarda en otra carpeta (conviene una que se sincronice con Drive/OneDrive)
//   node respaldar.js --guardar 30                 → conserva las copias de los últimos 30 días (por defecto 30) y borra las más viejas
//   node respaldar.js --tablas pautas,gastos       → solo esas tablas (para probar)
//
// Variables de entorno o parámetros: NKT_SUPABASE_URL / --url y NKT_SUPABASE_KEY / --key (por defecto, los de la app).
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const URL_BASE = String(opcion("url", process.env.NKT_SUPABASE_URL || "https://qcfwqnqtrqyjdfvakwxt.supabase.co")).replace(/\/+$/, "");
const CLAVE_PUBLICA = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZndxbnF0cnF5amRmdmFrd3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYxODMsImV4cCI6MjA5NjE1MjE4M30.Zh5jN_oGXde0JGBJ_NTBn5Mkr2m6lI3VPjAsqrzd6Gc";
const CLAVE = String(opcion("key", process.env.NKT_SUPABASE_KEY || CLAVE_PUBLICA)).replace(/[^\x21-\x7E]/g, "");
const CARPETA = path.resolve(opcion("carpeta", path.join(__dirname, "respaldos")));
const DIAS = Math.max(1, parseInt(opcion("guardar", "30"), 10) || 30);
const SOLO = opcion("tablas", "") ? String(opcion("tablas", "")).split(",").map((x) => x.trim()).filter(Boolean) : null;
const PAGINA = 1000;
// Por si la base no devuelve la lista de tablas: las que usa la app.
const TABLAS_RESPALDO = ["pautas", "gastos", "cierres_caja", "fichajes", "empleados", "usuarios", "comandas", "comanda_items", "comanda_mesas", "carta", "vencimientos", "ordenes", "productos", "proveedores", "precios", "saldos_proveedores", "sueldos", "planilla_sueldos", "adelantos", "vacaciones", "retiros", "aportes", "cargas_sociales", "stock", "stock_materia_prima", "stock_movimientos", "stock_mp_movimientos", "menu_stock", "recetas", "ideas", "faltantes", "conceptos_gastos", "categorias_gastos", "info_cajero", "avisos_caja", "locales_datos", "locales_obras", "traspasos_resultados", "correcciones_resultados", "checklist_tareas", "checklist_turnos", "checklist_items", "deportes"];

const hdr = { apikey: CLAVE, Authorization: "Bearer " + CLAVE };
const dos = (n) => String(n).padStart(2, "0");
const ahora = new Date();
const sello = ahora.getFullYear() + "-" + dos(ahora.getMonth() + 1) + "-" + dos(ahora.getDate()) + "_" + dos(ahora.getHours()) + dos(ahora.getMinutes());
const log = (m) => console.log(dos(new Date().getHours()) + ":" + dos(new Date().getMinutes()) + "  " + m);

async function get(url, extra) {
  const r = await fetch(url, { headers: Object.assign({}, hdr, extra || {}) });
  const t = await r.text();
  return { ok: r.ok, status: r.status, texto: t };
}

async function listarTablas() {
  if (SOLO) return SOLO;
  try {
    const r = await get(URL_BASE + "/rest/v1/", { Accept: "application/openapi+json, application/json" });
    if (r.ok) {
      const j = JSON.parse(r.texto);
      const nombres = Object.keys(j.definitions || (j.components && j.components.schemas) || {});
      if (nombres.length) return nombres.sort();
    }
  } catch (e) { /* se usa la lista de respaldo */ }
  log("Aviso: la base no devolvió la lista de tablas; se usa la lista conocida de la app.");
  return TABLAS_RESPALDO;
}

// Baja una tabla completa de a 1000 filas. Si no se puede ordenar por "id", se baja sin orden.
async function bajarTabla(tabla) {
  const filas = [];
  for (const orden of ["&order=id.asc", ""]) {
    filas.length = 0;
    let desde = 0, fallo = null;
    for (;;) {
      const r = await get(URL_BASE + "/rest/v1/" + encodeURIComponent(tabla) + "?select=*" + orden, { Range: desde + "-" + (desde + PAGINA - 1), "Range-Unit": "items" });
      if (!r.ok) { fallo = r.status + " " + r.texto.slice(0, 120); break; }
      let pag; try { pag = JSON.parse(r.texto); } catch (e) { fallo = "respuesta que no es JSON"; break; }
      if (!Array.isArray(pag)) { fallo = "respuesta inesperada"; break; }
      for (const f of pag) filas.push(f);
      if (pag.length < PAGINA) break;
      desde += PAGINA;
    }
    if (!fallo) return { filas: filas.slice() };
    if (orden === "") return { error: fallo };
  }
  return { error: "no se pudo bajar" };
}

function limpiarViejas() {
  const limite = Date.now() - DIAS * 86400000;
  let borradas = 0;
  for (const nom of fs.readdirSync(CARPETA)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})_\d{4}$/.exec(nom);   // solo carpetas con este formato: nunca toca otra cosa
    if (!m) continue;
    if (new Date(+m[1], +m[2] - 1, +m[3]).getTime() < limite) { fs.rmSync(path.join(CARPETA, nom), { recursive: true, force: true }); borradas++; }
  }
  return borradas;
}

(async () => {
  if (typeof fetch !== "function") { console.error("Este Node.js es muy viejo (hace falta la versión 18 o más). Instalá la versión LTS desde nodejs.org."); process.exit(2); }
  fs.mkdirSync(CARPETA, { recursive: true });
  const tmp = path.join(CARPETA, "_en_curso_" + sello);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  log("Respaldo de " + URL_BASE.replace(/^https?:\/\//, "") + " → " + CARPETA);
  const tablas = await listarTablas();
  const resumen = { fecha: ahora.toISOString(), base: URL_BASE, tablas: {}, errores: {} };
  for (const t of tablas) {
    const r = await bajarTabla(t);
    if (r.error) { resumen.errores[t] = r.error; log("  ✗ " + t + ": " + r.error); continue; }
    fs.writeFileSync(path.join(tmp, t + ".json"), JSON.stringify(r.filas));
    resumen.tablas[t] = r.filas.length;
    log("  ✓ " + t + ": " + r.filas.length + " filas");
  }
  const okN = Object.keys(resumen.tablas).length, malN = Object.keys(resumen.errores).length;
  fs.writeFileSync(path.join(tmp, "_resumen.json"), JSON.stringify(resumen, null, 2));
  if (okN === 0) { fs.rmSync(tmp, { recursive: true, force: true }); console.error("No se pudo bajar ninguna tabla. ¿Hay internet? Revisá la clave."); process.exit(1); }
  const destino = path.join(CARPETA, sello);
  fs.rmSync(destino, { recursive: true, force: true });
  fs.renameSync(tmp, destino);   // recién acá aparece la copia: una copia a medias nunca queda como si estuviera completa
  const borradas = limpiarViejas();
  log("Listo: " + okN + " tablas guardadas en " + destino + (malN ? " · " + malN + " con error (ver arriba)" : "") + (borradas ? " · se borraron " + borradas + " copia(s) de más de " + DIAS + " días" : ""));
  process.exit(malN ? 1 : 0);
})().catch((e) => { console.error("Falló el respaldo: " + e.message); process.exit(1); });
