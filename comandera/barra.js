// ─── COMANDA DE BARRA ─────────────────────────────────────────────────────────
// Las bebidas no pasan por la pantalla de la cocina: la app deja una «comanda de barra» para imprimir
// (tabla pautas, ámbito "impresion_barra") cada vez que se marcha algo de bebida. Este programa, que corre
// en una PC del local, mira cada tanto si hay comandas sin imprimir, las manda a la impresora de la barra y
// las marca como impresas. No usa librerías: solo lo que trae Node (anda desde Node 12, la última versión que corre en Windows 7).
//
//   node barra.js --local l1 --usb "NOMBRE DE LA IMPRESORA"   (impresora USB de la barra, en Windows)
//   node barra.js --local l1 --ip 192.168.1.223 (impresora de red)
//   node barra.js --listar                    → muestra los nombres de las impresoras instaladas en Windows
//   node barra.js --local l1 --simular        → muestra en pantalla cómo saldría, sin imprimir ni marcar nada
//   node barra.js --demo --simular            → una comanda de mentira, sin conectarse a nada
//   --con-pruebas               → imprime también las de la «Prueba compartida» / modo práctica (para ensayar)
//   --max-edad 5                → no imprime comandas con más de 5 minutos (por defecto 60; 0 = sin límite)
//
// Opciones (o variables de entorno): --local (l1 Bodegón, l2 Kusama, l3 Colantonio's) · --ip / COMANDERA_IP
// · --puerto · --ancho · --codepage · --url / NKT_SUPABASE_URL · --key / NKT_SUPABASE_KEY · --cada (segundos, 3).

const https = require("https");
const http = require("http");
const { imprimir, previsualizar, listarImpresorasWindows, CONFIG } = require("./comandera");

const args = process.argv.slice(2);
const tiene = (n) => args.includes("--" + n);
function opcion(nombre, porDefecto) {
  const i = args.indexOf("--" + nombre);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : porDefecto;
}

const LOCAL = opcion("local", process.env.NKT_LOCAL || "");
const URL_BASE = String(opcion("url", process.env.NKT_SUPABASE_URL || "https://qcfwqnqtrqyjdfvakwxt.supabase.co")).replace(/\/+$/, "");
// Clave pública de la base: es la misma que ya usa la app en el navegador (SKEY en src/comun.js), así que va incluida
// y no hace falta pegarla. Si se pasa otra con --key, se le sacan espacios y saltos de línea (por si se copió mal).
const CLAVE_PUBLICA = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZndxbnF0cnF5amRmdmFrd3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYxODMsImV4cCI6MjA5NjE1MjE4M30.Zh5jN_oGXde0JGBJ_NTBn5Mkr2m6lI3VPjAsqrzd6Gc";
const CLAVE = String(opcion("key", process.env.NKT_SUPABASE_KEY || CLAVE_PUBLICA)).replace(/[^\x21-\x7E]/g, "");
const CADA = Math.max(1, parseInt(opcion("cada", "3"), 10) || 3);
const SIMULAR = tiene("simular");
const CON_PRUEBAS = tiene("con-pruebas");                       // imprime también las comandas de la «Prueba compartida» / modo práctica
const MAX_EDAD_MIN = parseInt(opcion("max-edad", "60"), 10);    // no imprime comandas más viejas que esto (minutos); 0 = sin límite
const cfg = {
  ip: opcion("ip", CONFIG.ip),
  puerto: parseInt(opcion("puerto", CONFIG.puerto), 10),
  ancho: parseInt(opcion("ancho", CONFIG.ancho), 10),
  codepage: parseInt(opcion("codepage", CONFIG.codepage), 10),
  usb: opcion("usb", process.env.COMANDERA_USB || ""),
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

// Pedido HTTP con lo que trae Node (sin fetch, que no existe en Node 12). Devuelve { ok, status, texto }.
function pedir(url, opc) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const cuerpo = opc.body ? Buffer.from(opc.body, "utf8") : null;
    const h = Object.assign({}, opc.headers || {});
    if (cuerpo) h["Content-Length"] = cuerpo.length;
    const req = (u.protocol === "http:" ? http : https).request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search,
      method: opc.method || "GET", headers: h, timeout: 20000,
    }, (res) => {
      const partes = [];
      res.on("data", (d) => partes.push(d));
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, texto: Buffer.concat(partes).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("La base no contesta (¿hay internet?)")));
    req.on("error", (e) => reject(new Error("No se pudo conectar a la base: " + e.message)));
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}
let primeraVuelta = false;
const avisados = new Set();
const impresos = new Set();   // por si marcar como impresa falla: no se imprime dos veces

async function pendientes() {
  const q = "ambito=eq.impresion_barra&texto=like." + encodeURIComponent('*"impreso":false*') + "&order=created_at.asc&limit=30";
  const r = await pedir(URL_BASE + "/rest/v1/pautas?" + q, { headers: headers() });
  if (!r.ok) throw new Error("No se pudo leer la base (" + r.status + "). ¿La clave es correcta?");
  const filas = JSON.parse(r.texto);
  const todas = (Array.isArray(filas) ? filas : []).map((f) => { try { return { id: f.id, job: JSON.parse(f.texto) }; } catch (e) { return null; } }).filter((x) => x && x.job);
  if (!primeraVuelta) { primeraVuelta = true; console.log("Pendientes de imprimir en la base (de todos los locales): " + todas.length); }
  return todas.filter((x) => {
    if (impresos.has(x.id)) return false;
    const edadMin = x.job.at ? (Date.now() - new Date(x.job.at).getTime()) / 60000 : 0;
    const motivo = x.job.prueba && !CON_PRUEBAS ? "es de PRUEBA COMPARTIDA / modo practica (para imprimirlas: --con-pruebas)" : (MAX_EDAD_MIN > 0 && edadMin > MAX_EDAD_MIN ? "tiene mas de " + MAX_EDAD_MIN + " minutos (para imprimirla: --max-edad " + Math.ceil(edadMin + 1) + ")" : (LOCAL && x.job.local !== LOCAL ? "es del local " + x.job.local + " y este programa es del " + LOCAL : ""));
    if (motivo) { if (!avisados.has(x.id)) { avisados.add(x.id); console.log(new Date().toLocaleTimeString("es-AR") + "  Se saltea " + (x.job.titulo || x.id) + ": " + motivo + "."); } return false; }
    return true;
  });
}

async function marcar(fila) {
  const nuevo = Object.assign({}, fila.job, { impreso: true, impreso_at: new Date().toISOString() });
  const r = await pedir(URL_BASE + "/rest/v1/pautas?id=eq." + encodeURIComponent(fila.id), { method: "PATCH", headers: Object.assign({}, headers(), { Prefer: "return=minimal" }), body: JSON.stringify({ texto: JSON.stringify(nuevo) }) });
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

if (tiene("listar")) {
  listarImpresorasWindows().then((l) => { console.log("Impresoras instaladas en esta PC:\n" + l.map((x) => "  " + x).join("\n") + "\n\nUsá el nombre exacto con --usb \"NOMBRE\"."); })
    .catch((e) => { console.error(e.message); process.exit(1); });
} else if (tiene("demo")) {
  const demo = { local: LOCAL || "l1", tipo: "mesa", titulo: "Mesa 12 · Salón", numero: 7, at: new Date().toISOString(), mozo: "Prueba",
    items: [{ cant: 2, nombre: "Cerveza IPA 500cc" }, { cant: 1, nombre: "Fernet con coca", nota: "sin hielo" }, { cant: 3, nombre: "Gaseosa línea Coca-Cola 1,5 litros" }] };
  const t = ticketDe(demo);
  if (SIMULAR) { mostrar(t); process.exit(0); }
  imprimir(t, cfg).then(() => console.log("Listo.")).catch((e) => { console.error(e.message); process.exit(1); });
} else {
  if (!CLAVE) { console.error("Falta la clave de la base (--key o la variable NKT_SUPABASE_KEY)."); process.exit(1); }
  if (!LOCAL) console.log("Aviso: sin --local se imprimen las comandas de barra de TODOS los locales.");
  console.log("Comanda de barra" + (LOCAL ? " de " + (NOMBRES[LOCAL] || LOCAL) : "") + " → impresora " + (cfg.usb ? "USB «" + cfg.usb + "»" : cfg.ip + ":" + cfg.puerto) + (SIMULAR ? " (SIMULACIÓN: no imprime ni marca nada)" : "") + ". Mirando cada " + CADA + " s. Ctrl+C para cortar.");
  const ciclo = () => vuelta().catch((e) => console.error(new Date().toLocaleTimeString("es-AR") + "  " + e.message)).finally(() => setTimeout(ciclo, CADA * 1000));
  ciclo();
}
