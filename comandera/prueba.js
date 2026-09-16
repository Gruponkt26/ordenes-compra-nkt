// Imprime una comanda de mentira, para probar la impresora antes de que exista
// nada del módulo. Tiene a propósito lo que suele romperse: acentos, una ñ, un
// plato largo que no entra en una línea, una aclaración y el corte de papel.
//
//   node prueba.js              → imprime de verdad
//   node prueba.js --simular    → sólo muestra en pantalla cómo quedaría
//   node prueba.js --ip 192.168.1.50 --codepage 2

const { imprimir, previsualizar, CONFIG } = require("./comandera");

const args = process.argv.slice(2);
function opcion(nombre, porDefecto) {
  const i = args.indexOf("--" + nombre);
  return i !== -1 && args[i + 1] ? args[i + 1] : porDefecto;
}

const cfg = {
  ip: opcion("ip", CONFIG.ip),
  puerto: parseInt(opcion("puerto", CONFIG.puerto), 10),
  ancho: parseInt(opcion("ancho", CONFIG.ancho), 10),
  codepage: parseInt(opcion("codepage", CONFIG.codepage), 10),
};

const ahora = new Date();
const ticket = {
  tipo: "MESA 12",
  local: "El Bodegón NKT",
  numero: 1,
  hora: String(ahora.getHours()).padStart(2, "0") + ":" + String(ahora.getMinutes()).padStart(2, "0"),
  mozo: "Prueba",
  items: [
    { cant: 2, nombre: "Provoleta NKT" },
    { cant: 1, nombre: "Sándwich de jamón crudo y rúcula", nota: "sin cebolla" },
    { cant: 1, nombre: "Milanesa de ternera con papas españolas a la provenzal" },
    { cant: 3, nombre: "Ñoquis del 29", nota: "uno sin queso" },
  ],
  nota: "Ticket de prueba. Si los acentos se ven bien (á é í ó ú ñ ¿ ¡ °), la tabla de caracteres es la correcta.",
};

if (args.includes("--simular")) {
  console.log("Así quedaría el ticket (" + cfg.ancho + " caracteres de ancho):\n");
  console.log("┌" + "─".repeat(cfg.ancho) + "┐");
  for (const l of previsualizar(ticket, cfg).split("\n")) {
    console.log("│" + l.padEnd(cfg.ancho).slice(0, cfg.ancho) + "│");
  }
  console.log("└" + "─".repeat(cfg.ancho) + "┘");
  console.log("\nPara imprimir de verdad: node prueba.js");
  process.exit(0);
}

console.log("Mandando a la impresora " + cfg.ip + ":" + cfg.puerto + "...");
imprimir(ticket, cfg)
  .then(() => console.log("Listo. Si no salió el ticket, fijate que tenga papel y que la IP sea la correcta."))
  .catch((e) => { console.error("\nNo se pudo imprimir:\n  " + e.message + "\n"); process.exit(1); });
