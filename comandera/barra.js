// ─── COMANDA DE BARRA ─────────────────────────────────────────────────────────
// Las bebidas no pasan por la pantalla de la cocina: la app deja una «comanda de barra» para imprimir
// (tabla pautas, ámbito "impresion_barra") cada vez que se marcha algo de bebida. Este programa, que corre
// en una PC del local, mira cada tanto si hay comandas sin imprimir, las manda a la impresora de la barra y
// las marca como impresas. No usa librerías: solo lo que trae Node (anda desde Node 12, la última versión que corre en Windows 7).
//
//   node barra.js --local l1 --usb "NOMBRE DE LA IMPRESORA"   (impresora USB de la barra, en Windows)
//   node barra.js --local l1 --ip 192.168.1.223 (impresora de red)
//   node barra.js --local l1 --usb-guardada   → usa la impresora que se eligió con «node prueba.js --elegir» (impresora.txt)
//   node barra.js --listar                    → muestra los nombres de las impresoras instaladas en Windows
//   node barra.js --local l1 --simular        → muestra en pantalla cómo saldría, sin imprimir ni marcar nada
//   node barra.js --demo --simular            → una comanda de mentira, sin conectarse a nada
//   (el destino «barra» imprime además el ticket de CONTROL / cuenta del cliente, por la misma impresora)
//   --destino cocina            → imprime las comandas de COCINA en papel (por defecto: barra)
//   --con-pruebas               → imprime también las de la «Prueba compartida» / modo práctica (para ensayar)
//   --max-edad 5                → no imprime comandas con más de 5 minutos (por defecto 60; 0 = sin límite)
//
// Opciones (o variables de entorno): --local (l1 Bodegón, l2 Kusama, l3 Colantonio's) · --ip / COMANDERA_IP
// · --puerto · --ancho · --codepage · --url / NKT_SUPABASE_URL · --key / NKT_SUPABASE_KEY · --cada (segundos, 3).

// Todo lo que muestra la ventana también queda en barra-log.txt (al lado del programa), para poder revisarlo después.
const ARCHIVO_LOG = require("path").join(__dirname, "barra-log.txt");
(function () {
  const fs = require("fs");
  try { if (fs.existsSync(ARCHIVO_LOG) && fs.statSync(ARCHIVO_LOG).size > 500000) fs.writeFileSync(ARCHIVO_LOG, ""); } catch (e) {}
  for (const nivel of ["log", "error"]) {
    const original = console[nivel].bind(console);
    console[nivel] = function () {
      original.apply(null, arguments);
      try { fs.appendFileSync(ARCHIVO_LOG, new Date().toISOString().slice(0, 19).replace("T", " ") + "  " + Array.prototype.slice.call(arguments).join(" ") + "\n"); } catch (e) {}
    };
  }
})();
const https = require("https");
const http = require("http");
const { imprimir, previsualizar, listarImpresorasWindows, impresoraGuardada, CONFIG } = require("./comandera");

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
const DESTINO = opcion("destino", process.env.NKT_DESTINO || "barra");   // "barra" o "cocina": qué comandas imprime este programa
const CON_PRUEBAS = tiene("con-pruebas");                       // imprime también las comandas de la «Prueba compartida» / modo práctica
const MAX_EDAD_MIN = parseInt(opcion("max-edad", "60"), 10);    // no imprime comandas más viejas que esto (minutos); 0 = sin límite
const cfg = {
  ip: opcion("ip", CONFIG.ip),
  puerto: parseInt(opcion("puerto", CONFIG.puerto), 10),
  ancho: parseInt(opcion("ancho", CONFIG.ancho), 10),
  codepage: parseInt(opcion("codepage", CONFIG.codepage), 10),
  usb: opcion("usb", process.env.COMANDERA_USB || (tiene("usb-guardada") ? impresoraGuardada() : "")),
};
const NOMBRES = { l1: "El Bodegon NKT", l2: "Kusama", l3: "Colantonio's" };
const CORTOS = { l1: "BODEGON", l2: "KUSAMA", l3: "COLANTONIO'S" };
// Dirección que sale en el ticket de control.
const DIRECCIONES = { l1: "Villanueva 35 Punta Alta", l2: "Mitre 677 Punta Alta", l3: "Humberto 376 Punta Alta" };

// La impresora no entiende los símbolos fuera del abecedario con acentos: se cambian por algo que sí se imprime.
// Los emojis (🪑, 🥤…) no existen en la impresora y salían como "?": se sacan, y los acentos y la ñ se conservan.
const limpiar = (t) => String(t || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s{2,}/g, " ").trim().replace(/[·•]/g, "-").replace(/[→»]/g, ">").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const dos = (n) => String(n).padStart(2, "0");
// Fecha y hora de la comanda (hora del local, la de esta PC): 21/11/2026 09:24. Sale en todas: mesa, mostrador y delivery.
const fechaHora = (iso) => { try { const d = new Date(iso); if (isNaN(d.getTime())) return ""; return dos(d.getDate()) + "/" + dos(d.getMonth() + 1) + "/" + d.getFullYear() + " " + dos(d.getHours()) + ":" + dos(d.getMinutes()); } catch (e) { return ""; } };

function ticketDe(job) {
  const cocina = job.destino === "cocina";
  const control = job.destino === "control";
  const notas = [];
  if (control) {
    // Formato del ticket de control de siempre (ver armarControl en comandera.js).
    const d = job.at ? new Date(job.at) : new Date();
    const m = /^(?:mesa)\s+(\S+)/i.exec(String(job.titulo || ""));
    return { control: {
      local: limpiar(NOMBRES[job.local] || ""), direccion: limpiar(DIRECCIONES[job.local] || ""),
      mesa: job.tipo === "mesa" && m ? "Mesa: " + m[1] : limpiar(job.titulo || ""),
      fecha: dos(d.getDate()) + "/" + dos(d.getMonth() + 1) + "/" + d.getFullYear(), horaSolo: dos(d.getHours()) + ":" + dos(d.getMinutes()),
      mozo: limpiar(job.mozo || ""), personas: job.personas || undefined,
      // CUBIERTOS: una línea informativa con la cantidad de personas, sin precio (no se cobran), como en el modelo de siempre.
      items: (job.personas ? [{ cant: Number(job.personas), nombre: "CUBIERTOS", precio: 0 }] : []).concat(job.items || []).map((i) => ({ cant: i.cant || 1, nombre: limpiar(i.nombre), precio: Number(i.precio) || 0 })),
      subtotal: job.subtotal, descuento: job.descuento, motivoDescuento: limpiar(job.descuento_motivo || ""), total: job.total } };
  }
  if (cocina) {
    if (job.entrega_at) notas.push("ENTREGA AL CLIENTE: " + fechaHora(job.entrega_at));
    if (job.salida === "junto") notas.push("AGREGADO: SALE TODO JUNTO con lo que ya esta en la cocina.");
    else if (job.salida === "orden") notas.push("AGREGADO: SALE POR ORDEN DE COMANDA, despues de lo anterior.");
  }
  return {
    tipo: control ? "CONTROL" : (cocina ? "COCINA" : "BARRA"),
    nota: notas.length ? notas : undefined,
    // Con la comandera compartida entre locales (sin --local) el encabezado lleva el local: "KUSAMA - Mesa 12". Con --local queda como siempre.
    local: limpiar((!LOCAL && CORTOS[job.local] ? CORTOS[job.local] + " - " : "") + (job.titulo || NOMBRES[job.local] || "")),
    numero: job.numero || undefined,
    hora: fechaHora(job.at),
    mozo: limpiar(job.mozo || ""),
    personas: job.personas || undefined,
    direccion: job.tipo === "delivery" ? limpiar(job.direccion || "") : "",
    items: (job.items || []).map((i) => ({ cant: i.cant || 1, nombre: limpiar(i.nombre), nota: limpiar((i.entrada ? "ENTRADA" : "") + (i.entrada && i.nota ? " | " : "") + (i.nota || "")), precio: control ? Number(i.precio) || 0 : undefined })),
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
const MAX_INTENTOS = 3;        // si una comanda falla al imprimir 3 veces, se deja de intentar (para no gastar papel sin parar)
const ESPERA_REINTENTO_S = parseInt(process.env.NKT_ESPERA || "15", 10); // y entre un intento y otro espera este tiempo
const intentos = new Map();    // id -> { n, hasta }
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
    const dest = x.job.destino || "barra";
    if (DESTINO === "barra" ? (dest !== "barra" && dest !== "control") : dest !== DESTINO) return false;   // la barra imprime también el ticket de control (misma impresora)
    const it = intentos.get(x.id);
    if (it && (it.n >= MAX_INTENTOS || Date.now() < it.hasta)) return false;   // las de la otra impresora no se tocan ni se avisan
    const motivo = x.job.prueba && !CON_PRUEBAS ? "es de PRUEBA COMPARTIDA / modo practica (para imprimirlas: --con-pruebas)" : (MAX_EDAD_MIN > 0 && edadMin > MAX_EDAD_MIN ? "tiene mas de " + MAX_EDAD_MIN + " minutos (para imprimirla: --max-edad " + Math.ceil(edadMin + 1) + ")" : (LOCAL && x.job.local !== LOCAL ? "es del local " + x.job.local + " y este programa es del " + LOCAL : ""));
    if (motivo) { if (!avisados.has(x.id)) { avisados.add(x.id); console.log(new Date().toLocaleTimeString("es-AR") + "  Se saltea " + (x.job.titulo || x.id) + ": " + motivo + "."); } return false; }
    return true;
  });
}

// «Reclamar» la comanda ANTES de imprimir: la marca como impresa solo si todavía figuraba sin imprimir (el filtro lo resuelve la base
// de un solo golpe). Si hay dos programas mirando lo mismo (dos ventanas abiertas, por ejemplo), solo uno lo logra y el otro no imprime.
async function reclamar(fila) {
  const nuevo = Object.assign({}, fila.job, { impreso: true, impreso_at: new Date().toISOString() });
  const q = "id=eq." + encodeURIComponent(fila.id) + "&texto=like." + encodeURIComponent('*"impreso":false*');
  const r = await pedir(URL_BASE + "/rest/v1/pautas?" + q, { method: "PATCH", headers: Object.assign({}, headers(), { Prefer: "return=representation" }), body: JSON.stringify({ texto: JSON.stringify(nuevo) }) });
  if (!r.ok) throw new Error("No se pudo reclamar la comanda (" + r.status + ")");
  const filas = JSON.parse(r.texto || "[]");
  return Array.isArray(filas) && filas.length > 0;
}
// Si la impresión falla después de reclamar, se vuelve a dejar pendiente para que se reintente.
async function liberar(fila) {
  const r = await pedir(URL_BASE + "/rest/v1/pautas?id=eq." + encodeURIComponent(fila.id), { method: "PATCH", headers: Object.assign({}, headers(), { Prefer: "return=minimal" }), body: JSON.stringify({ texto: JSON.stringify(fila.job) }) });
  if (!r.ok) throw new Error("No se pudo dejar pendiente de nuevo (" + r.status + ")");
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
    if (SIMULAR) { console.log("\nComanda de " + DESTINO + " pendiente (" + fila.id + "):"); mostrar(ticket); impresos.add(fila.id); continue; }
    let reclamada = false;
    const t0 = Date.now();
    try {
      reclamada = await reclamar(fila);
      impresos.add(fila.id);
      if (!reclamada) continue;   // otro programa la agarró primero: no se imprime dos veces
      await imprimir(ticket, cfg);
      intentos.delete(fila.id);
      console.log(new Date().toLocaleTimeString("es-AR") + "  Impresa: " + ticket.local + " (" + ticket.items.length + " ítem" + (ticket.items.length === 1 ? "" : "s") + ") [" + fila.id + ", " + (Date.now() - t0) + " ms]");
    } catch (e) {
      const it = intentos.get(fila.id) || { n: 0, hasta: 0 };
      it.n += 1; it.hasta = Date.now() + ESPERA_REINTENTO_S * 1000; intentos.set(fila.id, it);
      console.error(new Date().toLocaleTimeString("es-AR") + "  Falló la comanda " + fila.id + " (intento " + it.n + " de " + MAX_INTENTOS + ", " + (Date.now() - t0) + " ms): " + e.message);
      if (reclamada) {
        impresos.delete(fila.id);
        if (it.n < MAX_INTENTOS) { try { await liberar(fila); console.error("  Queda pendiente: se reintenta en " + ESPERA_REINTENTO_S + " segundos."); } catch (e2) { console.error("  " + e2.message); } }
        else console.error("  Se deja de intentar con esta comanda, para no gastar papel. Revisá la impresora; la comanda quedó marcada como impresa.");
      }
    }
  }
}

if (tiene("listar")) {
  listarImpresorasWindows().then((l) => { console.log("Impresoras instaladas en esta PC:\n" + l.map((x) => "  " + x).join("\n") + "\n\nUsá el nombre exacto con --usb \"NOMBRE\"."); })
    .catch((e) => { console.error(e.message); process.exit(1); });
} else if (tiene("demo")) {
  const demo = { local: process.env.DEMO_LOCAL || LOCAL || "l1", tipo: "mesa", titulo: "Mesa 12 · Salón", numero: 7, at: new Date().toISOString(), mozo: "Prueba",
    items: [{ cant: 2, nombre: "Cerveza IPA 500cc" }, { cant: 1, nombre: "Fernet con coca", nota: "sin hielo" }, { cant: 3, nombre: "Gaseosa línea Coca-Cola 1,5 litros" }] };
  const t = ticketDe(demo);
  if (SIMULAR) { mostrar(t); process.exit(0); }
  imprimir(t, cfg).then(() => console.log("Listo.")).catch((e) => { console.error(e.message); process.exit(1); });
} else {
  if (tiene("usb-guardada") && !cfg.usb) { console.error("Todavía no elegiste la impresora USB. Corré primero probar-usb.bat y elegí el número."); process.exit(1); }
  if (!CLAVE) { console.error("Falta la clave de la base (--key o la variable NKT_SUPABASE_KEY)."); process.exit(1); }
  if (!LOCAL) console.log("Aviso: sin --local se imprimen las comandas de barra de TODOS los locales.");
  console.log("Comanda de " + DESTINO + (LOCAL ? " de " + (NOMBRES[LOCAL] || LOCAL) : "") + " → impresora " + (cfg.usb ? "USB «" + cfg.usb + "»" : cfg.ip + ":" + cfg.puerto) + (SIMULAR ? " (SIMULACIÓN: no imprime ni marca nada)" : "") + ". Mirando cada " + CADA + " s. Ctrl+C para cortar.");
  const ciclo = () => vuelta().catch((e) => console.error(new Date().toLocaleTimeString("es-AR") + "  " + e.message)).finally(() => setTimeout(ciclo, CADA * 1000));
  ciclo();
}
