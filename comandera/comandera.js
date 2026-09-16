// ─── COMANDERA TÉRMICA ────────────────────────────────────────────────────────
// Habla ESC/POS por red con la impresora de la cocina (3nstar, 80mm, puerto 9100).
//
// No usa ninguna librería: sólo `net`, que viene con Node. Es a propósito — esto
// corre en una PC de un local, y cada dependencia es una cosa más que puede faltar
// el día que haya que reinstalarlo.

const net = require("net");

const CONFIG = {
  ip: process.env.COMANDERA_IP || "192.168.1.222",
  puerto: parseInt(process.env.COMANDERA_PUERTO || "9100", 10),
  // Caracteres por línea. 80mm de papel son 48 con la fuente normal.
  ancho: parseInt(process.env.COMANDERA_ANCHO || "48", 10),
  // Tabla de caracteres de la impresora. 19 es CP858 y 2 es CP850: las dos tienen
  // los acentos y la ñ. Si el ticket de prueba sale con símbolos raros, probar con 2.
  codepage: parseInt(process.env.COMANDERA_CODEPAGE || "19", 10),
};

// ─── ESC/POS ──────────────────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;
const CMD = {
  init:        [ESC, 0x40],
  codepage:    (n) => [ESC, 0x74, n],
  izquierda:   [ESC, 0x61, 0],
  centro:      [ESC, 0x61, 1],
  derecha:     [ESC, 0x61, 2],
  negritaOn:   [ESC, 0x45, 1],
  negritaOff:  [ESC, 0x45, 0],
  normal:      [GS, 0x21, 0x00],
  grande:      [GS, 0x21, 0x11], // doble alto y ancho
  altoDoble:   [GS, 0x21, 0x01],
  avanzar:     (n) => [ESC, 0x64, n],
  cortar:      [GS, 0x56, 0x42, 0x00], // corte parcial, avanzando el papel
};

// Las térmicas no hablan UTF-8: cada acento hay que mandarlo con el byte que le
// corresponde en la tabla de caracteres de la impresora. Esto es CP850/CP858, que
// es lo que entienden las 3nstar y casi todas las demás.
const ACENTOS = {
  "á":0xa0,"é":0x82,"í":0xa1,"ó":0xa2,"ú":0xa3,
  "Á":0xb5,"É":0x90,"Í":0xd6,"Ó":0xe0,"Ú":0xe9,
  "ñ":0xa4,"Ñ":0xa5,"ü":0x81,"Ü":0x9a,
  "¿":0xa8,"¡":0xad,"°":0xf8,"º":0xa7,"ª":0xa6,"€":0xd5,
};

// Para volver atrás: la previsualización tiene que mostrar letras, no los bytes que
// entiende la impresora, o parece roto cuando en realidad está bien.
const ACENTOS_INVERSO = Object.fromEntries(Object.entries(ACENTOS).map(([ch, b]) => [b, ch]));

function codificar(texto) {
  const bytes = [];
  for (const ch of String(texto)) {
    if (ACENTOS[ch] !== undefined) bytes.push(ACENTOS[ch]);
    else {
      const c = ch.codePointAt(0);
      // Lo que no es ASCII ni un acento conocido sale como "?" en vez de ensuciar
      // el ticket con basura binaria.
      bytes.push(c < 128 ? c : 0x3f);
    }
  }
  return Buffer.from(bytes);
}

// ─── ARMADO DEL TICKET ────────────────────────────────────────────────────────
// Corta por palabras, no por letras: un plato que no entra se parte en dos líneas
// enteras y no a la mitad de "Provoleta".
function envolver(texto, ancho, sangria) {
  const pref = " ".repeat(sangria || 0);
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const tentativa = actual ? actual + " " + palabra : palabra;
    if ((pref + tentativa).length <= ancho) { actual = tentativa; continue; }
    if (actual) lineas.push(pref + actual);
    // Una palabra sola más larga que el papel se corta a lo bruto, no hay otra.
    actual = palabra.length > ancho - pref.length ? palabra.slice(0, ancho - pref.length) : palabra;
  }
  if (actual) lineas.push(pref + actual);
  return lineas.length ? lineas : [pref];
}

function dosColumnas(izq, der, ancho) {
  const relleno = Math.max(1, ancho - izq.length - der.length);
  return izq + " ".repeat(relleno) + der;
}

function pesos(n) {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
}

// Devuelve el buffer listo para mandarle a la impresora.
function armar(ticket, cfg) {
  const c = { ...CONFIG, ...(cfg || {}) };
  const partes = [];
  const crudo = (arr) => partes.push(Buffer.from(arr));
  const linea = (txt) => partes.push(codificar((txt === undefined ? "" : txt) + "\n"));

  crudo(CMD.init);
  crudo(CMD.codepage(c.codepage));

  // Encabezado: lo que el cocinero tiene que ver de un vistazo desde lejos
  crudo(CMD.centro);
  crudo(CMD.grande);
  linea(ticket.tipo || "COMANDA");
  crudo(CMD.normal);
  crudo(CMD.negritaOn);
  linea(ticket.local || "");
  crudo(CMD.negritaOff);
  crudo(CMD.izquierda);
  linea("-".repeat(c.ancho));
  linea(dosColumnas(
    ticket.numero ? "Comanda #" + ticket.numero : "",
    ticket.hora || "",
    c.ancho
  ));
  if (ticket.mozo) linea("Mozo: " + ticket.mozo);
  if (ticket.direccion) envolver("Dir: " + ticket.direccion, c.ancho, 0).forEach(linea);
  if (ticket.telefono) linea("Tel: " + ticket.telefono);
  linea("-".repeat(c.ancho));
  linea();

  // Ítems: la cantidad va pegada al margen y el nombre en negrita, porque es lo
  // único que la cocina realmente lee.
  for (const item of ticket.items || []) {
    const cant = String(item.cant || 1) + "x ";
    const nombre = envolver(item.nombre || "", c.ancho - cant.length, 0);
    crudo(CMD.negritaOn);
    linea(cant + nombre[0]);
    for (const resto of nombre.slice(1)) linea(" ".repeat(cant.length) + resto);
    crudo(CMD.negritaOff);
    // La aclaración es lo que arruina un plato si no se lee: va indentada y sola.
    if (item.nota) envolver(">> " + item.nota, c.ancho, cant.length).forEach(linea);
    if (item.precio !== undefined && item.precio !== null) {
      linea(dosColumnas("", pesos(item.precio * (item.cant || 1)), c.ancho));
    }
    linea();
  }

  if (ticket.total !== undefined && ticket.total !== null) {
    linea("-".repeat(c.ancho));
    crudo(CMD.altoDoble);
    // El total va en alto doble, así que entran la mitad de caracteres por línea.
    linea(dosColumnas("TOTAL", pesos(ticket.total), c.ancho));
    crudo(CMD.normal);
  }

  if (ticket.nota) {
    linea("-".repeat(c.ancho));
    envolver(ticket.nota, c.ancho, 0).forEach(linea);
  }

  crudo(CMD.avanzar(4));
  crudo(CMD.cortar);
  return Buffer.concat(partes);
}

// ─── ENVÍO ────────────────────────────────────────────────────────────────────
// Abre el socket, manda y cierra. Si la impresora no contesta en 8 segundos, falla
// con un mensaje que dice qué pasó: "no imprimió" sin más no le sirve a nadie.
function enviar(buffer, cfg) {
  const c = { ...CONFIG, ...(cfg || {}) };
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let listo = false;
    socket.setTimeout(8000);
    socket.on("timeout", () => {
      socket.destroy();
      if (!listo) reject(new Error("La impresora " + c.ip + ":" + c.puerto + " no contestó en 8 segundos. ¿Está prendida y en la red?"));
    });
    socket.on("error", (e) => {
      socket.destroy();
      if (!listo) reject(new Error(
        e.code === "ECONNREFUSED" ? "La impresora " + c.ip + " rechazó la conexión en el puerto " + c.puerto + ". ¿Es el puerto correcto?" :
        e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH" ? "No se llega a " + c.ip + ". ¿Está la PC en la misma red que la impresora?" :
        "Error hablando con la impresora: " + e.message
      ));
    });
    socket.connect(c.puerto, c.ip, () => {
      socket.write(buffer, () => {
        listo = true;
        socket.end();
        resolve();
      });
    });
  });
}

function imprimir(ticket, cfg) {
  return enviar(armar(ticket, cfg), cfg);
}

// Cómo se vería el ticket, sin impresora de por medio. Sirve para mirar el formato
// acá y para entender qué salió mal cuando lo impreso no es lo esperado.
function previsualizar(ticket, cfg) {
  const c = { ...CONFIG, ...(cfg || {}) };
  const bytes = armar(ticket, c);
  let texto = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Saltear los comandos, que no se imprimen: son instrucciones para la impresora.
    if (b === ESC || b === GS) {
      const sig = bytes[i + 1];
      if (b === ESC && sig === 0x40) { i += 1; continue; }                       // init
      if (b === ESC && (sig === 0x74 || sig === 0x61 || sig === 0x45 || sig === 0x64)) { i += 2; continue; }
      if (b === GS && sig === 0x21) { i += 2; continue; }                        // tamaño
      if (b === GS && sig === 0x56) { i += 3; continue; }                        // corte
      continue;
    }
    texto += ACENTOS_INVERSO[b] !== undefined ? ACENTOS_INVERSO[b] : String.fromCharCode(b);
  }
  return texto;
}

module.exports = { CONFIG, imprimir, armar, enviar, previsualizar, codificar, envolver, dosColumnas };
