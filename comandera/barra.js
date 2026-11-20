// ─── COMANDA DE BARRA ─────────────────────────────────────────────────────────
// Las bebidas no pasan por la pantalla de la cocina: la app deja una «comanda de barra» para imprimir
// (tabla pautas, ámbito "impresion_barra") cada vez que se marcha algo de bebida. Este programa, que corre
// en una PC del local, mira cada tanto si hay comandas sin imprimir, las manda a la impresora de la barra y
// las marca como impresas. No usa librerías: solo lo que trae Node (18 o más).
//
//   node barra.js --local l1 --ip 192.168.1.223 --key LA_CLAVE
//   node barra.js --local l1 --simular        → muestra en pantalla cómo saldría, sin imprimir ni marcar nada
//   node barra.js --demo --simular            → una comanda de mentira, sin conectarse a nada
//
// Opciones (o variables de entorno): --local (l1 Bodegón, l2 Kusama, l3 Colantonio's) · --ip / COMANDERA_IP
// · --puerto · --ancho · --codepage · --url / NKT_SUPABASE_URL · --key / NKT_SUPABASE_KEY · --cada (segundos, 3).

const { imprimir, previsualizar, CONFIG } = require("./comandera");

const args = process.argv.slice(2);
const tiene = (n) => args.includes("--" + n);
function opcion(nombre, porDefecto) {
  const i = args.indexOf("--" + nombre);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : porDefecto;
}

const LOCAL = opcion("local", process.env.NKT_LOCAL || "");
const URL_BASE = String(opcion("url", process.env.NKT_SUPABASE_URL || "https://qcfwqnqtrqyjdfvakwxt.supabase.co")).replace(/\/+$/, "");
const CLAVE = opcion("key", process.env.NKT_SUPABASE_KEY || "");
const CADA = Math.max(1, parseInt(opcion("cada", "3"), 10) || 3);
const SIMULAR = tiene("simular");
const cfg = {
  ip: opcion("ip", CONFIG.ip),
  puerto: parseInt(opcion("puerto", CONFIG.puerto), 10),
  ancho: parseInt(opcion("ancho", CONFIG.ancho), 10),
  codepage: parseInt(opcion("codepage", CONFIG.codepage), 10),
};
const NOMBRES = { l1: "El Bodegon NKT", l2: "Kusama", l3: "Colantonio's" };

// La impresora no entiende los símbolos fuera del abecedario con acentos: se cambian por algo que sí se imprime.
const limpiar = (t) => String(t || "").replace(/[·•]/g, "-").replace(/[→»]/g, ">").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const hora = (iso) => { try { return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; } };

function ticketDe(job) {
  return {
    tipo: "BARRA",
    local: limpiar(job.titulo || NOMBRES[job.local] || ""),
    numero: job.numero || undefined,
    hora: hora(job.at),
    mozo: limpiar(job.mozo || ""),
    direccion: job.tipo === "delivery" ? limpiar(job.direccion || "") : "",
    items: (job.items || []).map((i) => ({ cant: i.cant || 1, nombre: limpiar(i.nombre), nota: limpiar(i.nota || "") })),
  };
}

const headers = () => ({ apikey: CLAVE, Authorization: "Bearer " + CLAVE, "Content-Type": "application/json" });
const impresos = new Set();   // por si marcar como impresa falla: no se imprime dos veces

async function pendientes() {
  const q = "ambito=eq.impresion_barra&texto=like." + encodeURIComponent('*"impreso":false*') + "&order=created_at.asc&limit=30";
  const r = await fetch(URL_BASE + "/rest/v1/pautas?" + q, { headers: headers() });
  if (!r.ok) throw new Error("No se pudo leer la base (" + r.status + "). ¿La clave es correcta?");
  const filas = await r.json();
  return (Array.isArray(filas) ? filas : []).map((f) => { try { return { id: f.id, job: JSON.parse(f.texto) }; } catch (e) { return null; } })
    .filter((x) => x && x.job && !x.job.prueba && (!LOCAL || x.job.local === LOCAL) && !impresos.has(x.id));
}

async function marcar(fila) {
  const nuevo = { ...fila.job, impreso: true, impreso_at: new Date().toISOString() };
  const r = await fetch(URL_BASE + "/rest/v1/pautas?id=eq." + encodeURIComponent(fila.id), { method: "PATCH", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify({ texto: JSON.stringify(nuevo) }) });
  if (!r.ok) throw new Error("No se pudo marcar como impresa (" + r.status + ")");
}

function mostrar(ticket) {
  console.log("┌" + "─".repeat(cfg.ancho) + "┐");
  for (const l of previsualizar(ticket, cfg).split("\n")) console.log("│" + l.padEnd(cfg.ancho).slice(0, cfg.ancho) + "│");
  console.log("└" + "─".repeat(cfg.ancho) + "┘");
}

async function vuelta() {
  const lista = await pendientes();
  for (const fila of lista) {
    const ticket = ticketDe(fila.job);
    if (SIMULAR) { console.log("\nComanda de barra pendiente (" + fila.id + "):"); mostrar(ticket); impresos.add(fila.id); continue; }
    try {
      await imprimir(ticket, cfg);
      impresos.add(fila.id);
      console.log(new Date().toLocaleTimeString("es-AR") + "  Impresa: " + ticket.local + " (" + ticket.items.length + " ítem" + (ticket.items.length === 1 ? "" : "s") + ")");
      await marcar(fila);
    } catch (e) { console.error(new Date().toLocaleTimeString("es-AR") + "  " + e.message + " (se reintenta)"); }
  }
}

if (tiene("demo")) {
  const demo = { local: LOCAL || "l1", tipo: "mesa", titulo: "Mesa 12 · Salón", numero: 7, at: new Date().toISOString(), mozo: "Prueba",
    items: [{ cant: 2, nombre: "Cerveza IPA 500cc" }, { cant: 1, nombre: "Fernet con coca", nota: "sin hielo" }, { cant: 3, nombre: "Gaseosa línea Coca-Cola 1,5 litros" }] };
  const t = ticketDe(demo);
  if (SIMULAR) { mostrar(t); process.exit(0); }
  imprimir(t, cfg).then(() => console.log("Listo.")).catch((e) => { console.error(e.message); process.exit(1); });
} else {
  if (!CLAVE) { console.error("Falta la clave de la base: --key LA_CLAVE (o la variable NKT_SUPABASE_KEY)."); process.exit(1); }
  if (!LOCAL) console.log("Aviso: sin --local se imprimen las comandas de barra de TODOS los locales.");
  console.log("Comanda de barra" + (LOCAL ? " de " + (NOMBRES[LOCAL] || LOCAL) : "") + " → impresora " + cfg.ip + ":" + cfg.puerto + (SIMULAR ? " (SIMULACIÓN: no imprime ni marca nada)" : "") + ". Mirando cada " + CADA + " s. Ctrl+C para cortar.");
  const ciclo = () => vuelta().catch((e) => console.error(new Date().toLocaleTimeString("es-AR") + "  " + e.message)).finally(() => setTimeout(ciclo, CADA * 1000));
  ciclo();
}
