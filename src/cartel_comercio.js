// Cartel de mostrador de un comercio amigo (A4 vertical): «Somos parte de la Comunidad Grupo Nkt», con su logo, su nombre, su promo vigente y un QR
// que lleva a la comunidad. El QR trae el id del comercio (/grupo/?de=<id>) para contar cuántos socios nuevos trajo cada uno.
import QRCode from "qrcode";
import { promoVigente } from "./grupo.jsx";
import { cargarFuente, cargarImagen, rect, parrafo, aBlob, FUENTE } from "./placa_comercio.js";

function dibujar(c, id, logoNkt, logoCom, qr) {
  var W = 1240, H = 1754;
  var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var ctx = cv.getContext("2d");
  var color = /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#C1440E";
  ctx.fillStyle = "#F4ECDC"; ctx.fillRect(0, 0, W, H);
  var g1 = ctx.createRadialGradient(W * 0.9, 0, 0, W * 0.9, 0, 900); g1.addColorStop(0, "#c1440e40"); g1.addColorStop(1, "#c1440e00");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 14; ctx.strokeStyle = color; rect(ctx, 30, 30, W - 60, H - 60, 50); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  // marca
  if (logoNkt) { rect(ctx, W / 2 - 60, 90, 120, 120, 28); ctx.save(); ctx.clip(); ctx.drawImage(logoNkt, W / 2 - 60, 90, 120, 120); ctx.restore(); }
  ctx.fillStyle = "#6B6256"; ctx.font = "500 34px " + FUENTE; ctx.fillText("Somos parte de la", W / 2, 290);
  ctx.fillStyle = "#1D1A16"; ctx.font = "800 120px " + FUENTE; ctx.fillText("Comunidad", W / 2, 405);
  ctx.fillStyle = "#C1440E"; ctx.fillText("Grupo Nkt", W / 2, 525);
  // el comercio
  var lado = 190, y = 570;
  rect(ctx, W / 2 - lado / 2, y, lado, lado, 38); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#E3DCCD"; ctx.stroke();
  if (logoCom) { var k = Math.min((lado - 30) / logoCom.width, (lado - 30) / logoCom.height), w = logoCom.width * k, h = logoCom.height * k; ctx.drawImage(logoCom, W / 2 - w / 2, y + (lado - h) / 2, w, h); }
  else { ctx.fillStyle = color; ctx.font = "800 110px " + FUENTE; ctx.fillText(String(c.nombre || "?").trim().charAt(0).toUpperCase(), W / 2, y + 135); }
  ctx.fillStyle = "#1D1A16"; ctx.font = "800 64px " + FUENTE; parrafo(ctx, c.nombre || "Mi comercio", W / 2, y + lado + 78, W - 220, 70, 2);
  // promo
  var promo = promoVigente(c), py = 920;
  rect(ctx, 100, py, W - 200, 190, 36); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = "#6B6256"; ctx.font = "500 32px " + FUENTE; ctx.fillText("Mostrá tu cupón de socio y llevate", W / 2, py + 62);
  ctx.fillStyle = "#1D1A16"; ctx.font = "800 " + (promo.length > 24 ? 50 : 66) + "px " + FUENTE; parrafo(ctx, promo || "un beneficio exclusivo", W / 2, py + 142, W - 260, 60, 1);
  // QR
  var qy = 1150, lq = 330;
  rect(ctx, W / 2 - lq / 2 - 18, qy - 18, lq + 36, lq + 36, 30); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#E3DCCD"; ctx.stroke();
  if (qr) ctx.drawImage(qr, W / 2 - lq / 2, qy, lq, lq);
  ctx.fillStyle = "#1D1A16"; ctx.font = "800 46px " + FUENTE; ctx.fillText("¿Todavía no sos socio? Escaneá y sumate", W / 2, qy + lq + 85);
  ctx.fillStyle = "#6B6256"; ctx.font = "500 30px " + FUENTE; ctx.fillText("Tu cupón de beneficios y las novedades, en tu celular", W / 2, qy + lq + 130);
  ctx.fillStyle = "#6B6256"; ctx.font = "500 28px " + FUENTE; ctx.fillText("Comunidad Grupo Nkt · tus lugares en Punta Alta", W / 2, H - 70);
  return cv;
}

// Baja el cartel en PNG (A4, para imprimir). c = lo publicado del comercio; id = su id.
export async function descargarCartel(c, id) {
  await cargarFuente();
  var url = window.location.origin + "/grupo/?de=" + encodeURIComponent(id);
  var qrUrl = await QRCode.toDataURL(url, { margin: 1, width: 660, errorCorrectionLevel: "M" });
  var qr = await cargarImagen(qrUrl, false), nkt = await cargarImagen("/icon-192.png", false);
  var logo = c.logo ? await cargarImagen(c.logo, true) : null;
  var blob;
  try { blob = await aBlob(dibujar(c, id, nkt, logo, qr)); }
  catch (e) { blob = await aBlob(dibujar(c, id, nkt, null, qr)); }   // si el logo no deja exportar la imagen, va sin logo
  var nombre = "cartel-mostrador-" + String(c.nombre || "comercio").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
  var a = document.createElement("a"), u = URL.createObjectURL(blob);
  a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  return nombre;
}
