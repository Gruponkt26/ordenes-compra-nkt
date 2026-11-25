// Placa para redes de un comercio amigo: «Somos parte de la Comunidad Grupo Nkt», con su logo, su nombre y su promo vigente.
// Se dibuja en un canvas con lo que el comercio ya cargó en su portal, y se baja como imagen PNG lista para publicar.
import { promoVigente } from "./grupo.jsx";

export var FUENTE = "Jost, Futura, 'Century Gothic', 'Trebuchet MS', sans-serif";

export function cargarFuente() {
  try {
    if (!document.getElementById("fuente-jost")) {
      var l = document.createElement("link");
      l.id = "fuente-jost"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Jost:wght@400;500;800&display=swap";
      document.head.appendChild(l);
    }
    var espera = new Promise(function (r) { setTimeout(r, 2500); });
    return Promise.race([Promise.all([document.fonts.load("800 40px Jost"), document.fonts.load("500 30px Jost")]), espera]).catch(function () {});
  } catch (e) { return Promise.resolve(); }
}
export function cargarImagen(src, cors) {
  return new Promise(function (res) {
    var i = new Image();
    if (cors) i.crossOrigin = "anonymous";
    i.onload = function () { res(i); };
    i.onerror = function () { res(null); };
    i.src = src;
  });
}
export function rect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Parte un texto en renglones que entren en un ancho; devuelve la cantidad de renglones dibujados.
export function parrafo(ctx, texto, x, y, ancho, alto, maxLineas) {
  var pal = String(texto || "").split(/\s+/), linea = "", lineas = [];
  pal.forEach(function (p) {
    var prueba = linea ? linea + " " + p : p;
    if (ctx.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = p; } else linea = prueba;
  });
  if (linea) lineas.push(linea);
  if (lineas.length > maxLineas) { lineas = lineas.slice(0, maxLineas); lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/\s*\S*$/, "") + "…"; }
  lineas.forEach(function (l, i) { ctx.fillText(l, x, y + i * alto); });
  return lineas.length;
}

function dibujar(c, alto, logoNkt, logoCom) {
  var W = 1080, H = alto, vert = alto > 1200;
  var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var ctx = cv.getContext("2d");
  var color = /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#C1440E";
  ctx.fillStyle = "#f4ecdc"; ctx.fillRect(0, 0, W, H);
  var g1 = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 760); g1.addColorStop(0, "#c1440e40"); g1.addColorStop(1, "#c1440e00");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  var g2 = ctx.createRadialGradient(0, H, 0, 0, H, 640); g2.addColorStop(0, "#c1440e1f"); g2.addColorStop(1, "#c1440e00");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  var y = vert ? 150 : 84;
  // marca de la comunidad
  if (logoNkt) { rect(ctx, 76, y - 20, 96, 96, 22); ctx.save(); ctx.clip(); ctx.drawImage(logoNkt, 76, y - 20, 96, 96); ctx.restore(); }
  ctx.fillStyle = "#6b6256"; ctx.font = "500 28px " + FUENTE; if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "6px";
  ctx.fillText("COMUNIDAD", 196, y + 22);
  ctx.fillStyle = "#1d1a16"; ctx.font = "800 34px " + FUENTE; ctx.fillText("GRUPO NKT", 196, y + 64);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
  // titular
  y += vert ? 320 : 150;
  ctx.fillStyle = "#4a4339"; ctx.font = "500 46px " + FUENTE; ctx.fillText("Somos parte de la", 76, y);
  ctx.fillStyle = "#1d1a16"; ctx.font = "800 " + (vert ? 108 : 96) + "px " + FUENTE; ctx.fillText("Comunidad", 76, y + (vert ? 112 : 100));
  ctx.fillStyle = "#c1440e"; ctx.fillText("Grupo Nkt", 76, y + (vert ? 228 : 204));
  y += vert ? 330 : 270;
  // el comercio: logo + nombre
  var lado = vert ? 220 : 170;
  rect(ctx, 76, y, lado, lado, 36); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#e3dccd"; ctx.stroke();
  if (logoCom) {
    var k = Math.min((lado - 28) / logoCom.width, (lado - 28) / logoCom.height), w = logoCom.width * k, h = logoCom.height * k;
    ctx.drawImage(logoCom, 76 + (lado - w) / 2, y + (lado - h) / 2, w, h);
  } else {
    ctx.fillStyle = color; ctx.font = "800 " + Math.round(lado * 0.55) + "px " + FUENTE; ctx.textAlign = "center";
    ctx.fillText(String(c.nombre || "?").trim().charAt(0).toUpperCase(), 76 + lado / 2, y + lado * 0.7); ctx.textAlign = "left";
  }
  ctx.fillStyle = "#1d1a16"; ctx.font = "800 " + (vert ? 64 : 56) + "px " + FUENTE;
  var n = parrafo(ctx, c.nombre || "Mi comercio", 76 + lado + 36, y + (vert ? 90 : 78), W - 76 - (76 + lado + 36), vert ? 72 : 62, 2);
  if (c.direccion) { ctx.fillStyle = "#6b6256"; ctx.font = "500 30px " + FUENTE; parrafo(ctx, c.direccion, 76 + lado + 36, y + (vert ? 90 : 78) + (n > 1 ? (vert ? 72 : 62) : 0) + 52, W - 76 - (76 + lado + 36), 38, 1); }
  y += lado + (vert ? 70 : 52);
  // promo vigente
  var promo = promoVigente(c);
  var cajaH = vert ? 190 : 150;
  rect(ctx, 76, y, W - 152, cajaH, 30); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b6256"; ctx.font = "500 28px " + FUENTE; ctx.fillText("Mostrá tu cupón de socio y llevate", W / 2, y + (vert ? 62 : 48));
  ctx.fillStyle = "#1d1a16"; ctx.font = "800 " + (promo.length > 22 ? 46 : 60) + "px " + FUENTE;
  parrafo(ctx, promo || "un beneficio exclusivo", W / 2, y + (vert ? 140 : 112), W - 220, 56, 1);
  ctx.textAlign = "left";
  // pie
  var pie = H - (vert ? 110 : 64);
  ctx.textAlign = "center"; ctx.fillStyle = "#1d1a16"; ctx.font = "800 38px " + FUENTE; ctx.fillText("Sumate a la comunidad", W / 2, pie - 56);
  ctx.fillStyle = "#c1440e"; ctx.font = "800 34px " + FUENTE; ctx.fillText(window.location.host + "/grupo/", W / 2, pie - 12);
  ctx.fillStyle = "#6b6256"; ctx.font = "500 26px " + FUENTE; ctx.fillText("Tus lugares en Punta Alta", W / 2, pie + 30);
  ctx.textAlign = "left";
  return cv;
}

export function aBlob(cv) { return new Promise(function (res, rej) { try { cv.toBlob(function (b) { b ? res(b) : rej(new Error("sin imagen")); }, "image/png"); } catch (e) { rej(e); } }); }

// formato: "post" (1080×1080) o "historia" (1080×1920). Baja el PNG.
export async function descargarPlaca(c, formato) {
  var alto = formato === "historia" ? 1920 : 1080;
  await cargarFuente();
  var nkt = await cargarImagen("/icon-192.png", false);
  var logo = c.logo ? await cargarImagen(c.logo, true) : null;
  var blob;
  try { blob = await aBlob(dibujar(c, alto, nkt, logo)); }
  catch (e) { blob = await aBlob(dibujar(c, alto, nkt, null)); }   // si el logo no deja exportar la imagen, va sin logo
  var nombre = "placa-" + String(c.nombre || "comercio").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + (formato === "historia" ? "historia" : "post") + ".png";
  var url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  return nombre;
}
