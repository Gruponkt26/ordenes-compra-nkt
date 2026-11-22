// ─── COMANDAS ─────────────────────────────────────────────────────────────────
// La pantalla de servicio: el plano de mesas, los deliverys y los mostradores.
//
// Vive en su propio archivo a propósito. App.jsx ya pasó las 13.000 líneas y esto
// va a crecer: la carta con precios, la carga de ítems, la cuenta, la impresión.
//
// Dos tablas en Supabase (el SQL está en el README):
//  · comanda_mesas → las mesas de cada local, por sector
//  · comandas      → una fila por mesa abierta, delivery o pedido de mostrador
//
// Los ítems de cada comanda van a ser una tabla aparte, con una fila por ítem y no
// un JSON adentro de la comanda. No es un detalle: si dos mozos tocan la misma mesa
// y cada uno guarda la comanda entera, el último pisa lo que agregó el otro.

import { useState, useEffect, useRef } from "react";
import { SURL, SH, LOCALES, getLocal, fmtHora, INP, GH } from "./comun.js";
import { CARTAS_MAXIREST } from "./cartas_maxirest.js";

// ─── DATOS ────────────────────────────────────────────────────────────────────
async function sbComandasDisponible() {
  try {
    var r = await fetch(SURL + "/rest/v1/comandas?select=id&limit=1", { headers: SH });
    if (r.ok) return null;
    var txt = await r.text();
    return txt || ("Error " + r.status);
  } catch(e) { return String((e && e.message) || e); }
}

// ─── MODO PRÁCTICA ────────────────────────────────────────────────────
// Un simulador para aprender a usar comandas y cobro sin tocar nada real: mientras está
// prendido, todo lo que pasa por cfetch se lee y se escribe en memoria (mesas y carta se
// copian de las reales al entrar). Nada llega a la base, así que no entra al cierre de caja.
// El cierre lee con el fetch de verdad (cargarPagosComandas), nunca con éste.
var SIM = null;
function simResponder(url, opts) {
  var t = SIM.t, m = (opts && opts.method) || "GET";
  var partes = String(url).split("/rest/v1/")[1].split("?");
  var tabla = partes[0]; if (!t[tabla]) t[tabla] = [];
  var ps = (partes[1] || "").split("&").filter(Boolean).map(function(kv) { var i = kv.indexOf("="); return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))]; });
  function pasa(f) {
    return ps.every(function(q) {
      var k = q[0], v = q[1];
      if (k === "select" || k === "order" || k === "limit") return true;
      var v0 = String(f[k] == null ? "" : f[k]);
      if (v.indexOf("eq.") === 0) return v0 === v.slice(3);
      if (v.indexOf("in.(") === 0) return v.slice(4, -1).split(",").indexOf(v0) >= 0;
      if (v.indexOf("gte.") === 0) return v0 >= v.slice(4);
      if (v.indexOf("like.") === 0) return v0.indexOf(v.slice(5).replace(/\*$/, "")) === 0;
      return true;
    });
  }
  var ok = function(d) { return new Response(JSON.stringify(d), { status: 200 }); };
  if (m === "POST") {
    var cuerpo = JSON.parse(opts.body); if (!Array.isArray(cuerpo)) cuerpo = [cuerpo];
    cuerpo.forEach(function(f) {
      var i = t[tabla].findIndex(function(x) { return x.id === f.id; });
      if (i >= 0) t[tabla][i] = { ...t[tabla][i], ...f }; else t[tabla].push({ ...f });
    });
    return ok([]);
  }
  if (m === "DELETE") { t[tabla] = t[tabla].filter(function(f) { return !pasa(f); }); return ok([]); }
  var filas = t[tabla].filter(pasa);
  var ord = (ps.find(function(q) { return q[0] === "order"; }) || [0, ""])[1].split(",").filter(Boolean);
  if (ord.length) filas = filas.slice().sort(function(a, b) {
    for (var i = 0; i < ord.length; i++) {
      var c = ord[i].split(".")[0], d = ord[i].indexOf(".desc") > 0 ? -1 : 1;
      if (a[c] < b[c]) return -d; if (a[c] > b[c]) return d;
    }
    return 0;
  });
  return ok(filas);
}
function cfetch(url, opts) { return SIM ? Promise.resolve(simResponder(url, opts)) : fetch(url, opts); }
async function simIniciar() {
  var t = { comanda_mesas: [], comandas: [], comanda_items: [], carta: [], pautas: [] };
  t.comanda_mesas = await sbLoadMesas(); t.carta = await sbLoadCarta();
  SIM = { t: t };
}
function simTerminar() { SIM = null; }
// Cuadros que se acomodan en el plano además de las mesas.
var CMD_PALETA = ["#9AA0A6", "#4C9A5A", "#3A9BC1", "#D4A017", "#E07B39", "#B07CD8", "#C77DA8", "#A98B62"];
var CMD_EXTRAS = [
  { id:"rect",    emoji:"▭", nombre:"Rectángulo", color:"#9AA0A6", medidas:[4, 4] },
  { id:"salon",   emoji:"🍽️", nombre:"Salón",   color:"#4C9A5A", medidas:[4, 10] },
  { id:"barra",   emoji:"🍸", nombre:"Barra",   color:"#B07CD8" },
  { id:"cocina",  emoji:"🍳", nombre:"Cocina",  color:"#E07B39" },
  { id:"entrada", emoji:"🚪", nombre:"Entrada", color:"#3A9BC1" },
  { id:"banos",   emoji:"🚻", nombre:"Baños",   color:"#7E8C99", medidas:[2, 2] },
  { id:"caja",    emoji:"💰", nombre:"Caja",    color:"#D4A017" },
  { id:"patio",    emoji:"🌳", nombre:"Patio",    color:"#5FA05F", medidas:[4, 4] },
  { id:"deposito", emoji:"📦", nombre:"Depósito", color:"#A98B62", medidas:[2, 2] },
  { id:"vereda",   emoji:"🚶", nombre:"Vereda",   color:"#8FA3B0", medidas:[10, 1.5] },
  { id:"otro",     emoji:"✏️", nombre:"Otro (con nombre)", color:"#C77DA8", medidas:[3, 3] },
];
// ─── COBRO ────────────────────────────────────────────────────────────
// Cómo se pagó cada comanda. Se guarda en pautas (ámbito "comanda_pago", un registro por comanda) para no tener que tocar la tabla comandas:
// {comanda_id, local, fecha (día de negocio), total, pagos:[{medio, monto}], cobro_por, cobrado_at}. El cierre de caja lo lee para controlar.
// Los medios de cobro son exactamente los casilleros del cierre de caja de cada local: el id de cada medio ES el campo del cierre
// (efectivo, transferencia, tarjeta_debito, tarjeta_credito, otros, pat_*, mp_*). Así lo cobrado en comandas cae en el casillero correcto sin traducciones.
export function mediosDeLocal(localId) {
  var banco = { l1:"Provincia", l2:"Galicia", l3:"Patagonia" }[localId] || "";
  var sb = banco ? " " + banco : "";
  var m = [
    { id:"efectivo",        emoji:"💵", nombre:"Efectivo" },
    { id:"transferencia",   emoji:"📲", nombre:"Transf." + sb },
    { id:"tarjeta_debito",  emoji:"💳", nombre:"Débito" + sb },
    { id:"tarjeta_credito", emoji:"💳", nombre:"Crédito" + sb },
    { id:"otros",           emoji:localId === "l3" ? "📦" : "📱", nombre:localId === "l3" ? "Otros (ex QR MP)" : "QR" + sb },
  ];
  if (localId === "l1") m = m.concat([
    { id:"pat_transferencia", emoji:"📲", nombre:"Transf. Patagonia" },
    { id:"pat_qr",            emoji:"📱", nombre:"QR Patagonia" },
    { id:"pat_debito",        emoji:"💳", nombre:"Débito Patagonia" },
    { id:"pat_credito",       emoji:"💳", nombre:"Crédito Patagonia" },
  ]);
  return m.concat([
    { id:"mp_transferencia", emoji:"📲", nombre:"Transferencia MP" },
    { id:"mp_qr",            emoji:"📱", nombre:"QR MP" },
    { id:"mp_debito",        emoji:"💳", nombre:"Débito MP" },
    { id:"mp_credito",       emoji:"💳", nombre:"Crédito MP" },
  ]);
}
// Los cobros viejos guardaban ids genéricos (debito, credito, qr): se pasan al casillero del cierre.
export function normalizarMedio(id) { return { debito:"tarjeta_debito", credito:"tarjeta_credito", qr:"otros" }[id] || id; }
async function sbGuardarPago(p) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"cpago_" + p.comanda_id, ambito:"comanda_pago", texto:JSON.stringify(p), usuario:p.cobro_por || "", created_at:ahora, updated_at:ahora }) });
    if (!r.ok) return (await r.text()) || ("Error " + r.status);
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
// Lo extra de cada comanda (descuento, datos para facturar, control pedido) vive en pautas, ámbito "comanda_extra", un registro por comanda.
async function sbLeerExtra(id) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent("cextra_" + id) + "&limit=1", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) && d[0] ? (JSON.parse(d[0].texto) || {}) : {};
  } catch(e) { return {}; }
}
async function sbGuardarExtra(id, obj, usuario) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"cextra_" + id, ambito:"comanda_extra", texto:JSON.stringify(obj), usuario:usuario || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// Dónde está cada mesa en el plano del local (x, y en % del lienzo). Va en pautas, ámbito "comanda_plano", un registro por local.
async function sbLeerPlano(localId) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent("cplano_" + localId) + "&limit=1", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    var o = Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : {};
    return { pos: (o && o.pos) || {}, extras: (o && o.extras) || [], dims: (o && o.dims) || null, modelo: (o && o.modelo) || 1 };
  } catch(e) { return { pos: {}, extras: [], dims: null, modelo: 1 }; }
}
async function sbGuardarPlano(localId, pos, extras, dims, usuario) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"cplano_" + localId, ambito:"comanda_plano", texto:JSON.stringify({ pos:pos, extras:extras || [], dims:dims || null, modelo:2 }), usuario:usuario || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// Qué categorías de la carta no pasan por la cocina (van a la barra), por local. Va en pautas, ámbito "carta_sin_cocina". Sin registro, se reconocen por el nombre.
async function sbLeerSinCocina(localId) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent("csinc_" + localId) + "&limit=1", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
  } catch(e) { return null; }
}
async function sbGuardarSinCocina(localId, categorias, usuario) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"csinc_" + localId, ambito:"carta_sin_cocina", texto:JSON.stringify({ categorias:categorias }), usuario:usuario || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// Comanda de barra para imprimir: un registro por «Marchar» con bebidas (pautas, ámbito "impresion_barra"). El programa de la comandera, en la PC del local, lo toma, lo imprime y lo marca como impreso.
async function sbCrearImpresionBarra(job) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"cprint_" + job.comanda_id + "_" + (job.destino || "barra") + "_" + Date.now(), ambito:"impresion_barra", texto:JSON.stringify(job), usuario:job.por || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// Faltantes de plato: lo avisa el mozo o la cocina. Va en pautas, ámbito "comanda_faltante", un registro por aviso.
async function sbGuardarFaltante(f) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:f.id, ambito:"comanda_faltante", texto:JSON.stringify(f), usuario:f.por || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
async function sbLeerFaltantes(localId, fecha) {
  try {
    var d0 = new Date(fecha + "T00:00:00"); d0.setDate(d0.getDate() - 1);
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.comanda_faltante&created_at=gte." + d0.toISOString() + "&order=created_at.desc&limit=500", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function(f) { try { return JSON.parse(f.texto); } catch(e) { return null; } }).filter(function(x) { return x && x.local === localId && x.fecha === fecha && !esComandaPrueba(x.comanda_id); }) : [];
  } catch(e) { return []; }
}
// ¿Esta mesa ya se cerró (cobró) desde `desdeISO`? Sirve para preguntar si la que se abre ahora es una mesa nueva.
async function sbMesaCerradaDesde(mesaId, desdeISO, prueba) {
  try {
    var r = await cfetch(SURL + "/rest/v1/comandas?mesa_id=eq." + encodeURIComponent(mesaId) + "&estado=eq.cerrada&cerrada_at=gte." + desdeISO + "&id=" + (prueba ? "" : "not.") + "like.cmdp_*&limit=1", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) && d.length > 0;
  } catch(e) { return false; }
}
// Borra TODO lo de la prueba compartida: cuentas, productos, cobros, extras, registro, tiempos de entrega y faltantes de prueba.
async function sbBorrarPruebas() {
  var h = SH, ok = true;
  var pedidos = [
    ["comanda_items", "comanda_id=like.cmdp_*"],
    ["comandas", "id=like.cmdp_*"],
    ["pautas", "id=like.cpago_cmdp_*"],
    ["pautas", "id=like.cextra_cmdp_*"],
    ["pautas", "id=like.clog_cmdp_*"],
    ["pautas", "id=like.centrega_cmdp_*"],
    ["pautas", "id=like.cfalt_p_*"],
  ];
  for (var i = 0; i < pedidos.length; i++) {
    try { var r = await cfetch(SURL + "/rest/v1/" + pedidos[i][0] + "?" + pedidos[i][1], { method:"DELETE", headers:h }); if (!r.ok) ok = false; } catch(e) { ok = false; }
  }
  return ok;
}
// Lo extra de las cuentas de los últimos días, todo junto: {comanda_id: {...}} (la pantalla de cocina lo usa para saber si una mesa es nueva).
async function sbLeerExtrasRecientes() {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.comanda_extra&created_at=gte." + new Date(Date.now() - 2 * 86400000).toISOString() + "&limit=2000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function(f) { try { o[String(f.id).replace(/^cextra_/, "")] = JSON.parse(f.texto) || {}; } catch(e) {} });
    return o;
  } catch(e) { return {}; }
}
// Lo extra de unas cuentas puntuales (para el informe: cantidad de personas): {comanda_id: {...}}.
async function sbLeerExtrasDe(ids) {
  var o = {};
  for (var k = 0; k < ids.length; k += 80) {
    try {
      var tanda = ids.slice(k, k + 80).map(function(i) { return "cextra_" + i; }).join(",");
      var r = await cfetch(SURL + "/rest/v1/pautas?id=in.(" + tanda + ")&limit=200", { headers: {...SH, "Cache-Control":"no-cache"} });
      var d = await r.json();
      (Array.isArray(d) ? d : []).forEach(function(f) { try { o[String(f.id).replace(/^cextra_/, "")] = JSON.parse(f.texto) || {}; } catch(e) {} });
    } catch(e) {}
  }
  return o;
}
// Tiempo de entrega que el cajero le promete al cliente en delivery y mostrador. Va en pautas, ámbito "comanda_entrega", un registro por comanda.
async function sbGuardarEntrega(e) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"centrega_" + e.comanda_id, ambito:"comanda_entrega", texto:JSON.stringify(e), usuario:e.por || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(er) { return false; }
}
// Las de hace poco, de todos los pedidos: {comanda_id: {minutos, prometida_at}}.
async function sbLeerEntregas(desdeISO) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.comanda_entrega&created_at=gte." + (desdeISO || new Date(Date.now() - 3 * 86400000).toISOString()) + "&limit=2000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function(f) { try { var x = JSON.parse(f.texto); if (x && x.comanda_id) o[x.comanda_id] = x; } catch(e) {} });
    return o;
  } catch(e) { return {}; }
}
// Despacho del delivery: «en camino» y «entregado al cliente», con la hora de cada paso. Va en pautas, ámbito "delivery_estado", un registro por comanda.
async function sbGuardarDespacho(d) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"cdeliv_" + d.comanda_id, ambito:"delivery_estado", texto:JSON.stringify(d), usuario:d.por || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
async function sbLeerDespachos(desdeISO) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.delivery_estado&created_at=gte." + (desdeISO || new Date(Date.now() - 3 * 86400000).toISOString()) + "&limit=2000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function(f) { try { var x = JSON.parse(f.texto); if (x && x.comanda_id) o[x.comanda_id] = x; } catch(e) {} });
    return o;
  } catch(e) { return {}; }
}
// Pedidos de delivery que llegan desde Comunidad: un aviso por pedido (pautas, ámbito "delivery_web"): nuevo → aceptado | rechazado, con el medio de pago y la nota del cliente.
async function sbGuardarPedidoWeb(a) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"cweb_" + a.comanda_id, ambito:"delivery_web", texto:JSON.stringify(a), usuario:a.aceptado_por || "Comunidad", created_at:a.creado_at || ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
async function sbLeerPedidosWeb() {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.delivery_web&created_at=gte." + new Date(Date.now() - 3 * 86400000).toISOString() + "&limit=1000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function(f) { try { var x = JSON.parse(f.texto); if (x && x.comanda_id) o[x.comanda_id] = x; } catch(e) {} });
    return o;
  } catch(e) { return {}; }
}
// Un pitido corto para avisar que entró un pedido nuevo (funciona porque el cajero ya tocó la pantalla).
function avisoSonoro(n) {
  try {
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    var ctx = new C(), t = ctx.currentTime;
    for (var k = 0; k < (n || 2); k++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t + k * 0.35); g.gain.exponentialRampToValueAtTime(0.4, t + k * 0.35 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.35 + 0.28);
      o.start(t + k * 0.35); o.stop(t + k * 0.35 + 0.3);
    }
    setTimeout(function() { try { ctx.close(); } catch(e) {} }, 1500);
  } catch(e) {}
}
// El turno de cada local: se abre con la fecha del día y se cierra cuando no queda ninguna cuenta abierta.
// Va en pautas, ámbito "turno", un registro por local y fecha: {local, fecha, estado:"abierto"|"cerrado", abierto_at, abierto_por, cerrado_at, cerrado_por}.
async function sbGuardarTurno(t) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"turno_" + t.local + "_" + t.fecha, ambito:"turno", texto:JSON.stringify(t), usuario:(t.estado === "abierto" ? t.abierto_por : t.cerrado_por) || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
async function sbLeerTurnos(localId) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.turno&created_at=gte." + new Date(Date.now() - 14 * 86400000).toISOString() + "&order=created_at.desc&limit=200", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return (Array.isArray(d) ? d : []).map(function(f) { try { return JSON.parse(f.texto); } catch(e) { return null; } }).filter(function(x) { return x && x.local === localId; })
      .sort(function(a, b) { return String(b.abierto_at).localeCompare(String(a.abierto_at)); });
  } catch(e) { return []; }
}
// Colores elegidos para la carta de cada local: de categorías (por camino) y de platos (por id). Va en pautas, ámbito "carta_color".
async function sbLeerColoresCarta(localId) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent("ccolor_" + localId) + "&limit=1", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    var o = Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : {};
    return { cats: (o && o.cats) || {}, platos: (o && o.platos) || {} };
  } catch(e) { return { cats: {}, platos: {} }; }
}
async function sbGuardarColoresCarta(localId, col) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"ccolor_" + localId, ambito:"carta_color", texto:JSON.stringify(col), usuario:"", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// Registro de todo lo que se hace en una cuenta, con la hora: pautas, ámbito "comanda_log", un registro por acción.
// El id empieza con el de la comanda para poder traer el historial de una sola cuenta.
async function sbLogAcciones(filas) {
  if (!filas || !filas.length) return;
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var body = filas.map(function(f, i) { return { id:"clog_" + f.comanda_id + "_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 5), ambito:"comanda_log", texto:JSON.stringify(f), usuario:f.por || "", created_at:ahora, updated_at:ahora }; });
    await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify(body) });
  } catch(e) {}
}
function leerLog(filas) { return (Array.isArray(filas) ? filas : []).map(function(f) { try { return JSON.parse(f.texto); } catch(e) { return null; } }).filter(Boolean).sort(function(a, b) { return String(a.at).localeCompare(String(b.at)); }); }
async function sbLeerLogDia(localId, fecha) {
  try {
    var d0 = new Date(fecha + "T00:00:00"); d0.setDate(d0.getDate() - 1);
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.comanda_log&created_at=gte." + d0.toISOString() + "&order=created_at.asc&limit=3000", { headers: {...SH, "Cache-Control":"no-cache"} });
    return leerLog(await r.json()).filter(function(x) { return x.local === localId && x.fecha === fecha && !esComandaPrueba(x.comanda_id); });
  } catch(e) { return []; }
}
// Para la pantalla de cocina: lo anotado en las cuentas desde cierta hora (incluye las de prueba), sin importar la fecha del turno.
async function sbLeerLogDesde(localId, desdeISO) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.comanda_log&created_at=gte." + desdeISO + "&order=created_at.asc&limit=3000", { headers: {...SH, "Cache-Control":"no-cache"} });
    return leerLog(await r.json()).filter(function(x) { return x.local === localId; });
  } catch(e) { return []; }
}
// Cuando la cocina termina un pedido y se lo entrega al mozo o al cajero queda un registro por tanda (pautas, ámbito "cocina_listo").
// Los productos pasan a «listo»; recién cuando el mozo o el cajero los lleva a la mesa pasan a «entregado».
async function sbGuardarListo(rec) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"clisto_" + rec.comanda_id + "_" + rec.ronda, ambito:"cocina_listo", texto:JSON.stringify(rec), usuario:rec.por || "", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// {"comanda|ronda": {comanda_id, ronda, listo_at, por, local}} de los últimos días desde `desdeISO`.
async function sbLeerListosDesde(desdeISO) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?ambito=eq.cocina_listo&created_at=gte." + desdeISO + "&order=created_at.desc&limit=600", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function(f) { try { var x = JSON.parse(f.texto); if (x && x.comanda_id) o[x.comanda_id + "|" + (x.ronda || 0)] = x; } catch(e) {} });
    return o;
  } catch(e) { return {}; }
}
// Primera vez que cada cuenta llegó a la cocina desde cierta hora: {comanda_id: primer enviado_at}. Sirve para numerar las comandas por orden de llegada.
async function sbEnviosDesde(desdeISO) {
  try {
    var r = await cfetch(SURL + "/rest/v1/comanda_items?enviado_at=gte." + desdeISO + "&order=enviado_at.asc&limit=3000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function(i) { if (i.comanda_id && i.enviado_at && (!o[i.comanda_id] || i.enviado_at < o[i.comanda_id])) o[i.comanda_id] = i.enviado_at; });
    return o;
  } catch(e) { return {}; }
}
async function sbComandasPorIds(ids) {
  if (!ids || !ids.length) return [];
  try {
    var r = await cfetch(SURL + "/rest/v1/comandas?id=in.(" + ids.join(",") + ")", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json(); return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbLeerLogComanda(cid) {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?id=like." + encodeURIComponent("clog_" + cid + "_") + "*&order=created_at.asc&limit=300", { headers: {...SH, "Cache-Control":"no-cache"} });
    return leerLog(await r.json());
  } catch(e) { return []; }
}
function horaSeg(iso) { try { return new Date(iso).toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }); } catch(e) { return ""; } }
// Lo que se descuenta de un subtotal: {tipo:"%"|"$", valor}.
function montoDescuento(subtotal, d) {
  if (!d || !(Number(d.valor) > 0)) return 0;
  var m = d.tipo === "%" ? subtotal * Math.min(100, Number(d.valor)) / 100 : Math.min(subtotal, Number(d.valor));
  return Math.round(m * 100) / 100;
}
// Las cuentas de la prueba compartida llevan «cmdp_» en el id: se ven en todos los aparatos (marcadas como PRUEBA) pero no entran
// al cierre de caja, ni a los informes, ni al registro del día. Se borran todas juntas con el botón de la prueba.
export function esComandaPrueba(id) { return String(id || "").indexOf("cmdp_") === 0; }
// Lo cobrado en comandas de un local en un día de negocio, para el cierre de caja.
export async function cargarPagosComandas(localId, fecha) { return cargarPagosGen(localId, fecha, fetch); }
// El informe usa cfetch (así en el modo práctica lee la práctica); el cierre de caja usa siempre el fetch de verdad.
async function cargarPagosGen(localId, fecha, ff) {
  try {
    var d0 = new Date(fecha + "T00:00:00"); d0.setDate(d0.getDate() - 1);
    var r = await ff(SURL + "/rest/v1/pautas?ambito=eq.comanda_pago&created_at=gte." + d0.toISOString() + "&order=created_at.desc&limit=2000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function(f) { try { return JSON.parse(f.texto); } catch(e) { return null; } }).filter(function(x) { return x && x.local === localId && x.fecha === fecha && !x.prueba; }) : [];
  } catch(e) { return []; }
}
async function sbLoadMesas() {
  try {
    var r = await cfetch(SURL + "/rest/v1/comanda_mesas?order=orden", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbSaveMesa(m) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await cfetch(SURL + "/rest/v1/comanda_mesas", { method:"POST", headers:h, body:JSON.stringify(m) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveMesa:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
async function sbDeleteMesa(id) {
  try { await cfetch(SURL + "/rest/v1/comanda_mesas?id=eq." + id, { method:"DELETE", headers:SH }); } catch(e) {}
}
async function sbLoadComandas() {
  try {
    var r = await cfetch(SURL + "/rest/v1/comandas?estado=eq.abierta&order=abierta_at", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbSaveComanda(c) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await cfetch(SURL + "/rest/v1/comandas", { method:"POST", headers:h, body:JSON.stringify(c) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveComanda:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}

async function sbLoadCarta() {
  try {
    var r = await cfetch(SURL + "/rest/v1/carta?order=categoria,orden", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
// PostgREST inserta un array entero en una sola llamada. Mandar 75 requests en
// paralelo —uno por plato— es la forma más fácil de que la red o el servidor corten
// la mitad y la carta quede a medio traer.
async function sbSaveCartaMuchos(filas) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await cfetch(SURL + "/rest/v1/carta", { method:"POST", headers:h, body:JSON.stringify(filas) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveCartaMuchos:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
async function sbSaveCarta(x) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await cfetch(SURL + "/rest/v1/carta", { method:"POST", headers:h, body:JSON.stringify(x) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveCarta:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
async function sbDeleteCarta(id) {
  try { await cfetch(SURL + "/rest/v1/carta?id=eq." + id, { method:"DELETE", headers:SH }); } catch(e) {}
}

// ─── ÍTEMS ────────────────────────────────────────────────────────────────────
// Una fila por ítem, no un JSON adentro de la comanda. Si dos mozos tocan la misma
// mesa —uno agrega el postre y el otro una bebida— con un objeto entero el último
// pisa lo del primero y falta un plato. Con filas sueltas, cada uno agrega la suya.
async function sbLoadItems(ids) {
  if (!ids || !ids.length) return [];
  try {
    var lista = ids.join(",");
    var r = await cfetch(SURL + "/rest/v1/comanda_items?comanda_id=in.(" + lista + ")&order=created_at", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
// Guarda uno o varios. Mandar una tanda entera a la cocina son N ítems que cambian
// de estado a la vez: va en una sola llamada y no en N.
async function sbSaveItems(filas) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await cfetch(SURL + "/rest/v1/comanda_items", { method:"POST", headers:h, body:JSON.stringify(filas) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveItems:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
async function sbDeleteItem(id) {
  try { await cfetch(SURL + "/rest/v1/comanda_items?id=eq." + id, { method:"DELETE", headers:SH }); } catch(e) {}
}

// ─── SECTORES ─────────────────────────────────────────────────────────────────
// Los mismos que usa el checklist para las áreas de un local, que son los que la
// gente nombra: "las del patio", "la de la vereda".
export var CMD_SECTORES = [
  { id:"salon",  emoji:"🍽️", nombre:"Salón"  },
  { id:"patio",  emoji:"🌳", nombre:"Patio"  },
  { id:"vereda", emoji:"☂️", nombre:"Vereda" },
  { id:"barra",  emoji:"🍸", nombre:"Barra"  },
];

// ¿De qué sector es una mesa? Se mira dónde está dibujada en el plano: si cae adentro de un recuadro Salón, Patio, Vereda o Barra, es de ese sector;
// si no, vale el sector con el que se cargó. `plano` = {pos, extras} del local.
function sectorDeMesa(m, plano) {
  var pl = plano || {}, q = pl.pos && pl.pos[m.id];
  var base = CMD_SECTORES.find(function(x) { return x.id === m.sector; }) || null;
  if (!q) return base;
  var mejor = null, areaMejor = 1e9;
  (pl.extras || []).forEach(function(z) {
    if (!z.w || !z.h) return;
    var nom = String(z.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var id = ["salon", "patio", "vereda", "barra"].indexOf(z.tipo) >= 0 ? z.tipo : (["patio", "vereda", "salon", "barra"].filter(function(k) { return nom.indexOf(k) >= 0; })[0] || null);
    if (!id) return;
    if (Math.abs(q.x - z.x) <= z.w / 2 && Math.abs(q.y - z.y) <= z.h / 2 && z.w * z.h < areaMejor) { areaMejor = z.w * z.h; mejor = id; }
  });
  return mejor ? CMD_SECTORES.find(function(x) { return x.id === mejor; }) : base;
}

// Cada tipo de pedido tiene su color y su rótulo en todas las pantallas, para que no se confundan una mesa, un delivery y un pedido de mostrador.
export var CMD_TIPO = {
  mesa:      { color:"#4C9A5A", emoji:"🪑", nombre:"Mesa",      plural:"Mesas" },
  delivery:  { color:"#3A9BC1", emoji:"🛵", nombre:"Delivery",  plural:"Deliverys" },
  mostrador: { color:"#D4A017", emoji:"🥡", nombre:"Mostrador", plural:"Mostrador" },
};
var CMD_VISTAS = [
  { id:"mesas",     emoji:"🪑", nombre:"Mesas",     tipo:"mesa"      },
  { id:"delivery",  emoji:"🛵", nombre:"Delivery",  tipo:"delivery"  },
  { id:"mostrador", emoji:"🥡", nombre:"Mostrador", tipo:"mostrador" },
  { id:"carta",     emoji:"📖", nombre:"Carta"                       },
  { id:"informe",   emoji:"📊", nombre:"Informe"                     },
];

function pesos(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR"); }

// Minutos desde que salió la tanda. Es el número por el que existe el cronómetro:
// no cuánto hace que se sentaron, sino cuánto hace que la cocina tiene el pedido.
function minutosDesde(iso) {
  if (!iso) return null;
  var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return isNaN(m) || m < 0 ? null : m;
}
// Verde hasta 10, amarillo hasta 20, rojo después. Son los tiempos con los que se
// mira una cocina: a los veinte minutos sin salir, alguien tiene que ir a ver.
// El límite lo elige administración (por defecto 15): verde hasta dos tercios del límite, amarillo hasta el límite y rojo desde ahí.
var LIMITE_DEFECTO = 15;
function colorDemora(min, limite) {
  if (min === null) return "#555";
  var L = limite || LIMITE_DEFECTO;
  return min >= L ? "#C1440E" : min >= Math.round(L * 2 / 3) ? "#D4A017" : "#3A7D44";
}
// Tiempo de aviso por local, que se elige en administración. Va en pautas (ámbito "comandas_config"), sin cambios de base.
async function sbLeerConfigCom() {
  try {
    var r = await cfetch(SURL + "/rest/v1/pautas?id=eq.ccfg&limit=1", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    var o = Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : {};
    return { limites: (o && o.limites) || {}, exigir: (o && o.exigir) || {}, imprimir: (o && o.imprimir) || {} };
  } catch(e) { return { limites: {}, exigir: {}, imprimir: {} }; }
}
async function sbGuardarConfigCom(cfg) {
  try {
    var ahora = new Date().toISOString();
    var h = { ...SH, "Prefer":"resolution=merge-duplicates,return=minimal" };
    var r = await cfetch(SURL + "/rest/v1/pautas", { method:"POST", headers:h, body:JSON.stringify({ id:"ccfg", ambito:"comandas_config", texto:JSON.stringify(cfg), usuario:"", created_at:ahora, updated_at:ahora }) });
    return r.ok;
  } catch(e) { return false; }
}
// Cuánto se retrasó una mesa o pedido pasado el tiempo límite, en tres niveles: leve (hasta 5 min de más), medio (hasta 10) y grave (más de 10).
function nivelRetraso(minutos, limite) {
  var extra = Math.round(minutos - limite);
  if (!(extra > 0)) return null;
  var n = extra <= 5 ? { id:"leve", txt:"LEVE", col:"#F0A030" } : extra <= 10 ? { id:"medio", txt:"MEDIO", col:"#E0652E" } : { id:"grave", txt:"GRAVE", col:"#C1121F" };
  return { ...n, extra:extra };
}
// ¿Hay que esperar a que la cocina entregue antes de llevar a la mesa? Sí, salvo que administración lo apague para ese local.
function exigeCocina(cfg, localId) { return ((cfg || {}).exigir || {})[localId] !== false; }
// ¿Lo que va a la cocina sale también en papel? Apagado por defecto (si el local ya imprime con otro sistema, saldría duplicado).
function imprimeCocina(cfg, localId) { return ((cfg || {}).imprimir || {})[localId] === true; }
function limiteDe(cfg, localId) { var n = Number(((cfg || {}).limites || {})[localId]); return n > 0 ? n : LIMITE_DEFECTO; }
// ENTRADA: el mozo o el cajero marca al lado de cada producto cuál es entrada. La marca (🥗) va al principio de la aclaración del producto, así no hace falta
// ninguna columna nueva; en pantalla se ve como una insignia y la aclaración se muestra sin la marca.
var MARCA_ENTRADA = "🥗";
function esEntrada(i) { return String((i && i.nota) || "").indexOf(MARCA_ENTRADA) === 0; }
// Las bebidas no pasan por la cocina: salen en la comanda de barra (impresa) y quedan en la cuenta de la mesa. Se marcan al principio de la nota.
var MARCA_BARRA = "🥤";
function esBarra(i) { return String((i && i.nota) || "").indexOf(MARCA_BARRA) === 0; }
var SIN_COCINA_DEFECTO = /bebida|cerveza|vino|trago|champ|whisk|jugo|gaseosa|\bagua|caf[eé]|licor|aperitivo|espumante|c[oó]ctel|sin alcohol|infusi/i;
// Una categoría va a la barra si así se eligió para el local; si todavía no se eligió nada, se reconoce por el nombre (bebidas, vinos, cervezas, tragos…).
function categoriaSinCocina(cat, cfg) {
  var top = String(cat || "").split(" › ")[0];
  if (cfg && Array.isArray(cfg.categorias)) return cfg.categorias.indexOf(top) >= 0;
  return SIN_COCINA_DEFECTO.test(top);
}
function notaVisible(i) { var n = String((i && i.nota) || ""); var m = n.indexOf(MARCA_ENTRADA) === 0 ? MARCA_ENTRADA : n.indexOf(MARCA_BARRA) === 0 ? MARCA_BARRA : ""; return m ? n.slice(m.length).replace(/^\s*\|?\s*/, "") : n; }
function notaConMarca(texto, entrada) { var t = String(texto || "").trim(); return entrada ? MARCA_ENTRADA + (t ? " | " + t : "") : (t || null); }
// Cursos de una cuenta: lo que se manda junto se parte en la tanda de ENTRADA y la de PRINCIPAL (lo que viene después). La entrada cuenta desde que se manda;
// lo principal cuenta desde que la cocina entregó la entrada (hasta entonces «espera la entrada»). La cuenta tiene siempre, además, su contador global desde el primer pedido.
// itemsC = todos los productos de la cuenta; listos = {"comanda|ronda": registro de la cocina}.
function infoCurso(itemsC, ronda, listos, salidas) {
  var sal = function(i) { return i.estado !== "cancelado" && i.estado !== "pendiente"; };
  var minEnv = function(arr) { return arr.reduce(function(a, i) { return i.enviado_at && (!a || i.enviado_at < a) ? i.enviado_at : a; }, null); };
  var mios = itemsC.filter(function(i) { return (i.ronda || 0) === ronda && sal(i); });
  if (!mios.length) return { curso:null, inicio:null, espera:false };
  var env = minEnv(mios);
  // «Por orden de comanda»: lo agregado espera a que la cocina entregue la tanda anterior; recién entonces empieza a correr su tiempo (y así sucesivamente).
  var ord = null;
  if (salidas && salidas[ronda] === "orden") {
    var rondasAnt = []; itemsC.forEach(function(i) { var r = i.ronda || 0; if (r < ronda && sal(i) && rondasAnt.indexOf(r) < 0) rondasAnt.push(r); });
    if (rondasAnt.length) {
      var rAnt = Math.max.apply(null, rondasAnt);
      var itAnt = itemsC.filter(function(i) { return (i.ronda || 0) === rAnt && sal(i); });
      if (itAnt.some(function(i) { return i.estado === "enviado"; })) ord = { espera:true, inicio:null };
      else {
        var recA = listos && listos[mios[0].comanda_id + "|" + rAnt];
        var iniA = recA ? recA.listo_at : itAnt.reduce(function(a, i) { return i.entregado_at && (!a || i.entregado_at > a) ? i.entregado_at : a; }, null);
        ord = { espera:false, inicio:iniA };
      }
    }
  }
  function fin(res) {
    if (!ord || res.espera) return res;
    if (ord.espera) return { curso:res.curso, inicio:null, espera:true };
    var i = res.inicio;
    if (ord.inicio && (!i || ord.inicio > i)) i = ord.inicio;
    return { curso:res.curso, inicio:i, espera:false };
  }
  if (mios.every(esEntrada)) return fin({ curso:"entrada", inicio:env, espera:false });
  if (mios.some(esEntrada)) return fin({ curso:null, inicio:env, espera:false });
  var prev = itemsC.filter(function(i) { return (i.ronda || 0) === ronda - 1 && sal(i); });
  if (prev.length && prev.every(esEntrada) && minEnv(prev) === env) {
    var rec = listos && listos[mios[0].comanda_id + "|" + (ronda - 1)];
    var ini = rec ? rec.listo_at : (prev.every(function(i) { return i.estado === "entregado" && i.entregado_at; }) ? prev.reduce(function(a, i) { return i.entregado_at > a ? i.entregado_at : a; }, "") : null);
    return fin({ curso:"principal", inicio:ini, espera:!ini });
  }
  return fin({ curso:null, inicio:env, espera:false });
}
// La tanda más vieja que la cocina todavía no entregó, que es la que manda en el
// color de la mesa: si hay tres rondas, la que importa es la que más espera.
function demoraDe(itemsComanda, listos, salidas) {
  // La demora de la mesa es la de lo más viejo que sigue en la cocina; cada parte agregada y cada curso (entrada, principal) tiene su propio contador.
  var todos = itemsComanda || [];
  var rondas = []; todos.forEach(function(i) { if (i.estado === "enviado" && i.enviado_at && rondas.indexOf(i.ronda || 0) < 0) rondas.push(i.ronda || 0); });
  var inicios = [];
  rondas.forEach(function(r) {
    var inf = infoCurso(todos, r, listos, salidas);
    if (inf.espera) return;   // lo principal espera a que salga la entrada: todavía no cuenta
    var ini = inf.inicio || todos.filter(function(i) { return (i.ronda || 0) === r && i.estado === "enviado" && i.enviado_at; }).reduce(function(a, i) { return !a || i.enviado_at < a ? i.enviado_at : a; }, null);
    if (ini) inicios.push(ini);
  });
  if (!inicios.length) return null;
  return minutosDesde(inicios.reduce(function(a, b) { return a < b ? a : b; }));
}

// Cuánto hace que está abierta. Es el dato que mira un encargado para saber qué
// mesa se está demorando, así que va en la tarjeta y no escondido adentro.
function hace(iso) {
  if (!iso) return "";
  var min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (isNaN(min) || min < 0) return "";
  if (min < 60) return min + " min";
  var h = Math.floor(min / 60);
  return h + "h " + String(min % 60).padStart(2, "0");
}

// ─── DETALLE DE UNA COMANDA ───────────────────────────────────────────────────
// Lo que se ve al tocar una mesa: lo que ya pidió, lo que falta mandar, y la carta
// para agregar. El pedido se arma primero y se manda después, a propósito: el mozo
// toma toda la mesa y recién ahí la cocina recibe una tanda, no siete papelitos.
// El cobro: elegir cómo se pagó y, si dividen la cuenta, cargar más de un medio. La suma tiene que dar el total.
function Cobro(props) {
  var total = props.total;
  var [lineas, setLineas] = useState([{ medio:"efectivo", monto:String(total) }]);
  var [guardando, setGuardando] = useState(false);
  var suma = lineas.reduce(function(a, l) { return a + (parseFloat(l.monto) || 0); }, 0);
  var falta = Math.round((total - suma) * 100) / 100;
  var ok = Math.abs(falta) < 1 && lineas.every(function(l) { return (parseFloat(l.monto) || 0) > 0; });
  function cambiar(i, k, v) { setLineas(function(prev) { return prev.map(function(l, j) { return j === i ? { ...l, [k]: v } : l; }); }); }
  function agregar() { setLineas(function(prev) { return prev.concat([{ medio:"transferencia", monto: falta > 0 ? String(falta) : "" }]); }); }
  function quitar(i) { setLineas(function(prev) { return prev.length > 1 ? prev.filter(function(l, j) { return j !== i; }) : prev; }); }
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:14 }}>
      <div style={{ background:"#0F0F0F", border:"1px solid #2A2A2A", borderRadius:16, padding:"18px", width:"100%", maxWidth:420, maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:800, color:"#F0EDE8" }}>💰 Cobrar · {props.titulo}</div>
        {props.tipo && CMD_TIPO[props.tipo] && <span style={{ display:"inline-block", marginTop:4, background:CMD_TIPO[props.tipo].color+"26", color:CMD_TIPO[props.tipo].color, border:"1px solid "+CMD_TIPO[props.tipo].color+"66", borderRadius:6, padding:"2px 8px", fontSize:10.5, fontWeight:800, letterSpacing:0.8 }}>{CMD_TIPO[props.tipo].emoji} {CMD_TIPO[props.tipo].nombre.toUpperCase()}</span>}
        {props.descuento > 0 && <div style={{ fontSize:11.5, color:"#8C8C8C", marginTop:6 }}>Subtotal {pesos(props.subtotal)} · <span style={{ color:"#D4A017" }}>descuento −{pesos(props.descuento)}</span></div>}
        <div style={{ fontSize:26, fontWeight:800, color:props.color || "#3A7D44", margin:"6px 0 12px" }}>{pesos(total)}</div>
        {props.factura && <div style={{ fontSize:11.5, color:"#5BB8DC", marginBottom:10 }}>🧾 A facturar: {props.factura.tipo === "A" ? "Factura A · " + (props.factura.razon || "") : "Consumidor final"}</div>}
        {lineas.map(function(l, i) {
          return (
            <div key={i} style={{ display:"flex", gap:7, marginBottom:8, alignItems:"center" }}>
              <select value={l.medio} onChange={function(e) { cambiar(i, "medio", e.target.value); }} style={{ ...INP, flex:1.4, padding:"10px 8px" }}>
                {mediosDeLocal(props.localId).map(function(m) { return <option key={m.id} value={m.id}>{m.emoji} {m.nombre}</option>; })}
              </select>
              <input type="number" inputMode="decimal" value={l.monto} onChange={function(e) { cambiar(i, "monto", e.target.value); }} placeholder="$" style={{ ...INP, flex:1, padding:"10px 8px" }} />
              {lineas.length > 1 && <button onClick={function() { quitar(i); }} style={{ background:"none", border:"none", color:"#888", fontSize:16, cursor:"pointer" }}>✕</button>}
            </div>
          );
        })}
        <button onClick={agregar} style={{ ...GH, padding:"8px 12px", fontSize:12, marginBottom:10 }}>➕ Dividir el pago en otro medio</button>
        <div style={{ fontSize:12, color: Math.abs(falta) < 1 ? "#4C9A5A" : "#E0714A", marginBottom:12 }}>
          {Math.abs(falta) < 1 ? "✓ El pago completa el total." : (falta > 0 ? "Faltan " + pesos(falta) + " para completar el total." : "Te pasás por " + pesos(-falta) + ".")}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button disabled={!ok || guardando} onClick={function() { setGuardando(true); props.onConfirmar(lineas.map(function(l) { return { medio:l.medio, monto:Math.round((parseFloat(l.monto) || 0) * 100) / 100 }; })); }}
            style={{ flex:2, padding:"12px", borderRadius:9, border:"none", background:(ok && !guardando) ? "#3A7D44" : "#1A1A1A", color:(ok && !guardando) ? "#fff" : "#555", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:(ok && !guardando) ? "pointer" : "not-allowed" }}>
            {guardando ? "Guardando…" : "Cobrar y cerrar"}
          </button>
          <button onClick={props.onCancelar} style={{ flex:1, padding:"12px", borderRadius:9, border:"1px solid #2A2A2A", background:"none", color:"#888", fontFamily:"'Inter',sans-serif", fontSize:13, cursor:"pointer" }}>Volver</button>
        </div>
      </div>
    </div>
  );
}

// ─── OPCIONES DE LA MESA ──────────────────────────────────────────────
function Ventana(props) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:14 }}>
      <div style={{ background:"#0F0F0F", border:"1px solid #2A2A2A", borderRadius:16, padding:"18px", width:"100%", maxWidth:440, maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:800, color:"#F0EDE8" }}>{props.titulo}</div>
          <button onClick={props.onCerrar} style={{ background:"none", border:"none", color:"#888", fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

// Quitar un plato: lo todavía no mandado se saca sin más; lo ya mandado queda anotado como quitado, con el motivo.
function VentanaQuitar(props) {
  var [motivo, setMotivo] = useState("Error de carga");
  var [otro, setOtro] = useState("");
  var lista = props.items;
  var texto = motivo === "Otro" ? (otro.trim() || "Otro") : motivo;
  return (
    <Ventana titulo="➖ Quitar de la cuenta" onCerrar={props.onCerrar}>
      <label style={{ display:"block", fontSize:9, color:"#8C8C8C", textTransform:"uppercase", marginBottom:4 }}>Motivo (para lo que ya se marchó)</label>
      <select value={motivo} onChange={function(e) { setMotivo(e.target.value); }} style={{ ...INP, marginBottom:motivo === "Otro" ? 6 : 12 }}>
        {["Error de carga", "El cliente cambió de idea", "No hay stock", "Reclamo del cliente", "Otro"].map(function(m) { return <option key={m} value={m}>{m}</option>; })}
      </select>
      {motivo === "Otro" && <input value={otro} onChange={function(e) { setOtro(e.target.value); }} placeholder="Escribí el motivo" style={{ ...INP, marginBottom:12 }} />}
      {lista.length === 0 && <div style={{ fontSize:13, color:"#777", padding:"10px 0" }}>No hay nada para quitar.</div>}
      {lista.map(function(i) {
        var mandado = i.estado !== "pendiente";
        return (
          <div key={i.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"8px 0", borderTop:"1px solid #1A1A1A" }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, color:"#F0EDE8" }}>{i.cant}× {i.nombre}</div>
              <div style={{ fontSize:10.5, color:mandado ? "#E0914A" : "#777" }}>{mandado ? "Ya marchado" : "Sin marchar"} · {pesos((Number(i.precio) || 0) * (Number(i.cant) || 1))}</div>
            </div>
            <button onClick={function() { props.onQuitar(i, texto, false); }} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #C1440E66", background:"#C1440E18", color:"#E0714A", fontSize:11.5, fontWeight:800, cursor:"pointer" }}>Quitar {Number(i.cant) > 1 ? "1" : ""}</button>
            {Number(i.cant) > 1 && <button onClick={function() { props.onQuitar(i, texto, true); }} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #2A2A2A", background:"none", color:"#9A9A9A", fontSize:11.5, cursor:"pointer" }}>Todos</button>}
          </div>
        );
      })}
    </Ventana>
  );
}

// Descuento sobre la cuenta, en porcentaje o en pesos, con el motivo anotado.
function VentanaDescuento(props) {
  var actual = props.descuento || {};
  var [tipo, setTipo] = useState(actual.tipo || "%");
  var [valor, setValor] = useState(actual.valor ? String(actual.valor) : "");
  var [motivo, setMotivo] = useState(actual.motivo || "");
  var v = Number(valor) || 0;
  var monto = montoDescuento(props.subtotal, { tipo:tipo, valor:v });
  var valido = v > 0 && (tipo === "$" ? v <= props.subtotal : v <= 100);
  return (
    <Ventana titulo="🏷️ Descuento" onCerrar={props.onCerrar}>
      <div style={{ fontSize:12, color:"#9A9A9A", marginBottom:10 }}>Cuenta: <b style={{ color:"#F0EDE8" }}>{pesos(props.subtotal)}</b></div>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {[["%", "En porcentaje (%)"], ["$", "En pesos ($)"]].map(function(t) {
          var act = tipo === t[0];
          return <button key={t[0]} onClick={function() { setTipo(t[0]); }} style={{ flex:1, padding:"9px", borderRadius:8, border:"1px solid "+(act ? "#D4A017" : "#2A2A2A"), background:act ? "#D4A01722" : "#111", color:act ? "#D4A017" : "#888", fontSize:12.5, fontWeight:800, cursor:"pointer" }}>{t[1]}</button>;
        })}
      </div>
      {tipo === "%" && (
        <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
          {[5, 10, 15, 20, 25, 50].map(function(n) { return <button key={n} onClick={function() { setValor(String(n)); }} style={{ padding:"6px 11px", borderRadius:7, border:"1px solid #2A2A2A", background:Number(valor) === n ? "#D4A01722" : "#111", color:Number(valor) === n ? "#D4A017" : "#9A9A9A", fontSize:12, fontWeight:700, cursor:"pointer" }}>{n}%</button>; })}
        </div>
      )}
      <input type="number" inputMode="decimal" value={valor} onChange={function(e) { setValor(e.target.value); }} placeholder={tipo === "%" ? "Porcentaje" : "Monto en pesos"} style={{ ...INP, marginBottom:8 }} />
      <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
        {["Empleado", "Cortesía", "Reclamo", "Cupón de la comunidad"].map(function(m) { return <button key={m} onClick={function() { setMotivo(m); }} style={{ padding:"5px 10px", borderRadius:7, border:"1px solid #2A2A2A", background:motivo === m ? "#1A6B8A33" : "#111", color:motivo === m ? "#5BB8DC" : "#888", fontSize:11, cursor:"pointer" }}>{m}</button>; })}
      </div>
      <input value={motivo} onChange={function(e) { setMotivo(e.target.value); }} placeholder="Motivo del descuento" style={{ ...INP, marginBottom:10 }} />
      {valido && <div style={{ fontSize:13, color:"#8FD19A", marginBottom:10 }}>Descuento: −{pesos(monto)} · Total a cobrar: <b>{pesos(Math.max(0, props.subtotal - monto))}</b></div>}
      <div style={{ display:"flex", gap:8 }}>
        <button disabled={!valido} onClick={function() { props.onGuardar({ tipo:tipo, valor:v, motivo:motivo.trim() }); }} style={{ flex:2, padding:"11px", borderRadius:9, border:"none", background:valido ? "#D4A017" : "#1A1A1A", color:valido ? "#000" : "#555", fontSize:13, fontWeight:800, cursor:valido ? "pointer" : "not-allowed" }}>Aplicar descuento</button>
        {actual.valor > 0 && <button onClick={function() { props.onGuardar(null); }} style={{ flex:1, padding:"11px", borderRadius:9, border:"1px solid #C1440E66", background:"none", color:"#E0714A", fontSize:12, cursor:"pointer" }}>Quitar</button>}
      </div>
    </Ventana>
  );
}

// Facturar: deja anotados los datos del comprobante. No emite la factura electrónica: eso lo hace quien factura, con estos datos.
function VentanaFactura(props) {
  var actual = props.factura || {};
  var [tipo, setTipo] = useState(actual.tipo || "B");
  var [cuit, setCuit] = useState(actual.cuit || "");
  var [razon, setRazon] = useState(actual.razon || "");
  var [email, setEmail] = useState(actual.email || "");
  var dig = cuit.replace(/\D/g, "");
  var valido = tipo === "B" || (dig.length === 11 && razon.trim().length > 1);
  return (
    <Ventana titulo="🧾 Facturar" onCerrar={props.onCerrar}>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {[["B", "Consumidor final"], ["A", "Factura A (con CUIT)"]].map(function(t) {
          var act = tipo === t[0];
          return <button key={t[0]} onClick={function() { setTipo(t[0]); }} style={{ flex:1, padding:"9px", borderRadius:8, border:"1px solid "+(act ? "#3A9BC1" : "#2A2A2A"), background:act ? "#3A9BC122" : "#111", color:act ? "#5BB8DC" : "#888", fontSize:12.5, fontWeight:800, cursor:"pointer" }}>{t[1]}</button>;
        })}
      </div>
      {tipo === "A" && (
        <div>
          <input value={cuit} onChange={function(e) { setCuit(e.target.value); }} inputMode="numeric" placeholder="CUIT (11 números)" style={{ ...INP, marginBottom:8 }} />
          <input value={razon} onChange={function(e) { setRazon(e.target.value); }} placeholder="Razón social" style={{ ...INP, marginBottom:8 }} />
        </div>
      )}
      <input value={email} onChange={function(e) { setEmail(e.target.value); }} placeholder="Email para enviarla (opcional)" style={{ ...INP, marginBottom:10 }} />
      {!valido && <div style={{ fontSize:11.5, color:"#E0914A", marginBottom:8 }}>Para la factura A hacen falta el CUIT completo y la razón social.</div>}
      <div style={{ fontSize:10.5, color:"#777", lineHeight:1.5, marginBottom:10 }}>Esto deja anotado que la cuenta se factura y con qué datos; queda en el cobro y en el cierre. La factura electrónica se emite aparte.</div>
      <div style={{ display:"flex", gap:8 }}>
        <button disabled={!valido} onClick={function() { props.onGuardar({ tipo:tipo, cuit:tipo === "A" ? dig : "", razon:tipo === "A" ? razon.trim() : "", email:email.trim() }); }} style={{ flex:2, padding:"11px", borderRadius:9, border:"none", background:valido ? "#3A9BC1" : "#1A1A1A", color:valido ? "#fff" : "#555", fontSize:13, fontWeight:800, cursor:valido ? "pointer" : "not-allowed" }}>Anotar para facturar</button>
        {actual.tipo && <button onClick={function() { props.onGuardar(null); }} style={{ flex:1, padding:"11px", borderRadius:9, border:"1px solid #C1440E66", background:"none", color:"#E0714A", fontSize:12, cursor:"pointer" }}>Quitar</button>}
      </div>
    </Ventana>
  );
}

// Anular una cuenta que ya se comandó (error del mozo, se fueron, se hizo de prueba...): queda anotada con el motivo, la mesa se libera y no suma a ninguna caja.
function VentanaAnular(props) {
  var [motivo, setMotivo] = useState("");
  var ok = motivo.trim().length >= 3;
  var rapidos = ["Se fueron sin consumir", "Error del mozo", "Mesa equivocada", "El cliente se arrepintió", "Era una prueba"];
  return (
    <Ventana titulo={"🚫 Anular · " + props.titulo} onCerrar={props.onCerrar}>
      <div style={{ fontSize:12.5, color:"#E0A090", lineHeight:1.55, marginBottom:10 }}>
        Se <b>anula toda la cuenta</b>{props.cantItems ? " (" + props.cantItems + " producto" + (props.cantItems === 1 ? "" : "s") + ")" : ""}: la cocina deja de verla, la mesa queda libre y <b>no se cobra ni entra al cierre de caja</b>. Queda anotado quién la anuló y por qué. No se puede deshacer.
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        {rapidos.map(function(m) { return <button key={m} onClick={function() { setMotivo(m); }} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid " + (motivo === m ? "#E0452E" : "#2A2A2A"), background:motivo === m ? "#E0452E22" : "#151515", color:"#E8D2CC", fontSize:11.5, cursor:"pointer" }}>{m}</button>; })}
      </div>
      <input value={motivo} onChange={function(e) { setMotivo(e.target.value); }} placeholder="Motivo (obligatorio)" style={{ ...INP, marginBottom:10 }} />
      <div style={{ display:"flex", gap:8 }}>
        <button disabled={!ok} onClick={function() { props.onAnular(motivo.trim()); }} style={{ flex:2, padding:"12px", borderRadius:9, border:"none", background:ok ? "#C1121F" : "#1A1A1A", color:ok ? "#fff" : "#555", fontSize:14, fontWeight:800, cursor:ok ? "pointer" : "not-allowed" }}>🚫 Anular la cuenta</button>
        <button onClick={props.onCerrar} style={{ ...GH, flex:1, padding:"12px", fontSize:13 }}>Volver</button>
      </div>
    </Ventana>
  );
}

// El control (precuenta): lo que se le muestra o se le imprime al cliente antes de cobrar. No es una factura.
function VentanaControl(props) {
  var lineas = props.items;
  function textoPlano() {
    var t = (props.localNombre || "") + "\nCONTROL · " + props.titulo + "\n" + new Date().toLocaleString("es-AR") + "\n-----------------------------\n";
    lineas.forEach(function(i) { t += i.cant + " x " + i.nombre + "  " + pesos((Number(i.precio) || 0) * (Number(i.cant) || 1)) + "\n"; });
    t += "-----------------------------\nSubtotal: " + pesos(props.subtotal) + "\n";
    if (props.descuento > 0) t += "Descuento: -" + pesos(props.descuento) + "\n";
    t += "TOTAL: " + pesos(props.total) + "\n(No válido como factura)";
    return t;
  }
  var [mandado, setMandado] = useState(false);
  // Imprimir: deja el ticket de control para la impresora del local (la que corre el programa de la comandera), sin cuadros del navegador.
  function imprimirLocal() {
    if (!props.onImprimirControl || !lineas.length) return;
    props.onImprimirControl({ personas:props.personas || null, items: lineas.map(function(i) { return { cant:Number(i.cant) || 1, nombre:i.nombre, precio:Number(i.precio) || 0 }; }), subtotal:props.subtotal, descuento:props.descuento || 0, motivo:props.motivoDesc || "", total:props.total });
    setMandado(true); setTimeout(function() { setMandado(false); }, 4000);
  }
  function imprimir() {
    var w = window.open("", "_blank", "width=380,height=600");
    if (!w) { alert("El navegador bloqueó la ventana de impresión. Permitila e intentá de nuevo."); return; }
    w.document.write("<pre style=\"font-family:monospace;font-size:14px;white-space:pre-wrap\">" + textoPlano().replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>");
    w.document.close(); w.focus(); w.print();
  }
  return (
    <Ventana titulo={"🧾 Control · " + props.titulo} onCerrar={props.onCerrar}>
      <div style={{ background:"#0A0A0A", border:"1px solid #1E1E1E", borderRadius:10, padding:"12px", marginBottom:12 }}>
        {lineas.length === 0 && <div style={{ fontSize:13, color:"#777" }}>La cuenta está vacía.</div>}
        {lineas.map(function(i) {
          return <div key={i.id} style={{ display:"flex", justifyContent:"space-between", gap:8, fontSize:13, color:"#F0EDE8", padding:"3px 0" }}><span>{i.cant}× {i.nombre}</span><span>{pesos((Number(i.precio) || 0) * (Number(i.cant) || 1))}</span></div>;
        })}
        <div style={{ borderTop:"1px solid #222", marginTop:8, paddingTop:8, fontSize:12.5, color:"#B8B8B8" }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}><span>Subtotal</span><span>{pesos(props.subtotal)}</span></div>
          {props.descuento > 0 && <div style={{ display:"flex", justifyContent:"space-between", color:"#8FD19A" }}><span>Descuento{props.motivoDesc ? " (" + props.motivoDesc + ")" : ""}</span><span>−{pesos(props.descuento)}</span></div>}
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:18, fontWeight:800, color:"#F0EDE8", marginTop:4 }}><span>TOTAL</span><span>{pesos(props.total)}</span></div>
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {props.onImprimirControl
          ? <button onClick={imprimirLocal} disabled={!lineas.length} style={{ flex:1, padding:"11px", borderRadius:9, border:"none", background:mandado ? "#2E5C36" : "#3A7D44", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>{mandado ? "✓ Mandado a la impresora" : "🖨️ Imprimir"}</button>
          : <button onClick={imprimir} style={{ flex:1, padding:"11px", borderRadius:9, border:"none", background:"#3A7D44", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>🖨️ Imprimir</button>}
        <button onClick={function() { try { navigator.clipboard.writeText(textoPlano()); alert("Copiado."); } catch (e) {} }} style={{ ...GH, flex:1, padding:"11px", fontSize:13 }}>📋 Copiar</button>
      </div>
      <div style={{ fontSize:10.5, color:"#777", marginTop:8 }}>Es un control para el cliente, no una factura.{props.onImprimirControl && <span> · <a onClick={imprimir} style={{ color:"#8C8C8C", textDecoration:"underline", cursor:"pointer" }}>imprimir desde el navegador</a></span>}</div>
    </Ventana>
  );
}


// Referencias de los colores de las mesas, para que cajeros y mozos sepan qué significa cada una.
function LeyendaColores(props) {
  var L = props.limite || LIMITE_DEFECTO;
  var [abierta, setAbierta] = useState(function() { try { return window.localStorage.getItem("nkt_leyenda_mesas") !== "0"; } catch(e) { return true; } });
  function alternar() { var n = !abierta; setAbierta(n); try { window.localStorage.setItem("nkt_leyenda_mesas", n ? "1" : "0"); } catch(e) {} }
  var filas = [
    ["#2A2A2A", "#555", "Libre", "Mesa sin cuenta abierta."],
    [props.color || "#C1440E", props.color || "#C1440E", "Abierta, sin pedir", "Tiene cuenta pero todavía no se mandó nada a cocina."],
    ["#3A7D44", "#3A7D44", "En cocina, a tiempo", "Ya está en cocina y va bien de tiempo."],
    ["#D4A017", "#D4A017", "En cocina, demorando", "Se acerca al límite de " + L + " min: conviene estar atento."],
    ["#E0452E", "#E0452E", "Rojo titilando", "Se pasó de los " + L + " min en cocina: hay que apurar."],
    ["#FFD60A", "#FFD60A", "Amarillo: comiendo", "La cocina ya entregó todo lo que pidió."],
  ];
  return (
    <div style={{ marginBottom:10 }}>
      <button onClick={alternar} style={{ ...GH, padding:"5px 11px", fontSize:11 }}>🎨 Colores de las mesas {abierta ? "▴" : "▾"}</button>
      {abierta && (
        <div style={{ marginTop:6, background:"#0F0F0F", border:"1px solid #222", borderRadius:10, padding:"8px 10px", display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(250px, 1fr))", gap:"6px 14px" }}>
          {filas.map(function(f, k) {
            return (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ flexShrink:0, width:22, height:22, borderRadius:6, border:"2px solid " + f[0], background: f[0] + "44", animation: k === 4 ? "nktPulso 1s infinite" : "none" }} />
                <span style={{ fontSize:11.5, color:"#B8B8B8", lineHeight:1.35 }}><b style={{ color: f[1] === "#555" ? "#8C8C8C" : f[1] }}>{f[2]}</b> · {f[3]}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── INFORME DE COCINA ────────────────────────────────────────────────
// Solo tiempos y comida, sin plata: cuánto tardó la cocina, qué se retrasó, qué se pidió más, qué se quitó o cambió y qué faltó.
function InformeCocina(props) {
  var localId = props.localId;
  var [fecha, setFecha] = useState(props.diaDeNegocio ? props.diaDeNegocio() : new Date().toISOString().slice(0, 10));
  var [datos, setDatos] = useState(null);
  useEffect(function() {
    var vivo = true; setDatos(null);
    (async function() {
      var ini = new Date(fecha + "T06:00:00"), fin = new Date(ini.getTime() + 86400000);
      var listos = await sbLeerListosDesde(new Date(ini.getTime() - 86400000).toISOString());
      var recs = Object.keys(listos).map(function(k) { return listos[k]; }).filter(function(r) { return (!r.local || r.local === localId) && r.listo_at >= ini.toISOString() && r.listo_at < fin.toISOString() && !esComandaPrueba(r.comanda_id); });
      var ids = []; recs.forEach(function(r) { if (ids.indexOf(r.comanda_id) < 0) ids.push(r.comanda_id); });
      var coms = await sbComandasPorIds(ids), its = ids.length ? await sbLoadItems(ids) : [];
      var mesas = await sbLoadMesas();
      var plano = await sbLeerPlano(localId);
      var falt = (await sbLeerFaltantes(localId, fecha));
      var cfg = await sbLeerConfigCom();
      var cartaK = (await sbLoadCarta()).filter(function(x) { return x.local === localId; });
      if (vivo) setDatos({ recs:recs, coms:coms, items:its, mesas:mesas, falt:falt, cfg:cfg, plano:plano, carta:cartaK });
    })();
    return function() { vivo = false; };
  }, [fecha, localId]);
  var card = { background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:12, padding:"13px 14px", marginBottom:12 };
  var h = { fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1.5, marginBottom:8, fontWeight:700 };

  function cuerpo() {
    if (!datos) return <div style={{ textAlign:"center", padding:"30px 0", color:"#444" }}>Cargando…</div>;
    var limite = limiteDe(datos.cfg, localId);
    var entregas = datos.recs.map(function(r) {
      var c = datos.coms.find(function(x) { return x.id === r.comanda_id; });
      var delT = datos.items.filter(function(i) { return i.comanda_id === r.comanda_id && (i.ronda || 0) === (r.ronda || 0) && i.enviado_at && i.estado !== "cancelado"; });
      if (!c || !delT.length) return null;
      var desde = delT.reduce(function(a, i) { return i.enviado_at < a ? i.enviado_at : a; }, delT[0].enviado_at);
      var min = (new Date(r.listo_at) - new Date(desde)) / 60000;
      if (!(min >= 0 && min < 240)) return null;
      var mesa = datos.mesas.find(function(m) { return m.id === c.mesa_id; });
      var sec = mesa ? sectorDeMesa(mesa, datos.plano) : null;
      var nombre = c.tipo === "mesa" ? "🪑 Mesa " + (mesa ? mesa.nombre : "") + (sec ? " · " + sec.nombre : "") : (c.tipo === "delivery" ? "🛵 Delivery" : "🥡 Mostrador") + (c.cliente ? " · " + c.cliente : "");
      var aMesa = delT.every(function(i) { return i.estado === "entregado" && i.entregado_at; }) ? (new Date(delT.reduce(function(a, i) { return i.entregado_at > a ? i.entregado_at : a; }, "")) - new Date(r.listo_at)) / 60000 : null;
      return { r:r, c:c, items:delT, nombre:nombre, min:min, aMesa:(aMesa !== null && aMesa >= 0 && aMesa < 240) ? aMesa : null, nv:nivelRetraso(min, limite) };
    }).filter(Boolean);
    if (!entregas.length) return <div style={{ textAlign:"center", padding:"30px 0", color:"#555", fontSize:13 }}>La cocina todavía no entregó pedidos en este día.</div>;
    var prom = entregas.reduce(function(a, e) { return a + e.min; }, 0) / entregas.length;
    var orden = entregas.slice().sort(function(a, b) { return b.min - a.min; });
    var conMesa = entregas.filter(function(e) { return e.aMesa !== null; });
    var aMesaProm = conMesa.length ? conMesa.reduce(function(a, e) { return a + e.aMesa; }, 0) / conMesa.length : null;
    var retr = entregas.filter(function(e) { return e.nv; }), porNivel = { leve:0, medio:0, grave:0 }; retr.forEach(function(e) { porNivel[e.nv.id]++; });
    // Comida: lo más pedido y lo más lento en salir.
    var todos = []; entregas.forEach(function(e) { e.items.forEach(function(i) { todos.push({ i:i, min:e.min }); }); });
    var porPlato = {}; todos.forEach(function(x) { var o = porPlato[x.i.nombre] || (porPlato[x.i.nombre] = { n:0, t:0, v:0 }); o.n += Number(x.i.cant) || 1; o.t += x.min; o.v++; });
    var masPedidos = Object.keys(porPlato).map(function(k) { return { nombre:k, n:porPlato[k].n, prom:porPlato[k].t / porPlato[k].v }; }).sort(function(a, b) { return b.n - a.n; }).slice(0, 15);
    var lentos = masPedidos.slice().sort(function(a, b) { return b.prom - a.prom; }).slice(0, 5);
    var idsE = {}; datos.recs.forEach(function(r) { idsE[r.comanda_id] = 1; });
    var quitados = datos.items.filter(function(i) { return idsE[i.comanda_id] && i.estado === "cancelado" && i.enviado_at; });
    var falt = datos.falt;
    var kpi = function(t, v, sub, col) { return <div style={{ flex:"1 1 130px", background:"#111", border:"1px solid " + (col || "#222") + "55", borderRadius:10, padding:"10px 12px" }}><div style={{ fontSize:9, color:"#777", textTransform:"uppercase", letterSpacing:1 }}>{t}</div><div style={{ fontSize:20, fontWeight:800, color:col || "#F0EDE8", margin:"2px 0" }}>{v}</div><div style={{ fontSize:10, color:"#666" }}>{sub}</div></div>; };
    return (
      <div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {kpi("Entregas de la cocina", entregas.length, "pedidos o tandas", "#4C9A5A")}
          {kpi("Tiempo promedio", fmtMin(prom), "de Marchar a listo", "#D4A017")}
          {kpi("La más lenta", fmtMin(orden[0].min), orden[0].nombre, "#C1440E")}
          {kpi("La más rápida", fmtMin(orden[orden.length - 1].min), orden[orden.length - 1].nombre, "#3A9BC1")}
        </div>
        {aMesaProm !== null && <div style={{ ...card, fontSize:13, color:"#DDD" }}>🍽️ Del listo a la mesa (lo que tarda el mozo o el cajero en llevarlo): <b style={{ color:"#F0EDE8" }}>{fmtMin(aMesaProm)}</b> <span style={{ color:"#666", fontSize:11 }}>({conMesa.length})</span></div>}

        <div style={{ ...card, borderColor: retr.length ? "#E0652E66" : "#1E1E1E" }}>
          <div style={h}>⏰ Retrasos (más de {limite} min en la cocina)</div>
          {retr.length === 0 ? <div style={{ fontSize:13, color:"#8FD19A" }}>✅ Ninguna entrega pasó de los {limite} minutos.</div> : (
            <div>
              <div style={{ fontSize:13, color:"#DDD", marginBottom:8 }}><b style={{ color:"#F0EDE8" }}>{retr.length}</b> de {entregas.length} entregas se pasaron del límite</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                {[["leve", "#F0A030", "Leve (hasta +5)"], ["medio", "#E0652E", "Medio (+6 a +10)"], ["grave", "#C1121F", "Grave (más de +10)"]].map(function(x) { return <span key={x[0]} style={{ background:x[1] + "26", border:"1px solid " + x[1], color:x[1], borderRadius:8, padding:"4px 10px", fontSize:12, fontWeight:800 }}>{x[2]}: {porNivel[x[0]]}</span>; })}
              </div>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={h}>⏱ Cuánto tardó cada entrega (de la más lenta a la más rápida)</div>
          {orden.map(function(e, i) {
            return <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 0", borderTop:"1px solid #181818", fontSize:12.5 }}>
              <div style={{ minWidth:0 }}><div style={{ color:"#DDD" }}>{e.nombre}{e.r.ronda > 1 ? <span style={{ color:"#666" }}> · tanda {e.r.ronda}</span> : null}</div><div style={{ fontSize:11, color:"#777" }}>{e.items.map(function(i) { return (Number(i.cant) || 1) + "× " + i.nombre; }).join(", ")}</div></div>
              <div style={{ textAlign:"right", whiteSpace:"nowrap" }}><b style={{ color: e.nv ? e.nv.col : "#F0EDE8" }}>{fmtMin(e.min)}</b>{e.nv && <div style={{ fontSize:10.5, fontWeight:800, color:e.nv.col }}>+{e.nv.extra} · {e.nv.txt}</div>}</div>
            </div>;
          })}
        </div>

        <div style={card}>
          <div style={h}>🍽️ Lo más pedido</div>
          {masPedidos.map(function(x) { return <div key={x.nombre} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:"1px solid #181818", fontSize:12.5 }}><span style={{ color:"#CCC" }}>{x.nombre}</span><span style={{ color:"#999" }}><b style={{ color:"#F0EDE8" }}>{x.n}</b> · sale en {fmtMin(x.prom)}</span></div>; })}
        </div>

        <div style={card}>
          <div style={h}>🐢 Lo que más tarda en salir</div>
          {lentos.map(function(x) { return <div key={x.nombre} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:"1px solid #181818", fontSize:12.5 }}><span style={{ color:"#CCC" }}>{x.nombre}</span><span style={{ color:"#999" }}>{fmtMin(x.prom)} <span style={{ color:"#555" }}>×{x.n}</span></span></div>; })}
        </div>

        <div style={card}>
          <div style={h}>🔄 Cambios y quitados después de marchar</div>
          {quitados.length === 0 ? <div style={{ fontSize:12, color:"#555" }}>No hubo cambios ni quitados.</div> : quitados.map(function(i) {
            var cm = /^cambio por (.+)$/.exec(i.nota || "");
            return <div key={i.id} style={{ fontSize:12.5, color:"#D4A017", padding:"3px 0", borderTop:"1px solid #181818" }}>{cm ? "🔄 " + (Number(i.cant) || 1) + "× " + i.nombre + " → " + cm[1] : "🗑 " + (Number(i.cant) || 1) + "× " + i.nombre + (i.nota ? " — " + i.nota : "")}</div>;
          })}
        </div>

        <TarjetasDiscontinuados falt={falt} carta={datos.carta} card={card} h={h} />
      </div>
    );
  }
  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
        <input type="date" value={fecha} onChange={function(e) { setFecha(e.target.value); }} style={{ ...INP, width:"auto", padding:"8px 10px", fontSize:13 }} />
        <span style={{ fontSize:11, color:"#777" }}>Del día de negocio (desde las 6 de la mañana). Solo tiempos y comida.</span>
      </div>
      {cuerpo()}
    </div>
  );
}

// Tarjetas de los informes: qué se discontinuó (y qué volvió a la carta) en el día, qué sigue discontinuado ahora y los otros faltantes.
var NOTA_DISC = "Discontinuado", NOTA_VUELTO = "Vuelto a la carta";
function TarjetasDiscontinuados(props) {
  var falt = props.falt || [], card = props.card, h = props.h;
  var movs = falt.filter(function(f) { return f.nota === NOTA_DISC || f.nota === NOTA_VUELTO; }).sort(function(a, b) { return String(a.at).localeCompare(String(b.at)); });
  var otros = falt.filter(function(f) { return f.nota !== NOTA_DISC && f.nota !== NOTA_VUELTO; });
  var ahora = (props.carta || []).filter(function(x) { return x.activo === false; });
  return (
    <div>
      <div style={{ ...card, borderColor: (movs.length || ahora.length) ? "#C1440E66" : "#1E1E1E" }}>
        <div style={h}>🚫 Productos discontinuados</div>
        <div style={{ fontSize:11, color:"#8C8C8C", margin:"0 0 6px" }}>Lo que se sacó de la carta (y lo que volvió) durante el servicio:</div>
        {movs.length === 0 ? <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>No se discontinuó nada en este día.</div> : movs.map(function(f) {
          var vuelve = f.nota === NOTA_VUELTO;
          return <div key={f.id} style={{ display:"flex", gap:8, padding:"4px 0", borderTop:"1px solid #181818", fontSize:12.5, alignItems:"baseline" }}>
            <span style={{ color:"#4C9A5A", minWidth:44, fontVariantNumeric:"tabular-nums" }}>{horaSeg(f.at).slice(0, 5)}</span>
            <span style={{ flex:1, color:"#DDD" }}><b>{f.plato}</b> <span style={{ color: vuelve ? "#8FD19A" : "#E0714A" }}>{vuelve ? "↩ volvió a la carta" : "🚫 discontinuado"}</span>{f.por ? <span style={{ color:"#666" }}> ({f.por})</span> : null}</span>
          </div>;
        })}
        <div style={{ fontSize:11, fontWeight:800, color:"#E0714A", margin:"8px 0 4px" }}>Siguen discontinuados ahora ({ahora.length})</div>
        {ahora.length === 0 ? <div style={{ fontSize:12, color:"#555" }}>Todo está disponible.</div> : <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{ahora.map(function(x) { return <span key={x.id} style={{ background:"#C1440E22", border:"1px solid #C1440E66", color:"#E8A08C", borderRadius:7, padding:"3px 9px", fontSize:12, fontWeight:700 }}>{x.nombre}</span>; })}</div>}
      </div>
      {otros.length > 0 && (
        <div style={{ ...card, borderColor:"#D4A01766" }}>
          <div style={h}>⚠️ Faltantes avisados</div>
          {otros.map(function(f) {
            return <div key={f.id} style={{ padding:"5px 0", borderTop:"1px solid #181818", fontSize:12.5 }}><b style={{ color:"#F0EDE8" }}>{f.plato}</b> <span style={{ color:"#D4A017" }}>· avisó {f.avisa === "cocina" ? "la cocina" : "el mozo"}{f.por ? " (" + f.por + ")" : ""}</span> <span style={{ color:"#555" }}>· {horaSeg(f.at).slice(0, 5)}</span>{f.nota && <div style={{ fontSize:11, color:"#888" }}>{f.nota}</div>}</div>;
          })}
        </div>
      )}
    </div>
  );
}

// ─── DISCONTINUAR PRODUCTOS ───────────────────────────────────────────
// La cocina o el cajero sacan de la carta un producto que no hay más (y lo vuelven a poner cuando vuelve). Un producto discontinuado deja de ofrecerse
// para pedir; las cuentas que ya lo tienen no se tocan. Cada discontinuación queda como aviso de faltante, con la hora y quién fue.
function VentanaDiscontinuar(props) {
  var localId = props.localId;
  var [carta, setCarta] = useState(null);
  var [ruta, setRuta] = useState([]);
  var [q, setQ] = useState("");
  var [colores, setColores] = useState({ cats: {}, platos: {} });
  useEffect(function() {
    var vivo = true;
    sbLoadCarta().then(function(c) { if (vivo) setCarta(c.filter(function(x) { return x.local === localId; })); });
    sbLeerColoresCarta(localId).then(function(c) { if (vivo) setColores(c); });
    return function() { vivo = false; };
  }, [localId]);
  if (!carta) return <Ventana titulo="🚫 Discontinuar" onCerrar={props.onCerrar}><div style={{ color:"#777", padding:"20px 0", textAlign:"center" }}>Cargando…</div></Ventana>;
  var cats = []; var minO = {};
  carta.forEach(function(x) { var o = x.orden === null || x.orden === undefined ? 9999 : x.orden; if (minO[x.categoria] === undefined || o < minO[x.categoria]) minO[x.categoria] = o; });
  cats = Object.keys(minO).sort(function(a, b) { return minO[a] - minO[b] || a.localeCompare(b); });
  var qq = q.trim().toLowerCase();
  var discontinuados = carta.filter(function(x) { return x.activo === false; });
  function alternar(x) {
    var sale = x.activo !== false;
    var nuevo = { ...x, activo: !sale };
    setCarta(function(prev) { return prev.map(function(y) { return y.id === x.id ? nuevo : y; }); });
    sbSaveCarta(nuevo).then(function(err) { if (err) { alert("No se pudo guardar el cambio:\n\n" + String(err).slice(0, 200)); } if (props.onCambio) props.onCambio(); });
    var ahoraISO = new Date().toISOString();
    sbGuardarFaltante({ id:"cfalt_" + Date.now(), prueba:false, local:localId, fecha:props.diaDeNegocio ? props.diaDeNegocio() : ahoraISO.slice(0, 10), plato:x.nombre, avisa:"cocina", por:props.usuario || "", nota: sale ? NOTA_DISC : NOTA_VUELTO, at:ahoraISO });
  }
  function lista(arr) {
    return <RejillaPlatos alto={360}>{arr.map(function(x, i) { return <VentanaPlato key={x.id} x={x} col={colorDePlato(x, i, colores)} onClick={function() { alternar(x); }} />; })}</RejillaPlatos>;
  }
  return (
    <Ventana titulo="🚫 Discontinuar productos" onCerrar={props.onCerrar}>
      <div style={{ fontSize:12, color:"#9A9A9A", marginBottom:8, lineHeight:1.5 }}>Tocá un producto para sacarlo de la carta (deja de ofrecerse para pedir). Tocalo de nuevo, atenuado, para volver a ponerlo.</div>
      {discontinuados.length > 0 && !qq && ruta.length === 0 && (
        <div style={{ background:"#2A0E0A", border:"1px solid #C1440E66", borderRadius:10, padding:"8px 10px", marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#E0714A", marginBottom:6 }}>🚫 Discontinuados ahora ({discontinuados.length}) · tocá para volver a ponerlos</div>
          {lista(discontinuados)}
        </div>
      )}
      <input value={q} onChange={function(e) { setQ(e.target.value); }} placeholder="Buscar…" style={{ ...INP, fontSize:12, marginBottom:10 }} />
      {qq ? lista(carta.filter(function(x) { return String(x.nombre).toLowerCase().indexOf(qq) !== -1; })) : (
        <ArbolCarta cats={cats} ruta={ruta} setRuta={setRuta} colores={colores}
          contar={function(nodo) { return carta.filter(function(x) { return dentroDe(x.categoria, nodo); }).length; }}
          renderPlatos={function(nodo) { return lista(carta.filter(function(x) { return x.categoria === nodo; })); }} />
      )}
    </Ventana>
  );
}

// ─── PANTALLA DE COCINA ───────────────────────────────────────────────
// Lo que llega a la cocina: cada vez que el mozo o el cajero toca «Marchar», el pedido aparece acá como un ticket (mesa, delivery o mostrador).
// La cocina toca «Entregado» cuando lo despacha y el ticket se va; siguen entrando los otros. Se arma con los ítems en estado «enviado».
// Un ticket es una tanda de una cuenta: si a la misma mesa le agregan algo después, sale como un ticket nuevo.
export function PanelCocina(props) {
  var usuario = props.usuario || "";
  var [localId, setLocalId] = useState(props.localFijo || props.localInicial || "l1");
  var [tickets, setTickets] = useState([]);
  var [entregadas, setEntregadas] = useState([]);
  var [pestana, setPestana] = useState("pend");      // pend | entregadas
  var [cargado, setCargado] = useState(false);
  var [ahora, setAhora] = useState(Date.now());
  var [sonido, setSonido] = useState(false);
  var [completa, setCompleta] = useState(!!props.fija);   // modo pantalla completa: solo el botón de volver y los tickets
  var [discontinuando, setDiscontinuando] = useState(false);
  // Los avisos de cambio que la cocina ya vio (se recuerdan en esta tablet).
  var [vistos, setVistos] = useState(function() { try { return JSON.parse(localStorage.getItem("nkt_cocina_vistos") || "[]"); } catch(e) { return []; } });
  var sonidoRef = useRef(false); sonidoRef.current = sonido;
  var vistosRef = useRef(vistos); vistosRef.current = vistos;
  var ctxRef = useRef(null);
  var conocidos = useRef(null);      // tickets que ya estaban en la lectura anterior
  var pasados = useRef({});
  var alertasRef = useRef(null);   // avisos de cambio ya conocidos: uno nuevo hace sonar la tablet          // tickets que ya avisaron que pasaron los 15 minutos
  var local = getLocal(localId);
  var [limite, setLimite] = useState(LIMITE_DEFECTO);   // minutos: pasado este tiempo el ticket avisa en rojo (lo elige administración)
  var limiteRef = useRef(LIMITE_DEFECTO);
  var LIMITE = limite;

  function pitar(freq, veces) {
    try {
      var c = ctxRef.current; if (!c) return;
      for (var k = 0; k < (veces || 2); k++) {
        (function(t) {
          var o = c.createOscillator(), g = c.createGain();
          o.frequency.value = freq || 880; o.connect(g); g.connect(c.destination);
          g.gain.setValueAtTime(0.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.22);
          o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.24);
        })(k * 0.28);
      }
    } catch(e) {}
  }
  // Un pedido «pasado» es el que lleva más del tiempo límite en la cocina o, si es delivery o mostrador, el que se pasó de la hora prometida al cliente.
  function pasadaK(g, lim) {
    if (!g.items.length || g.espera) return false;   // lo principal que espera la entrada todavía no cuenta
    var m = minutosDesde(g.desde);
    return (m !== null && m >= lim) || (g.comanda.tipo !== "mesa" && minutosVencida(g.entrega, Date.now()) !== null);
  }
  // El día de negocio de la cocina arranca a las 6 de la mañana: lo entregado desde ahí queda para revisar.
  function inicioDia() { var d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); d.setHours(6, 0, 0, 0); return d.toISOString(); }
  function cargar() {
    var desde = inicioDia();
    return Promise.all([sbLoadComandas(), sbLoadMesas(), sbLeerEntregas(), sbLeerExtrasRecientes(), sbLeerListosDesde(desde), sbLeerLogDesde(localId, desde), sbLeerConfigCom(), sbLeerPlano(localId)]).then(function(r) {
      var lim = limiteDe(r[6], localId); limiteRef.current = lim; setLimite(lim);
      var coms = r[0].filter(function(c) { return c.local === localId; });
      var mesas = r[1], entregasP = r[2], extras = r[3], listos = r[4], log = r[5];
      var recs = Object.keys(listos).map(function(k) { return listos[k]; }).filter(function(x) { return !x.local || x.local === localId; });
      var idsRec = {}; recs.forEach(function(x) { idsRec[x.comanda_id] = 1; });
      var faltan = {}; Object.keys(idsRec).forEach(function(id) { if (!coms.some(function(c) { return c.id === id; })) faltan[id] = 1; });
      var todosIds = coms.map(function(c) { return c.id; }).concat(Object.keys(faltan));
      return Promise.all([sbLoadItems(todosIds), sbComandasPorIds(Object.keys(faltan)), sbEnviosDesde(desde)]).then(async function(rr) {
        var itsTodos = rr[0], cerradas = rr[1], envios = rr[2];
        // Número de comanda por orden de llegada a la cocina en el día (las de la prueba compartida se numeran aparte).
        var conocidas = {}; coms.concat(cerradas).forEach(function(c) { conocidas[c.id] = c; });
        var desconocidas = Object.keys(envios).filter(function(id) { return !conocidas[id]; });
        if (desconocidas.length) (await sbComandasPorIds(desconocidas)).forEach(function(c) { conocidas[c.id] = c; });
        var ordenLlegada = {};
        [false, true].forEach(function(pr) {
          Object.keys(envios).filter(function(id) { return conocidas[id] && conocidas[id].local === localId && esComandaPrueba(id) === pr; })
            .sort(function(a, b) { return envios[a] < envios[b] ? -1 : envios[a] > envios[b] ? 1 : (a < b ? -1 : 1); })
            .forEach(function(id, k) { ordenLlegada[id] = k + 1; });
        });
        var its = itsTodos.filter(function(i) { return coms.some(function(c) { return c.id === i.comanda_id; }); });
        function titulo(c) {
          var mesa = mesas.find(function(m) { return m.id === c.mesa_id; });
          var sec = mesa ? sectorDeMesa(mesa, r[7]) : null;
          return c.tipo === "mesa" ? "Mesa " + (mesa ? mesa.nombre : "") + (sec ? " · " + sec.nombre : "") : (c.tipo === "delivery" ? "Delivery" : "Mostrador") + (c.cliente ? " · " + c.cliente : "");
        }
        // Pendientes: los ítems marchados y todavía no entregados, una tarjeta por tanda.
        // El contador de la mesa sigue desde el primer pedido de la cuenta, aunque lo primero ya se haya entregado.
        var primerEnvio = {};
        its.forEach(function(i) { if (i.enviado_at && i.estado !== "cancelado" && (!primerEnvio[i.comanda_id] || i.enviado_at < primerEnvio[i.comanda_id])) primerEnvio[i.comanda_id] = i.enviado_at; });
        var grupos = {};
        function grupo(i) {
          var k = i.comanda_id + "|" + (i.ronda || 0);
          return grupos[k] || (grupos[k] = { clave:k, comanda:coms.find(function(c) { return c.id === i.comanda_id; }), ronda:i.ronda || 0, items:[], quitados:[], desde:i.enviado_at, desdeMesa:primerEnvio[i.comanda_id] || i.enviado_at });
        }
        its.filter(function(i) { return i.estado === "enviado"; }).forEach(function(i) {
          var g = grupo(i); g.items.push(i);
          if (i.enviado_at && (!g.desde || i.enviado_at < g.desde)) g.desde = i.enviado_at;
        });
        // Lo que quitaron después de marchar: se avisa en rojo (también si la tanda entera se anuló).
        its.filter(function(i) { return i.estado === "cancelado" && i.enviado_at; }).forEach(function(i) {
          if (vistosRef.current.indexOf("q|" + i.id) >= 0) return;
          var g = grupo(i); g.quitados.push(i); if (!g.desde || i.enviado_at < g.desde) g.desde = i.enviado_at;
        });
        var lista = Object.keys(grupos).map(function(k) {
          var g = grupos[k], c = g.comanda || {};
          g.titulo = titulo(c);
          g.orden = ordenLlegada[c.id] || null;
          // Entrada o principal: la entrada cuenta desde que se mandó; lo principal, desde que la cocina entregó la entrada (hasta entonces espera).
          var inf = infoCurso(its.filter(function(x) { return x.comanda_id === c.id; }), g.ronda, listos, (extras[c.id] || {}).salidas);
          g.curso = inf.curso; g.espera = inf.espera;
          if (inf.inicio) g.desde = inf.inicio;
          g.entrega = entregasP[c.id] || null;
          var ex = extras[c.id] || {};
          g.nueva = c.tipo === "mesa" && ex.mesa_nueva === true;
          g.misma = c.tipo === "mesa" && ex.mesa_nueva === false;
          g.personas = c.tipo === "mesa" ? (ex.personas || null) : null;
          g.salida = (ex.salidas || {})[g.ronda] || null;   // lo que eligió el mozo o el cajero al agregar: «junto» u «orden»
          // Cambios de cantidad o de nota en lo que ya se mandó, desde que se mandó.
          g.cambios = log.filter(function(l) {
            return l.comanda_id === c.id && l.at > String(g.desde) && (l.accion === "Cambió la cantidad" || l.accion === "Anotó una nota")
              && g.items.some(function(i) { return String(l.detalle).indexOf(i.nombre) === 0; });
          });
          return g;
        }).filter(function(g) { return g.comanda && (g.items.length || g.quitados.length); }).sort(function(a, b) {
          if (a.nueva !== b.nueva) return a.nueva ? -1 : 1;
          return String(a.desde).localeCompare(String(b.desde));
        });
        // Sonidos: ticket nuevo, y ticket que recién pasó los 15 minutos. La primera lectura no suena.
        if (conocidos.current && sonidoRef.current) {
          if (lista.some(function(g) { return !conocidos.current[g.clave]; })) pitar(880, 2);
          else if (lista.some(function(g) { return pasadaK(g, limiteRef.current) && !pasados.current[g.clave]; })) pitar(520, 3);
        }
        var cv = {}; lista.forEach(function(g) { cv[g.clave] = 1; }); conocidos.current = cv;
        // Una sola ventana por cuenta: lo que se agrega después a una mesa que ya pidió entra en el mismo ticket, como «agregado».
        var porCom = {};
        lista.forEach(function(g) {
          var t = porCom[g.comanda.id] || (porCom[g.comanda.id] = { clave:g.comanda.id, comanda:g.comanda, titulo:g.titulo, orden:g.orden, entrega:g.entrega, nueva:g.nueva, misma:g.misma, personas:g.personas, tandas:[], items:[], quitados:[], cambios:[], desde:null });
          t.tandas.push(g); if (g.salida && g.items.length) t.salida = g.salida;
          t.items = t.items.concat(g.items); t.quitados = t.quitados.concat(g.quitados); t.cambios = t.cambios.concat(g.cambios);
          // El contador del ticket es el de lo más viejo que sigue pendiente; cada parte agregada tiene el suyo, y se guarda aparte desde cuándo está la mesa.
          if (g.items.length && !g.espera && g.desde && (!t.desde || g.desde < t.desde)) t.desde = g.desde;
          if (!t.desde && g.desde) t.desde = g.desde;
          if (g.desdeMesa && (!t.desdeMesa || g.desdeMesa < t.desdeMesa)) t.desdeMesa = g.desdeMesa;
        });
        var unidas = Object.keys(porCom).map(function(k) { var t = porCom[k]; t.tandas.sort(function(a, b) { return a.ronda - b.ronda; }); return t; });
        unidas.sort(function(a, b) {
          if (a.nueva !== b.nueva) return a.nueva ? -1 : 1;
          return String(a.desde).localeCompare(String(b.desde));
        });
        var tandasLista = lista; lista = unidas;
        var clavesAv = {}; unidas.forEach(function(t) { t.quitados.forEach(function(i) { clavesAv["q|" + i.id] = 1; }); t.cambios.forEach(function(l) { clavesAv[claveCambio(l)] = 1; }); });
        if (alertasRef.current && sonidoRef.current && Object.keys(clavesAv).some(function(k) { return !alertasRef.current[k]; })) pitar(300, 3);
        alertasRef.current = clavesAv;
        var np = {}; tandasLista.forEach(function(g) { if (pasadaK(g, limiteRef.current)) np[g.clave] = 1; }); pasados.current = np;
        // Lo que la cocina ya le entregó al mozo o al cajero, por comanda: cada comanda es una sola ventana con todas sus partes, que salieron en distintos tiempos.
        var comPorId = {}; coms.concat(cerradas).forEach(function(c) { comPorId[c.id] = c; });
        function tandasHechas(c) {
          var rs = {};
          itsTodos.filter(function(i) { return i.comanda_id === c.id && !esBarra(i) && (i.estado === "listo" || i.estado === "entregado"); }).forEach(function(i) { (rs[i.ronda || 0] = rs[i.ronda || 0] || []).push(i); });
          var todosC = itsTodos.filter(function(x) { return x.comanda_id === c.id; });
          return Object.keys(rs).map(function(r) {
            var items = rs[r], rn = Number(r), rec = listos[c.id + "|" + rn];
            var desde = items.reduce(function(a, i) { return i.enviado_at && (!a || i.enviado_at < a) ? i.enviado_at : a; }, null);
            var enMesa = items.every(function(i) { return i.estado === "entregado"; });
            var enMesaAt = enMesa ? items.reduce(function(a, i) { return i.entregado_at && i.entregado_at > a ? i.entregado_at : a; }, "") : null;
            var inf = infoCurso(todosC, rn, listos, (extras[c.id] || {}).salidas);
            return { clave:c.id + "|" + rn, comanda:c, ronda:rn, items:items, desde:(inf.inicio && inf.inicio > String(desde || "")) ? inf.inicio : desde, listo:rec ? rec.listo_at : null, enMesa:enMesa, enMesaAt:enMesaAt, titulo:titulo(c), curso:inf.curso };
          }).sort(function(a, b) { return a.ronda - b.ronda; });
        }
        // Las comandas que todavía tienen algo pendiente muestran lo ya entregado adentro de su misma ventana.
        var pendientesIds = {}; lista.forEach(function(t) { pendientesIds[t.comanda.id] = 1; t.hechas = tandasHechas(t.comanda); });
        setTickets(lista);
        var porComE = {};
        recs.forEach(function(rec) {
          var c = comPorId[rec.comanda_id]; if (!c || c.local !== localId || pendientesIds[c.id] || porComE[c.id]) return;
          var tandas = tandasHechas(c).filter(function(t) { return t.listo; });
          if (!tandas.length) return;
          porComE[c.id] = { clave:c.id, comanda:c, orden:ordenLlegada[c.id] || null, titulo:titulo(c), tandas:tandas, listo:tandas.reduce(function(a, t) { return t.listo > a ? t.listo : a; }, "") };
        });
        setEntregadas(Object.keys(porComE).map(function(k) { return porComE[k]; }).sort(function(a, b) { return String(b.listo).localeCompare(String(a.listo)); }).slice(0, 80));
        setCargado(true);
      });
    }).catch(function() { setCargado(true); });
  }
  useEffect(function() {
    conocidos.current = null; pasados.current = {}; alertasRef.current = null; setCargado(false);
    var vivo = true;
    cargar();
    var t = setInterval(function() { if (vivo) cargar(); }, 5000);
    var reloj = setInterval(function() { if (vivo) setAhora(Date.now()); }, 15000);
    return function() { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, [localId]);
  // Avisa al resto de la app cuándo la cocina está libre (sin pedidos pendientes): es el momento seguro para actualizarse sola a una versión nueva.
  useEffect(function() {
    // En el aparato fijo de la cocina se actualiza apenas hay una versión nueva, aunque haya pedidos: los pedidos están guardados y vuelven a cargarse solos.
    window.__NKT_LIBRE = cargado && (tickets.length === 0 || !!props.fija) && !discontinuando;
    return function() { window.__NKT_LIBRE = false; };
  }, [cargado, tickets.length, discontinuando, !!props.fija]);
  // La pantalla no se apaga mientras se está mirando (si el navegador lo permite).
  useEffect(function() {
    var lock = null;
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function(l) { lock = l; }).catch(function() {}); } catch(e) {}
    return function() { try { if (lock) lock.release(); } catch(e) {} };
  }, []);

  // Aparato fijo de la cocina: que la pantalla no se apague sola.
  useEffect(function() {
    if (!props.fija) return;
    var lock = null, vivo = true;
    function pedir() { try { if (navigator.wakeLock && document.visibilityState === "visible") navigator.wakeLock.request("screen").then(function(l) { if (vivo) lock = l; else l.release(); }).catch(function() {}); } catch(e) {} }
    pedir(); document.addEventListener("visibilitychange", pedir);
    return function() { vivo = false; document.removeEventListener("visibilitychange", pedir); try { if (lock) lock.release(); } catch(e) {} };
  }, [!!props.fija]);
  function activarSonido() {
    try { if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)(); ctxRef.current.resume && ctxRef.current.resume(); } catch(e) {}
    var nuevo = !sonido; setSonido(nuevo); if (nuevo) pitar(880, 2);
  }
  function entrarCompleta() {
    setCompleta(true);
    try { if (!document.fullscreenElement) { var r = document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(function() {}); } } catch(e) {}
  }
  function salirCompleta() {
    setCompleta(false);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e) {}
  }
  // Si salen de la pantalla completa del navegador (tecla Esc, gesto de la tablet), también se sale de este modo.
  useEffect(function() {
    function cambio() { if (!document.fullscreenElement) setCompleta(false); }
    document.addEventListener("fullscreenchange", cambio);
    return function() { document.removeEventListener("fullscreenchange", cambio); };
  }, []);
  function marcarVisto(clave) {
    var nuevo = vistosRef.current.concat(clave).slice(-500);
    vistosRef.current = nuevo; setVistos(nuevo); try { localStorage.setItem("nkt_cocina_vistos", JSON.stringify(nuevo)); } catch(e) {}
    cargar();
  }
  // La cocina termina y se lo entrega al mozo (mesa) o al cajero (delivery y mostrador). Llegar a la mesa lo marca después quien lo lleva.
  function entregar(g) {
    var ahoraISO = new Date().toISOString();
    var filas = g.items.map(function(i) { return { ...i, estado:"listo" }; });
    setTickets(function(prev) { return prev.filter(function(x) { return x.clave !== g.clave; }); });
    if (conocidos.current) delete conocidos.current[g.clave];
    var quien = g.comanda.tipo === "mesa" ? "al mozo" : "al cajero";
    Promise.all([sbSaveItems(filas), sbGuardarListo({ comanda_id:g.comanda.id, ronda:g.ronda, local:localId, listo_at:ahoraISO, por:usuario })]).then(function(r) {
      if (r[0]) { alert("No se pudo marcar como entregado:\n\n" + String(r[0]).slice(0, 200)); }
      cargar();
    });
    var fecha = props.diaDeNegocio ? props.diaDeNegocio() : ahoraISO.slice(0, 10);
    sbLogAcciones([{ local:localId, fecha:fecha, comanda_id:g.comanda.id, titulo:g.titulo, accion:"Cocina entregó " + quien, detalle:g.items.map(function(i) { return (Number(i.cant) || 1) + "x " + i.nombre; }).join(", "), por:usuario, at:ahoraISO }]);
  }
  // Por si se marcó por error: la tanda vuelve a pendientes.
  function deshacer(g) {
    if (!window.confirm("¿Volver a poner «" + g.titulo + "» en pendientes?")) return;
    var filas = g.items.map(function(i) { return { ...i, estado:"enviado", entregado_at:null }; });
    sbSaveItems(filas).then(function() { cargar(); });
    // Si estaba entregado a la mesa, se avisa en el registro.
    var ahoraISO = new Date().toISOString();
    sbLogAcciones([{ local:localId, fecha:props.diaDeNegocio ? props.diaDeNegocio() : ahoraISO.slice(0, 10), comanda_id:g.comanda.id, titulo:g.titulo, accion:"Volvió a la cocina", detalle:"Desde la pantalla de cocina: " + g.items.map(function(i) { return (Number(i.cant) || 1) + "x " + i.nombre; }).join(", "), por:usuario, at:ahoraISO }]);
  }

  var lista15 = tickets.filter(function(g) { return pasadaK(g, LIMITE); });
  var demorados = lista15.length;
  // Mientras haya pedidos pasados de 15 minutos: el título de la pestaña avisa, y con el sonido activado se repite cada minuto (y vibra, si la tablet puede).
  useEffect(function() {
    try { document.title = demorados > 0 ? "🔥 ¡APURAR! " + demorados + " · Cocina" : "GrupoNkt"; } catch(e) {}
  }, [demorados]);
  useEffect(function() {
    if (!demorados) return;
    var t = setInterval(function() {
      if (sonidoRef.current) pitar(520, 3);
      try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch(e) {}
    }, 60000);
    return function() { clearInterval(t); };
  }, [demorados > 0]);
  function claveCambio(l) { return "l|" + l.comanda_id + "|" + l.at; }
  var pestanaBtn = function(id, txt) {
    var act = pestana === id;
    return <button onClick={function() { setPestana(id); }} style={{ padding:"10px 16px", borderRadius:10, border:"2px solid " + (act ? "#3A7D44" : "#2A2A2A"), background: act ? "#3A7D4426" : "#111", color: act ? "#8FD19A" : "#9A9A9A", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer" }}>{txt}</button>;
  };
  var badgePrueba = function(c) { return esComandaPrueba(c.id) ? <span style={{ display:"inline-block", marginLeft:6, background:"#B07CD833", color:"#B07CD8", border:"1px solid #B07CD8", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:900 }}>🧪 PRUEBA</span> : null; };

  // Una parte ya entregada por la cocina, dentro de la ventana de su comanda: su nombre, cuándo salió, cuánto tardó y si ya llegó a la mesa.
  function renderHecha(h) {
    var quien = h.comanda.tipo === "mesa" ? "mozo" : "cajero";
    var tardo = h.desde && h.listo ? Math.round((new Date(h.listo) - new Date(h.desde)) / 60000) : null;
    var aMesa = h.enMesa && h.enMesaAt && h.listo ? Math.round((new Date(h.enMesaAt) - new Date(h.listo)) / 60000) : null;
    var nv = tardo !== null ? nivelRetraso(tardo, LIMITE) : null;
    var nombre = h.curso === "entrada" ? "🥗 ENTRADA" : h.curso === "principal" ? "🍽️ PRINCIPAL" : h.ronda > 1 ? "➕ AGREGADO" : "PEDIDO ORIGINAL";
    return (
      <div key={h.clave} style={{ marginBottom:10, padding:"6px 8px 8px", borderRadius:9, background:"#0A140C", border:"1px solid #1E3A24" }}>
        <div style={{ fontSize:12, fontWeight:900, letterSpacing:0.5, color:"#4C9A5A" }}>✅ {nombre} · al {quien} {h.listo ? horaSeg(h.listo).slice(0, 5) : ""}{tardo !== null && <span style={{ color: nv ? nv.col : "#8FD19A" }}> · la cocina tardó {tardo} min{nv ? " (+" + nv.extra + " · " + nv.txt.toLowerCase() + ")" : ""}</span>}</div>
        {h.items.map(function(i) { return <div key={i.id} style={{ fontSize:15, color:"#8A8A8A", padding:"1px 0", textDecoration:"line-through" }}><span style={{ fontWeight:800 }}>{Number(i.cant) || 1}×</span> {i.nombre}{notaVisible(i) ? <span style={{ color:"#A8893A" }}> · 📝 {notaVisible(i)}</span> : null}</div>; })}
        <button onClick={function() { deshacer(h); }} style={{ ...GH, padding:"4px 10px", fontSize:11, marginTop:4 }}>↩ Volver a pendientes</button>
      </div>
    );
  }
  // Todas las partes de una comanda, en el orden en que se mandaron: lo ya entregado y lo que sigue pendiente.
  function seccionesDe(g) {
    // «Todo junto»: lo agregado que el mozo/cajero pidió que salga junto se une en un solo bloque con lo pendiente anterior, con un solo contador (el del más viejo).
    var pend = [];
    g.tandas.filter(function(t) { return t.items.length > 0; }).forEach(function(t) {
      var ant = pend.length ? pend[pend.length - 1] : null;
      if (ant && t.salida === "junto" && !t.curso && !ant.t.curso && !t.espera && !ant.t.espera) {
        var partes = ant.t.partes || [ant.t];
        var m = { ...ant.t, items:ant.t.items.concat(t.items), partes:partes.concat([t]), juntoCon:true, salida:ant.t.salida || "junto", desde: (t.desde && ant.t.desde && t.desde < ant.t.desde) ? t.desde : ant.t.desde };
        pend[pend.length - 1] = { ronda:ant.ronda, t:m };
      } else pend.push({ ronda:t.ronda || 0, t:t });
    });
    return pend
      .concat((g.hechas || []).map(function(h) { return { ronda:h.ronda, h:h }; })).sort(function(a, b) { return a.ronda - b.ronda; });
  }

  var cuerpo = (
    <div>
      <style>{"@keyframes nktPulso{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
      {lista15.length > 0 && (
        <div>
          <div style={{ position:"fixed", inset:0, border:"10px solid #E0452E", pointerEvents:"none", zIndex:700, animation:"nktPulso 1s infinite" }} />
          <div style={{ background:"#E0452E", color:"#fff", borderRadius:14, padding:"16px 18px", marginBottom:14, animation:"nktPulso 1s infinite" }}>
            <div style={{ fontSize:34, fontWeight:900, letterSpacing:1, lineHeight:1.1 }}>🔥 ¡APURAR!</div>
            <div style={{ fontSize:22, fontWeight:900, marginTop:6, lineHeight:1.25 }}>{lista15.map(function(g) { var m = minutosDesde(g.desde), nv = nivelRetraso(m, LIMITE), venc = g.comanda.tipo !== "mesa" ? minutosVencida(g.entrega, ahora) : null; return (g.orden ? "Comanda " + g.orden + " · " : "") + g.titulo + " · " + m + " min" + (nv ? " (+" + nv.extra + " · " + nv.txt.toLowerCase() + ")" : "") + (venc !== null ? " · pasó la hora prometida +" + venc + " min" : ""); }).join("   |   ")}</div>
            <div style={{ fontSize:13, fontWeight:700, marginTop:5, opacity:0.95 }}>{lista15.length === 1 ? "Este pedido lleva" : "Estos pedidos llevan"} más de {LIMITE} minutos.</div>
            {!sonido && <div style={{ fontSize:12, marginTop:5, opacity:0.95 }}>🔕 El sonido está apagado: tocá «Activar sonido» para que también suene.</div>}
          </div>
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        {pestanaBtn("pend", "🍳 Pendientes (" + tickets.length + ")")}
        {pestanaBtn("entregadas", "✅ Entregadas hoy (" + entregadas.length + ")")}
        {pestanaBtn("informe", "📊 Informe")}
        {demorados > 0 && <span style={{ alignSelf:"center", background:"#E0452E", color:"#fff", borderRadius:8, padding:"6px 12px", fontSize:13, fontWeight:900, animation:"nktPulso 1.2s infinite" }}>🔥 {demorados} para apurar</span>}
      </div>
      {!cargado ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#555" }}>Cargando…</div>
      ) : pestana === "informe" ? (
        <InformeCocina localId={localId} diaDeNegocio={props.diaDeNegocio} />
      ) : pestana === "entregadas" ? (
        entregadas.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"#666", fontSize:14 }}>Todavía no se entregó nada hoy.</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))", gap:12 }}>
            {entregadas.map(function(g) {
              var c = g.comanda, T = CMD_TIPO[c.tipo] || CMD_TIPO.mostrador;
              return (
                <div key={g.clave} style={{ background:"#0F0F0F", border:"1px solid #2A2A2A", borderLeft:"8px solid " + T.color, borderRadius:14, padding:"12px 14px", display:"flex", flexDirection:"column", gap:6 }}>
                  <div>
                    <span style={{ display:"inline-block", background:T.color + "26", color:T.color, border:"1px solid " + T.color + "66", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:800 }}>{T.emoji} {T.nombre.toUpperCase()}</span>{badgePrueba(c)}
                    <div style={{ fontSize:17, fontWeight:900, color:T.color, marginTop:3 }}>COMANDA {g.orden || "—"}</div>
                    <div style={{ fontSize:19, fontWeight:800, color:"#F0EDE8", marginTop:1 }}>{g.titulo}</div>
                    <div style={{ marginTop:5 }}><span style={{ display:"inline-block", background:"#D4A01722", border:"1px solid #D4A017", color:"#FFD36B", borderRadius:8, padding:"3px 10px", fontSize:17, fontWeight:900, letterSpacing:0.3 }}>{c.tipo === "mesa" ? "🧑‍🍳 Mozo" : "🧾 Cajero"}: {c.mozo || "—"}</span></div>
                  </div>
                  <div style={{ borderTop:"1px solid #1E1E1E", paddingTop:8 }}>
                    {g.tandas.map(function(h) { return renderHecha(h); })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tickets.length === 0 ? (
        <div style={{ textAlign:"center", padding:"70px 0" }}>
          <div style={{ fontSize:54, marginBottom:10 }}>✅</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:"#4C9A5A" }}>Todo entregado</div>
          <div style={{ fontSize:13, color:"#666", marginTop:6 }}>Cuando el mozo o el cajero mande un pedido a la cocina, aparece acá. Lo ya entregado está en «Entregadas hoy».</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))", gap:12 }}>
          {tickets.map(function(g) {
            var c = g.comanda, T = CMD_TIPO[c.tipo] || CMD_TIPO.mostrador;
            var min = minutosDesde(g.desde), col = min === null ? "#3A7D44" : (min >= LIMITE ? "#E0452E" : min >= Math.round(LIMITE * 2 / 3) ? "#D4A017" : "#3A7D44");
            var st = c.tipo !== "mesa" ? estadoEntrega(g.entrega, ahora) : null;
            var cambios = (g.cambios || []).filter(function(l) { return vistos.indexOf(claveCambio(l)) < 0; });
            var hayAlerta = cambios.length > 0 || g.quitados.length > 0;
            var venc = c.tipo !== "mesa" ? minutosVencida(g.entrega, ahora) : null;   // minutos pasados de la hora prometida (delivery y mostrador)
            var tarde = pasadaK(g, LIMITE);
            return (
              <div key={g.clave} style={{ background:"#111", border:"3px solid " + (hayAlerta ? "#E0452E" : col), borderLeft:"10px solid " + T.color, borderRadius:14, padding:"13px 14px", display:"flex", flexDirection:"column", gap:9, boxShadow: hayAlerta || tarde ? "0 0 0 2px #E0452E55" : "none" }}>
                {hayAlerta && (
                  <div style={{ background:"#E0452E", color:"#fff", borderRadius:9, padding:"9px 11px", animation:"nktPulso 1.1s infinite" }}>
                    <div style={{ fontSize:15, fontWeight:900, letterSpacing:0.5 }}>⚠️ CAMBIO EN ESTE PEDIDO</div>
                    {g.quitados.map(function(i) {
                      var cm = /^cambio por (.+)$/.exec(i.nota || "");
                      return <div key={i.id} style={{ fontSize:15, fontWeight:800, marginTop:3 }}>{cm ? "🔄 CAMBIARON: " + (Number(i.cant) || 1) + "× " + i.nombre + " → " + cm[1] : "QUITARON: " + (Number(i.cant) || 1) + "× " + i.nombre + (i.nota ? " — " + i.nota : "")}</div>;
                    })}
                    {cambios.map(function(l) { return <div key={claveCambio(l)} style={{ fontSize:14, fontWeight:700, marginTop:3 }}>{l.accion.toUpperCase()}: {l.detalle}</div>; })}
                    <button onClick={function() { g.quitados.forEach(function(i) { marcarVisto("q|" + i.id); }); cambios.forEach(function(l) { marcarVisto(claveCambio(l)); }); }}
                      style={{ marginTop:8, width:"100%", padding:"9px", borderRadius:8, border:"2px solid #fff", background:"transparent", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:900, cursor:"pointer" }}>✓ VISTO</button>
                  </div>
                )}
                {tarde && (function() {
                  var a = min !== null ? nivelRetraso(min, LIMITE) : null, b = venc !== null ? nivelRetraso(venc, 0) : null;
                  var nv = a && b ? (b.extra > a.extra ? b : a) : (a || b);
                  return <div style={{ background: nv ? nv.col : "#E0452E", color:"#fff", borderRadius:9, padding:"8px 12px", animation:"nktPulso 1s infinite" }}>
                    <div style={{ fontSize:24, fontWeight:900, letterSpacing:0.5 }}>🔥 ¡APURAR! · {min} min</div>
                    {venc !== null && <div style={{ fontSize:15, fontWeight:900, marginTop:2 }}>⏰ Se pasó la hora prometida ({horaSeg(g.entrega.prometida_at).slice(0, 5)}) · +{venc} min</div>}
                    {nv && <div style={{ fontSize:14, fontWeight:900, marginTop:2 }}>+{nv.extra} min de retraso · {nv.txt}</div>}
                  </div>;
                })()}
                {g.salida && c.tipo === "mesa" && (
                  <div style={{ background: g.salida === "junto" ? "#E0652E" : "#3A9BC1", color:"#fff", borderRadius:10, padding:"10px 12px", border:"2px solid #fff" }}>
                    <div style={{ fontSize:20, fontWeight:900, letterSpacing:0.5 }}>{g.salida === "junto" ? "🔥 SALE TODO JUNTO" : "📋 SALE POR ORDEN DE COMANDA"}</div>
                    <div style={{ fontSize:13, fontWeight:700, marginTop:2 }}>{g.salida === "junto" ? "Lo agregado va junto con lo que ya está en la cocina." : "Lo agregado sale después de lo anterior."} <span style={{ opacity:0.85 }}>(lo eligió {c.tipo === "mesa" ? "el mozo" : "el cajero"})</span></div>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                  <div style={{ minWidth:0 }}>
                    <span style={{ display:"inline-block", background:T.color + "26", color:T.color, border:"1px solid " + T.color + "66", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:800, letterSpacing:0.8 }}>{T.emoji} {T.nombre.toUpperCase()}</span>
                    {badgePrueba(c)}
                    {g.nueva && <span style={{ display:"inline-block", marginLeft:6, background:"#3A7D44", color:"#fff", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:900, letterSpacing:0.8 }}>🆕 MESA NUEVA</span>}
                    {g.misma && <span style={{ display:"inline-block", marginLeft:6, background:"#D4A01733", color:"#D4A017", border:"1px solid #D4A017", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:800, letterSpacing:0.8 }}>↩ SIGUE LA MISMA</span>}
                    {g.personas && <span style={{ display:"inline-block", marginLeft:6, background:"#8B2FC9", color:"#fff", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:900, letterSpacing:0.8 }}>👥 {g.personas}</span>}
                    <div style={{ fontSize:26, fontWeight:900, color:T.color, marginTop:4, letterSpacing:0.5 }}>COMANDA {g.orden || "—"}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:"#F0EDE8", marginTop:1, wordBreak:"break-word" }}>{g.titulo}</div>
                    <div style={{ marginTop:5 }}><span style={{ display:"inline-block", background:"#D4A01722", border:"1px solid #D4A017", color:"#FFD36B", borderRadius:8, padding:"3px 10px", fontSize:17, fontWeight:900, letterSpacing:0.3 }}>{c.tipo === "mesa" ? "🧑‍🍳 Mozo" : "🧾 Cajero"}: {c.mozo || "—"}</span>{g.ronda > 1 && <span style={{ fontSize:11, color:"#777", marginLeft:6 }}>tanda {g.ronda}</span>}</div>
                  </div>
                  <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                    {(function() {
                      // Arriba, el contador ORIGINAL de la mesa (desde el primer pedido, no se reinicia); si hay algo agregado, abajo va el de lo agregado, que es el que avisa según el tiempo elegido.
                      var minMesa = minutosDesde(g.desdeMesa || g.desde);
                      var conAgregado = minMesa !== null && min !== null && minMesa - min >= 1;
                      return (
                        <div>
                          <div style={{ fontSize:26, fontWeight:900, color: conAgregado ? "#F0EDE8" : col }}>{(conAgregado ? minMesa : min) === null ? "—" : (conAgregado ? minMesa : min) + " min"}</div>
                          <div style={{ fontSize:10, color:"#666" }}>{conAgregado ? "la mesa · desde " + horaSeg(g.desdeMesa).slice(0, 5) : "desde " + horaSeg(g.desde).slice(0, 5)}</div>
                          {conAgregado && <div style={{ marginTop:4, fontSize:19, fontWeight:900, color:col }}>➕ {min} min<div style={{ fontSize:10, fontWeight:600, color:"#777" }}>lo agregado · desde {horaSeg(g.desde).slice(0, 5)}</div></div>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {st && <div style={{ fontSize:13, fontWeight:800, color:st.col, background:st.col + "1F", border:"1px solid " + st.col + "66", borderRadius:8, padding:"4px 9px" }}>{st.txt}</div>}
                <div style={{ borderTop:"1px solid #222", paddingTop:7 }}>
                  {seccionesDe(g).map(function(sec, ti, arr) {
                    if (sec.h) return renderHecha(sec.h);
                    var t = sec.t;
                    // «Agregado»: una tanda posterior a la primera, aunque lo de antes ya se haya entregado.
                    var multiple = arr.length > 1, agregado = ((multiple && ti > 0) || (t.ronda || 0) > 1) && !t.curso;
                    var mt = t.espera ? null : minutosDesde(t.desde);
                    return (
                      <div key={t.clave} style={{ marginBottom: multiple ? 10 : 0, padding: (agregado || t.curso) ? "6px 8px 8px" : 0, borderRadius:9, background: t.curso === "entrada" ? "#4C9A5A14" : t.curso === "principal" ? "#3A9BC114" : agregado ? "#D4A01712" : "transparent", border: t.curso === "entrada" ? "1px solid #4C9A5A66" : t.curso === "principal" ? "1px solid #3A9BC166" : agregado ? "1px solid #D4A01766" : "none" }}>
                        {(multiple || agregado || t.curso || t.juntoCon) && <div style={{ fontSize:12, fontWeight:900, letterSpacing:0.8, color: t.curso === "entrada" ? "#8FD19A" : t.curso === "principal" ? "#7CC4E4" : agregado ? "#D4A017" : "#8C8C8C", marginBottom:3 }}>{t.curso === "entrada" ? "🥗 ENTRADA " : t.curso === "principal" ? "🍽️ PRINCIPAL " : agregado ? "➕ AGREGADO " : "PEDIDO ORIGINAL "}{t.espera ? "" : horaSeg(t.desde).slice(0, 5)}{t.espera && <span style={{ marginLeft:8, fontSize:13, fontWeight:900, color:"#D4A017" }}>⏳ {t.curso === "principal" ? "espera que salga la entrada" : "espera que salga lo anterior"}</span>}{t.salida && c.tipo === "mesa" && <span style={{ marginLeft:8, background: t.salida === "junto" ? "#E0652E" : "#3A9BC1", color:"#fff", borderRadius:6, padding:"1px 7px", fontSize:11, fontWeight:900 }}>{t.salida === "junto" ? "🔥 TODO JUNTO" : "📋 POR ORDEN"}</span>}{mt !== null && <span style={{ marginLeft:8, fontSize:15, fontWeight:900, color: colorDemora(mt, LIMITE) }}>⏱ {mt} min</span>}</div>}
                        {t.items.map(function(i) {
                          return (
                            <div key={i.id} style={{ padding:"4px 0" }}>
                              <div style={{ fontSize:19, fontWeight:800, color:"#F0EDE8" }}><span style={{ color: agregado ? "#D4A017" : col }}>{Number(i.cant) || 1}×</span> {i.nombre}</div>
                              {notaVisible(i) && <div style={{ fontSize:14, color:"#D4A017", fontWeight:700 }}>📝 {notaVisible(i)}</div>}
                            </div>
                          );
                        })}
                        <button onClick={function() { (t.partes || [t]).forEach(entregar); }} style={{ marginTop:6, width:"100%", padding: multiple ? "11px" : "15px", borderRadius:11, border:"none", background:"#3A7D44", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize: multiple ? 15 : 17, fontWeight:900, cursor:"pointer", letterSpacing:0.5 }}>{(c.tipo === "mesa" ? "✓ ENTREGADO AL MOZO" : "✓ ENTREGADO AL CAJERO") + (t.curso === "entrada" ? " · la entrada" : t.curso === "principal" ? " · lo principal" : multiple ? (agregado ? " · lo agregado" : " · el pedido") : "")}</button>
                      </div>
                    );
                  })}
                  {g.quitados.map(function(i) {
                    return <div key={i.id} style={{ padding:"4px 0", fontSize:16, fontWeight:700, color:"#E0452E", textDecoration:"line-through" }}>{Number(i.cant) || 1}× {i.nombre}</div>;
                  })}
                  {g.items.length === 0 && <div style={{ fontSize:14, fontWeight:900, color:"#E0452E" }}>PEDIDO ANULADO: no hay nada para preparar.</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (completa || props.fija) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:500, background:"#0D0D0D", overflowY:"auto", padding:"12px 14px 20px", fontFamily:"'Inter',sans-serif" }}>
        {/* Aparato fijo de la cocina: no hay «Volver» ni nada de la app; solo un candado discreto para salir con contraseña. */}
        {props.fija
          ? (props.alSalir && <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:6, marginBottom:4 }}><button onClick={function() { setDiscontinuando(true); }} style={{ ...GH, padding:"6px 11px", fontSize:12, borderColor:"#C1440E88", color:"#E0714A" }}>🚫 Discontinuar</button><button onClick={activarSonido} title="Sonido de avisos" style={{ background:"transparent", border:"none", color: sonido ? "#8FD19A" : "#777", fontSize:14, cursor:"pointer", padding:"2px 6px" }}>{sonido ? "🔔" : "🔕 activar sonido"}</button><button onClick={props.alSalir} title="Salir de la pantalla fija" style={{ background:"transparent", border:"none", color:"#444", fontSize:14, cursor:"pointer", padding:"2px 6px" }}>🔒</button></div>)
          : <div style={{ marginBottom:12 }}><button onClick={salirCompleta} style={estiloVolver(local ? local.color : "#C1440E")}>← Volver</button></div>}
        {cuerpo}
        {discontinuando && <VentanaDiscontinuar localId={localId} usuario={usuario} diaDeNegocio={props.diaDeNegocio} onCerrar={function() { setDiscontinuando(false); }} />}
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'Inter',sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        {props.onVolver && <button onClick={props.onVolver} style={estiloVolver(local ? local.color : "#C1440E")}>← Volver</button>}
        <div style={{ flex:1, minWidth:180 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:800, color:"#F0EDE8" }}>👨‍🍳 Cocina {local ? "· " + local.nombre : ""}</div>
          <div style={{ fontSize:12, color:"#8C8C8C" }}>{tickets.length === 0 ? "Sin pedidos pendientes" : tickets.length + " pedido" + (tickets.length === 1 ? "" : "s") + " para entregar"} · se actualiza solo</div>
        </div>
        {!props.localFijo && (
          <select value={localId} onChange={function(e) { setLocalId(e.target.value); }} style={{ ...INP, width:"auto", padding:"9px 10px", fontSize:13 }}>
            {LOCALES.filter(function(l) { return l.id !== "l4"; }).map(function(l) { return <option key={l.id} value={l.id}>{l.nombre}</option>; })}
          </select>
        )}
        <button onClick={activarSonido} style={{ ...GH, padding:"9px 13px", fontSize:12, borderColor: sonido ? "#4C9A5A" : "#2A2A2A", color: sonido ? "#4C9A5A" : "#9A9A9A" }}>{sonido ? "🔔 Sonido activado" : "🔕 Activar sonido"}</button>
        <button onClick={function() { setDiscontinuando(true); }} style={{ ...GH, padding:"9px 13px", fontSize:12, borderColor:"#C1440E88", color:"#E0714A" }}>🚫 Discontinuar</button>
        <button onClick={entrarCompleta} style={{ ...GH, padding:"9px 13px", fontSize:12 }}>⛶ Pantalla completa</button>
      </div>
      {discontinuando && <VentanaDiscontinuar localId={localId} usuario={usuario} diaDeNegocio={props.diaDeNegocio} onCerrar={function() { setDiscontinuando(false); }} />}
      {cuerpo}
    </div>
  );
}


// ─── INFORME DEL TURNO ────────────────────────────────────────────────
// Qué pasó en el servicio: cuánto tardó cada mesa, el promedio, la más lenta, la cocina, lo cobrado por medio de pago y los faltantes.
// Los turnos de cada local. Hoy cada uno tiene uno solo: la noche (Kusama y Colantonio's desde las 19:30, el Bodegón desde las 20:00).
// Con un solo turno no se parte el día: todo lo cobrado en el día de negocio es de ese turno. Si algún local suma otro turno, se agrega acá.
var TURNOS_LOCAL = {
  l1: [{ id:"noche", nombre:"🌙 Noche", desde:"20:00" }],
  l2: [{ id:"noche", nombre:"🌙 Noche", desde:"19:30" }],
  l3: [{ id:"noche", nombre:"🌙 Noche", desde:"19:30" }],
};
export function turnosLocal(localId) {
  return TURNOS_LOCAL[localId] || [{ id:"mediodia", nombre:"☀️ Mediodía", desde:"05:00" }, { id:"noche", nombre:"🌙 Noche", desde:"17:00" }];
}
export function turnoDe(iso) { var h = new Date(iso).getHours(); return h >= 5 && h < 17 ? "mediodia" : "noche"; }
function fmtMin(m) { if (m === null || m === undefined || isNaN(m)) return "—"; m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min"; }
function InformeTurno(props) {
  var color = props.color, localId = props.localId;
  var [fecha, setFecha] = useState(props.diaDeNegocio ? props.diaDeNegocio() : new Date().toISOString().slice(0, 10));
  var [turno, setTurno] = useState("todo");
  var [verTodoLog, setVerTodoLog] = useState(false);
  var [datos, setDatos] = useState(null);
  useEffect(function() {
    var vivo = true; setDatos(null);
    (async function() {
      var pagos = await cargarPagosGen(localId, fecha, cfetch);
      var ids = pagos.map(function(x) { return x.comanda_id; });
      var coms = [], its = [];
      if (ids.length) {
        try { var r = await cfetch(SURL + "/rest/v1/comandas?id=in.(" + ids.join(",") + ")", { headers: {...SH, "Cache-Control":"no-cache"} }); var d = await r.json(); coms = Array.isArray(d) ? d : []; } catch(e) {}
        its = await sbLoadItems(ids);
      }
      var falt = await sbLeerFaltantes(localId, fecha);
      var log = await sbLeerLogDia(localId, fecha);
      // Personas de cada mesa cobrada, y lo de las cuentas anuladas del día (con lo que no se cobró).
      var extras = ids.length ? await sbLeerExtrasDe(ids) : {};
      var anIds = log.filter(function(l) { return l.accion === "Anuló la cuenta"; }).map(function(l) { return l.comanda_id; }).filter(function(v, i, a) { return a.indexOf(v) === i; });
      var itsAn = anIds.length ? await sbLoadItems(anIds) : [];
      var ent = await sbLeerEntregas(new Date(new Date(fecha + "T00:00:00").getTime() - 86400000).toISOString());
      var listos = await sbLeerListosDesde(new Date(new Date(fecha + "T00:00:00").getTime() - 86400000).toISOString());
      var cfgC = await sbLeerConfigCom();
      var planoI = await sbLeerPlano(localId);
      var cartaI = (await sbLoadCarta()).filter(function(x) { return x.local === localId; });
      if (vivo) setDatos({ extras:extras, itsAn:itsAn, pagos:pagos, coms:coms, items:its, falt:falt, log:log, ent:ent, listos:listos, cfg:cfgC, plano:planoI, carta:cartaI });
    })();
    return function() { vivo = false; };
  }, [fecha, localId, props.refresco]);

  var card = { background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:12, padding:"13px 14px", marginBottom:12 };
  var h = { fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1.5, marginBottom:8, fontWeight:700 };

  function cuerpo() {
    if (!datos) return <div style={{ textAlign:"center", padding:"30px 0", color:"#444" }}>Cargando…</div>;
    var filas = datos.pagos.map(function(pg) {
      var c = datos.coms.find(function(x) { return x.id === pg.comanda_id; });
      if (!c) return null;
      var min = c.abierta_at && c.cerrada_at ? (new Date(c.cerrada_at) - new Date(c.abierta_at)) / 60000 : null;
      var mesa = (props.mesas || []).find(function(m) { return m.id === c.mesa_id; });
      var secI = mesa ? sectorDeMesa(mesa, datos.plano) : null;
      var nombre = c.tipo === "mesa" ? "🪑 Mesa " + (mesa ? mesa.nombre : "") + (secI ? " · " + secI.nombre : "") : (c.tipo === "delivery" ? "🛵 Delivery" : "🥡 Mostrador") + (c.cliente ? " · " + c.cliente : "");
      return { c:c, pg:pg, sec:secI, min:(min !== null && min >= 0 && min < 720) ? min : null, nombre:nombre, turno:turnoDe(c.cerrada_at || c.abierta_at) };
    }).filter(function(x) { return x && (turno === "todo" || x.turno === turno); });
    if (!filas.length) return <div style={{ textAlign:"center", padding:"30px 0", color:"#555", fontSize:13 }}>No hay comandas cobradas en este día{turno !== "todo" ? " y turno" : ""}.</div>;
    var ids = {}; filas.forEach(function(f) { ids[f.c.id] = true; });
    var conMin = filas.filter(function(f) { return f.min !== null; });
    var mesasMin = conMin.filter(function(f) { return f.c.tipo === "mesa"; });
    var prom = function(a) { return a.length ? a.reduce(function(s2, f) { return s2 + f.min; }, 0) / a.length : null; };
    var ordenadas = conMin.slice().sort(function(a, b) { return b.min - a.min; });
    var ventas = filas.reduce(function(a, f) { return a + (Number(f.pg.total) || 0); }, 0);
    var desc = filas.reduce(function(a, f) { return a + (Number(f.pg.descuento) || 0); }, 0);
    var porMedio = {}; filas.forEach(function(f) { (f.pg.pagos || []).forEach(function(q) { var k = normalizarMedio(q.medio); porMedio[k] = (porMedio[k] || 0) + (Number(q.monto) || 0); }); });
    var porMozo = {}; filas.forEach(function(f) { var k = f.c.tipo === "mesa" ? (f.c.mozo || "Sin mozo") : "🧾 Cajero: " + (f.c.mozo || "—"); var o = porMozo[k] || (porMozo[k] = { n:0, v:0, mins:[] }); o.n++; o.v += Number(f.pg.total) || 0; if (f.min !== null) o.mins.push(f.min); });
    // Por sector (solo mesas): salón, patio, vereda, barra.
    var porSector = {};
    filas.filter(function(f) { return f.c.tipo === "mesa"; }).forEach(function(f) {
      var k = f.sec ? f.sec.id : "otro", o = porSector[k] || (porSector[k] = { sec:f.sec, n:0, v:0, mins:[] });
      o.n++; o.v += Number(f.pg.total) || 0; if (f.min !== null) o.mins.push(f.min);
    });
    var itemsT = datos.items.filter(function(i) { return ids[i.comanda_id]; });
    // Cocina: desde «Marchar» hasta que queda listo (se lo entrega al mozo o al cajero). Los pedidos viejos, sin ese registro, se miden hasta la entrega a la mesa.
    var listos = datos.listos || {};
    function listoDe(i) { var r = listos[i.comanda_id + "|" + (i.ronda || 0)]; return r ? r.listo_at : null; }
    var cocina = itemsT.filter(function(i) { return !esBarra(i) && (i.estado === "entregado" || i.estado === "listo") && i.enviado_at; }).map(function(i) {
      var l = listoDe(i) || (i.estado === "entregado" ? i.entregado_at : null);
      return l ? { nombre:i.nombre, min:(new Date(l) - new Date(i.enviado_at)) / 60000 } : null;
    }).filter(function(x) { return x && x.min >= 0 && x.min < 240; });
    // Del «listo» hasta que el mozo o el cajero lo lleva a la mesa.
    var aMesaMin = itemsT.filter(function(i) { return i.estado === "entregado" && i.entregado_at && listoDe(i); }).map(function(i) { return (new Date(i.entregado_at) - new Date(listoDe(i))) / 60000; }).filter(function(m) { return m >= 0 && m < 240; });
    var aMesaProm = aMesaMin.length ? aMesaMin.reduce(function(a, m) { return a + m; }, 0) / aMesaMin.length : null;
    var cocProm = cocina.length ? cocina.reduce(function(a, x) { return a + x.min; }, 0) / cocina.length : null;
    // Retrasos de cocina: cada entrega de la cocina (mesa o pedido) que tardó más del tiempo límite, clasificada por cuánto se pasó.
    var limiteK = limiteDe(datos.cfg, localId);
    var retrasos = [], totalEntregas = 0;
    Object.keys(listos).forEach(function(k) {
      var rec = listos[k];
      if (!ids[rec.comanda_id]) return;
      var delTanda = itemsT.filter(function(i) { return i.comanda_id === rec.comanda_id && (i.ronda || 0) === (rec.ronda || 0) && i.enviado_at; });
      if (!delTanda.length) return;
      var desde = delTanda.reduce(function(a, i) { return i.enviado_at < a ? i.enviado_at : a; }, delTanda[0].enviado_at);
      var min = (new Date(rec.listo_at) - new Date(desde)) / 60000;
      if (!(min >= 0 && min < 240)) return;
      totalEntregas++;
      var nv = nivelRetraso(min, limiteK);
      var fila = filas.find(function(f) { return f.c.id === rec.comanda_id; });
      if (nv) retrasos.push({ nombre: fila ? fila.nombre : rec.comanda_id, ronda: rec.ronda || 0, min: Math.round(min), nv: nv });
    });
    retrasos.sort(function(a, b) { return b.nv.extra - a.nv.extra; });
    var porNivel = { leve:0, medio:0, grave:0 }; retrasos.forEach(function(r) { porNivel[r.nv.id]++; });
    var retrasoProm = retrasos.length ? retrasos.reduce(function(a, r) { return a + r.nv.extra; }, 0) / retrasos.length : null;
    var porPlato = {}; cocina.forEach(function(x) { var o = porPlato[x.nombre] || (porPlato[x.nombre] = { n:0, t:0 }); o.n++; o.t += x.min; });
    var lentos = Object.keys(porPlato).map(function(k) { return { nombre:k, prom:porPlato[k].t / porPlato[k].n, n:porPlato[k].n }; }).sort(function(a, b) { return b.prom - a.prom; }).slice(0, 5);
    var quitados = itemsT.filter(function(i) { return i.estado === "cancelado"; });
    var falt = datos.falt.filter(function(f) { return turno === "todo" || turnoDe(f.at) === turno; });
    // Personas por turno (solo mesas con el dato cargado) y ticket por persona.
    var personasDe = function(f) { return f.c.tipo === "mesa" ? (Number(((datos.extras || {})[f.c.id] || {}).personas) || 0) : 0; };
    var porTurnoP = { mediodia:{ p:0, m:0, v:0 }, noche:{ p:0, m:0, v:0 } };
    filas.forEach(function(f) { var n = personasDe(f); if (n > 0) { var o = porTurnoP[f.turno]; o.p += n; o.m++; o.v += Number(f.pg.total) || 0; } });
    var totPersonas = porTurnoP.mediodia.p + porTurnoP.noche.p, mesasConDato = porTurnoP.mediodia.m + porTurnoP.noche.m, ventasConDato = porTurnoP.mediodia.v + porTurnoP.noche.v;
    var mesasTotal = filas.filter(function(f) { return f.c.tipo === "mesa"; }).length;
    // Cuántos pedidos de cada tipo se cobraron (mesas, deliveries y mostradores), con la plata y el reparto por turno.
    var porTipo = [["mesa", "🪑 Mesas"], ["delivery", "🛵 Deliveries"], ["mostrador", "🥡 Mostradores"]].map(function(t) {
      var l = filas.filter(function(f) { return f.c.tipo === t[0]; });
      var md = l.filter(function(f) { return f.turno === "mediodia"; }), no = l.filter(function(f) { return f.turno === "noche"; });
      var suma = function(a) { return a.reduce(function(x, f) { return x + (Number(f.pg.total) || 0); }, 0); };
      return { id:t[0], label:t[1], n:l.length, v:suma(l), md:md.length, no:no.length };
    });
    // Cuentas anuladas del día: quién, cuándo, por qué y cuánta plata no se cobró.
    var anuladas = datos.log.filter(function(l) { return l.accion === "Anuló la cuenta" && (turno === "todo" || turnoDe(l.at) === turno); }).map(function(l) {
      var monto = (datos.itsAn || []).filter(function(i) { return i.comanda_id === l.comanda_id && String(i.nota || "").indexOf("Anulada:") === 0; }).reduce(function(a, i) { return a + (Number(i.precio) || 0) * (Number(i.cant) || 1); }, 0);
      return { l:l, monto:monto };
    });
    var montoAnulado = anuladas.reduce(function(a, x) { return a + x.monto; }, 0);
    var kpi = function(t, v, sub, col) { return <div style={{ flex:"1 1 130px", background:"#111", border:"1px solid " + (col || "#222") + "55", borderRadius:10, padding:"10px 12px" }}><div style={{ fontSize:9, color:"#777", textTransform:"uppercase", letterSpacing:1 }}>{t}</div><div style={{ fontSize:20, fontWeight:800, color:col || "#F0EDE8", margin:"2px 0" }}>{v}</div><div style={{ fontSize:10, color:"#666" }}>{sub}</div></div>; };
    var mas = ordenadas[0], menos = ordenadas[ordenadas.length - 1];
    return (
      <div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {kpi("Cobrado", pesos(ventas), filas.length + " comanda" + (filas.length === 1 ? "" : "s") + (desc > 0 ? " · desc. " + pesos(desc) : ""), "#4C9A5A")}
          {kpi("Tardanza promedio", fmtMin(prom(mesasMin)), "por mesa (" + mesasMin.length + ")", color)}
          {kpi("La que más tardó", mas ? fmtMin(mas.min) : "—", mas ? mas.nombre : "", "#C1440E")}
          {kpi("La más rápida", menos ? fmtMin(menos.min) : "—", menos ? menos.nombre : "", "#3A9BC1")}
          {kpi("Deliveries", String(porTipo[1].n), porTipo[1].n ? pesos(porTipo[1].v) + " cobrado" : "ninguno", "#3A9BC1")}
          {kpi("Mostradores", String(porTipo[2].n), porTipo[2].n ? pesos(porTipo[2].v) + " cobrado" : "ninguno", "#D4A017")}
          {kpi("Personas", totPersonas ? String(totPersonas) : "—", totPersonas ? (mesasConDato + " mesa" + (mesasConDato === 1 ? "" : "s") + (mesasConDato < mesasTotal ? " de " + mesasTotal + " (las demás sin el dato)" : "") + " · " + (totPersonas / mesasConDato).toFixed(1).replace(".", ",") + " por mesa · " + pesos(ventasConDato / totPersonas) + " por persona") : "ninguna mesa tiene el dato", "#8B2FC9")}
          {anuladas.length > 0 && kpi("Anuladas", String(anuladas.length), "sin cobrar " + pesos(montoAnulado), "#E0452E")}
        </div>

        <div style={card}>
          <div style={h}>🧾 Pedidos cobrados por tipo</div>
          {porTipo.map(function(t, i) { return (
            <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10, padding:"7px 0", borderTop:i === 0 ? "none" : "1px solid #181818" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:"#F0EDE8" }}>{t.label} <span style={{ color:"#C9C9C9" }}>· {t.n}</span></div>
                {turno === "todo" && t.n > 0 && <div style={{ fontSize:11, color:"#8C8C8C" }}>☀️ mediodía {t.md} · 🌙 noche {t.no}</div>}
              </div>
              <div style={{ fontSize:14, fontWeight:800, color:"#F0EDE8", whiteSpace:"nowrap" }}>{pesos(t.v)}</div>
            </div>); })}
        </div>

        {turno === "todo" && totPersonas > 0 && (
          <div style={card}>
            <div style={h}>👥 Personas por turno (mesas)</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {[["mediodia", "☀️ Mediodía"], ["noche", "🌙 Noche"]].map(function(t) { var o = porTurnoP[t[0]]; return (
                <div key={t[0]} style={{ flex:"1 1 150px", background:"#111", border:"1px solid #8B2FC955", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:12, color:"#C9A0F0", fontWeight:800 }}>{t[1]}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#F0EDE8" }}>{o.p}</div>
                  <div style={{ fontSize:10.5, color:"#8C8C8C" }}>{o.m ? o.m + " mesa" + (o.m === 1 ? "" : "s") + " · " + pesos(o.v / o.p) + " por persona" : "sin datos"}</div>
                </div>); })}
            </div>
          </div>
        )}

        {anuladas.length > 0 && (
          <div style={{ ...card, border:"1px solid #E0452E55" }}>
            <div style={{ ...h, color:"#E0715A" }}>🚫 Cuentas anuladas · {anuladas.length} · sin cobrar {pesos(montoAnulado)}</div>
            {anuladas.map(function(x, i) { return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10, padding:"6px 0", borderTop:i === 0 ? "none" : "1px solid #181818" }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, color:"#F0EDE8", fontWeight:700 }}>{x.l.titulo || "Cuenta"} <span style={{ color:"#777", fontWeight:400 }}>· {horaSeg(x.l.at).slice(0, 5)}</span></div>
                  <div style={{ fontSize:11.5, color:"#9A9A9A" }}>{x.l.detalle}</div>
                </div>
                <div style={{ fontSize:13, fontWeight:800, color:"#E0715A", whiteSpace:"nowrap" }}>{pesos(x.monto)}</div>
              </div>); })}
          </div>
        )}

        <div style={card}>
          <div style={h}>⏱ Cuánto tardó cada una (de la más lenta a la más rápida)</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ color:"#666", fontSize:9.5, textTransform:"uppercase" }}><th style={{ textAlign:"left", padding:"3px 0" }}>Mesa / pedido</th><th style={{ textAlign:"left" }}>Mozo</th><th style={{ textAlign:"right" }}>Tiempo</th><th style={{ textAlign:"right" }}>Cuenta</th></tr></thead>
            <tbody>
              {ordenadas.concat(filas.filter(function(f) { return f.min === null; })).map(function(f) {
                var lenta = f.min !== null && prom(conMin) && f.min > prom(conMin) * 1.5;
                return <tr key={f.c.id} style={{ borderTop:"1px solid #181818" }}>
                  <td style={{ padding:"6px 0", color:"#DDD" }}>{f.nombre} <span style={{ color:"#555", fontSize:10 }}>#{f.c.numero}</span>{(function() {
                    var e = datos.ent && datos.ent[f.c.id]; if (!e || f.c.tipo === "mesa" || !f.c.cerrada_at) return null;
                    var dif = Math.round((new Date(f.c.cerrada_at) - new Date(e.prometida_at)) / 60000);
                    return <div style={{ fontSize:10, color: dif > 0 ? "#E0452E" : "#4C9A5A" }}>🕒 prometido {e.minutos} min · {dif > 0 ? "salió " + dif + " min tarde" : "a tiempo"}</div>;
                  })()}</td>
                  <td style={{ color:"#999" }}>{f.c.mozo || "—"}</td>
                  <td style={{ textAlign:"right", fontWeight:700, color: lenta ? "#C1440E" : "#F0EDE8" }}>{fmtMin(f.min)}{lenta ? " 🐢" : ""}</td>
                  <td style={{ textAlign:"right", color:"#BBB" }}>{pesos(f.pg.total)}</td></tr>;
              })}
            </tbody>
          </table>
          <div style={{ fontSize:10, color:"#555", marginTop:6 }}>🐢 = más de una vez y media el promedio. El tiempo va desde que se abre hasta que se cobra.</div>
        </div>

        <div style={card}>
          <div style={h}>💳 Cobrado por medio de pago (esto es lo que va al cierre de caja)</div>
          {mediosDeLocal(localId).filter(function(m) { return (porMedio[m.id] || 0) > 0; }).map(function(m) {
            return <div key={m.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderTop:"1px solid #181818", fontSize:13 }}><span style={{ color:"#CCC" }}>{m.emoji} {m.nombre}</span><b style={{ color:"#F0EDE8" }}>{pesos(porMedio[m.id])}</b></div>;
          })}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0 0", borderTop:"2px solid #222", fontSize:13 }}><b style={{ color:"#F0EDE8" }}>Total</b><b style={{ color:"#4C9A5A" }}>{pesos(Object.keys(porMedio).reduce(function(a, k) { return a + porMedio[k]; }, 0))}</b></div>
        </div>

        {Object.keys(porSector).length > 0 && (
          <div style={card}>
            <div style={h}>📍 Por sector (mesas)</div>
            {Object.keys(porSector).sort(function(a, b) { return porSector[b].v - porSector[a].v; }).map(function(k) {
              var o = porSector[k], pm = o.mins.length ? o.mins.reduce(function(a, x) { return a + x; }, 0) / o.mins.length : null;
              return <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"5px 0", borderTop:"1px solid #181818", fontSize:12.5 }}><span style={{ color:"#DDD" }}>{o.sec ? o.sec.emoji + " " + o.sec.nombre : "Sin sector"}</span><span style={{ color:"#999" }}>{o.n} mesa{o.n === 1 ? "" : "s"} · prom. {fmtMin(pm)} · <b style={{ color:"#F0EDE8" }}>{pesos(o.v)}</b></span></div>;
            })}
          </div>
        )}

        <div style={card}>
          <div style={h}>🧑‍🍳 Por mozo (delivery y mostrador van al cajero)</div>
          {Object.keys(porMozo).sort(function(a, b) { return porMozo[b].v - porMozo[a].v; }).map(function(k) {
            var o = porMozo[k]; var pm = o.mins.length ? o.mins.reduce(function(a, x) { return a + x; }, 0) / o.mins.length : null;
            return <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"5px 0", borderTop:"1px solid #181818", fontSize:12.5 }}><span style={{ color:"#DDD" }}>{k}</span><span style={{ color:"#999" }}>{o.n} · prom. {fmtMin(pm)} · <b style={{ color:"#F0EDE8" }}>{pesos(o.v)}</b></span></div>;
          })}
        </div>

        <div style={card}>
          <div style={h}>🍳 Cocina: del pedido a que queda listo</div>
          {cocProm === null ? <div style={{ fontSize:12, color:"#555" }}>Todavía no hay pedidos marcados como entregados en este turno.</div> : (
            <>
              {aMesaProm !== null && <div style={{ fontSize:13, color:"#DDD", marginBottom:6 }}>Del listo a la mesa (lo que tarda el mozo o el cajero en llevarlo): <b style={{ color:"#F0EDE8" }}>{fmtMin(aMesaProm)}</b> <span style={{ color:"#666", fontSize:11 }}>({aMesaMin.length})</span></div>}
              <div style={{ fontSize:13, color:"#DDD", marginBottom:6 }}>Promedio por pedido: <b style={{ color:"#F0EDE8" }}>{fmtMin(cocProm)}</b> <span style={{ color:"#666", fontSize:11 }}>({cocina.length} entregados)</span></div>
              {lentos.map(function(x) { return <div key={x.nombre} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:"1px solid #181818", fontSize:12 }}><span style={{ color:"#CCC" }}>{x.nombre}</span><span style={{ color:"#999" }}>{fmtMin(x.prom)} <span style={{ color:"#555" }}>×{x.n}</span></span></div>; })}
              <div style={{ fontSize:10, color:"#555", marginTop:5 }}>Los más lentos arriba. Cuenta desde «Marchar» hasta que la cocina lo entrega al mozo o al cajero.</div>
            </>
          )}
          {quitados.length > 0 && <div style={{ fontSize:11, color:"#D4A017", marginTop:8 }}>🗑 Quitado de las cuentas: {quitados.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0)} ({quitados.slice(0, 6).map(function(i) { return i.nombre + (i.nota ? " — " + i.nota : ""); }).join("; ")}{quitados.length > 6 ? "…" : ""})</div>}
        </div>

        <div style={{ ...card, borderColor: retrasos.length ? "#E0652E66" : "#1E1E1E" }}>
          <div style={h}>⏰ Retrasos de cocina (más de {limiteK} min)</div>
          {totalEntregas === 0 ? <div style={{ fontSize:12, color:"#555" }}>Todavía no hay entregas de la cocina registradas en este turno.</div> : retrasos.length === 0 ? (
            <div style={{ fontSize:13, color:"#8FD19A" }}>✅ Ninguna entrega pasó de los {limiteK} minutos ({totalEntregas} entregas).</div>
          ) : (
            <div>
              <div style={{ fontSize:13, color:"#DDD", marginBottom:8 }}><b style={{ color:"#F0EDE8" }}>{retrasos.length}</b> de {totalEntregas} entregas se pasaron del límite · retraso promedio <b style={{ color:"#F0EDE8" }}>+{Math.round(retrasoProm)} min</b></div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                {[["leve", "#F0A030", "Leve (hasta +5)"], ["medio", "#E0652E", "Medio (+6 a +10)"], ["grave", "#C1121F", "Grave (más de +10)"]].map(function(x) {
                  return <span key={x[0]} style={{ background:x[1] + "26", border:"1px solid " + x[1], color:x[1], borderRadius:8, padding:"4px 10px", fontSize:12, fontWeight:800 }}>{x[2]}: {porNivel[x[0]]}</span>;
                })}
              </div>
              {retrasos.map(function(r, i) {
                return <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"5px 0", borderTop:"1px solid #181818", fontSize:12.5 }}>
                  <span style={{ color:"#DDD" }}>{r.nombre}{r.ronda > 1 ? <span style={{ color:"#666" }}> · tanda {r.ronda}</span> : null}</span>
                  <span style={{ whiteSpace:"nowrap" }}><span style={{ color:"#999" }}>{r.min} min · </span><b style={{ color:r.nv.col }}>+{r.nv.extra} min · {r.nv.txt}</b></span>
                </div>;
              })}
              <div style={{ fontSize:10, color:"#555", marginTop:6 }}>El tiempo de cocina va desde «Marchar» hasta que la cocina lo entrega al mozo o al cajero. El límite se elige en Comandas (administración).</div>
            </div>
          )}
        </div>

        <TarjetasDiscontinuados falt={falt} carta={datos.carta} card={card} h={h} />

        <div style={card}>
          <div style={h}>🕒 Registro de acciones (con la hora de cada una)</div>
          {(function() {
            var lg = (datos.log || []).filter(function(x) { return turno === "todo" || turnoDe(x.at) === turno; });
            if (!lg.length) return <div style={{ fontSize:12, color:"#555" }}>No hay acciones registradas en este turno.</div>;
            var ver = verTodoLog ? lg : lg.slice(-40);
            return (
              <div>
                {!verTodoLog && lg.length > 40 && <button onClick={function() { setVerTodoLog(true); }} style={{ ...GH, padding:"5px 10px", fontSize:11, marginBottom:6 }}>Ver las {lg.length} acciones (ahora se ven las últimas 40)</button>}
                {ver.map(function(x, i) {
                  return <div key={i} style={{ display:"flex", gap:8, padding:"4px 0", borderTop:"1px solid #181818", fontSize:11.5, alignItems:"baseline" }}>
                    <span style={{ color:"#4C9A5A", fontVariantNumeric:"tabular-nums", minWidth:58 }}>{horaSeg(x.at)}</span>
                    <span style={{ color:"#999", minWidth:88 }}>{x.titulo}</span>
                    <span style={{ color:"#DDD", flex:1 }}><b>{x.accion}</b>{x.detalle ? " · " + x.detalle : ""} <span style={{ color:"#666" }}>({x.por})</span></span>
                  </div>;
                })}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
        <input type="date" value={fecha} onChange={function(e) { setFecha(e.target.value); }} style={{ ...INP, width:"auto", padding:"7px 10px", fontSize:12 }} />
        {turnosLocal(localId).length === 1 && <span style={{ fontSize:12, color:"#8C8C8C" }}>{turnosLocal(localId)[0].nombre} · servicio desde las {turnosLocal(localId)[0].desde}</span>}
        {turnosLocal(localId).length > 1 && [["todo", "Todo el día"], ["mediodia", "☀️ Mediodía"], ["noche", "🌙 Noche"]].map(function(x) {
          var act = turno === x[0];
          return <button key={x[0]} onClick={function() { setTurno(x[0]); }} style={{ padding:"7px 12px", borderRadius:8, border:"1px solid " + (act ? color : "#222"), background: act ? color + "22" : "transparent", color: act ? color : "#777", fontSize:12, fontWeight:700, cursor:"pointer" }}>{x[1]}</button>;
        })}
      </div>
      {cuerpo()}
    </div>
  );
}

// Cuánto falta para la hora prometida: texto y color. Pasada la hora, en rojo.
function estadoEntrega(e, ahoraMs) {
  if (!e || !e.prometida_at) return null;
  var d = new Date(e.prometida_at), faltan = Math.ceil((d.getTime() - ahoraMs) / 60000);
  var hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (faltan >= 0) return { txt:"🕒 Entrega " + hh + " · en " + faltan + " min", col: faltan <= 5 ? "#D4A017" : "#4C9A5A" };
  return { txt:"🕒 Entrega " + hh + " · atrasado " + (-faltan) + " min", col:"#E0452E" };
}
// Minutos que pasaron de la hora prometida al cliente (delivery y mostrador); null si todavía está a tiempo o no hay hora.
function minutosVencida(e, ahoraMs) {
  if (!e || !e.prometida_at) return null;
  var dif = ahoraMs - new Date(e.prometida_at).getTime();
  return dif > 0 ? Math.max(1, Math.ceil(dif / 60000)) : null;
}
var ENTREGA_OPCIONES = [10, 15, 20, 30, 45, 60, 90];
function ElegirEntrega(props) {
  var [otro, setOtro] = useState("");
  return (
    <div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {ENTREGA_OPCIONES.map(function(m) {
          var act = props.valor === m;
          return <button key={m} onClick={function() { props.onElegir(m); }} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid " + (act ? props.color : "#2A2A2A"), background: act ? props.color + "28" : "#161616", color: act ? props.color : "#CCC", fontSize:13, fontWeight:700, cursor:"pointer" }}>{m} min</button>;
        })}
        <input type="number" inputMode="numeric" value={otro} onChange={function(e) { setOtro(e.target.value); }} placeholder="otro" style={{ ...INP, width:70, padding:"8px", fontSize:13 }} />
        {parseInt(otro, 10) > 0 && <button onClick={function() { var n = parseInt(otro, 10); if (n > 0 && n < 600) { props.onElegir(n); setOtro(""); } }} style={{ padding:"8px 12px", borderRadius:8, border:"none", background:props.color, color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>OK</button>}
      </div>
    </div>
  );
}
// El botón de volver: grande y con color, para que se encuentre sin buscarlo.
function estiloVolver(color) { return { display:"inline-flex", alignItems:"center", gap:6, padding:"11px 18px", borderRadius:10, border:"2px solid " + (color || "#C1440E"), background:(color || "#C1440E") + "26", color:color || "#C1440E", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer" }; }

// Los mozos de un local: los empleados activos cargados en ese local, de los sectores Salón y Barra.
var SECTORES_ORDEN = ["Salón", "Barra"];   // solo estos sectores toman pedidos
function mozosDeLocal(empleados, localId) {
  return (empleados || []).filter(function(e) { return e.activo !== false && e.local === localId && e.nombre && SECTORES_ORDEN.indexOf(e.categoria) >= 0; })
    .sort(function(a, b) {
      var ia = SECTORES_ORDEN.indexOf(a.categoria), ib = SECTORES_ORDEN.indexOf(b.categoria);
      ia = ia < 0 ? 99 : ia; ib = ib < 0 ? 99 : ib;
      return ia - ib || String(a.nombre).localeCompare(String(b.nombre));
    });
}
// ¿Quién toma el pedido? Se pregunta al abrir una mesa, un delivery o un mostrador.
// ¿Cuántas personas vienen a la mesa? Se pregunta al abrirla y se puede corregir después desde las opciones de la mesa.
function ElegirPersonas(props) {
  var color = props.color;
  var [otro, setOtro] = useState("");
  var n = parseInt(otro, 10);
  return (
    <div onClick={props.onCancelar} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ background:"#111", border:"1px solid "+color+"55", borderRadius:14, padding:"16px", width:"100%", maxWidth:420 }}>
        <div style={{ fontSize:15, fontWeight:800, color:"#F0EDE8", marginBottom:3 }}>👥 ¿Cuántas personas son?</div>
        <div style={{ fontSize:11, color:"#777", marginBottom:12 }}>{props.titulo}{props.actual ? " · hoy: " + props.actual : ""}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(function(k) {
            var on = props.actual === k;
            return <button key={k} onClick={function() { props.onElegir(k); }} style={{ padding:"14px 0", borderRadius:10, border:"1px solid "+(on ? color : "#2A2A2A"), background:on ? color+"33" : "#1A1A1A", color:"#F0EDE8", fontFamily:"'Inter',sans-serif", fontSize:18, fontWeight:800, cursor:"pointer" }}>{k}</button>;
          })}
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <input value={otro} onChange={function(e) { setOtro(e.target.value.replace(/[^0-9]/g, "")); }} placeholder="Otra cantidad (más de 12)" inputMode="numeric" style={{ ...INP, flex:1 }} />
          <button disabled={!(n > 0)} onClick={function() { props.onElegir(n); }} style={{ padding:"0 16px", borderRadius:8, border:"none", background:n > 0 ? color : "#1A1A1A", color:n > 0 ? "#fff" : "#444", fontWeight:800, fontSize:14, cursor:n > 0 ? "pointer" : "not-allowed" }}>OK</button>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {props.onOmitir && <button onClick={props.onOmitir} style={{ ...GH, flex:1, padding:"10px", fontSize:12 }}>Seguir sin el dato</button>}
          <button onClick={props.onCancelar} style={{ ...GH, flex:1, padding:"10px", fontSize:12 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ElegirMozo(props) {
  var mozos = props.mozos, color = props.color, ultimo = props.ultimo;
  var sectores = [];
  mozos.forEach(function(m) { var k = m.categoria || "Otro"; if (sectores.indexOf(k) < 0) sectores.push(k); });
  return (
    <div onClick={props.onCancelar} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ background:"#111", border:"1px solid "+color+"55", borderRadius:14, padding:"16px", width:"100%", maxWidth:420, maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ fontSize:15, fontWeight:800, color:"#F0EDE8", marginBottom:3 }}>🧑‍🍳 ¿Quién toma el pedido?</div>
        <div style={{ fontSize:11, color:"#777", marginBottom:12 }}>{props.titulo}</div>
        {sectores.map(function(sec) {
          return (
            <div key={sec} style={{ marginBottom:11 }}>
              <div style={{ fontSize:9, color:"#666", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>{sec}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {mozos.filter(function(m) { return (m.categoria || "Otro") === sec; }).map(function(m) {
                  var act = ultimo === m.nombre;
                  return <button key={m.id} onClick={function() { props.onElegir(m.nombre); }}
                    style={{ padding:"10px 14px", borderRadius:9, border:"1px solid " + (act ? color : "#2A2A2A"), background: act ? color + "22" : "#161616", color: act ? color : "#DDD", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>{m.nombre}</button>;
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display:"flex", gap:8, marginTop:6 }}>
          <button onClick={function() { props.onElegir(props.usuario); }} style={{ ...GH, flex:1, padding:"9px", fontSize:11 }}>Nadie / yo ({props.usuario})</button>
          <button onClick={props.onCancelar} style={{ ...GH, padding:"9px 14px", fontSize:11 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Cambiar un producto ya mandado por otro: se elige el nuevo de la carta (con las mismas ventanas de colores).
function VentanaCambiar(props) {
  var [ruta, setRuta] = useState([]);
  var cats = props.cats, delLocal = props.delLocal, colores = props.colores;
  var [q, setQ] = useState("");
  var qq = q.trim().toLowerCase();
  var platos = delLocal.filter(function(x) { return qq ? String(x.nombre).toLowerCase().indexOf(qq) !== -1 : x.categoria === ruta.join(NIV); });
  function lista(arr) {
    return <RejillaPlatos alto={380}>{arr.map(function(x, i) { return <VentanaPlato key={x.id} x={x} col={colorDePlato(x, i, colores)} onClick={function() { props.onElegir(x); }} />; })}</RejillaPlatos>;
  }
  return (
    <Ventana titulo={"🔄 Cambiar «" + props.item.nombre + "»"} onCerrar={props.onCerrar}>
      <div style={{ fontSize:12, color:"#9A9A9A", marginBottom:8, lineHeight:1.5 }}>Elegí lo que va en su lugar. Se marcha de una vez y la cocina ve el aviso del cambio.</div>
      <input value={q} onChange={function(e) { setQ(e.target.value); }} placeholder="Buscar…" style={{ ...INP, fontSize:12, marginBottom:10 }} />
      {qq ? lista(platos) : (
        <ArbolCarta cats={cats} ruta={ruta} setRuta={setRuta} colores={colores}
          contar={function(nodo) { return delLocal.filter(function(x) { return dentroDe(x.categoria, nodo); }).length; }}
          renderPlatos={function() { return lista(platos); }} />
      )}
    </Ventana>
  );
}

function PlatoParaAgregar(props) {
  var x = props.x;
  return (
    <button onClick={function() { props.onAgregar(x); }}
      style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:9, padding:"9px 11px", borderRadius:8, border:"1px solid #1A1A1A", background:"#111", color:"#F0EDE8", fontFamily:"'Inter',sans-serif", fontSize:13, cursor:"pointer", textAlign:"left" }}>
      <span style={{ flex:1, minWidth:0 }}>{x.nombre}</span>
      <span style={{ color:x.precio ? "#666" : "#D4A017", whiteSpace:"nowrap" }}>{x.precio ? pesos(x.precio) : "sin precio"}</span>
    </button>
  );
}

function ComandaDetalle(props) {
  var c = props.comanda, items = props.items, carta = props.carta, color = props.color;
  var [agregando, setAgregando] = useState(false);
  var [historial, setHistorial] = useState(null);   // null = cerrado; lista = abierto
  var [cambiando, setCambiando] = useState(null);   // el producto ya mandado que se está cambiando por otro
  var [ruta, setRuta] = useState([]);   // por qué niveles de la carta se va navegando
  var [busqueda, setBusqueda] = useState("");
  var [notaDe, setNotaDe] = useState(null);
  var [ventana, setVentana] = useState(null);   // opciones de la mesa: "quitar" | "control" | "descuento" | "factura"
  var extra = props.extra || {};

  var mios = items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
  var pendientes = mios.filter(function(i) { return i.estado === "pendiente"; });
  var mandados = mios.filter(function(i) { return i.estado !== "pendiente"; });
  var subtotal = mios.reduce(function(a, i) { return a + (Number(i.precio) || 0) * (Number(i.cant) || 1); }, 0);
  var descM = montoDescuento(subtotal, extra.descuento);   // lo que se descuenta
  var total = Math.max(0, subtotal - descM);                // lo que se cobra

  // Las tandas ya mandadas, de la más nueva a la más vieja.
  var rondas = [];
  mandados.forEach(function(i) {
    var r = rondas.find(function(x) { return x.ronda === i.ronda; });
    if (!r) { r = { ronda:i.ronda, enviado_at:i.enviado_at, items:[] }; rondas.push(r); }
    r.items.push(i);
    if (i.enviado_at && (!r.enviado_at || i.enviado_at < r.enviado_at)) r.enviado_at = i.enviado_at;
  });
  rondas.sort(function(a, b) { return (b.ronda || 0) - (a.ronda || 0); });

  var delLocal = carta.filter(function(x) { return x.local === c.local && x.activo !== false; });
  var cats = [];
  var minOrden = {};
  delLocal.forEach(function(x) {
    var o = x.orden === null || x.orden === undefined ? 9999 : x.orden;
    if (minOrden[x.categoria] === undefined || o < minOrden[x.categoria]) minOrden[x.categoria] = o;
  });
  cats = Object.keys(minOrden).sort(function(a, b) { return minOrden[a] - minOrden[b]; });
  var q = busqueda.trim().toLowerCase();
  var platos = delLocal.filter(function(x) {
    if (q) return String(x.nombre).toLowerCase().indexOf(q) !== -1;
    return x.categoria === ruta.join(NIV);
  }).sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

  // Cuántos de este plato hay ya sin mandar en la cuenta (se muestra en su ventana).
  function cantPend(x) { return pendientes.filter(function(i) { return i.nombre === x.nombre; }).reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0); }

  function agregar(plato) {
    // Si ya está sin mandar, suma uno en vez de repetir la línea: una mesa que pide
    // cuatro cervezas quiere "4x Heineken" y no cuatro renglones iguales.
    var ya = pendientes.find(function(i) { return i.nombre === plato.nombre && !i.nota; });
    if (ya) { props.onGuardarItems([{ ...ya, cant: (Number(ya.cant) || 1) + 1 }]); return; }
    props.onGuardarItems([{
      id: "it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      comanda_id: c.id, nombre: plato.nombre, cant: 1, precio: plato.precio,
      nota: null, estado: "pendiente", ronda: null, enviado_at: null, entregado_at: null,
      usuario: props.usuario || "", created_at: new Date().toISOString(),
    }]);
  }
  // Quitar un plato (o una unidad). Lo sin mandar se saca; lo ya mandado queda como "cancelado", con el motivo en la aclaración.
  function quitar(i, motivo, todos) {
    var n = Number(i.cant) || 1, sacar = todos ? n : 1, quien = props.usuario || "";
    var notaQ = "Quitado: " + motivo + (quien ? " (" + quien + ")" : "") + (notaVisible(i) ? " · " + notaVisible(i) : "");
    if (i.estado === "pendiente") {
      if (sacar >= n) props.onBorrarItem(i.id); else props.onGuardarItems([{ ...i, cant:n - sacar }]);
      return;
    }
    if (sacar >= n) { props.onGuardarItems([{ ...i, estado:"cancelado", nota:notaQ }]); return; }
    props.onGuardarItems([
      { ...i, cant:n - sacar },
      { ...i, id:"it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), cant:sacar, estado:"cancelado", nota:notaQ },
    ]);
  }
  // Cambio de un producto ya mandado: el viejo se tacha con «cambio por …» y el nuevo entra marchado en la misma tanda, con la aclaración
  // «reemplaza a …»; la cocina ve un solo aviso rojo («CAMBIARON: A → B») y no depende de que el mozo se acuerde de marchar.
  function cambiarPor(i, plato) {
    var ahora = new Date().toISOString();
    var nuevo = {
      id: "it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      comanda_id: c.id, nombre: plato.nombre, cant: Number(i.cant) || 1, precio: plato.precio,
      nota: notaConMarca("🔄 reemplaza a " + i.nombre, esEntrada(i)), estado: "enviado", ronda: i.ronda, enviado_at: i.enviado_at || ahora, entregado_at: null,   // hereda la hora del que reemplaza: el tiempo en cocina sigue corriendo, no arranca de cero
      usuario: props.usuario || "", created_at: ahora,
    };
    props.onGuardarItems([{ ...i, estado: "cancelado", nota: "cambio por " + plato.nombre }, nuevo]);
    setCambiando(null);
  }
  // ¿Hay algo todavía en la cocina de esta mesa? Entonces, al mandar más, se pregunta cómo tiene que salir lo nuevo.
  var hayEnCocina = mandados.some(function(i) { return i.estado === "enviado"; });
  var [preguntaSalida, setPreguntaSalida] = useState(false);
  // Marchar (el mosaico de Opciones y el botón de abajo hacen lo mismo): primero el tiempo del delivery, después cómo sale lo nuevo si ya hay cosas en la cocina.
  function pedirMandar() {
    if (!pendientes.length) return;
    // Si lo que se manda son solo bebidas, no hay nada para la cocina: no se pregunta tiempo ni cómo sale.
    if (pendientes.every(esDeBarra)) { mandar(); return; }
    if (props.comanda.tipo === "delivery" && !props.entrega) setPreguntaEntrega(true);
    // Delivery con el pedido ya en marcha al que se le suma algo: se ofrece cambiar el tiempo de entrega antes de mandar.
    else if (props.comanda.tipo === "delivery" && props.entrega && mandados.length) setPreguntaTiempoExtra(true);
    else mandarSegunTipo();
  }
  // En una mesa se pregunta cómo sale lo nuevo; en delivery y mostrador siempre sale todo junto (no se pregunta, queda anotado para que la cocina lo una en un solo bloque).
  function mandarSegunTipo() {
    if (!hayEnCocina) { mandar(); return; }
    if (props.comanda.tipo === "mesa") setPreguntaSalida(true);
    else mandar("junto");
  }
  function seguirTrasTiempo() { mandarSegunTipo(); }
  var [medioDel, setMedioDel] = useState("efectivo");   // cómo paga el delivery que toma el cajero: efectivo al recibir o transferencia al local
  var [preguntaEntrega, setPreguntaEntrega] = useState(false);
  var [preguntaTiempoExtra, setPreguntaTiempoExtra] = useState(false);   // delivery en marcha al que se le suma algo: ¿cambia el tiempo?   // delivery sin tiempo de entrega: se pregunta antes de marchar
  // Las bebidas no van a la cocina: salen en la comanda de barra y quedan en la cuenta.
  function esDeBarra(i) { return !!(props.esSinCocina && props.esSinCocina(i.nombre)); }
  function mandar(salida) {
    if (!pendientes.length) return;
    var ronda = mandados.reduce(function(a, i) { return Math.max(a, Number(i.ronda) || 0); }, 0) + 1;
    var ahora = new Date().toISOString();
    var deCocina = pendientes.filter(function(i) { return !esDeBarra(i); }), deBarra = pendientes.filter(esDeBarra);
    // Lo marcado como entrada sale como una tanda y el resto como la siguiente (el principal): las dos con la misma hora de «Marchar».
    var hayEntrada = deCocina.some(esEntrada), hayResto = deCocina.some(function(i) { return !esEntrada(i); });
    var rondasNuevas = hayEntrada && hayResto ? [ronda, ronda + 1] : [ronda];
    if (salida && deCocina.length && props.onSalida) props.onSalida(rondasNuevas, salida);
    props.onGuardarItems(pendientes.map(function(i) {
      if (esDeBarra(i)) { var t = notaVisible(i); return { ...i, estado:"listo", ronda:ronda, enviado_at:ahora, nota: MARCA_BARRA + (t ? " | " + t : "") }; }
      return { ...i, estado:"enviado", ronda: hayEntrada && hayResto && !esEntrada(i) ? ronda + 1 : ronda, enviado_at:ahora };
    }));
    if (deBarra.length && props.onImprimirBarra) props.onImprimirBarra(deBarra, ronda);
    if (deCocina.length && props.onImprimirCocina) props.onImprimirCocina(deCocina, ronda, salida, rondasNuevas.length > 1);
  }

  var LBL = { display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:6 };
  // Un plato cargado sin precio (de la carta, que todavía no lo tenía) hace que la cuenta dé $0: se le pone el precio acá, sin salir de la comanda.
  function ponerPrecio(i) {
    var v = window.prompt("Precio de «" + i.nombre + "» (por unidad):", "");
    if (v === null) return;
    var n = parseFloat(String(v).replace(",", "."));
    if (!(n > 0)) { alert("Poné un precio mayor a cero."); return; }
    props.onGuardarItems([{ ...i, precio:n }]);
  }
  function PrecioItem(q) {
    var sin = !(Number(q.i.precio) > 0);
    return sin
      ? <button onClick={function() { ponerPrecio(q.i); }} style={{ background:"#D4A01722", border:"1px solid #D4A01788", borderRadius:6, padding:"3px 8px", color:"#D4A017", fontSize:11, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap" }}>Poner precio</button>
      : <span style={{ fontSize:q.chico ? 11 : 12, color:q.chico ? "#555" : "#666", whiteSpace:"nowrap" }}>{pesos((Number(q.i.precio) || 0) * (Number(q.i.cant) || 1))}</span>;
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12, flexWrap:"wrap" }}>
        <button onClick={props.onVolver} style={estiloVolver(color)}>← Volver</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ background:(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color+"26", color:(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color, border:"1px solid "+(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color+"66", borderRadius:6, padding:"2px 8px", fontSize:10.5, fontWeight:800, letterSpacing:0.8 }}>{(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).emoji} {(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).nombre.toUpperCase()}</span>
            <span style={{ fontSize:15, fontWeight:800, color:(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color }}>{props.titulo}</span>
          </div>
          <div style={{ fontSize:10, color:"#555" }}>
            {esComandaPrueba(c.id) && <b style={{ color:"#B07CD8" }}>🧪 PRUEBA · </b>}#{c.numero}{c.abierta_at ? " · abierta hace " + hace(c.abierta_at) : ""} · {c.tipo === "mesa" ? "Mozo:" : "Cajero:"}{" "}
            {c.tipo === "mesa" && props.mozos && props.mozos.length > 0 ? (
              <select value={c.mozo || ""} onChange={function(e) { props.onCambiarMozo(e.target.value); }}
                style={{ background:"#161616", color:"#DDD", border:"1px solid #2A2A2A", borderRadius:6, fontSize:11, padding:"2px 4px" }}>
                {(c.mozo && !props.mozos.some(function(m) { return m.nombre === c.mozo; })) && <option value={c.mozo}>{c.mozo}</option>}
                {props.mozos.map(function(m) { return <option key={m.id} value={m.nombre}>{m.nombre}</option>; })}
              </select>
            ) : (c.mozo || "—")}
          </div>
        </div>
      </div>

      {/* Tiempo de entrega prometido (delivery y mostrador) */}
      {c.tipo !== "mesa" && (function() {
        var st = estadoEntrega(props.entrega, props.ahora || Date.now());
        return (
          <div style={{ background:"#0F0F0F", border:"1px solid " + (st ? st.col + "66" : "#1E1E1E"), borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:800, color: st ? st.col : "#999", marginBottom:8 }}>{st ? st.txt : "🕒 Sin tiempo de entrega"}</div>
            {props.entrega && props.entrega.prometida_at && props.onSumarEntrega && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Sumar minutos a la hora prometida</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {[5, 10, 15, 20, 30].map(function(m) { return <button key={m} onClick={function() { props.onSumarEntrega(m); }} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #2A2A2A", background:"#161616", color:"#DDD", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>+{m}</button>; })}
                </div>
              </div>
            )}
            <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Poner o cambiar el tiempo (cuenta desde ahora)</div>
            <ElegirEntrega valor={null} color={color} onElegir={function(m) { props.onEntrega(m); }} />
            {c.tipo === "delivery" && c.telefono && props.entrega && props.entrega.prometida_at && (function() {
              var d = new Date(props.entrega.prometida_at), hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
              var wa = linkWspDelivery(c.telefono, "Hola " + (c.cliente || "") + "! Sumamos lo que pediste a tu pedido de " + (props.localNombre || "") + ". La nueva hora de entrega es aproximadamente a las " + hh + ".");
              return wa ? <a href={wa} target="_blank" rel="noreferrer" style={{ ...GH, display:"inline-block", marginTop:10, padding:"8px 12px", fontSize:12, textDecoration:"none", borderColor:"#25D36688", color:"#5BDB8B" }}>💬 Avisar al cliente la hora de entrega ({hh})</a> : null;
            })()}
          </div>
        );
      })()}

      {/* Historial de la cuenta: cada acción con su hora */}
      <div style={{ marginBottom:10 }}>
        <button onClick={function() { if (historial) setHistorial(null); else sbLeerLogComanda(c.id).then(function(l) { setHistorial(l); }); }}
          style={{ ...GH, padding:"6px 12px", fontSize:11 }}>🕒 {historial ? "Ocultar el historial" : "Ver el historial de esta cuenta"}</button>
        {historial && (
          <div style={{ background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:10, padding:"8px 10px", marginTop:8 }}>
            {historial.length === 0 ? <div style={{ fontSize:11, color:"#555" }}>Todavía no hay acciones registradas.</div> : historial.map(function(x, i) {
              return <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:11.5, alignItems:"baseline" }}>
                <span style={{ color:"#4C9A5A", minWidth:58, fontVariantNumeric:"tabular-nums" }}>{horaSeg(x.at)}</span>
                <span style={{ color:"#DDD", flex:1 }}><b>{x.accion}</b>{x.detalle ? " · " + x.detalle : ""} <span style={{ color:"#666" }}>({x.por})</span></span>
              </div>;
            })}
          </div>
        )}
      </div>

      {/* Lo anotado en esta cuenta: descuento, facturación, control */}
      {(extra.descuento || extra.factura || extra.control_at || extra.personas) && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
          {extra.personas && <span style={{ background:"#8B2FC922", border:"1px solid #8B2FC966", color:"#C9A0F0", borderRadius:7, padding:"3px 9px", fontSize:11, fontWeight:700 }}>👥 {extra.personas} {extra.personas === 1 ? "persona" : "personas"}</span>}
          {extra.descuento && descM > 0 && <span style={{ background:"#D4A01722", border:"1px solid #D4A01766", color:"#D4A017", borderRadius:7, padding:"3px 9px", fontSize:11, fontWeight:700 }}>🏷️ Descuento {extra.descuento.tipo === "%" ? extra.descuento.valor + "%" : pesos(extra.descuento.valor)}{extra.descuento.motivo ? " · " + extra.descuento.motivo : ""}</span>}
          {extra.factura && <span style={{ background:"#3A9BC122", border:"1px solid #3A9BC166", color:"#5BB8DC", borderRadius:7, padding:"3px 9px", fontSize:11, fontWeight:700 }}>🧾 A facturar · {extra.factura.tipo === "A" ? "Factura A" + (extra.factura.razon ? " · " + extra.factura.razon : "") : "Consumidor final"}</span>}
          {extra.control_at && <span style={{ background:"#3A7D4422", border:"1px solid #3A7D4466", color:"#8FD19A", borderRadius:7, padding:"3px 9px", fontSize:11, fontWeight:700 }}>🧾 Control pedido hace {hace(extra.control_at)}</span>}
        </div>
      )}

      {/* Opciones de la mesa o del pedido */}
      <div style={{ background:"#0C0C0C", border:"1px solid #1E1E1E", borderRadius:12, padding:"10px", marginBottom:12 }}>
        <div style={{ ...LBL, marginBottom:8 }}>Opciones</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:7 }}>
          {[
            { id:"marchar",  txt:"🔥 Marchar",     sub:pendientes.length ? pendientes.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0) + " para marchar" : "nada para marchar", col:"#E0914A", off:!pendientes.length, fn:function() { pedirMandar(); } },
            { id:"sumar",    txt:"➕ Sumar",  sub:"de la carta",                                                                    col:"#4C9A5A", off:false, fn:function() { setAgregando(true); } },
            { id:"quitar",   txt:"➖ Quitar", sub:"con motivo",                                                                     col:"#E0714A", off:!mios.length, fn:function() { setVentana("quitar"); } },
            { id:"control",  txt:"🧾 Control",      sub:"precuenta",                                                                      col:"#8FD19A", off:!mios.length, fn:function() { setVentana("control"); if (props.onExtra) props.onExtra({ ...extra, control_at:new Date().toISOString() }); } },
            { id:"desc",     txt:"🏷️ Descuento",    sub:props.puedeDescuento === false ? "lo aplica el cajero" : (descM > 0 ? "−" + pesos(descM) : "% o $"),                       col:"#D4A017", off:!mios.length || props.puedeDescuento === false, fn:function() { setVentana("descuento"); } },
            { id:"facturar", txt:"🧾 Facturar",     sub:extra.factura ? "anotado" : "datos de factura",                                    col:"#5BB8DC", off:!mios.length, fn:function() { setVentana("factura"); } },
          ].concat([{ id:"anular", txt:"🚫 Anular", sub:props.puedeDescuento === false ? "lo anula el cajero" : "toda la cuenta", col:"#E0452E", off:props.puedeDescuento === false, fn:function() { setVentana("anular"); } }]).concat(c.tipo === "mesa" ? [{ id:"personas", txt:"👥 Personas", sub:extra.personas ? extra.personas + " en la mesa" : "cuántos son", col:"#C9A0F0", fn:function() { setVentana("personas"); } }] : []).map(function(b) {
            return (
              <button key={b.id} disabled={b.off} onClick={b.fn}
                style={{ padding:"10px 4px", borderRadius:9, border:"1px solid "+(b.off ? "#1E1E1E" : b.col+"66"), background:b.off ? "#0E0E0E" : b.col+"14", color:b.off ? "#444" : b.col, fontFamily:"'Inter',sans-serif", cursor:b.off ? "not-allowed" : "pointer", textAlign:"center", lineHeight:1.25 }}>
                <div style={{ fontSize:12.5, fontWeight:800 }}>{b.txt}</div>
                <div style={{ fontSize:9.5, fontWeight:500, opacity:0.85, marginTop:1 }}>{b.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lo cargado y todavía no mandado */}
      {pendientes.length > 0 && (
        <div style={{ background:"#0F0F0F", border:"1px dashed "+color+"55", borderRadius:12, padding:"12px", marginBottom:12 }}>
          <div style={LBL}>Sin marchar</div>
          {pendientes.map(function(i) {
            return (
              <div key={i.id} style={{ marginBottom:7 }}>
                <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                  <button onClick={function() {
                      var n = (Number(i.cant) || 1) - 1;
                      if (n <= 0) props.onBorrarItem(i.id); else props.onGuardarItems([{ ...i, cant:n }]);
                    }}
                    style={{ width:28, height:28, borderRadius:7, border:"1px solid #2A2A2A", background:"#111", color:"#888", fontSize:15, cursor:"pointer", flex:"none" }}>−</button>
                  <span style={{ fontSize:14, fontWeight:800, color:"#F0EDE8", minWidth:22, textAlign:"center" }}>{i.cant}</span>
                  <button onClick={function() { props.onGuardarItems([{ ...i, cant:(Number(i.cant) || 1) + 1 }]); }}
                    style={{ width:28, height:28, borderRadius:7, border:"1px solid #2A2A2A", background:"#111", color:"#888", fontSize:15, cursor:"pointer", flex:"none" }}>+</button>
                  <span style={{ fontSize:13, color:"#F0EDE8", flex:1, minWidth:0 }}>{i.nombre}</span>
                  {PrecioItem({ i:i })}
                  <button onClick={function() { props.onGuardarItems([{ ...i, nota:notaConMarca(notaVisible(i), !esEntrada(i)) }]); }} title="Marcar como entrada (sale primero y tiene su propio contador)"
                    style={{ background: esEntrada(i) ? "#4C9A5A" : "none", border:"1px solid " + (esEntrada(i) ? "#4C9A5A" : "#2A2A2A"), borderRadius:6, padding:"3px 8px", color: esEntrada(i) ? "#fff" : "#777", fontSize:11, fontWeight: esEntrada(i) ? 800 : 400, cursor:"pointer", whiteSpace:"nowrap" }}>🥗 entrada</button>
                  <button onClick={function() { setNotaDe(notaDe === i.id ? null : i.id); }} title="Aclaración"
                    style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:notaVisible(i)?color:"#555", fontSize:11, cursor:"pointer" }}>✎</button>
                </div>
                {(notaDe === i.id || notaVisible(i)) && (
                  <input defaultValue={notaVisible(i)} placeholder="Sin cebolla, bien cocido…"
                    onBlur={function(e) { var v = e.target.value.trim(); if (v !== notaVisible(i)) props.onGuardarItems([{ ...i, nota:notaConMarca(v, esEntrada(i)) }]); }}
                    style={{ ...INP, fontSize:12, marginTop:5, marginLeft:70, width:"calc(100% - 70px)" }} />
                )}
              </div>
            );
          })}
          <button onClick={function() { pedirMandar(); }}
            style={{ width:"100%", marginTop:8, padding:"12px", borderRadius:9, border:"none", background:color, color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer" }}>
            🔔 Marchar ({pendientes.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0)})
          </button>
        </div>
      )}

      {/* Agregar de la carta */}
      {!agregando ? (
        <button onClick={function() { setAgregando(true); }}
          style={{ width:"100%", padding:"12px", borderRadius:10, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer", marginBottom:12 }}>
          + Agregar de la carta
        </button>
      ) : (
        <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"12px", marginBottom:12 }}>
          <div style={{ display:"flex", gap:7, marginBottom:9 }}>
            <input value={busqueda} onChange={function(e) { setBusqueda(e.target.value); }} placeholder="Buscar…" style={{ ...INP, fontSize:12 }} />
            <button onClick={function() { setAgregando(false); setBusqueda(""); }} style={{ ...GH, padding:"8px 13px", fontSize:12 }}>Listo</button>
          </div>
          {delLocal.length === 0 ? (
            <div style={{ fontSize:12, color:"#8A6055", lineHeight:1.6 }}>
              Este local todavía no tiene carta cargada. Se carga en la pestaña 📖 Carta.
            </div>
          ) : q ? (
            <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:340, overflowY:"auto" }}>
              <RejillaPlatos>{platos.map(function(x, i) { return <VentanaPlato key={x.id} x={x} col={colorDePlato(x, i, props.colores)} n={cantPend(x)} onClick={function() { agregar(x); }} />; })}</RejillaPlatos>
              {platos.length === 0 && <div style={{ fontSize:11, color:"#444", padding:"6px 0" }}>Nada con ese nombre.</div>}
            </div>
          ) : (
            <div>
              {ruta.length === 0 && <div style={{ fontSize:11, color:"#666", marginBottom:8 }}>Tocá una categoría para ver lo que hay adentro, o buscá por el nombre.</div>}
              <ArbolCarta cats={cats} ruta={ruta} setRuta={setRuta} colores={props.colores}
                contar={function(nodo) { return delLocal.filter(function(x) { return dentroDe(x.categoria, nodo); }).length; }}
                renderPlatos={function(nodo, col) {
                  return <RejillaPlatos alto={440}>{platos.map(function(x, i) { return <VentanaPlato key={x.id} x={x} col={colorDePlato(x, i, props.colores)} n={cantPend(x)} onClick={function() { agregar(x); }} />; })}</RejillaPlatos>;
                }} />
            </div>
          )}
        </div>
      )}

      {/* Lo que ya está en la cocina: una sola ventana por mesa, con lo que ya salió tachado y lo nuevo abajo. El contador sigue desde el primer pedido. */}
      {rondas.length > 0 && (function() {
        var rondasAsc = rondas.slice().sort(function(x, y) { return (x.ronda || 0) - (y.ronda || 0); });
        var primero = mandados.reduce(function(a, i) { return i.enviado_at && (!a || i.enviado_at < a) ? i.enviado_at : a; }, null);
        var hayEnviado = mandados.some(function(i) { return i.estado === "enviado"; });
        var min = hayEnviado ? minutosDesde(primero) : null;
        var col = min === null ? "#3A7D44" : colorDemora(min, props.limite);
        var todoEntregado = mandados.every(function(i) { return i.estado === "listo" || i.estado === "entregado"; });   // la cocina ya entregó todo
        return (
          <div style={{ background:"#111", border:"1px solid "+col+"55", borderRadius:10, padding:"11px 12px", marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, gap:9 }}>
              <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1 }}>
                Pedido{primero ? " · desde " + fmtHora(primero) : ""}
              </div>
              <div style={{ fontSize:13, fontWeight:800, color:col, whiteSpace:"nowrap" }}>
                {todoEntregado ? "✅ la cocina entregó el pedido" : hayEnviado ? "⏱ " + min + " min la mesa" : ""}
              </div>
            </div>
            {rondasAsc.map(function(r) {
              var entregada = r.items.every(function(i) { return i.estado === "listo" || i.estado === "entregado"; });
              var listoR = r.items.some(function(i) { return i.estado === "listo"; });
              return (
                <div key={r.ronda} style={{ marginBottom:6 }}>
                  {(function() {
                    // Cada parte tiene su propio contador: el pedido original, cada agregado y cada curso (entrada / principal) cuentan desde su propio arranque;
                    // lo principal arranca cuando la cocina entregó la entrada. El contador global de la mesa está arriba, desde el primer pedido.
                    var inf = infoCurso(mios, r.ronda || 0, props.listos, props.extra && props.extra.salidas);
                    if (rondasAsc.length <= 1 && !inf.curso) return null;
                    var pendiente = r.items.some(function(i) { return i.estado === "enviado"; });
                    var ini = inf.inicio || r.enviado_at;
                    var minR = pendiente && !inf.espera ? minutosDesde(ini) : null;
                    var recR = props.listos && props.listos[c.id + "|" + (r.ronda || 0)];
                    var fin = entregada ? (recR && recR.listo_at ? recR.listo_at : r.items.reduce(function(a, i) { return i.entregado_at && i.entregado_at > a ? i.entregado_at : a; }, "")) : "";
                    var tardo = entregada && fin && ini ? Math.round((new Date(fin) - new Date(ini)) / 60000) : null;
                    var nombreTanda = inf.curso === "entrada" ? "🥗 Entrada" : inf.curso === "principal" ? "🍽️ Principal" : ((r.ronda || 0) > 1 ? "➕ " : "") + "Tanda " + r.ronda;
                    return <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, margin:"6px 0 2px", fontSize:10, fontWeight:800, letterSpacing:0.8, textTransform:"uppercase", color: inf.curso === "entrada" ? "#8FD19A" : inf.curso === "principal" ? "#7CC4E4" : (r.ronda || 0) > 1 ? "#D4A017" : "#6E6E6E" }}>
                      <span>{nombreTanda}{!inf.espera && ini ? " · " + fmtHora(ini) : ""}{c.tipo === "mesa" && props.extra && props.extra.salidas && props.extra.salidas[r.ronda || 0] && <span style={{ marginLeft:6, color:"#fff", background: props.extra.salidas[r.ronda || 0] === "junto" ? "#E0652E" : "#3A9BC1", borderRadius:5, padding:"0 6px", fontSize:10 }}>{props.extra.salidas[r.ronda || 0] === "junto" ? "🔥 todo junto" : "📋 por orden"}</span>}</span>
                      <span style={{ fontSize:12, color: entregada ? "#4C9A5A" : inf.espera ? "#D4A017" : minR !== null ? colorDemora(minR, props.limite) : "#4C9A5A", textTransform:"none", letterSpacing:0 }}>
                        {entregada ? "✅ la cocina entregó" + (tardo !== null && tardo >= 0 ? " · tardó " + tardo + " min" : "") : inf.espera ? (inf.curso === "principal" ? "⏳ espera que salga la entrada" : "⏳ espera que salga lo anterior") : pendiente ? "⏱ " + minR + " min" : listoR ? "🍽️ lista para llevar" : ""}
                      </span>
                    </div>;
                  })()}
                  {r.items.map(function(i) {
              var listo = false;
              return (
                <div key={i.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"4px 0", opacity:listo?0.5:1 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#888", minWidth:24 }}>{i.cant}x</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:"#F0EDE8", textDecoration:listo?"line-through":"none" }}>{i.nombre}</div>
                    {esEntrada(i) && <span style={{ display:"inline-block", background:"#4C9A5A33", color:"#8FD19A", border:"1px solid #4C9A5A", borderRadius:5, padding:"0 6px", fontSize:10, fontWeight:900, marginRight:5 }}>🥗 ENTRADA</span>}
                    {notaVisible(i) && <div style={{ fontSize:11, color:"#D4A017" }}>▸ {notaVisible(i)}</div>}
                  </div>
                  {PrecioItem({ i:i, chico:true })}
                  {i.estado === "enviado" && <button onClick={function() { setCambiando(i); }} title="Cambiar por otro producto" style={{ background:"none", border:"1px solid #D4A01766", borderRadius:6, padding:"3px 8px", color:"#D4A017", fontSize:11, cursor:"pointer", whiteSpace:"nowrap" }}>🔄 cambiar</button>}
                  {i.estado === "enviado"
                    ? <span title="La cocina todavía no lo entregó" style={{ border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 9px", color:"#777", fontSize:11, whiteSpace:"nowrap" }}>⏳ en cocina</span>
                    : esBarra(i)
                      ? <span title="Salió en la comanda de barra" style={{ border:"1px solid #B07CD866", borderRadius:6, padding:"3px 9px", color:"#B07CD8", fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>🥤 barra</span>
                      : <span title="La cocina ya lo entregó" style={{ border:"1px solid #3A7D4466", borderRadius:6, padding:"3px 9px", color:"#4C9A5A", fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>✅ cocina</span>}
                </div>
              );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Total y cierre */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:9, marginTop:14, padding:"12px 13px", background:"#0F0F0F", border:"1px solid #1A1A1A", borderRadius:10 }}>
        <div>
          <div style={{ fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1 }}>Total</div>
          {descM > 0 && <div style={{ fontSize:11, color:"#8C8C8C" }}>Subtotal {pesos(subtotal)} · <span style={{ color:"#D4A017" }}>descuento −{pesos(descM)}</span></div>}
          <div style={{ fontSize:20, fontWeight:800, color:"#F0EDE8" }}>{pesos(total)}</div>
        </div>
        <button onClick={function() { props.onCerrar(total, pendientes.length, subtotal, descM); }}
          style={{ padding:"11px 18px", borderRadius:9, border:"none", background:mios.length?"#3A7D44":"#1A1A1A", color:mios.length?"#fff":"#555", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer" }}>
          {c.tipo === "delivery" ? "Cerrar delivery" : (c.tipo === "mostrador" ? "Cerrar pedido" : "Cerrar mesa")}
        </button>
      </div>

      {ventana === "quitar" && <VentanaQuitar items={mios} onCerrar={function() { setVentana(null); }} onQuitar={quitar} />}
      {ventana === "anular" && <VentanaAnular titulo={props.titulo} cantItems={mios.length} onCerrar={function() { setVentana(null); }} onAnular={function(m) { setVentana(null); if (props.onAnular) props.onAnular(m); }} />}
      {ventana === "personas" && <ElegirPersonas titulo={props.titulo} color={color} actual={extra.personas}
        onElegir={function(n) { setVentana(null); if (props.onExtra) props.onExtra({ ...extra, personas:n }); }} onCancelar={function() { setVentana(null); }} />}
      {ventana === "control" && <VentanaControl titulo={props.titulo} localNombre={props.localNombre} items={mios} subtotal={subtotal} descuento={descM} motivoDesc={extra.descuento && extra.descuento.motivo} total={total} personas={extra.personas} onImprimirControl={props.onImprimirControl} onCerrar={function() { setVentana(null); }} />}
      {preguntaTiempoExtra && (function() {
        var st = estadoEntrega(props.entrega, props.ahora || Date.now());
        var ir = function(fn) { setPreguntaTiempoExtra(false); if (fn) fn(); seguirTrasTiempo(); };
        return (
          <Ventana titulo="🕒 El cliente sumó algo: ¿cambia el tiempo?" onCerrar={function() { setPreguntaTiempoExtra(false); }}>
            <div style={{ fontSize:13, color:"#C8C8C8", lineHeight:1.5, marginBottom:8 }}>El pedido ya está en marcha y le estás sumando {pendientes.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0)} producto{pendientes.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0) === 1 ? "" : "s"}. ¿Querés cambiar el tiempo de entrega que le prometiste?</div>
            {st && <div style={{ fontSize:13, fontWeight:800, color:st.col, marginBottom:10 }}>Ahora: {st.txt}</div>}
            <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Sumar minutos a la hora prometida</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
              {[5, 10, 15, 20, 30].map(function(m) {
                return <button key={m} onClick={function() { ir(function() { if (props.onSumarEntrega) props.onSumarEntrega(m); }); }} style={{ flex:"1 1 60px", padding:"14px 6px", borderRadius:10, border:"2px solid " + props.color, background:props.color + "22", color:props.color, fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:900, cursor:"pointer" }}>+{m} min</button>;
              })}
            </div>
            <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>O un tiempo nuevo, desde ahora</div>
            <div style={{ marginBottom:12 }}><ElegirEntrega valor={null} color={props.color} onElegir={function(m) { ir(function() { if (props.onEntrega) props.onEntrega(m); }); }} /></div>
            <button onClick={function() { ir(null); }} style={{ width:"100%", padding:"13px", borderRadius:10, border:"1px solid #3A7D44", background:"#3A7D4422", color:"#8FD19A", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:8 }}>Dejar el tiempo como está</button>
            <button onClick={function() { setPreguntaTiempoExtra(false); }} style={{ ...GH, width:"100%", padding:"10px", fontSize:12 }}>Cancelar (no mandar todavía)</button>
          </Ventana>
        );
      })()}
      {preguntaEntrega && (
        <Ventana titulo="Último paso: pago y tiempo" onCerrar={function() { setPreguntaEntrega(false); }}>
          <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>💳 ¿Cómo paga el cliente?</div>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[["efectivo", "💵 Efectivo al recibir"], ["transferencia", "📲 Transferencia al local"]].map(function(m) {
              var act = medioDel === m[0];
              return <button key={m[0]} onClick={function() { setMedioDel(m[0]); }} style={{ flex:1, padding:"12px 6px", borderRadius:10, border:"2px solid " + (act ? props.color : "#2A2A2A"), background: act ? props.color + "26" : "#111", color: act ? "#fff" : "#9A9A9A", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer" }}>{m[1]}</button>;
            })}
          </div>
          {medioDel === "transferencia" && <div style={{ fontSize:12, color:"#B07CD8", lineHeight:1.5, margin:"-6px 0 12px" }}>El cliente transfiere al local. Cuando te llegue, tocá «Confirmar transferencia recibida» en el pedido: hasta entonces no se puede despachar.</div>}
          <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>🕒 ¿En cuánto tiempo se entrega? (se cuenta desde que marchás)</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            {ENTREGA_OPCIONES.map(function(m) {
              return <button key={m} onClick={function() { setPreguntaEntrega(false); if (props.onEntrega) props.onEntrega(m); if (props.onMedioPago) props.onMedioPago(medioDel); mandar(); }} style={{ flex:"1 1 70px", padding:"16px 8px", borderRadius:11, border:"2px solid " + props.color, background:props.color + "22", color:props.color, fontFamily:"'Inter',sans-serif", fontSize:17, fontWeight:900, cursor:"pointer" }}>{m} min</button>;
            })}
          </div>
          <button onClick={function() { setPreguntaEntrega(false); }} style={{ ...GH, width:"100%", padding:"10px", fontSize:12 }}>Cancelar</button>
        </Ventana>
      )}
      {preguntaSalida && (
        <Ventana titulo="¿Cómo sale lo nuevo?" onCerrar={function() { setPreguntaSalida(false); }}>
          <div style={{ fontSize:13, color:"#C8C8C8", lineHeight:1.5, marginBottom:12 }}>Esta mesa ya tiene pedidos en la cocina. Lo que estás mandando ahora, ¿sale <b>todo junto</b> con lo anterior o <b>por orden de comanda</b>? La cocina lo ve bien resaltado.</div>
          <button onClick={function() { setPreguntaSalida(false); mandar("junto"); }} style={{ width:"100%", padding:"16px", borderRadius:11, border:"none", background:"#E0652E", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:900, cursor:"pointer", marginBottom:8 }}>🔥 TODO JUNTO<div style={{ fontSize:11, fontWeight:600, opacity:0.9 }}>sale con lo que ya está en la cocina</div></button>
          <button onClick={function() { setPreguntaSalida(false); mandar("orden"); }} style={{ width:"100%", padding:"16px", borderRadius:11, border:"none", background:"#3A9BC1", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:900, cursor:"pointer", marginBottom:8 }}>📋 POR ORDEN DE COMANDA<div style={{ fontSize:11, fontWeight:600, opacity:0.9 }}>sale después de lo anterior</div></button>
          <button onClick={function() { setPreguntaSalida(false); }} style={{ ...GH, width:"100%", padding:"10px", fontSize:12 }}>Cancelar</button>
        </Ventana>
      )}
      {cambiando && <VentanaCambiar item={cambiando} cats={cats} delLocal={delLocal} colores={props.colores} onElegir={function(pl) { cambiarPor(cambiando, pl); }} onCerrar={function() { setCambiando(null); }} />}
      {ventana === "descuento" && <VentanaDescuento subtotal={subtotal} descuento={extra.descuento} onCerrar={function() { setVentana(null); }} onGuardar={function(d) { var e = { ...extra }; if (d) e.descuento = { ...d, por:props.usuario || "" }; else delete e.descuento; if (props.onExtra) props.onExtra(e); setVentana(null); }} />}
      {ventana === "factura" && <VentanaFactura factura={extra.factura} onCerrar={function() { setVentana(null); }} onGuardar={function(f) { var e = { ...extra }; if (f) e.factura = f; else delete e.factura; if (props.onExtra) props.onExtra(e); setVentana(null); }} />}
    </div>
  );
}

// Los tres formularios viven acá afuera y no adentro de PanelComandas. Definidos
// adentro, cada render del panel crea funciones nuevas, React las toma por
// componentes distintos y los vuelve a montar: con el refresco cada 20 segundos,
// eso le borra a cualquiera lo que esté tipeando. Cargar 75 precios así es imposible.
// La carta del local para consultar (cajeros y mozos): categorías, platos y precios. No se edita desde acá.
// Cada categoría de la carta es una ventana de su propio color: se toca y se abre con todos sus platos.
var COLORES_CATEGORIA = ["#E0714A", "#4C9A5A", "#3A9BC1", "#D4A017", "#B07CD8", "#E0527A", "#2FB5A0", "#8FA3B0", "#C77DA8", "#A98B62", "#6C8CE0", "#9ACD32"];
function colorCategoria(cats, cat) { var i = cats.indexOf(cat); return COLORES_CATEGORIA[(i < 0 ? 0 : i) % COLORES_CATEGORIA.length]; }
// «21 tapeos», «10 vinos», «4 postres»: la cantidad con el nombre de la categoría (en singular si es uno solo).
function rotuloCat(cat, n) {
  var nom = String(cat || "").toLowerCase().trim();
  if (n === 1 && nom.length > 3 && /s$/.test(nom)) nom = nom.slice(0, -1);
  return nom;
}
function VentanasCategorias(props) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:9 }}>
      {props.categorias.map(function(cat) {
        var col = props.colorDe ? props.colorDe(cat) : colorCategoria(props.categorias, cat), n = props.conteo(cat);
        return (
          <button key={cat} onClick={function() { props.onElegir(cat); }}
            style={{ textAlign:"left", minHeight:84, padding:"13px 13px", borderRadius:12, border:"2px solid " + col + "88", background:"linear-gradient(145deg, " + col + "30, " + col + "10)", color:"#F0EDE8", fontFamily:"'Inter',sans-serif", cursor:"pointer", display:"flex", flexDirection:"column", justifyContent:"space-between", gap:8 }}>
            <span style={{ fontSize:15, fontWeight:800, lineHeight:1.2, color:col, wordBreak:"break-word" }}>{cat}</span>
            <span style={{ fontSize:11.5, color:"#C8C8C8" }}>{n} {rotuloCat(cat, n)} ›</span>
          </button>
        );
      })}
    </div>
  );
}

// Cada plato o bebida también es una ventana del color de su categoría: nombre y precio; si se toca, se agrega a la cuenta.
function VentanaPlato(props) {
  var x = props.x, col = props.col || "#8FA3B0", fuera = x.activo === false;
  var sinPrecio = x.precio === null || x.precio === undefined || x.precio === "";
  var Tag = props.onClick ? "button" : "div";
  return (
    <Tag onClick={props.onClick}
      style={{ position:"relative", textAlign:"left", minHeight:78, padding:"11px 12px", borderRadius:12, border:"2px solid " + col + "77", background:"linear-gradient(145deg, " + col + "26, " + col + "0D)", color:"#F0EDE8", fontFamily:"'Inter',sans-serif", cursor: props.onClick ? "pointer" : "default", display:"flex", flexDirection:"column", justifyContent:"space-between", gap:7, opacity: fuera ? 0.45 : 1 }}>
      <span style={{ fontSize:13.5, fontWeight:800, lineHeight:1.25, wordBreak:"break-word", textDecoration: fuera ? "line-through" : "none" }}>{x.nombre}</span>
      <span style={{ fontSize:13, fontWeight:800, color: sinPrecio ? "#D4A017" : col }}>{sinPrecio ? "sin precio" : pesos(x.precio)}{fuera && <span style={{ fontSize:10, color:"#E0714A", marginLeft:6, fontWeight:600 }}>fuera de la carta</span>}</span>
      {props.n > 0 && <span style={{ position:"absolute", top:6, right:8, background:col, color:"#0D0D0D", borderRadius:10, padding:"1px 8px", fontSize:12, fontWeight:900 }}>×{props.n}</span>}
    </Tag>
  );
}
// El color de la ventana de un plato: el que se le eligió; si no, el de su categoría si se la pintó; y si no, uno de la paleta que va rotando,
// para que las ventanas se distingan una de otra.
function colorDePlato(x, i, colores, base) {
  var c = colores || { cats: {}, platos: {} };
  if (c.platos[x.id]) return c.platos[x.id];
  if (c.cats[x.categoria]) return c.cats[x.categoria];
  return COLORES_CATEGORIA[((i || 0) + (base || 0)) % COLORES_CATEGORIA.length];
}
function RejillaPlatos(props) {
  return <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:9, maxHeight:props.alto || "none", overflowY: props.alto ? "auto" : "visible", paddingRight: props.alto ? 2 : 0 }}>{props.children}</div>;
}
// Niveles de la carta: una categoría puede tener subcategorías, y estas otras, sin límite. El camino se guarda en el mismo campo
// `categoria` separado con « › » (ej: «Pizzas › Especiales»), así no hace falta ninguna columna nueva y todo lo que ya existía sigue igual.
var NIV = " › ";
function hijosDe(cats, ruta) {
  var pref = ruta.length ? ruta.join(NIV) + NIV : "", out = [];
  cats.forEach(function(c) {
    if (c.indexOf(pref) === 0 && c.length > pref.length) { var nom = c.slice(pref.length).split(NIV)[0]; if (out.indexOf(nom) < 0) out.push(nom); }
  });
  return out;
}
// ¿Esta categoría es `nodo` o está adentro de él?
function dentroDe(cat, nodo) { return cat === nodo || String(cat).indexOf(nodo + NIV) === 0; }
// Navega los niveles: ventanas de colores con lo que hay adentro y, si ese nivel tiene platos propios, la lista de platos.
// props: cats (caminos completos), ruta/setRuta, contar(nodo), renderPlatos(nodo), extra(nodo) (controles propios del nivel).
function ArbolCarta(props) {
  var cats = props.cats, ruta = props.ruta, setRuta = props.setRuta, colores = props.colores || { cats: {}, platos: {} };
  var hijos = hijosDe(cats, ruta), nodo = ruta.join(NIV);
  // El color de un nivel: el que se le eligió o, si no, uno de la paleta según su lugar entre los de su mismo nivel.
  function colorDe(path) {
    if (colores.cats[path]) return colores.cats[path];
    var partes = path.split(NIV);
    return colorCategoria(hijosDe(cats, partes.slice(0, -1)), partes[partes.length - 1]);
  }
  var col = ruta.length ? colorDe(nodo) : "#999";
  return (
    <div>
      {ruta.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:"10px 12px", borderRadius:12, border:"2px solid " + col + "88", background:col + "1A", flexWrap:"wrap" }}>
          <button onClick={function() { setRuta(ruta.slice(0, -1)); }} style={estiloVolver(col)}>← Volver</button>
          <span style={{ fontSize:16, fontWeight:800, color:col, flex:1, minWidth:0, wordBreak:"break-word" }}>{ruta.join(" › ")}</span>
        </div>
      )}
      {ruta.length > 0 && props.extra && props.extra(nodo, col)}
      {hijos.length > 0 && (
        <div style={{ marginBottom:12 }}>
          {ruta.length > 0 && <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1.5, marginBottom:7 }}>Subcategorías</div>}
          <VentanasCategorias categorias={hijos} colorDe={function(nom) { return colorDe(nodo ? nodo + NIV + nom : nom); }} conteo={function(nom) { return props.contar(nodo ? nodo + NIV + nom : nom); }} onElegir={function(nom) { setRuta(ruta.concat([nom])); }} />
        </div>
      )}
      {ruta.length > 0 && cats.indexOf(nodo) >= 0 && props.renderPlatos(nodo, col)}
    </div>
  );
}

function CartaConsulta(props) {
  var localId = props.localId, color = props.color, carta = props.carta, colores = props.colores || { cats: {}, platos: {} };
  var [buscar, setBuscar] = useState("");
  var [ruta, setRuta] = useState([]);
  var delLocal = carta.filter(function(x) { return x.local === localId; });
  var q = buscar.trim().toLowerCase();
  var minOrden = {};
  delLocal.forEach(function(x) {
    var o = x.orden === null || x.orden === undefined ? 9999 : x.orden;
    if (minOrden[x.categoria] === undefined || o < minOrden[x.categoria]) minOrden[x.categoria] = o;
  });
  var categorias = Object.keys(minOrden).sort(function(a, b) { return minOrden[a] !== minOrden[b] ? minOrden[a] - minOrden[b] : a.localeCompare(b); });
  function bloque(cat, conTitulo) {
    var platos = delLocal.filter(function(x) { return x.categoria === cat && (!q || String(x.nombre || "").toLowerCase().indexOf(q) !== -1); })
      .sort(function(a, b) { return (a.orden || 0) - (b.orden || 0) || String(a.nombre).localeCompare(String(b.nombre)); });
    if (!platos.length) return null;
    var col = colorCategoria(hijosDe(categorias, []), cat.split(NIV)[0]);
    return (
      <div key={cat} style={{ marginBottom:14 }}>
        {conTitulo && <div style={{ fontSize:11, fontWeight:800, color:col, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>{cat}</div>}
        <RejillaPlatos>{platos.map(function(x, i) { return <VentanaPlato key={x.id} x={x} col={colorDePlato(x, i, colores)} />; })}</RejillaPlatos>
      </div>
    );
  }
  return (
    <div>
      <input value={buscar} onChange={function(e) { setBuscar(e.target.value); }} placeholder="🔎 Buscar…" style={{ ...INP, marginBottom:12 }} />
      {delLocal.length === 0 && <div style={{ textAlign:"center", padding:"30px 0", color:"#666", fontSize:13 }}>Este local todavía no tiene carta cargada.</div>}
      {q && categorias.map(function(cat) { return bloque(cat, true); })}
      {!q && delLocal.length > 0 && (
        <ArbolCarta cats={categorias} ruta={ruta} setRuta={setRuta} colores={colores}
          contar={function(nodo) { return delLocal.filter(function(x) { return dentroDe(x.categoria, nodo) && x.activo !== false; }).length; }}
          renderPlatos={function(nodo) { return bloque(nodo, false); }} />
      )}
    </div>
  );
}

function Carta(props) {
  var localId = props.localId, local = props.local, color = props.color;
  var carta = props.carta, setCarta = props.setCarta, cargarCarta = props.cargarCarta;
  var p = { menuStock: props.menuStock };
  var colores = props.colores || { cats: {}, platos: {} }, setColores = props.setColores || function() {};
  // Elegir (o quitar) el color de una categoría (por camino) o de un plato (por id).
  function ponerColor(tipo, clave, color) {
    var nuevo = { cats: { ...colores.cats }, platos: { ...colores.platos } };
    if (color) nuevo[tipo][clave] = color; else delete nuevo[tipo][clave];
    setColores(nuevo); sbGuardarColoresCarta(localId, nuevo);
  }

    var [nuevoPlato, setNuevoPlato] = useState({});
    var [nuevaCat, setNuevaCat] = useState("");
    var [ruta, setRuta] = useState([]);   // por qué niveles de la carta se va navegando (vacío = las ventanas de arriba)
    var [nuevaSub, setNuevaSub] = useState("");
    var [trayendo, setTrayendo] = useState(false);

    var delLocal = carta.filter(function(x) { return x.local === localId; });
    // Las categorías van en el orden de la carta —entradas, pizzas, principales, y las
    // bebidas al final—, no alfabético: alfabético pondría las ensaladas antes que las
    // entradas y una carta no se lee así.
    //
    // El orden sale del `orden` más chico de cada categoría, que es lo que permite
    // cargar una carta entera respetando la impresa: se numeran los platos de corrido
    // y las categorías quedan ordenadas solas. Cuando los platos vienen del menú de
    // stock el `orden` es el índice dentro de la categoría, así que todas empatan en
    // cero y decide el orden del menú, como antes. Lo que no esté en ninguno va último.
    var ordenMenu = Object.keys((p.menuStock || {})[localId] || {});
    var minOrden = {};
    delLocal.forEach(function(x) {
      var o = x.orden === null || x.orden === undefined ? 9999 : x.orden;
      if (minOrden[x.categoria] === undefined || o < minOrden[x.categoria]) minOrden[x.categoria] = o;
    });
    var categorias = Object.keys(minOrden);
    categorias.sort(function(a, b) {
      if (minOrden[a] !== minOrden[b]) return minOrden[a] - minOrden[b];
      var ia = ordenMenu.indexOf(a), ib = ordenMenu.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    var sinPrecio = delLocal.filter(function(x) { return x.precio === null || x.precio === undefined || x.precio === ""; }).length;

    function guardarPlato(x) {
      setCarta(function(prev) {
        var f = prev.filter(function(y) { return y.id !== x.id; });
        return f.concat([x]);
      });
      sbSaveCarta(x).then(function(err) {
        if (err) alert("No se pudo guardar el producto:\n\n" + err + "\n\nSi el error menciona la tabla carta, hay que crearla en Supabase (el SQL está en el README).");
      });
    }
    function borrarPlato(x) {
      if (!window.confirm("¿Sacar \"" + x.nombre + "\" de la carta?")) return;
      setCarta(function(prev) { return prev.filter(function(y) { return y.id !== x.id; }); });
      sbDeleteCarta(x.id);
    }
    // Categorías: cambiarles el nombre (se les cambia a todos sus platos) o borrarlas enteras, con sus platos.
    // Renombrar o borrar un nivel afecta también a todo lo que tiene adentro (subcategorías y platos).
    function renombrarCat(nodo) {
      var partes = nodo.split(NIV), ultimo = partes[partes.length - 1];
      var nuevo = window.prompt("Nuevo nombre para «" + ultimo + "»:", ultimo);
      if (nuevo === null) return;
      nuevo = nuevo.replace(/ › /g, " - ").trim();
      if (!nuevo || nuevo === ultimo) return;
      var nuevoNodo = partes.slice(0, -1).concat([nuevo]).join(NIV);
      if (categorias.some(function(c) { return dentroDe(c, nuevoNodo); })) { alert("Ya existe «" + nuevo + "» en ese lugar. Para juntarlas, movés los productos de una a la otra."); return; }
      var cambiados = delLocal.filter(function(x) { return dentroDe(x.categoria, nodo); }).map(function(x) { return { ...x, categoria:nuevoNodo + x.categoria.slice(nodo.length) }; });
      setCarta(function(prev) { return prev.filter(function(y) { return !(y.local === localId && dentroDe(y.categoria, nodo)); }).concat(cambiados); });
      var remap = {}; Object.keys(colores.cats).forEach(function(k) { remap[dentroDe(k, nodo) ? nuevoNodo + k.slice(nodo.length) : k] = colores.cats[k]; });
      if (JSON.stringify(remap) !== JSON.stringify(colores.cats)) { var nc = { cats: remap, platos: colores.platos }; setColores(nc); sbGuardarColoresCarta(localId, nc); }
      if (ruta.join(NIV) === nodo || ruta.join(NIV).indexOf(nodo + NIV) === 0) setRuta(nuevoNodo.split(NIV).concat(ruta.slice(partes.length)));
      sbSaveCartaMuchos(cambiados).then(function(err) { if (err) { alert("No se pudo cambiar el nombre:\n\n" + String(err).slice(0, 200)); cargarCarta(); } });
    }
    function borrarCat(nodo) {
      var platosCat = delLocal.filter(function(x) { return dentroDe(x.categoria, nodo); });
      var subs = hijosDe(categorias, nodo.split(NIV)).length;
      if (!window.confirm("¿Borrar «" + nodo.split(NIV).pop() + "»" + (subs ? " con sus " + subs + " subcategoría" + (subs === 1 ? "" : "s") : "") + " y sus " + platosCat.length + " producto" + (platosCat.length === 1 ? "" : "s") + "?\n\nSi solo querés cambiar un producto de lugar, usá la flecha ↪ del producto. No se puede deshacer.")) return;
      setCarta(function(prev) { return prev.filter(function(y) { return !(y.local === localId && dentroDe(y.categoria, nodo)); }); });
      setRuta(nodo.split(NIV).slice(0, -1));
      platosCat.forEach(function(x) { sbDeleteCarta(x.id); });
    }
    // Una subcategoría nace con un plato de ejemplo, igual que una categoría nueva: la carta guarda platos, no categorías vacías.
    function crearSub(nodo) {
      var nom = nuevaSub.replace(/ › /g, " - ").trim();
      if (!nom) return;
      var camino = nodo + NIV + nom;
      if (categorias.some(function(c) { return dentroDe(c, camino); })) { alert("Ya hay una subcategoría «" + nom + "» acá."); return; }
      guardarPlato({ id:"carta_" + localId + "_" + Date.now(), local:localId, categoria:camino, nombre:"Nuevo", precio:null, activo:true, orden:0 });
      setNuevaSub(""); setRuta(nodo.split(NIV).concat([nom]));
    }
    // La carta que cada local tiene publicada en Maxirest (Kusama y Colantonio's), con sus precios. Se suma lo que falte, sin tocar lo que ya hay:
    // un plato se considera repetido si ya existe uno con el mismo nombre, y los ya cargados desde acá conservan lo que se les haya editado.
    var cartaMx = CARTAS_MAXIREST[localId] || null;
    var [cargandoMx, setCargandoMx] = useState(false);
    function cargarDeMaxirest() {
      if (!cartaMx) return;
      var nombres = {}, ids = {};
      delLocal.forEach(function(x) { nombres[String(x.nombre).trim().toLowerCase()] = true; ids[x.id] = true; });
      var nuevos = [];
      cartaMx.forEach(function(fila, i) {
        var id = "cartamx_" + localId + "_" + i;
        if (ids[id] || nombres[String(fila[1]).trim().toLowerCase()]) return;
        nuevos.push({ id:id, local:localId, categoria:fila[0], nombre:fila[1], precio:fila[2], activo:true, orden:i });
      });
      if (!nuevos.length) { alert("La carta de " + ((local && local.nombre) || "este local") + " ya tiene los " + cartaMx.length + " productos de Maxirest. No hay nada nuevo para cargar."); return; }
      if (!window.confirm("¿Cargar la carta de " + ((local && local.nombre) || "este local") + " tal como figura en Maxirest?\n\nSe suman " + nuevos.length + " productos con su precio" + (cartaMx.length - nuevos.length > 0 ? " (otros " + (cartaMx.length - nuevos.length) + " ya estaban y no se tocan)" : "") + ".\n\nDespués los podés editar, sacar o cambiar de categoría.")) return;
      setCargandoMx(true);
      setCarta(function(prev) { return prev.concat(nuevos); });
      sbSaveCartaMuchos(nuevos).then(function(err) {
        setCargandoMx(false);
        if (err) {
          setCarta(function(prev) { return prev.filter(function(x) { return nuevos.indexOf(x) === -1; }); });
          alert("No se pudo cargar la carta:\n\n" + String(err).slice(0, 250) + "\n\nSi el error menciona la tabla carta, hay que crearla en Supabase (el SQL está en el README).");
          return;
        }
        cargarCarta();
        alert("Listo: se cargaron " + nuevos.length + " productos con su precio.");
      });
    }
    // Trae los platos del menú de stock de este local. No pisa lo que ya está: si un
    // plato ya figura en la carta, se saltea, así se puede volver a apretar cuando se
    // agrega algo al menú sin perder los precios cargados.
    function traerDelMenu() {
      var menu = (p.menuStock || {})[localId] || {};
      var cuantosEnMenu = Object.keys(menu).reduce(function(a, cat) { return a + (menu[cat] || []).length; }, 0);
      // Un local sin menú de stock y una carta ya completa terminan los dos sin platos
      // para traer, pero se arreglan de maneras muy distintas: hay que decir cuál es.
      if (cuantosEnMenu === 0) {
        alert("El menú de stock de " + ((local && local.nombre) || "este local") + " está vacío, así que no hay productos para traer.\n\nSe cargan en Compras → Stock, o se pueden escribir acá a mano con \"+ Categoría\" y el campo de agregar de cada una.");
        return;
      }
      var existentes = {};
      delLocal.forEach(function(x) { existentes[String(x.nombre).toLowerCase()] = true; });
      var nuevos = [];
      Object.keys(menu).forEach(function(cat) {
        (menu[cat] || []).forEach(function(plato, i) {
          // El menú de stock guarda nombres sueltos, pero por las dudas se acepta
          // también un objeto con nombre: un dato viejo no tiene que romper la carta.
          var nombre = typeof plato === "string" ? plato : (plato && plato.nombre) || "";
          if (!nombre || existentes[nombre.toLowerCase()]) return;
          nuevos.push({ id:"carta_"+localId+"_"+Date.now()+"_"+nuevos.length, local:localId, categoria:cat, nombre:nombre, precio:null, activo:true, orden:i });
        });
      });
      if (!nuevos.length) {
        alert("La carta de " + ((local && local.nombre) || "este local") + " ya tiene los " + cuantosEnMenu + " productos del menú de stock. No hay nada nuevo para traer.");
        return;
      }
      setTrayendo(true);
      setCarta(function(prev) { return prev.concat(nuevos); });
      sbSaveCartaMuchos(nuevos).then(function(err) {
        setTrayendo(false);
        if (err) {
          setCarta(function(prev) { return prev.filter(function(x) { return nuevos.indexOf(x) === -1; }); });
          alert("No se pudieron traer los productos:\n\n" + err + "\n\nSi el error menciona la tabla carta, hay que crearla en Supabase (el SQL está en el README). Acordate del alter de RLS.");
          return;
        }
        cargarCarta();
      });
    }

    // Los platos de un nivel (los que están justo en esa categoría), editables.
    function bloqueEditor(cat) {
          var platos = delLocal.filter(function(x) { return x.categoria === cat; })
            .sort(function(a, b) {
              var oa = a.orden === null || a.orden === undefined ? 999 : a.orden;
              var ob = b.orden === null || b.orden === undefined ? 999 : b.orden;
              return oa !== ob ? oa - ob : String(a.nombre).localeCompare(String(b.nombre));
            });
          return (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {platos.map(function(x) {
                  var faltaPrecio = x.precio === null || x.precio === undefined || x.precio === "";
                  return (
                    <div key={x.id} style={{ display:"flex", gap:7, alignItems:"center", background:"#111", border:"1px solid "+(faltaPrecio?"#D4A01733":"#1A1A1A"), borderRadius:8, padding:"7px 10px", opacity:x.activo===false?0.45:1 }}>
                      <input defaultValue={x.nombre} title="Tocá el nombre para cambiarlo"
                        onBlur={function(e) { var v = e.target.value.trim(); if (v && v !== x.nombre) guardarPlato({ ...x, nombre:v }); }}
                        style={{ ...INP, border:"1px solid #2A2A2A", background:"#0C0C0C", padding:"6px 9px", fontSize:13, flex:1, minWidth:0 }} />
                      <span style={{ color:"#444", fontSize:12 }}>$</span>
                      <input defaultValue={x.precio === null || x.precio === undefined ? "" : x.precio}
                        onBlur={function(e) {
                          var v = e.target.value.trim();
                          var n = v === "" ? null : parseFloat(v);
                          if (v !== "" && isNaN(n)) { e.target.value = x.precio === null || x.precio === undefined ? "" : x.precio; return; }
                          if (n !== x.precio) guardarPlato({ ...x, precio:n });
                        }}
                        placeholder="0" inputMode="decimal"
                        style={{ ...INP, width:88, flex:"none", textAlign:"right", fontSize:13, padding:"5px 8px", border:"1px solid "+(faltaPrecio?"#D4A01744":"#2A2A2A") }} />
                      <button onClick={function() {
                          var cur = colores.platos[x.id], idx = cur ? COLORES_CATEGORIA.indexOf(cur) : -1;
                          ponerColor("platos", x.id, idx + 1 < COLORES_CATEGORIA.length ? COLORES_CATEGORIA[idx + 1] : null);
                        }}
                        title="Color de esta ventana (tocá para cambiarlo)"
                        style={{ width:22, height:22, borderRadius:11, border:"2px solid #2A2A2A", background: colores.platos[x.id] || "transparent", cursor:"pointer", padding:0, flex:"none" }} />
                      <button onClick={function() { guardarPlato({ ...x, activo:x.activo===false }); }}
                        title={x.activo===false ? "Está fuera de la carta — tocar para volver a ofrecerlo" : "Sacar de la carta por un tiempo"}
                        style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:x.activo===false?"#555":"#3A7D44", fontSize:11, cursor:"pointer" }}>
                        {x.activo===false ? "✖️" : "✓"}
                      </button>
                      {categorias.length > 1 && (
                        <select value="" title="Mover a otra categoría" onChange={function(e) { var v = e.target.value; if (v) guardarPlato({ ...x, categoria:v }); }}
                          style={{ width:34, background:"#111", border:"1px solid #2A2A2A", borderRadius:6, color:"#888", fontSize:11, padding:"3px 2px", cursor:"pointer" }}>
                          <option value="">↪</option>
                          {categorias.filter(function(k) { return k !== cat; }).map(function(k) { return <option key={k} value={k}>Mover a {k}</option>; })}
                        </select>
                      )}
                      <button onClick={function() { borrarPlato(x); }}
                        style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:"#555", fontSize:11, cursor:"pointer" }}>🗑️</button>
                    </div>
                  );
                })}
                <button onClick={function() {
                    var nombre = (nuevoPlato[cat] || "").trim();
                    if (!nombre) return;
                    guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:nombre, precio:null, activo:true, orden:500 });
                    setNuevoPlato(function(prev) { var n = {...prev}; n[cat] = ""; return n; });
                  }} style={{ display:"none" }} />
                <div style={{ display:"flex", gap:6, marginTop:2 }}>
                  <input value={nuevoPlato[cat] || ""} onChange={function(e) { var v = e.target.value; setNuevoPlato(function(prev) { var n = {...prev}; n[cat] = v; return n; }); }}
                    placeholder={"Agregar a " + cat + "..."} style={{ ...INP, fontSize:12, padding:"7px 10px" }} />
                  <button onClick={function() {
                      var nombre = (nuevoPlato[cat] || "").trim();
                      if (!nombre) return;
                      guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:nombre, precio:null, activo:true, orden:500 });
                      setNuevoPlato(function(prev) { var n = {...prev}; n[cat] = ""; return n; });
                    }} disabled={!(nuevoPlato[cat] || "").trim()}
                    style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #1E1E1E", background:"#111", color:(nuevoPlato[cat]||"").trim()?color:"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:(nuevoPlato[cat]||"").trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
                    +
                  </button>
                </div>
              </div>
            </div>
          );
    }

    return (
      <div>
        <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"13px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:9 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:color }}>Carta de {local && local.nombre}</div>
              <div style={{ fontSize:11, color:"#555", marginTop:3 }}>
                {delLocal.length} en la carta
                {sinPrecio > 0 ? " · " + sinPrecio + " sin precio" : delLocal.length ? " · todos con precio" : ""}
              </div>
            </div>
            {cartaMx && (
              <button onClick={cargarDeMaxirest} disabled={cargandoMx}
                style={{ padding:"9px 14px", borderRadius:8, border:"1px solid #3A7D4488", background:"#3A7D4422", color:"#8FD19A", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:800, cursor:cargandoMx?"wait":"pointer" }}>
                {cargandoMx ? "Cargando…" : "📥 Cargar la carta de Maxirest (" + cartaMx.length + ")"}
              </button>
            )}
            <button onClick={traerDelMenu} disabled={trayendo}
              style={{ padding:"9px 14px", borderRadius:8, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:trayendo?"wait":"pointer" }}>
              {trayendo ? "Trayendo…" : "↓ Traer del stock"}
            </button>
          </div>
          <div style={{ fontSize:11, color:"#7E7E7E", marginTop:9, lineHeight:1.5 }}>✎ Tocá el nombre o el precio para cambiarlo: se guarda solo al salir del campo.</div>
          {sinPrecio > 0 && (
            <div style={{ fontSize:11, color:"#8A6055", marginTop:9, lineHeight:1.5 }}>
              Lo que no tiene precio no se puede cobrar. Se puede marchar igual, así que
              sirve para empezar, pero conviene completarlos antes de usar la cuenta.
            </div>
          )}
        </div>

        {/* Categoría nueva */}
        <div style={{ display:"flex", gap:7, marginBottom:14 }}>
          <input value={nuevaCat} onChange={function(e) { setNuevaCat(e.target.value); }}
            placeholder="Categoría nueva (Bebidas, Postres...)" style={{ ...INP, fontSize:12 }} />
          <button onClick={function() {
              var cat = nuevaCat.replace(/ › /g, " - ").trim();
              if (!cat || categorias.some(function(c) { return dentroDe(c, cat); })) return;
              guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:"Nuevo", precio:null, activo:true, orden:0 });
              setNuevaCat("");
            }} disabled={!nuevaCat.trim()}
            style={{ padding:"9px 15px", borderRadius:8, border:"none", background:nuevaCat.trim()?color:"#1A1A1A", color:nuevaCat.trim()?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:nuevaCat.trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
            + Categoría
          </button>
        </div>

        {delLocal.length === 0 ? (
          <div style={{ textAlign:"center", padding:"30px 0" }}>
            <div style={{ fontSize:30, marginBottom:8 }}>📖</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#2E2E2E", marginBottom:6 }}>La carta está vacía</div>
            <div style={{ fontSize:11, color:"#444", maxWidth:360, margin:"0 auto", lineHeight:1.6 }}>
              Lo de este local ya está cargado en el menú de stock. Traelo con el botón de
              arriba y completá los precios: es mucho menos trabajo que escribirlos de nuevo.
            </div>
          </div>
        ) : (
          <ArbolCarta cats={categorias} ruta={ruta} setRuta={setRuta} colores={colores}
            contar={function(nodo) { return delLocal.filter(function(x) { return dentroDe(x.categoria, nodo); }).length; }}
            extra={function(nodo, colNodo) {
              return (
                <div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:11, color:"#888", marginRight:2 }}>🎨 Color:</span>
                  {COLORES_CATEGORIA.map(function(c) { return <button key={c} onClick={function() { ponerColor("cats", nodo, c); }} title="Pintar este nivel de este color" style={{ width:24, height:24, borderRadius:12, background:c, border: colNodo === c ? "3px solid #fff" : "2px solid #0D0D0D", cursor:"pointer", padding:0 }} />; })}
                  <button onClick={function() { ponerColor("cats", nodo, null); }} style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:"#888", fontSize:11, cursor:"pointer" }}>automático</button>
                </div>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
                  <button onClick={function() { renombrarCat(nodo); }} title="Cambiarle el nombre" style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"5px 10px", color:"#888", fontSize:11, cursor:"pointer" }}>✎ Renombrar</button>
                  <button onClick={function() { borrarCat(nodo); }} title="Borrar este nivel con todo lo que tiene adentro" style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"5px 10px", color:"#888", fontSize:11, cursor:"pointer" }}>🗑️ Borrar</button>
                  <input value={nuevaSub} onChange={function(e) { setNuevaSub(e.target.value); }} placeholder="Subcategoría nueva…" style={{ ...INP, fontSize:12, padding:"6px 9px", width:170, flex:"none" }} />
                  <button onClick={function() { crearSub(nodo); }} disabled={!nuevaSub.trim()} style={{ padding:"6px 12px", borderRadius:8, border:"none", background:nuevaSub.trim() ? color : "#1A1A1A", color:nuevaSub.trim() ? "#fff" : "#444", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Subcategoría</button>
                </div>
                </div>
              );
            }}
            renderPlatos={function(cat) { return bloqueEditor(cat); }} />
        )}
      </div>
    );
  }

function ConfigMesas(props) {
  var localId = props.localId, local = props.local, color = props.color;
  var mesasLocal = props.mesasLocal, setMesas = props.setMesas, comandaDeMesa = props.comandaDeMesa;

    var [sector, setSector] = useState("salon");
    var [desde, setDesde] = useState("");
    var [hasta, setHasta] = useState("");
    var [nombre, setNombre] = useState("");

    function agregarRango() {
      var a = parseInt(desde, 10), b = parseInt(hasta, 10);
      if (isNaN(a)) return;
      if (isNaN(b) || b < a) b = a;
      var nuevas = [];
      for (var n = a; n <= b && n - a < 60; n++) {
        nuevas.push({ id: "mesa_" + localId + "_" + sector + "_" + n + "_" + Date.now(), local: localId, sector: sector, nombre: String(n), orden: n, activa: true });
      }
      setMesas(function(prev) { return prev.concat(nuevas); });
      nuevas.forEach(function(m, i) {
        sbSaveMesa(m).then(function(err) {
          if (err && i === 0) alert("No se pudieron guardar las mesas:\n\n" + err + "\n\nSi el error menciona la tabla comanda_mesas, hay que crearla en Supabase.");
        });
      });
      setDesde(""); setHasta("");
    }
    function agregarUna() {
      if (!nombre.trim()) return;
      var m = { id: "mesa_" + localId + "_" + Date.now(), local: localId, sector: sector, nombre: nombre.trim(), orden: 900, activa: true };
      setMesas(function(prev) { return prev.concat([m]); });
      sbSaveMesa(m);
      setNombre("");
    }
    function borrar(m) {
      if (comandaDeMesa(m.id)) { alert("Esa mesa tiene una comanda abierta. Cerrala antes de sacarla del plano."); return; }
      if (!window.confirm("¿Sacar la mesa " + m.nombre + " del plano?")) return;
      setMesas(function(prev) { return prev.filter(function(x) { return x.id !== m.id; }); });
      sbDeleteMesa(m.id);
    }

    // Mesas con el mismo nombre en el local: se queda una (la que tiene comanda abierta, si hay; si no, la primera) y se sacan las demás.
    var sobrantes = (function() {
      var vistas = {}, fuera = [];
      mesasLocal.slice().sort(function(x, y) { return (comandaDeMesa(y.id) ? 1 : 0) - (comandaDeMesa(x.id) ? 1 : 0); }).forEach(function(m) {
        var k = String(m.nombre || "").trim().toLowerCase();
        if (vistas[k]) { if (!comandaDeMesa(m.id)) fuera.push(m); } else vistas[k] = true;
      });
      return fuera;
    })();
    function borrarRepetidas() {
      if (!window.confirm("Hay " + sobrantes.length + " mesa" + (sobrantes.length === 1 ? "" : "s") + " con número repetido (" + sobrantes.map(function(m) { return m.nombre; }).join(", ") + ").\n\nSe deja una de cada una y se sacan las demás. ¿Seguimos?")) return;
      var ids = sobrantes.map(function(m) { return m.id; });
      setMesas(function(prev) { return prev.filter(function(x) { return ids.indexOf(x.id) < 0; }); });
      ids.forEach(function(id) { sbDeleteMesa(id); });
    }

    return (
      <div>
        <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"14px", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:800, color:color, marginBottom:11 }}>Agregar mesas a {local && local.nombre}</div>
          <label style={{ display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Sector</label>
          <div style={{ display:"flex", gap:5, marginBottom:11, flexWrap:"wrap" }}>
            {CMD_SECTORES.map(function(s) {
              var act = sector === s.id;
              return (
                <button key={s.id} onClick={function() { setSector(s.id); }}
                  style={{ padding:"7px 13px", borderRadius:8, border:"1px solid "+(act?color:"#1E1E1E"), background:act?color+"22":"#111", color:act?color:"#555", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {s.emoji} {s.nombre}
                </button>
              );
            })}
          </div>
          <label style={{ display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Por número, de una vez</label>
          <div style={{ display:"flex", gap:7, marginBottom:11, alignItems:"center" }}>
            <input value={desde} onChange={function(e) { setDesde(e.target.value); }} placeholder="de la 1" inputMode="numeric" style={{ ...INP, fontSize:12 }} />
            <span style={{ color:"#444", fontSize:12 }}>a la</span>
            <input value={hasta} onChange={function(e) { setHasta(e.target.value); }} placeholder="10" inputMode="numeric" style={{ ...INP, fontSize:12 }} />
            <button onClick={agregarRango} disabled={!String(desde).trim()}
              style={{ padding:"9px 15px", borderRadius:8, border:"none", background:String(desde).trim()?color:"#1A1A1A", color:String(desde).trim()?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:String(desde).trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
              + Agregar
            </button>
          </div>
          <label style={{ display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>O una con nombre propio</label>
          <div style={{ display:"flex", gap:7 }}>
            <input value={nombre} onChange={function(e) { setNombre(e.target.value); }} placeholder="Ej: Barra 1, Reservado" style={{ ...INP, fontSize:12 }} />
            <button onClick={agregarUna} disabled={!nombre.trim()}
              style={{ padding:"9px 15px", borderRadius:8, border:"none", background:nombre.trim()?color:"#1A1A1A", color:nombre.trim()?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:nombre.trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
              + Agregar
            </button>
          </div>
        </div>

        {sobrantes.length > 0 && (
          <div style={{ background:"#2A1A00", border:"1px solid #D4A017", borderRadius:10, padding:"10px 12px", marginBottom:12, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:"#E8D9A0", flex:1, minWidth:160 }}>⚠️ Hay {sobrantes.length} mesa{sobrantes.length === 1 ? "" : "s"} con el número repetido.</span>
            <button onClick={borrarRepetidas} style={{ background:"#D4A017", border:"none", borderRadius:8, color:"#1A1200", padding:"7px 12px", fontSize:12, fontWeight:800, cursor:"pointer" }}>🧹 Borrar repetidas</button>
          </div>
        )}
        {CMD_SECTORES.map(function(s) {
          var delSector = mesasLocal.filter(function(m) { return m.sector === s.id; });
          if (!delSector.length) return null;
          return (
            <div key={s.id} style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:7 }}>{s.emoji} {s.nombre} ({delSector.length})</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {delSector.map(function(m) {
                  return (
                    <button key={m.id} onClick={function() { borrar(m); }} title="Sacar del plano"
                      style={{ padding:"7px 12px", borderRadius:8, border:"1px solid #1E1E1E", background:"#111", color:"#666", fontFamily:"'Inter',sans-serif", fontSize:12, cursor:"pointer" }}>
                      {m.nombre} <span style={{ color:"#C1440E", marginLeft:3 }}>×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {mesasLocal.length === 0 && (
          <div style={{ textAlign:"center", padding:"20px 0", color:"#333", fontSize:12 }}>Todavía no hay mesas en este local.</div>
        )}
      </div>
    );
  }

function NuevaComanda(props) {
  var color = props.color, localId = props.localId, usuario = props.usuario;
  var guardar = props.guardar, proximoNumero = props.proximoNumero;

    var esDelivery = props.tipo === "delivery";
    var [abierto, setAbierto] = useState(false);
    var [cliente, setCliente] = useState("");
    var [direccion, setDireccion] = useState("");
    var [telefono, setTelefono] = useState("");
    var [entregaMin, setEntregaMin] = useState(esDelivery ? 30 : 15);

    function crear() {
      if (esDelivery && !direccion.trim()) return;
      if (!props.puedeAbrirCuenta()) return;
      var datos = { cliente: cliente.trim() || null, direccion: esDelivery ? direccion.trim() : null, telefono: telefono.trim() || null };
      setCliente(""); setDireccion(""); setTelefono(""); setAbierto(false);
      // Delivery y mostrador los toma siempre el cajero: es quien está logueado, no se pregunta.
      var nueva = {
        id: props.nuevoId(),
        local: localId, tipo: props.tipo, numero: proximoNumero(), estado: "abierta",
        mozo: usuario, cliente: datos.cliente, direccion: datos.direccion, telefono: datos.telefono,
        abierta_at: new Date().toISOString(), usuario: usuario,
      };
      // El delivery se toma en tres pasos: los datos, el pedido de la carta y, al marchar, el tiempo de entrega. El mostrador pide el tiempo acá.
      if (!esDelivery) props.fijarEntrega(nueva, entregaMin, nueva.abierta_at);
      props.registrar(nueva, esDelivery ? "Abrió un delivery" : "Abrió un pedido de mostrador", "Cajero: " + usuario + (datos.cliente ? " · " + datos.cliente : "") + (datos.direccion ? " · " + datos.direccion : ""));
      guardar(nueva).then(function(err) { if (!err && esDelivery && props.alCrear) props.alCrear(nueva.id); });
    }

    if (!abierto) return (
      <button onClick={function() { setAbierto(true); }}
        style={{ width:"100%", padding:"12px", borderRadius:10, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer", marginBottom:14 }}>
        + Nuevo {esDelivery ? "delivery" : "pedido de mostrador"}
      </button>
    );
    return (
      <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"14px", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:800, color:color, marginBottom:11 }}>{esDelivery ? "🛵 Nuevo delivery" : "🥡 Nuevo pedido de mostrador"}</div>
        <input value={cliente} onChange={function(e) { setCliente(e.target.value); }} placeholder="Cliente (opcional)" style={{ ...INP, marginBottom:8 }} />
        {esDelivery && <input value={direccion} onChange={function(e) { setDireccion(e.target.value); }} placeholder="Dirección *" style={{ ...INP, marginBottom:8 }} />}
        <input value={telefono} onChange={function(e) { setTelefono(e.target.value); }} placeholder="Teléfono (opcional)" inputMode="tel" style={{ ...INP, marginBottom:10 }} />
        {esDelivery
          ? <div style={{ fontSize:11.5, color:"#8C8C8C", marginBottom:12, lineHeight:1.5 }}>Paso 1 de 3: los datos del cliente. Después cargás el pedido de la carta y, al marchar, elegís el tiempo de entrega.</div>
          : <>
              <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>🕒 Tiempo para retirar</div>
              <div style={{ marginBottom:12 }}><ElegirEntrega valor={entregaMin} color={color} onElegir={setEntregaMin} /></div>
            </>}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={crear} disabled={esDelivery && !direccion.trim()}
            style={{ flex:1, padding:"11px", borderRadius:8, border:"none", background:(!esDelivery || direccion.trim())?color:"#1A1A1A", color:(!esDelivery || direccion.trim())?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:(!esDelivery || direccion.trim())?"pointer":"not-allowed" }}>
            {esDelivery ? "Siguiente: cargar el pedido →" : "+ Abrir"}
          </button>
          <button onClick={function() { setAbierto(false); }} style={{ ...GH, padding:"11px 16px", fontSize:13 }}>Cancelar</button>
        </div>
      </div>
    );
  }

// Qué categorías de la carta no pasan por la cocina: salen en la comanda de barra (impresa) y quedan en la cuenta de la mesa.
function ConfigSinCocina(props) {
  var cats = [];
  (props.carta || []).forEach(function(x) { if (x.local !== props.localId) return; var t = String(x.categoria || "").split(" › ")[0]; if (t && cats.indexOf(t) < 0) cats.push(t); });
  var inicial = props.cfg && Array.isArray(props.cfg.categorias) ? props.cfg.categorias : cats.filter(function(c) { return categoriaSinCocina(c, null); });
  var [sel, setSel] = useState(null);
  var [msg, setMsg] = useState("");
  var [abierto, setAbierto] = useState(false);
  var actual = sel || inicial;
  if (!cats.length) return null;
  function alternar(c) { var l = actual.indexOf(c) >= 0 ? actual.filter(function(x) { return x !== c; }) : actual.concat([c]); setSel(l); }
  function guardar() {
    sbGuardarSinCocina(props.localId, actual, props.usuario).then(function(ok) {
      if (ok) { props.onGuardado(actual); setSel(null); setMsg("✓ Guardado"); } else setMsg("No se pudo guardar");
      setTimeout(function() { setMsg(""); }, 2500);
    });
  }
  return (
    <div style={{ background:"#150F1C", border:"1px solid #B07CD855", borderRadius:12, padding:"10px 13px", marginBottom:12 }}>
      <button onClick={function() { setAbierto(!abierto); }} style={{ display:"flex", justifyContent:"space-between", width:"100%", background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"'Inter',sans-serif" }}>
        <span style={{ fontSize:13, fontWeight:800, color:"#D9B8F5" }}>🥤 Categorías que no van a cocina ({actual.length})</span>
        <span style={{ fontSize:11, color:"#7E7E7E" }}>{abierto ? "▾ ocultar" : "▸ elegir"}</span>
      </button>
      {abierto && (
        <div>
          <div style={{ fontSize:11.5, color:"#9A9A9A", lineHeight:1.5, margin:"6px 0 8px" }}>Lo que tenga una de estas categorías no le llega a la pantalla de la cocina: sale en la <b>comanda de barra</b> (impresa) y queda sumado en la cuenta de la mesa para cuando se pida el ticket.</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
            {cats.map(function(c) {
              var on = actual.indexOf(c) >= 0;
              return <button key={c} onClick={function() { alternar(c); }} style={{ padding:"7px 12px", borderRadius:9, border:"1px solid " + (on ? "#B07CD8" : "#2A2A2A"), background: on ? "#B07CD833" : "#111", color: on ? "#E5CFF8" : "#9A9A9A", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:"pointer" }}>{on ? "🥤 " : ""}{c}</button>;
            })}
          </div>
          <button onClick={guardar} disabled={!sel} style={{ padding:"8px 14px", borderRadius:8, border:"none", background: sel ? "#B07CD8" : "#2A2A2A", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:12.5, fontWeight:800, cursor: sel ? "pointer" : "default" }}>Guardar</button>
          {msg && <span style={{ fontSize:12, color:"#8FD19A", marginLeft:10 }}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
// ─── PANTALLA DEL CADETE ──────────────────────────────────────────────
// El cadete reparte para los 3 locales. Ve solo los pedidos que el cajero le asignó: retira, sale, entrega y cobra (efectivo o ya transferido).
// El efectivo que cobra lo rinde en cada local (cada local tiene su caja): el cajero de ese local confirma «recibí $X».
function TarjetaCadete(props) {
  var c = props.comanda, d = props.desp || {}, a = props.aviso || {};
  var loc = getLocal(c.local) || {};
  var its = props.items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
  var total = totalItemsDelivery(its);
  var etapa = etapaDelivery(its, d);
  var transfer = a.medio === "transferencia";
  var transfPend = transfer && !a.transf_ok;
  var [cobrando, setCobrando] = useState(false);
  var [monto, setMonto] = useState(String(Math.round(total)));
  var mapa = c.direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.direccion + " Punta Alta") : "";
  var wa = c.telefono ? linkWspDelivery(c.telefono, "Hola " + (c.cliente || "") + "! Soy el cadete de " + (loc.nombre || "") + ", estoy llegando con tu pedido 🛵") : "";
  var colEtapa = etapa === "camino" ? "#3A9BC1" : etapa === "listo" ? "#4C9A5A" : "#D4A017";
  return (
    <div style={{ background:"#111", border:"2px solid " + colEtapa + "88", borderLeft:"8px solid " + (loc.color || colEtapa), borderRadius:14, padding:"13px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:12, fontWeight:900, color:loc.color || "#9A9A9A", letterSpacing:0.6 }}>{loc.emoji} {String(loc.nombre || "").toUpperCase()} · #{c.numero}</div>
          <div style={{ fontSize:19, fontWeight:900, color:"#F0EDE8", marginTop:3 }}>{c.cliente || "Sin nombre"}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:900, color:"#FFD36B" }}>{pesos(total)}</div>
          <div style={{ fontSize:11, fontWeight:800, color: transfer ? "#B07CD8" : "#8FD19A" }}>{transfer ? (a.transf_ok ? "📲 transferido" : "📲 transf. sin confirmar") : "💵 cobrar en efectivo"}</div>
        </div>
      </div>
      {c.direccion && <div style={{ fontSize:15, fontWeight:700, color:"#E0E0E0", marginTop:6 }}>📍 {c.direccion}</div>}
      <div style={{ fontSize:13, color:"#B8B8B8", marginTop:5, lineHeight:1.45 }}>{its.map(function(i) { return (Number(i.cant) || 1) + "× " + i.nombre; }).join(" · ")}</div>
      {a.nota && <div style={{ fontSize:12.5, color:"#D4A017", marginTop:3 }}>📝 {a.nota}</div>}
      {!transfer && a.abona_con && <div style={{ fontSize:12.5, color:"#C8C8C8", marginTop:3 }}>Abona con {pesos(a.abona_con)} · vuelto {pesos(Math.max(0, Number(a.abona_con) - total))}</div>}
      <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:9 }}>
        {mapa && <a href={mapa} target="_blank" rel="noreferrer" style={{ ...GH, padding:"9px 13px", fontSize:13, textDecoration:"none" }}>🗺️ Mapa</a>}
        {c.telefono && <a href={"tel:" + String(c.telefono).replace(/[^\d+]/g, "")} style={{ ...GH, padding:"9px 13px", fontSize:13, textDecoration:"none" }}>📞 Llamar</a>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...GH, padding:"9px 13px", fontSize:13, textDecoration:"none", borderColor:"#25D36688", color:"#5BDB8B" }}>💬 WhatsApp</a>}
      </div>
      {etapa === "cocina" && <div style={{ marginTop:10, fontSize:13, fontWeight:800, color:"#D4A017" }}>🍳 Todavía en la cocina: esperá el aviso del local.</div>}
      {etapa === "armando" && <div style={{ marginTop:10, fontSize:13, fontWeight:800, color:"#9A9A9A" }}>🧾 El local lo está armando.</div>}
      {etapa === "listo" && (transfPend
        ? <div style={{ marginTop:10, fontSize:13, fontWeight:800, color:"#B07CD8" }}>⏳ Esperá: el local todavía no confirmó la transferencia.</div>
        : <button onClick={function() { props.onSali(c); }} style={{ marginTop:10, width:"100%", padding:"15px", borderRadius:11, border:"none", background:"#3A9BC1", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:17, fontWeight:900, cursor:"pointer" }}>🛵 Retiré y salí</button>)}
      {etapa === "camino" && !cobrando && <button onClick={function() { if (transfer) props.onEntregue(c, 0); else setCobrando(true); }} style={{ marginTop:10, width:"100%", padding:"15px", borderRadius:11, border:"none", background:"#3A7D44", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:17, fontWeight:900, cursor:"pointer" }}>✅ Entregué</button>}
      {etapa === "camino" && cobrando && (
        <div style={{ marginTop:10, background:"#0F1A12", border:"1px solid #3A7D44", borderRadius:10, padding:"10px 12px" }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#8FD19A", marginBottom:6 }}>¿Cuánto cobraste en efectivo?</div>
          <input value={monto} onChange={function(e) { setMonto(e.target.value); }} inputMode="numeric" style={{ ...INP, fontSize:20, fontWeight:900, marginBottom:8 }} />
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={function() { var m = parseInt(String(monto).replace(/[^\d]/g, ""), 10); if (!(m >= 0)) return; props.onEntregue(c, m); setCobrando(false); }} style={{ flex:2, padding:"13px", borderRadius:10, border:"none", background:"#3A7D44", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:900, cursor:"pointer" }}>Confirmar entrega</button>
            <button onClick={function() { setCobrando(false); }} style={{ ...GH, flex:1, padding:"13px", fontSize:13 }}>Volver</button>
          </div>
        </div>
      )}
    </div>
  );
}
export function PantallaCadete(props) {
  var usuario = props.usuario;
  var [datos, setDatos] = useState(null);
  var previos = useRef(null);
  function cargar() {
    return Promise.all([sbLoadComandas(), sbLeerDespachos(), sbLeerPedidosWeb()]).then(function(r) {
      var coms = r[0].filter(function(c) { return c.tipo === "delivery"; });
      return sbLoadItems(coms.map(function(c) { return c.id; })).then(function(its) { setDatos({ coms:coms, items:its, desp:r[1], web:r[2] }); });
    }).catch(function() {});
  }
  useEffect(function() {
    var vivo = true; cargar();
    var t = setInterval(function() { if (vivo) cargar(); }, 8000);
    return function() { vivo = false; clearInterval(t); };
  }, []);
  var desp = datos ? datos.desp : {};
  var mios = datos ? datos.coms.filter(function(c) { var d = desp[c.id]; return d && d.cadete === usuario && d.estado !== "entregado"; }) : [];
  useEffect(function() {
    if (!datos) return;
    if (previos.current !== null && mios.length > previos.current) avisoSonoro(3);
    previos.current = mios.length;
  }, [mios.length, !!datos]);
  function guardarDesp(c, cambios, accion, detalle) {
    var nuevo = { ...(desp[c.id] || {}), comanda_id:c.id, local:c.local, cadete:usuario, ...cambios };
    setDatos(function(prev) { return { ...prev, desp: { ...prev.desp, [c.id]: nuevo } }; });
    sbGuardarDespacho(nuevo).then(function(ok) { if (!ok) alert("No se pudo guardar. Revisá la conexión y probá de nuevo."); });
    var fecha = props.diaDeNegocio ? props.diaDeNegocio() : new Date().toISOString().slice(0, 10);
    sbLogAcciones([{ local:c.local, fecha:fecha, comanda_id:c.id, titulo:"🛵 Delivery #" + c.numero + (c.cliente ? " · " + c.cliente : ""), accion:accion, detalle:detalle, por:usuario, at:new Date().toISOString() }]);
  }
  function sali(c) { guardarDesp(c, { estado:"en_camino", en_camino_at:new Date().toISOString(), por:usuario }, "El cadete salió con el pedido", usuario); }
  function entregue(c, monto) { guardarDesp(c, { estado:"entregado", entregado_at:new Date().toISOString(), cobrado_efectivo:monto, por:usuario }, "El cadete entregó el pedido", usuario + (monto > 0 ? " · cobró " + pesos(monto) : "")); }
  // Pedidos del mismo cliente y dirección (de varios locales): el cadete cobra todo junto, pero cada pedido es de su local.
  var grupos = [];
  mios.forEach(function(c) {
    var k = String(c.telefono || "") + "|" + String(c.direccion || "");
    var g = grupos.find(function(z) { return z.k === k; });
    if (!g) { g = { k:k, lista:[] }; grupos.push(g); }
    g.lista.push(c);
  });
  // Efectivo cobrado y todavía sin rendir, por local.
  var porRendir = {};
  Object.keys(desp).forEach(function(id) {
    var d = desp[id];
    if (d && d.cadete === usuario && d.cobrado_efectivo > 0 && !d.rendido) porRendir[d.local] = (porRendir[d.local] || 0) + d.cobrado_efectivo;
  });
  var locRend = Object.keys(porRendir);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, background:"#0D0D0D", overflowY:"auto", padding:"12px 14px 30px", fontFamily:"'Inter',sans-serif", color:"#F0EDE8" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, color:"#8C8C8C", textTransform:"uppercase", letterSpacing:1.5 }}>Cadete</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:21, fontWeight:800 }}>🛵 {usuario}</div>
        </div>
        {props.alSalir && <button onClick={props.alSalir} title="Salir" style={{ background:"transparent", border:"1px solid #2A2A2A", color:"#8C8C8C", borderRadius:8, padding:"7px 11px", fontSize:13, cursor:"pointer" }}>🔒 Salir</button>}
      </div>
      {locRend.length > 0 && (
        <div style={{ background:"#150F1C", border:"1px solid #B07CD8", borderRadius:12, padding:"10px 13px", marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:900, color:"#D9B8F5" }}>💵 Efectivo para rendir</div>
          {locRend.map(function(l) { var lo = getLocal(l) || {}; return <div key={l} style={{ fontSize:14, marginTop:3 }}>{lo.emoji} Entregalo en <b style={{ color:lo.color }}>{lo.nombre}</b>: <b>{pesos(porRendir[l])}</b></div>; })}
          <div style={{ fontSize:11, color:"#9A9A9A", marginTop:5 }}>El cajero de cada local confirma que lo recibió.</div>
        </div>
      )}
      {!datos ? <div style={{ textAlign:"center", padding:"60px 0", color:"#555" }}>Cargando…</div>
        : mios.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0" }}>
            <div style={{ fontSize:52, marginBottom:8 }}>🛵</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:19, color:"#4C9A5A" }}>Sin pedidos asignados</div>
            <div style={{ fontSize:13, color:"#666", marginTop:6 }}>Cuando un cajero te asigne un pedido, aparece acá con un aviso.</div>
          </div>
        ) : grupos.map(function(g) {
          var efectivo = g.lista.filter(function(c) { var a = datos.web[c.id] || {}; return a.medio !== "transferencia"; });
          var tot = function(c) { return totalItemsDelivery(datos.items.filter(function(i) { return i.comanda_id === c.id; })); };
          var totalEf = efectivo.reduce(function(a, c) { return a + tot(c); }, 0);
          return (
            <div key={g.k} style={{ marginBottom:14 }}>
              {g.lista.length > 1 && (
                <div style={{ background:"#1A1208", border:"1px solid #D4A017", borderRadius:10, padding:"8px 12px", marginBottom:7, fontSize:13, fontWeight:800, color:"#FFD36B" }}>
                  🧾 {g.lista.length} pedidos para el mismo cliente
                  {efectivo.length > 0 && <div style={{ fontSize:12.5, fontWeight:700, color:"#E0C080", marginTop:2 }}>Cobrar en total {pesos(totalEf)}: {efectivo.map(function(c) { return (getLocal(c.local) || {}).nombre + " " + pesos(tot(c)); }).join(" + ")}</div>}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {g.lista.map(function(c) { return <TarjetaCadete key={c.id} comanda={c} items={datos.items} desp={desp[c.id]} aviso={datos.web[c.id]} onSali={sali} onEntregue={entregue} />; })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ─── MÓDULO DE DELIVERY ───────────────────────────────────────────────
// Pantalla exclusiva de delivery para cajeros y administración (por local): los pedidos por etapa y el informe del día. Convive con la pestaña Delivery de Comandas.
function numeroWspAR(t) {
  var n = String(t || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!n) return "";
  if (n.indexOf("549") === 0) return n;
  if (n.indexOf("54") === 0) return "549" + n.slice(2);
  return "549" + n.replace(/^15/, "");
}
function linkWspDelivery(tel, texto) { var n = numeroWspAR(tel); return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(texto) : ""; }
function totalItemsDelivery(its) { return (its || []).filter(function(i) { return i.estado !== "cancelado"; }).reduce(function(a, i) { return a + (Number(i.precio) || 0) * (Number(i.cant) || 1); }, 0); }
// Etapa de un delivery: armando → en cocina → listo para despachar → en camino → entregado (falta cobrar o cerrar la cuenta).
function etapaDelivery(its, desp) {
  if (desp && desp.estado === "entregado") return "entregado";
  if (desp && desp.estado === "en_camino") return "camino";
  var vivos = (its || []).filter(function(i) { return i.estado !== "cancelado"; });
  if (vivos.some(function(i) { return i.estado === "enviado"; })) return "cocina";
  if (vivos.some(function(i) { return i.estado === "listo" || i.estado === "entregado"; })) return "listo";
  return "armando";
}
var ETAPAS_DELIVERY = [
  { id:"cocina",    emoji:"🍳", nombre:"En cocina",              col:"#D4A017" },
  { id:"listo",     emoji:"📦", nombre:"Listo para despachar",   col:"#4C9A5A" },
  { id:"camino",    emoji:"🛵", nombre:"En camino",              col:"#3A9BC1" },
  { id:"armando",   emoji:"🧾", nombre:"Armando el pedido",      col:"#8C8C8C" },
  { id:"entregado", emoji:"💵", nombre:"Entregado: falta cobrar y cerrar", col:"#B07CD8" },
];
// Un pedido nuevo de Comunidad esperando que el cajero lo acepte (con el tiempo de entrega) o lo rechace (con motivo).
function TarjetaPedidoWeb(props) {
  var c = props.comanda, a = props.aviso || {};
  var [minutos, setMinutos] = useState(40);
  var [rechazando, setRechazando] = useState(false);
  var [motivo, setMotivo] = useState("No hay stock de algo del pedido");
  var its = props.items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
  return (
    <div style={{ background:"#1A1208", border:"2px solid #D4A017", borderRadius:12, padding:"12px 14px" }}>
      <div style={{ fontSize:12, fontWeight:900, color:"#D4A017", letterSpacing:0.6, animation:"nktPulso 1.2s infinite" }}>🌐 PEDIDO DE COMUNIDAD · hace {hace(c.abierta_at)}</div>
      <div style={{ display:"flex", justifyContent:"space-between", gap:9, marginTop:5 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:16, fontWeight:900, color:"#F0EDE8" }}>{c.cliente || "Sin nombre"}</div>
          {c.direccion && <div style={{ fontSize:13, color:"#C8C8C8", marginTop:2 }}>📍 {c.direccion}</div>}
          {c.telefono && <div style={{ fontSize:12.5, color:"#9A9A9A" }}>📞 {c.telefono}</div>}
        </div>
        <div style={{ textAlign:"right", whiteSpace:"nowrap", fontSize:17, fontWeight:900, color:"#FFD36B" }}>{pesos(totalItemsDelivery(its))}</div>
      </div>
      <div style={{ fontSize:13.5, color:"#E0E0E0", margin:"8px 0", lineHeight:1.5 }}>{its.map(function(i) { return (Number(i.cant) || 1) + "× " + i.nombre; }).join(" · ")}</div>
      <div style={{ fontSize:12.5, color:"#C8C8C8", lineHeight:1.5 }}>
        {a.medio === "transferencia" ? "📲 Paga por transferencia (confirmala antes de despachar)" : "💵 Efectivo al recibir" + (a.abona_con ? " · abona con " + pesos(a.abona_con) : "")}
        {a.nota ? <div style={{ color:"#D4A017" }}>📝 {a.nota}</div> : null}
      </div>
      {!rechazando ? (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginTop:10 }}>
          <span style={{ fontSize:12, color:"#C8C8C8" }}>Tiempo de entrega</span>
          <select value={minutos} onChange={function(e) { setMinutos(parseInt(e.target.value, 10)); }} style={{ ...INP, width:"auto", padding:"8px 10px", fontSize:13, fontWeight:800 }}>
            {[20, 30, 40, 45, 60, 75, 90].map(function(m) { return <option key={m} value={m}>{m} min</option>; })}
          </select>
          <button onClick={function() { props.onAceptar(c, minutos); }} style={{ padding:"10px 18px", borderRadius:9, border:"none", background:"#3A7D44", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:900, cursor:"pointer" }}>✅ Aceptar</button>
          <button onClick={function() { setRechazando(true); }} style={{ ...GH, padding:"9px 14px", fontSize:13, borderColor:"#C1440E88", color:"#E0714A" }}>✖ Rechazar</button>
        </div>
      ) : (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginTop:10 }}>
          <select value={motivo} onChange={function(e) { setMotivo(e.target.value); }} style={{ ...INP, width:"auto", padding:"8px 10px", fontSize:13 }}>
            {["No hay stock de algo del pedido", "Estamos fuera de la zona de reparto", "El local no está tomando pedidos ahora", "No pudimos comunicarnos con vos"].map(function(m) { return <option key={m} value={m}>{m}</option>; })}
          </select>
          <button onClick={function() { props.onRechazar(c, motivo); }} style={{ padding:"10px 16px", borderRadius:9, border:"none", background:"#C1440E", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:900, cursor:"pointer" }}>Confirmar rechazo</button>
          <button onClick={function() { setRechazando(false); }} style={{ ...GH, padding:"9px 14px", fontSize:13 }}>Volver</button>
        </div>
      )}
    </div>
  );
}
function BandejaDelivery(props) {
  var color = props.color;
  var web = props.pedidosWeb || {};
  var nuevos = props.comandas.filter(function(c) { return web[c.id] && web[c.id].estado === "nuevo"; });
  var delis = props.comandas.filter(function(c) { return !(web[c.id] && web[c.id].estado === "nuevo"); });
  var rendiciones = props.rendiciones || [];
  var cabezaRend = rendiciones.length > 0 ? (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:900, letterSpacing:0.6, color:"#B07CD8", textTransform:"uppercase", marginBottom:6 }}>💵 Rendiciones de cadetes · {rendiciones.length}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {rendiciones.map(function(r) {
          return (
            <div key={r.cadete} style={{ background:"#150F1C", border:"1px solid #B07CD866", borderRadius:10, padding:"10px 13px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:900, color:"#F0EDE8" }}>🛵 {r.cadete} tiene que rendir <span style={{ color:"#D9B8F5" }}>{pesos(r.monto)}</span></div>
                <div style={{ fontSize:11.5, color:"#9A9A9A", marginTop:2 }}>{r.pedidos} pedido{r.pedidos === 1 ? "" : "s"} cobrado{r.pedidos === 1 ? "" : "s"} en efectivo de este local. Contá la plata antes de confirmar.</div>
              </div>
              <button onClick={function() { props.onRendir(r); }} style={{ padding:"10px 16px", borderRadius:9, border:"none", background:"#B07CD8", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:900, cursor:"pointer" }}>💵 Recibí {pesos(r.monto)}</button>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;
  var cabeza = nuevos.length > 0 ? (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:900, letterSpacing:0.6, color:"#D4A017", textTransform:"uppercase", marginBottom:6 }}>🔔 Pedidos nuevos de Comunidad · {nuevos.length}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {nuevos.map(function(c) { return <TarjetaPedidoWeb key={c.id} comanda={c} aviso={web[c.id]} items={props.items} onAceptar={props.onAceptarWeb} onRechazar={props.onRechazarWeb} />; })}
      </div>
    </div>
  ) : null;
  if (!delis.length) return (
    <div>
      {cabeza}
      {cabezaRend}
      {nuevos.length === 0 && rendiciones.length === 0 && <div style={{ textAlign:"center", padding:"30px 0", color:"#444" }}>
        <div style={{ fontSize:30, marginBottom:8 }}>🛵</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#555" }}>Sin deliverys abiertos</div>
      </div>}
    </div>
  );
  var cadetes = props.cadetes || [];
  return (
    <div>
      {cabeza}
      {cabezaRend}
      {ETAPAS_DELIVERY.map(function(et) {
        var lista = delis.filter(function(c) { return etapaDelivery(props.items.filter(function(i) { return i.comanda_id === c.id; }), props.despachos[c.id]) === et.id; });
        if (!lista.length) return null;
        return (
          <div key={et.id} style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:900, letterSpacing:0.6, color:et.col, textTransform:"uppercase", marginBottom:6 }}>{et.emoji} {et.nombre} · {lista.length}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {lista.map(function(c) {
                var its = props.items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
                var st = estadoEntrega(props.entregas[c.id], props.ahora);
                var resumen = its.map(function(i) { return (Number(i.cant) || 1) + "× " + i.nombre; }).join(", ");
                var desp = props.despachos[c.id] || {};
                var hh = props.entregas[c.id] && props.entregas[c.id].prometida_at ? String(new Date(props.entregas[c.id].prometida_at).getHours()).padStart(2, "0") + ":" + String(new Date(props.entregas[c.id].prometida_at).getMinutes()).padStart(2, "0") : "";
                var texto = et.id === "cocina" || et.id === "armando"
                  ? "Hola " + (c.cliente || "") + "! Recibimos tu pedido de " + (props.localNombre || "") + ", ya lo estamos preparando 🍳" + (hh ? " Llega aproximadamente a las " + hh + "." : "")
                  : "Hola " + (c.cliente || "") + "! Tu pedido de " + (props.localNombre || "") + " ya salió y llega en unos minutos 🛵";
                var wa = c.telefono ? linkWspDelivery(c.telefono, texto) : "";
                return (
                  <div key={c.id} style={{ background:"#111", border:"1px solid " + et.col + "55", borderLeft:"6px solid " + et.col, borderRadius:10, padding:"11px 13px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:9, alignItems:"flex-start" }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:15, fontWeight:900, color:"#F0EDE8" }}>#{c.numero} · {c.cliente || "Sin nombre"}{web[c.id] && web[c.id].origen !== "cajero" && <span style={{ marginLeft:6, fontSize:10, fontWeight:900, color:"#D4A017", border:"1px solid #D4A01788", borderRadius:5, padding:"1px 6px" }}>🌐 COMUNIDAD</span>}</div>
                        {web[c.id] && <div style={{ fontSize:11.5, color: web[c.id].medio === "transferencia" ? (web[c.id].transf_ok ? "#8FD19A" : "#B07CD8") : "#C8C8C8", marginTop:2 }}>{web[c.id].medio === "transferencia" ? (web[c.id].transf_ok ? "📲 Transferencia confirmada" : "📲 Transferencia sin confirmar") : "💵 Efectivo" + (web[c.id].abona_con ? " · abona con " + pesos(web[c.id].abona_con) : "")}</div>}
                        {c.direccion && <div style={{ fontSize:12, color:"#9A9A9A", marginTop:2 }}>📍 {c.direccion}</div>}
                        {c.telefono && <div style={{ fontSize:12, color:"#777" }}>📞 {c.telefono}</div>}
                        <div style={{ fontSize:12.5, color:"#C8C8C8", marginTop:4, lineHeight:1.4 }}>{resumen || "Todavía sin productos"}</div>
                        {st && <div style={{ display:"inline-block", marginTop:5, fontSize:12, fontWeight:800, color:st.col, background:st.col + "1F", border:"1px solid " + st.col + "66", borderRadius:8, padding:"3px 9px" }}>{st.txt}</div>}
                      </div>
                      <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                        <div style={{ fontSize:15, fontWeight:900, color:color }}>{pesos(totalItemsDelivery(its))}</div>
                        <div style={{ fontSize:11, color:"#888", marginTop:2 }}>⏱ {hace(c.abierta_at)}</div>
                        {desp.cadete && <div style={{ fontSize:11, color:"#7CC4E4", marginTop:2 }}>🛵 {desp.cadete}</div>}
                        {desp.en_camino_at && <div style={{ fontSize:10, color:"#3A9BC1", marginTop:2 }}>salió {horaSeg(desp.en_camino_at).slice(0, 5)}</div>}
                        {desp.cobrado_efectivo > 0 && <div style={{ fontSize:10.5, color: desp.rendido ? "#8FD19A" : "#D9B8F5", marginTop:2 }}>{desp.rendido ? "💵 rendido" : "💵 cobró " + pesos(desp.cobrado_efectivo)}</div>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap", justifyContent:"flex-end", alignItems:"center", marginTop:9 }}>
                      {et.id !== "armando" && et.id !== "entregado" && cadetes.length > 0 && (
                        <select value={desp.cadete || ""} onChange={function(e) { props.onAsignar(c, e.target.value); }} style={{ ...INP, width:"auto", padding:"7px 9px", fontSize:12, fontWeight:700, color: desp.cadete ? "#7CC4E4" : "#9A9A9A" }}>
                          <option value="">🛵 Asignar cadete…</option>
                          {cadetes.map(function(n) { return <option key={n} value={n}>🛵 {n}</option>; })}
                        </select>
                      )}
                      {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...GH, padding:"7px 12px", fontSize:12, textDecoration:"none", borderColor:"#25D36688", color:"#5BDB8B" }}>💬 WhatsApp</a>}
                      <button onClick={function() { props.onAbrir(c); }} style={{ ...GH, padding:"7px 12px", fontSize:12 }}>🧾 Abrir cuenta</button>
                      {(et.id === "listo" || et.id === "cocina") && web[c.id] && web[c.id].medio === "transferencia" && !web[c.id].transf_ok && <button onClick={function() { props.onTransferencia(c); }} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"#B07CD8", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:900, cursor:"pointer" }}>📲 Confirmar transferencia recibida</button>}
                      {et.id === "listo" && cadetes.length > 0 && !desp.cadete && <span style={{ fontSize:12, fontWeight:800, color:"#D4A017" }}>👆 Asigná un cadete para despachar</span>}
                      {et.id === "listo" && (cadetes.length === 0 || desp.cadete) && !(web[c.id] && web[c.id].medio === "transferencia" && !web[c.id].transf_ok) && <button onClick={function() { props.onDespacho(c, "en_camino"); }} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"#3A9BC1", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:900, cursor:"pointer" }}>🛵 Salió el delivery</button>}
                      {et.id === "camino" && desp.cadete && <span style={{ fontSize:11.5, color:"#7CC4E4" }}>Lo marca {desp.cadete} al entregar</span>}
                      {et.id === "camino" && <button onClick={function() { props.onDespacho(c, "entregado"); }} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"#3A7D44", color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:900, cursor:"pointer" }}>{desp.cadete ? "✅ Marcar entregado" : "✅ Llegó al cliente"}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
// Informe de los deliverys de un día de negocio en un local: cuántos, cuánto se vendió, cuánto tardaron y cuáles llegaron tarde.
function InformeDelivery(props) {
  var localId = props.localId, color = props.color;
  var [fecha, setFecha] = useState(props.diaDeNegocio ? props.diaDeNegocio() : new Date().toISOString().slice(0, 10));
  var [datos, setDatos] = useState(null);
  useEffect(function() {
    var vivo = true; setDatos(null);
    var d0 = new Date(fecha + "T06:00:00"), d1 = new Date(d0.getTime() + 86400000);
    cfetch(SURL + "/rest/v1/comandas?tipo=eq.delivery&local=eq." + encodeURIComponent(localId) + "&abierta_at=gte." + d0.toISOString() + "&abierta_at=lt." + d1.toISOString() + "&order=abierta_at", { headers: {...SH, "Cache-Control":"no-cache"} })
      .then(function(r) { return r.json(); })
      .then(function(cs) {
        cs = (Array.isArray(cs) ? cs : []).filter(function(c) { return !esComandaPrueba(c.id); });
        return Promise.all([sbLoadItems(cs.map(function(c) { return c.id; })), sbLeerEntregas(d0.toISOString()), sbLeerDespachos(d0.toISOString()), cargarPagosGen(localId, fecha, cfetch)]).then(function(r) {
          if (vivo) setDatos({ cs:cs, items:r[0], entregas:r[1], desp:r[2], pagos:r[3].filter(function(x) { return x.tipo === "delivery"; }) });
        });
      }).catch(function() { if (vivo) setDatos({ cs:[], items:[], entregas:{}, desp:{}, pagos:[] }); });
    return function() { vivo = false; };
  }, [localId, fecha, props.refresco]);
  var cuerpo;
  if (!datos) cuerpo = <div style={{ textAlign:"center", padding:"40px 0", color:"#444" }}>Cargando…</div>;
  else if (!datos.cs.length) cuerpo = <div style={{ textAlign:"center", padding:"40px 0", color:"#555", fontSize:14 }}>No hubo deliverys este día.</div>;
  else {
    var filas = datos.cs.map(function(c) {
      var its = datos.items.filter(function(i) { return i.comanda_id === c.id; });
      var pago = datos.pagos.find(function(x) { return x.comanda_id === c.id; });
      var desp = datos.desp[c.id] || {}, ent = datos.entregas[c.id] || {};
      var fin = desp.entregado_at || (c.estado === "cerrada" ? c.cerrada_at : null);
      var tardo = fin ? Math.round((new Date(fin) - new Date(c.abierta_at)) / 60000) : null;
      var atraso = fin && ent.prometida_at ? Math.round((new Date(fin) - new Date(ent.prometida_at)) / 60000) : null;
      return { c:c, total: pago ? Number(pago.total) || 0 : totalItemsDelivery(its), cobrado:!!pago, pago:pago, tardo:tardo, atraso:atraso, prometida:ent.prometida_at || null };
    });
    var cobrados = filas.filter(function(f) { return f.cobrado; });
    var ventas = cobrados.reduce(function(a, f) { return a + f.total; }, 0);
    var conTiempo = filas.filter(function(f) { return f.tardo !== null && f.tardo >= 0; });
    var prom = conTiempo.length ? Math.round(conTiempo.reduce(function(a, f) { return a + f.tardo; }, 0) / conTiempo.length) : null;
    var conPrometida = filas.filter(function(f) { return f.atraso !== null; });
    var aTiempo = conPrometida.filter(function(f) { return f.atraso <= 0; }).length;
    var medios = {};
    cobrados.forEach(function(f) { (f.pago.pagos || []).forEach(function(x) { medios[x.medio] = (medios[x.medio] || 0) + (Number(x.monto) || 0); }); });
    var nombreMedio = function(id) { var m = mediosDeLocal(localId).find(function(z) { return z.id === id; }); return m ? m.emoji + " " + m.nombre : id; };
    var kpi = function(t, v, sub) { return <div style={{ background:"#111", border:"1px solid #222", borderRadius:10, padding:"10px 12px", flex:"1 1 130px" }}><div style={{ fontSize:10, color:"#8C8C8C", textTransform:"uppercase", letterSpacing:1 }}>{t}</div><div style={{ fontSize:20, fontWeight:900, color:"#F0EDE8", marginTop:2 }}>{v}</div>{sub && <div style={{ fontSize:10.5, color:"#777", marginTop:1 }}>{sub}</div>}</div>; };
    cuerpo = (
      <div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {kpi("Pedidos", filas.length, cobrados.length + " cobrados")}
          {kpi("Ventas", pesos(ventas), cobrados.length ? "ticket " + pesos(ventas / cobrados.length) : "")}
          {kpi("Tiempo promedio", prom !== null ? prom + " min" : "—", "desde que se abrió hasta que llegó")}
          {kpi("A tiempo", conPrometida.length ? aTiempo + " de " + conPrometida.length : "—", conPrometida.length ? Math.round(aTiempo * 100 / conPrometida.length) + "% llegó en la hora prometida" : "")}
        </div>
        {Object.keys(medios).length > 0 && (
          <div style={{ background:"#111", border:"1px solid #222", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:"#8C8C8C", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Cobrado por medio de pago</div>
            {Object.keys(medios).map(function(m) { return <div key={m} style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#D0D0D0", padding:"2px 0" }}><span>{nombreMedio(m)}</span><b>{pesos(medios[m])}</b></div>; })}
          </div>
        )}
        <div style={{ fontSize:10, color:"#8C8C8C", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Cada pedido</div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {filas.map(function(f) {
            var tarde = f.atraso !== null && f.atraso > 0;
            return (
              <div key={f.c.id} style={{ background:"#0F0F0F", border:"1px solid " + (tarde ? "#E0452E66" : "#1E1E1E"), borderRadius:9, padding:"8px 11px", display:"flex", justifyContent:"space-between", gap:10, alignItems:"center" }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:"#F0EDE8" }}>#{f.c.numero} · {f.c.cliente || "Sin nombre"} <span style={{ fontWeight:500, color:"#777", fontSize:11 }}>· {horaSeg(f.c.abierta_at).slice(0, 5)}</span></div>
                  {f.c.direccion && <div style={{ fontSize:11, color:"#777" }}>📍 {f.c.direccion}</div>}
                  <div style={{ fontSize:11, marginTop:2, color: tarde ? "#E0452E" : "#8C8C8C" }}>
                    {f.tardo !== null ? "Tardó " + f.tardo + " min" : f.c.estado === "cerrada" ? "Cerrado" : "Todavía abierto"}
                    {f.atraso !== null ? (tarde ? " · llegó " + f.atraso + " min tarde" : " · a tiempo") : ""}
                  </div>
                </div>
                <div style={{ textAlign:"right", whiteSpace:"nowrap", fontSize:13, fontWeight:900, color: f.cobrado ? "#8FD19A" : "#9A9A9A" }}>{pesos(f.total)}<div style={{ fontSize:10, fontWeight:600 }}>{f.cobrado ? "cobrado" : "sin cobrar"}</div></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <span style={{ fontSize:12, color:"#8C8C8C" }}>Día</span>
        <input type="date" value={fecha} onChange={function(e) { if (e.target.value) setFecha(e.target.value); }} style={{ ...INP, width:"auto", padding:"7px 10px" }} />
      </div>
      {cuerpo}
    </div>
  );
}

export default function PanelComandas(p) {
  var usuario = p.usuario || "";
  // Un mozo ve su local y nada más; administración elige.
  var localFijo = p.localFijo || null;
  var [localId, setLocalId] = useState(localFijo || "l1");
  var [vista, setVista] = useState("mesas");
  var [mesas, setMesas] = useState([]);
  var [comandas, setComandas] = useState([]);
  var [cargando, setCargando] = useState(true);
  var [problemaTabla, setProblemaTabla] = useState(null);
  var [config, setConfig] = useState(false);
  var [carta, setCarta] = useState([]);
  var [items, setItems] = useState([]);
  var [abiertaId, setAbiertaId] = useState(null);
  var [ahora, setAhora] = useState(Date.now());
  var [practica, setPractica] = useState(false);
  useEffect(function() { setTurnos(null); sbLeerTurnos(localId).then(setTurnos); }, [localId, practica]);
  var mozos = mozosDeLocal(p.empleados, localId);
  var [discontinuando, setDiscontinuando] = useState(false);   // ventana para sacar de la carta un producto que no hay
  var [pruebaVivo, setPruebaVivoS] = useState(function() { try { return sessionStorage.getItem("nkt_prueba_vivo") === "1"; } catch(e) { return false; } });
  function setPruebaVivo(v) { setPruebaVivoS(v); try { sessionStorage.setItem("nkt_prueba_vivo", v ? "1" : "0"); } catch(e) {} }
  var [verCocina, setVerCocina] = useState(false);   // la pantalla de cocina, a pantalla completa dentro de Comandas
  var [turnos, setTurnos] = useState(null);          // null = todavía no se leyó
  var [abriendoTurno, setAbriendoTurno] = useState(false);
  var [fechaTurno, setFechaTurno] = useState("");
  var turnoActual = (turnos || []).find(function(t) { return t.estado === "abierto"; }) || null;
  // El día de las ventas es el del turno abierto: así lo cobrado cae en el cierre de esa fecha.
  function fechaNegocio() { return turnoActual ? turnoActual.fecha : (p.diaDeNegocio ? p.diaDeNegocio() : new Date().toISOString().slice(0, 10)); }
  var [entregas, setEntregas] = useState({});   // tiempos de entrega prometidos {comanda_id: {...}}
  var [pedidosWeb, setPedidosWeb] = useState({});   // pedidos de Comunidad {comanda_id: aviso}
  var [despachos, setDespachos] = useState({});   // delivery: en camino / entregado al cliente {comanda_id: {...}}
  var [vistaDel, setVistaDel] = useState("pedidos");   // módulo de delivery: pedidos | informe
  var [refInforme, setRefInforme] = useState(0);
  var verInforme = !p.soloServicio || !!p.puedeDescuento;   // el informe lo ven administración y cajeros
  var [eligeMozo, setEligeMozo] = useState(null);   // {titulo, alElegir}
  var [eligePersonas, setEligePersonas] = useState(null);   // {titulo, alElegir}: cuántas personas vienen a la mesa
  var [ultimoMozo, setUltimoMozo] = useState(null);
  // Pregunta quién toma el pedido; si el local no tiene empleados cargados, sigue con el usuario de siempre.
  function pedirMozo(titulo, alElegir) {
    if (!mozos.length) { alElegir(usuario); return; }
    setEligeMozo({ titulo: titulo, alElegir: alElegir });
  }

  // Todo lo que se hace en una cuenta queda anotado con quién y a qué hora (se ve en el historial de la cuenta y en el informe).
  function registrarVarias(arr) {
    var fecha = fechaNegocio();
    sbLogAcciones(arr.map(function(x, i) {
      return { local: x.c.local || localId, fecha: fecha, comanda_id: x.c.id, titulo: x.c.tipo ? tituloDe(x.c) : "", accion: x.accion, detalle: x.detalle || "", por: usuario, at: new Date(Date.now() + i).toISOString() };
    }));
  }
  function registrar(c, accion, detalle) { registrarVarias([{ c: c, accion: accion, detalle: detalle }]); }
  // El cajero le promete un tiempo al cliente (delivery y mostrador): se cuenta desde que lo fija.
  // Si el pedido vino de Comunidad, el cliente ve la hora nueva en su portada.
  function avisarHoraAlWeb(c, e) {
    var av = pedidosWeb[c.id];
    if (!av || av.estado !== "aceptado") return;
    var nuevo = { ...av, prometida_at:e.prometida_at, minutos:e.minutos };
    setPedidosWeb(function(prev) { return { ...prev, [c.id]: nuevo }; });
    sbGuardarPedidoWeb(nuevo);
  }
  function fijarEntrega(c, minutos, desdeISO) {
    var base = desdeISO ? new Date(desdeISO).getTime() : Date.now();
    var e = { comanda_id: c.id, local: c.local || localId, minutos: minutos, prometida_at: new Date(base + minutos * 60000).toISOString(), por: usuario, at: new Date().toISOString() };
    setEntregas(function(prev) { return { ...prev, [c.id]: e }; });
    sbGuardarEntrega(e);
    registrar(c, "Fijó el tiempo de entrega", minutos + " min (hora prometida " + horaSeg(e.prometida_at).slice(0, 5) + ")");
    avisarHoraAlWeb(c, e);
  }
  // El cliente sumó algo con el pedido en marcha: se le suman minutos a la hora que ya se le había prometido.
  function sumarEntrega(c, extra) {
    var ant = entregas[c.id];
    var base = ant && ant.prometida_at ? Math.max(new Date(ant.prometida_at).getTime(), Date.now()) : Date.now();
    var e = { ...(ant || {}), comanda_id: c.id, local: c.local || localId, minutos: (Number(ant && ant.minutos) || 0) + extra, prometida_at: new Date(base + extra * 60000).toISOString(), por: usuario, at: new Date().toISOString() };
    setEntregas(function(prev) { return { ...prev, [c.id]: e }; });
    sbGuardarEntrega(e);
    registrar(c, "Sumó tiempo a la entrega", "+" + extra + " min (nueva hora prometida " + horaSeg(e.prometida_at).slice(0, 5) + ")");
    avisarHoraAlWeb(c, e);
  }
  var [posPlano, setPosPlano] = useState({});     // {mesaId: {x, y}} en %
  var [verPlano, setVerPlano] = useState(false);
  var [acomodando, setAcomodando] = useState(false);
  var [extrasPlano, setExtrasPlano] = useState([]);   // cuadros decorativos: barra, cocina, etc. {id, tipo, x, y}
  var [dimsPlano, setDimsPlano] = useState(null);     // {ancho, largo} en metros; null = el lienzo de siempre
  var [arrastre, setArrastre] = useState(null);   // id de la mesa que se está moviendo
  useEffect(function() {
    var vivo = true;
    sbLeerPlano(localId).then(function(x) {
      if (!vivo) return;
      var pos = x.pos, extras = x.extras, dims = x.dims || (localId === "l1" ? { ancho:4, largo:20 } : null);
      // Plano viejo: todo el lienzo era el salón. Ahora el lienzo es el terreno entero y el salón es un recuadro más,
      // con 3 m de aire alrededor para armar las otras áreas. Las mesas se reubican adentro del salón.
      if (dims && x.modelo < 2) {
        var a0 = Number(dims.ancho) || 4, l0 = Number(dims.largo) || 20, A = a0 + 6, L = l0 + 6;
        var np = {}; Object.keys(pos).forEach(function(k) { np[k] = { x: Math.round((3 + pos[k].x / 100 * a0) / A * 100), y: Math.round((3 + pos[k].y / 100 * l0) / L * 100) }; });
        extras = extras.map(function(z) { return { ...z, x: Math.round((3 + z.x / 100 * a0) / A * 100), y: Math.round((3 + z.y / 100 * l0) / L * 100) }; })
          .concat([{ id: "x_salon", tipo: "salon", nombre: null, x: 50, y: 50, w: Math.round(a0 / A * 100), h: Math.round(l0 / L * 100) }]);
        pos = np; dims = { ancho: A, largo: L };
      }
      setPosPlano(pos); setExtrasPlano(extras); setDimsPlano(dims);
      setVerPlano(Object.keys(pos).length > 0 || extras.length > 0); setAcomodando(false);
    });
    return function() { vivo = false; };
  }, [localId, practica]);
  // Siempre se sale del simulador al irse de la pantalla: no puede quedar prendido.
  useEffect(function() { return function() { simTerminar(); }; }, []);
  function recargarTodo() { setAbiertaId(null); setCobrando(null); return Promise.all([cargar(), cargarCarta()]); }
  // Prueba compartida: las cuentas se guardan de verdad pero marcadas como PRUEBA; se ven en todos los aparatos (también en la cocina).
  function borrarPruebas() {
    if (!window.confirm("¿Borrar TODO lo de la prueba (cuentas, productos, cobros y avisos de prueba)? Lo real no se toca.")) return;
    sbBorrarPruebas().then(function(ok) {
      setAbiertaId(null); setCobrando(null); cargar(); setRefInforme(function(n) { return n + 1; });
      alert(ok ? "Listo: se borró todo lo de la prueba." : "Se borró casi todo, pero algo no se pudo borrar. Probá de nuevo.");
    });
  }
  function entrarPractica() {
    simIniciar().then(function() { setPractica(true); recargarTodo(); });
  }
  function salirPractica() {
    if (!window.confirm("¿Salir de la práctica? Todo lo que probaste se borra y no queda en ningún cierre.")) return;
    simTerminar(); setPractica(false); recargarTodo();
  }
  function reiniciarPractica() {
    if (!window.confirm("¿Borrar lo practicado y empezar de cero?")) return;
    simIniciar().then(recargarTodo);
  }

  function cargar() {
    sbLeerEntregas().then(setEntregas);
    sbLeerDespachos().then(setDespachos);
    sbLeerPedidosWeb().then(setPedidosWeb);
    sbLeerSinCocina(localId).then(setCfgSinCocina);
    sbLeerTurnos(localId).then(setTurnos);
    sbLeerListosDesde(new Date(Date.now() - 24 * 3600000).toISOString()).then(setListosMap);
    sbLeerExtrasRecientes().then(setExtrasTodos);
    return Promise.all([sbLoadMesas(), sbLoadComandas()]).then(function(r) {
      setMesas(r[0]); setComandas(r[1]); setCargando(false);
      return sbLoadItems(r[1].map(function(c) { return c.id; })).then(setItems);
    }).catch(function() { setCargando(false); });
  }
  var [extrasTodos, setExtrasTodos] = useState({});   // lo extra de todas las cuentas (cómo sale lo agregado), para que cada mesa cuente bien su tiempo
  function salidasDe(cid) { return ((extras[cid] && extras[cid].salidas) ? extras[cid] : (extrasTodos[cid] || {})).salidas; }
  var [listosMap, setListosMap] = useState({});   // lo que la cocina ya entregó (para saber desde cuándo cuenta lo principal)
  var [cfgCom, setCfgCom] = useState({ limites: {}, exigir: {} });
  useEffect(function() { sbLeerConfigCom().then(setCfgCom); }, [practica]);
  var exigirCocina = exigeCocina(cfgCom, localId);   // el mozo o el cajero solo lleva a la mesa lo que la cocina ya entregó
  var limite = limiteDe(cfgCom, localId);   // minutos: pasado este tiempo la mesa y el pedido avisan en rojo
  var [coloresCarta, setColoresCarta] = useState({ cats: {}, platos: {} });
  useEffect(function() { sbLeerColoresCarta(localId).then(setColoresCarta); }, [localId, practica]);
  function cargarCarta() { return sbLoadCarta().then(setCarta).catch(function() {}); }
  // Bebidas: no van a la cocina. Se reconocen por la categoría de la carta (se puede ajustar en la pestaña Carta).
  var [cfgSinCocina, setCfgSinCocina] = useState(null);
  function esSinCocina(nombre) {
    var n = String(nombre || "").trim().toLowerCase();
    var it = carta.find(function(x) { return x.local === localId && String(x.nombre || "").trim().toLowerCase() === n; });
    return it ? categoriaSinCocina(it.categoria, cfgSinCocina) : false;
  }
  // Comanda de cocina en papel (si el local lo tiene prendido): mismo mecanismo que la de barra, con destino «cocina».
  function imprimirCocina(c, its, ronda, salida, separaEntrada) {
    if (!imprimeCocina(cfgCom, localId)) return;
    var e = entregas[c.id];
    sbCrearImpresionBarra({ destino:"cocina", personas:(extras[c.id] || {}).personas || null, comanda_id:c.id, local:c.local, tipo:c.tipo, numero:c.numero, titulo:tituloDe(c), mozo:c.mozo || "", cliente:c.cliente || "", direccion:c.direccion || "", ronda:ronda,
      salida: salida || "", entrega_at: e && e.prometida_at ? e.prometida_at : "", at:new Date().toISOString(), impreso:false, prueba:esComandaPrueba(c.id) || practica, por:usuario,
      items: its.map(function(i) { return { cant:Number(i.cant) || 1, nombre:i.nombre, nota:notaVisible(i), entrada:esEntrada(i) }; }) });
  }
  // Anular una cuenta ya comandada: los productos pasan a «cancelado» (la cocina deja de verlos), la cuenta queda «cancelada» (no cobra, no entra a la caja) y todo queda en el historial.
  function anularCuenta(c, motivo) {
    if (!window.confirm("¿Anular " + tituloDe(c) + "?\n\nMotivo: " + motivo + "\n\nNo se cobra y no se puede deshacer.")) return;
    var ahoraISO = new Date().toISOString();
    var propios = items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
    var nota = "Anulada: " + motivo + " (" + usuario + ")";
    if (propios.length) guardarItems(propios.map(function(i) { return { ...i, estado:"cancelado", nota:nota }; }));
    guardar({ ...c, estado:"cancelada", cerrada_at:ahoraISO });
    registrar(c, "Anuló la cuenta", motivo + " · " + propios.length + " producto" + (propios.length === 1 ? "" : "s") + " · por " + usuario);
    setAbiertaId(null);
  }
  // Ticket de control (precuenta) para el cliente: sale por la impresora de la barra/caja con el programa de la comandera.
  function imprimirControl(c, d) {
    sbCrearImpresionBarra({ destino:"control", comanda_id:c.id, local:c.local, tipo:c.tipo, numero:c.numero, titulo:tituloDe(c), mozo:c.mozo || "", cliente:c.cliente || "", direccion:c.direccion || "",
      subtotal:d.subtotal, descuento:d.descuento, descuento_motivo:d.motivo, total:d.total, personas:d.personas || null, at:new Date().toISOString(), impreso:false, prueba:esComandaPrueba(c.id) || practica, por:usuario, items:d.items }).then(function(ok) {
      if (!ok) alert("No se pudo dejar el ticket para imprimir. Revisá la conexión.");
    });
    registrar(c, "Imprimió el control", pesos(d.total));
  }
  function imprimirBarra(c, its, ronda) {
    var ahoraISO = new Date().toISOString();
    sbCrearImpresionBarra({ destino:"barra", personas:(extras[c.id] || {}).personas || null, comanda_id:c.id, local:c.local, tipo:c.tipo, numero:c.numero, titulo:tituloDe(c), mozo:c.mozo || "", cliente:c.cliente || "", direccion:c.direccion || "", ronda:ronda, at:ahoraISO, impreso:false, prueba:esComandaPrueba(c.id) || practica, por:usuario,
      items: its.map(function(i) { return { cant:Number(i.cant) || 1, nombre:i.nombre, nota:notaVisible(i) }; }) });
    registrar(c, "Comanda de barra", its.map(function(i) { return (Number(i.cant) || 1) + "x " + i.nombre; }).join(", "));
  }

  useEffect(function() {
    var vivo = true;
    sbComandasDisponible().then(function(err) { if (vivo) setProblemaTabla(err); });
    cargar();
    cargarCarta();
    // Durante el servicio la pantalla la miran varios a la vez: el mozo abre la
    // mesa y el encargado tiene que verla sin apretar nada. Refrescar solo cada 20
    // segundos es lo mínimo para que no sea una foto vieja. Lo correcto sería
    // Supabase Realtime, que además necesita abrir el CSP a wss://.
    var t = setInterval(function() { if (vivo) { cargar(); setAhora(Date.now()); } }, 8000);
    // El reloj de "hace cuánto" corre aparte, más seguido y sin pegarle a la base.
    var reloj = setInterval(function() { if (vivo) setAhora(Date.now()); }, 30000);
    return function() { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, []);

  var local = getLocal(localId);
  var color = (local && local.color) || "#C1440E";
  var vistaActual = CMD_VISTAS.find(function(v) { return v.id === vista; }) || CMD_VISTAS[0];

  var mesasLocal = mesas.filter(function(m) { return m.local === localId && m.activa !== false; });
  var abiertas = comandas.filter(function(c) { return c.local === localId; });
  function comandaDeMesa(mesaId) { return abiertas.find(function(c) { return c.tipo === "mesa" && c.mesa_id === mesaId; }); }
  var delTipo = abiertas.filter(function(c) { return c.tipo === vistaActual.tipo && !(pedidosWeb[c.id] && pedidosWeb[c.id].estado === "nuevo"); });

  var comandaAbierta = abiertaId ? comandas.find(function(x) { return x.id === abiertaId; }) : null;
  var planoActual = { pos: posPlano, extras: extrasPlano };
  function sectorDe(m) { return sectorDeMesa(m, planoActual); }
  function tituloDe(c) {
    if (!c) return "";
    if (c.tipo === "mesa") {
      var m = mesas.find(function(x) { return x.id === c.mesa_id; });
      var sc = m ? sectorDe(m) : null;
      return "🪑 Mesa " + ((m && m.nombre) || "") + (sc ? " · " + sc.nombre : "");
    }
    return (c.tipo === "delivery" ? "🛵 Delivery" : "🥡 Mostrador") + (c.cliente ? " · " + c.cliente : "");
  }

  function proximoNumero() {
    var hoy = new Date().toISOString().slice(0, 10);
    var nums = comandas.filter(function(c) { return c.local === localId && esComandaPrueba(c.id) === pruebaVivo && String(c.abierta_at || "").slice(0, 10) === hoy; })
      .map(function(c) { return parseInt(c.numero, 10) || 0; });
    return (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  }

  // Se pinta primero y se guarda después, porque durante el servicio esperar a la
  // base para que la mesa cambie de color es insoportable. Pero si la base rechaza,
  // se vuelve atrás: una mesa pintada de ocupada que en realidad no se guardó es
  // peor que una que no se pintó, porque nadie se entera hasta que es tarde.
  function guardar(c) {
    var antes = comandas;
    setComandas(function(prev) {
      var f = prev.filter(function(x) { return x.id !== c.id; });
      return c.estado === "abierta" ? [c].concat(f) : f;
    });
    return sbSaveComanda(c).then(function(err) {
      if (err) {
        setComandas(antes);
        alert("No se pudo guardar la comanda:\n\n" + err + "\n\nSi el error menciona la tabla comandas, hay que crearla en Supabase (el SQL está en el README).");
        return err;
      }
      cargar();
      return null;
    });
  }

  // Se pinta primero y se guarda después; si la base rechaza, vuelve atrás. Un plato
  // que se ve cargado pero no se guardó es un plato que la cocina nunca recibe.
  function guardarItems(filas) {
    var antes = items;
    var grupos = {};
    filas.forEach(function(f) {
      var prev = items.find(function(x) { return x.id === f.id; });
      var det = (Number(f.cant) || 1) + "x " + f.nombre, acc = null;
      if (!prev) { acc = f.estado === "cancelado" ? "Quitó de la cuenta" : "Agregó a la cuenta"; if (f.estado === "cancelado" && f.nota) det += " — " + f.nota; if (String(f.nota || "").indexOf("🔄 reemplaza a ") === 0) acc = null; }
      else if (prev.estado !== f.estado) {
        acc = f.estado === "enviado" ? (prev.estado === "entregado" ? "Desmarcó la entrega" : prev.estado === "listo" ? "Volvió a la cocina" : "Marchó a la cocina") : f.estado === "listo" ? (prev.estado === "entregado" ? "Desmarcó la entrega a la mesa" : "Cocina dejó listo") : f.estado === "entregado" ? "Entregó a la mesa" : f.estado === "cancelado" ? "Quitó de la cuenta" : "Volvió a pendiente";
        if (f.estado === "cancelado" && f.nota) det += " — " + f.nota;
        if (f.estado === "cancelado" && String(f.nota || "").indexOf("cambio por ") === 0) { acc = "Cambió un producto"; det = (Number(f.cant) || 1) + "x " + f.nombre + " → " + String(f.nota).slice(11); }
      }
      else if (Number(prev.cant) !== Number(f.cant)) { acc = "Cambió la cantidad"; det = f.nombre + ": " + prev.cant + " → " + f.cant; }
      else if (Number(prev.precio) !== Number(f.precio)) { acc = "Puso precio"; det = f.nombre + ": " + pesos(f.precio); }
      else if ((prev.nota || "") !== (f.nota || "")) {
        if (esEntrada(prev) !== esEntrada(f) && notaVisible(prev) === notaVisible(f)) { acc = esEntrada(f) ? "Marcó como entrada" : "Sacó de entrada"; det = f.nombre; }
        else { acc = "Anotó una nota"; det = f.nombre + ": " + (notaVisible(f) || "(sin nota)"); }
      }
      if (!acc) return;
      var k = f.comanda_id + "|" + acc; (grupos[k] = grupos[k] || { cid: f.comanda_id, acc: acc, dets: [] }).dets.push(det);
    });
    var lista = Object.keys(grupos).map(function(k) { var g = grupos[k]; return { c: comandas.find(function(x) { return x.id === g.cid; }) || { id: g.cid }, accion: g.acc, detalle: g.dets.join(", ") }; });
    if (lista.length) registrarVarias(lista);
    setItems(function(prev) {
      var ids = filas.map(function(f) { return f.id; });
      return prev.filter(function(x) { return ids.indexOf(x.id) === -1; }).concat(filas);
    });
    return sbSaveItems(filas).then(function(err) {
      if (err) {
        setItems(antes);
        alert("No se pudo guardar el pedido:\n\n" + err + "\n\nSi el error menciona comanda_items o alguna columna, falta correr el SQL del README. Acordate del alter de RLS.");
        return err;
      }
      return null;
    });
  }
  // Pedidos nuevos de Comunidad (de este local) que esperan al cajero.
  var nuevosWeb = comandas.filter(function(c) { return c.local === localId && c.tipo === "delivery" && pedidosWeb[c.id] && pedidosWeb[c.id].estado === "nuevo"; });
  var contNuevosWeb = useRef(null);
  useEffect(function() {
    // Suena cuando entra uno nuevo (no en la primera lectura).
    if (contNuevosWeb.current !== null && nuevosWeb.length > contNuevosWeb.current) avisoSonoro(3);
    contNuevosWeb.current = nuevosWeb.length;
  }, [nuevosWeb.length]);
  function aceptarWeb(c, minutos) {
    if (!puedeAbrirCuenta()) return;
    var ahoraISO = new Date().toISOString();
    var nueva = { ...c, numero: proximoNumero() };
    guardar(nueva);
    fijarEntrega(nueva, minutos, ahoraISO);
    var pend = items.filter(function(i) { return i.comanda_id === c.id && i.estado === "pendiente"; });
    guardarItems(pend.map(function(i) {
      if (esSinCocina(i.nombre)) { var t = notaVisible(i); return { ...i, estado:"listo", ronda:1, enviado_at:ahoraISO, nota: MARCA_BARRA + (t ? " | " + t : "") }; }
      return { ...i, estado:"enviado", ronda:1, enviado_at:ahoraISO };
    }));
    var deBarra = pend.filter(function(i) { return esSinCocina(i.nombre); });
    if (deBarra.length) imprimirBarra(nueva, deBarra, 1);
    var deCocinaWeb = pend.filter(function(i) { return !esSinCocina(i.nombre); });
    if (deCocinaWeb.length) imprimirCocina(nueva, deCocinaWeb, 1, "", false);
    var av = { ...(pedidosWeb[c.id] || {}), comanda_id:c.id, local:c.local, estado:"aceptado", aceptado_at:ahoraISO, aceptado_por:usuario, minutos:minutos, prometida_at:new Date(Date.now() + minutos * 60000).toISOString() };
    setPedidosWeb(function(prev) { return { ...prev, [c.id]: av }; });
    sbGuardarPedidoWeb(av).then(function(ok) { if (!ok) alert("El pedido se aceptó, pero no se pudo avisar al cliente. Avisale por WhatsApp."); });
    registrar(nueva, "Aceptó un pedido de Comunidad", (c.cliente || "") + " · " + minutos + " min");
  }
  function rechazarWeb(c, motivo) {
    var ahoraISO = new Date().toISOString();
    guardar({ ...c, estado:"cancelada", cerrada_at:ahoraISO });
    var av = { ...(pedidosWeb[c.id] || {}), comanda_id:c.id, local:c.local, estado:"rechazado", motivo:motivo, rechazado_at:ahoraISO, aceptado_por:usuario };
    setPedidosWeb(function(prev) { return { ...prev, [c.id]: av }; });
    sbGuardarPedidoWeb(av);
    registrar(c, "Rechazó un pedido de Comunidad", (c.cliente || "") + " · " + motivo);
    var wa = c.telefono ? linkWspDelivery(c.telefono, "Hola " + (c.cliente || "") + "! No pudimos tomar tu pedido de " + (local && local.nombre || "") + ": " + motivo + ". Disculpá las molestias.") : "";
    if (wa && window.confirm("Pedido rechazado. ¿Querés avisarle al cliente por WhatsApp?")) window.open(wa, "_blank");
  }
  // Delivery tomado por el cajero: cómo paga el cliente (efectivo al recibir o transferencia al local). Si es transferencia, no se despacha hasta confirmarla.
  function fijarMedioDelivery(c, medio) {
    var av = { ...(pedidosWeb[c.id] || {}), comanda_id:c.id, local:c.local, estado:"aceptado", origen:"cajero", medio:medio, cliente:c.cliente || "", creado_at:(pedidosWeb[c.id] && pedidosWeb[c.id].creado_at) || new Date().toISOString(), aceptado_por:usuario };
    setPedidosWeb(function(prev) { return { ...prev, [c.id]: av }; });
    sbGuardarPedidoWeb(av);
    registrar(c, "Eligió cómo paga el delivery", medio === "transferencia" ? "Transferencia al local" : "Efectivo al recibir");
  }
  // El cajero asigna el pedido a un cadete (los cadetes reparten para los 3 locales).
  function asignarCadete(c, nombre) {
    var nuevo = { ...(despachos[c.id] || {}), comanda_id:c.id, local:c.local, cadete:nombre || null, asignado_at:new Date().toISOString(), asignado_por:usuario };
    setDespachos(function(prev) { return { ...prev, [c.id]: nuevo }; });
    sbGuardarDespacho(nuevo);
    registrar(c, nombre ? "Asignó el pedido a un cadete" : "Sacó al cadete del pedido", nombre || "");
  }
  // Efectivo que los cadetes cobraron de pedidos de este local y todavía no rindieron.
  var rendiciones = (function() {
    var por = {};
    Object.keys(despachos).forEach(function(id) {
      var d = despachos[id];
      if (d && d.local === localId && d.cadete && d.cobrado_efectivo > 0 && !d.rendido) { var r = por[d.cadete] || (por[d.cadete] = { cadete:d.cadete, monto:0, pedidos:0, ids:[] }); r.monto += d.cobrado_efectivo; r.pedidos++; r.ids.push(id); }
    });
    return Object.keys(por).map(function(k) { return por[k]; });
  })();
  function rendir(r) {
    if (!window.confirm("¿Recibiste " + pesos(r.monto) + " de " + r.cadete + "? Contá la plata antes de confirmar.")) return;
    var ahoraISO = new Date().toISOString();
    r.ids.forEach(function(id) {
      var nuevo = { ...despachos[id], rendido:true, rendido_at:ahoraISO, rendido_por:usuario };
      setDespachos(function(prev) { return { ...prev, [id]: nuevo }; });
      sbGuardarDespacho(nuevo);
    });
    sbLogAcciones([{ local:localId, fecha:fechaNegocio(), comanda_id:r.ids[0], titulo:"🛵 Rendición de " + r.cadete, accion:"Recibió el efectivo del cadete", detalle:r.cadete + " · " + pesos(r.monto) + " (" + r.pedidos + " pedido" + (r.pedidos === 1 ? "" : "s") + ")", por:usuario, at:ahoraISO }]);
  }
  function confirmarTransferencia(c) {
    var av = { ...(pedidosWeb[c.id] || {}), comanda_id:c.id, local:c.local, transf_ok:true, transf_at:new Date().toISOString(), transf_por:usuario };
    setPedidosWeb(function(prev) { return { ...prev, [c.id]: av }; });
    sbGuardarPedidoWeb(av);
    registrar(c, "Confirmó la transferencia", c.cliente || "");
  }
  // Delivery: el cajero marca cuándo salió el pedido y cuándo llegó al cliente.
  function despachar(c, estado) {
    var ahoraISO = new Date().toISOString();
    var d0 = despachos[c.id] || {}, cads = p.cadetes || [];
    // Sin cadete asignado no se despacha (si el local tiene cadetes cargados).
    if (estado === "en_camino" && cads.length && !d0.cadete) { alert("Primero asignale un cadete a este pedido."); return; }
    var nuevo = { ...d0, comanda_id:c.id, local:c.local, estado:estado, por:usuario };
    if (estado === "en_camino") nuevo.en_camino_at = ahoraISO; else nuevo.entregado_at = ahoraISO;
    // Si lo llevó un cadete y lo marca el cajero (porque el cadete no pudo), se anota cuánto cobró el cadete para que figure en su rendición.
    if (estado === "entregado" && d0.cadete) {
      var av = pedidosWeb[c.id] || {};
      if (av.medio === "transferencia") { if (!window.confirm("El pedido lo llevó " + d0.cadete + ". ¿Confirmás que ya se entregó?")) return; nuevo.cobrado_efectivo = 0; }
      else {
        var tot = totalItemsDelivery(items.filter(function(i) { return i.comanda_id === c.id; }));
        var rta = window.prompt("El pedido lo llevó " + d0.cadete + ". ¿Cuánto cobró en efectivo?", String(Math.round(tot)));
        if (rta === null) return;
        nuevo.cobrado_efectivo = parseInt(String(rta).replace(/[^\d]/g, ""), 10) || 0;
      }
    }
    setDespachos(function(prev) { return { ...prev, [c.id]: nuevo }; });
    sbGuardarDespacho(nuevo).then(function(ok) { if (!ok) alert("No se pudo guardar el estado del delivery. Probá de nuevo."); });
    registrar(c, estado === "en_camino" ? "Salió el delivery" : "Llegó al cliente", (c.cliente || "") + (c.direccion ? " · " + c.direccion : ""));
  }
  function borrarItem(id) {
    var it = items.find(function(x) { return x.id === id; });
    if (it) registrarVarias([{ c: comandas.find(function(x) { return x.id === it.comanda_id; }) || { id: it.comanda_id }, accion: "Sacó un ítem sin mandar", detalle: (Number(it.cant) || 1) + "x " + it.nombre }]);
    setItems(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    sbDeleteItem(id);
  }

  // Sin turno abierto no se toman pedidos nuevos. En el modo práctica también: el turno se abre y se cierra de mentira, en memoria.
  function puedeAbrirCuenta() {
    if (turnoActual || pruebaVivo) return true;
    alert(turnos === null ? "Todavía se está leyendo el turno, probá de nuevo en un segundo." : "El turno está cerrado. Primero hay que abrir el turno.");
    return false;
  }
  function abrirTurno() {
    var f = fechaTurno;
    if (!f) return;
    var previo = (turnos || []).find(function(t) { return t.fecha === f; });
    if (previo && !window.confirm("El " + f.split("-").reverse().join("/") + " ya tuvo un turno" + (previo.estado === "cerrado" ? " cerrado" : "") + ". ¿Reabrirlo?")) return;
    var t = { local: localId, fecha: f, estado: "abierto", abierto_at: new Date().toISOString(), abierto_por: usuario, cerrado_at: null, cerrado_por: null };
    setTurnos(function(prev) { return [t].concat((prev || []).filter(function(x) { return x.fecha !== f; })); });
    setAbriendoTurno(false);
    sbGuardarTurno(t).then(function(ok) { if (!ok) alert("No se pudo guardar la apertura del turno."); });
  }
  function cerrarTurno() {
    var pendientes = comandas.filter(function(c) { return c.local === localId && !esComandaPrueba(c.id); });   // las de prueba no cuentan
    if (pendientes.length) {
      alert("No se puede cerrar el turno: hay " + pendientes.length + " cuenta" + (pendientes.length === 1 ? "" : "s") + " sin cobrar.\n\n" + pendientes.map(function(c) { return "• " + tituloDe(c); }).join("\n") + "\n\nCobralas o cerralas y volvé a intentar.");
      return;
    }
    if (!window.confirm("¿Cerrar el turno del " + turnoActual.fecha.split("-").reverse().join("/") + "?\n\nDespués no se pueden abrir cuentas nuevas hasta abrir otro turno.")) return;
    var t = { ...turnoActual, estado: "cerrado", cerrado_at: new Date().toISOString(), cerrado_por: usuario };
    setTurnos(function(prev) { return (prev || []).map(function(x) { return x.fecha === t.fecha ? t : x; }); });
    sbGuardarTurno(t).then(function(ok) { if (!ok) alert("No se pudo guardar el cierre del turno."); });
  }
  // Una mesa libre que se abre es siempre una mesa nueva (también si ya se cobró antes): no se pregunta nada.
  function abrirMesa(mesa) {
    var ya = comandaDeMesa(mesa.id);
    if (ya) { setAbiertaId(ya.id); return; }
    if (!puedeAbrirCuenta()) return;
    function seguir(esNueva) {
      pedirMozo("🪑 Mesa " + (mesa.nombre || ""), function(mozo) {
       setEligePersonas({ titulo:"🪑 Mesa " + (mesa.nombre || "") + " · " + mozo, alElegir:function(personas) {
        var nueva = {
          id: (pruebaVivo ? "cmdp_" : "cmd_") + Date.now(),
          local: localId, tipo: "mesa", mesa_id: mesa.id,
          numero: proximoNumero(), estado: "abierta",
          mozo: mozo, abierta_at: new Date().toISOString(), usuario: usuario,
        };
        var extraNueva = personas ? { mesa_nueva: esNueva, personas: personas } : { mesa_nueva: esNueva };
        registrar(nueva, "Abrió la mesa", "Mozo: " + mozo + (personas ? " · " + personas + " personas" : "") + (esNueva ? " · mesa nueva" : " · misma mesa que seguía"));
        setExtras(function(prev) { return { ...prev, [nueva.id]: extraNueva }; });
        Promise.all([guardar(nueva), sbGuardarExtra(nueva.id, extraNueva, usuario)]).then(function(r) { if (!r[0]) setAbiertaId(nueva.id); });
       } });
      });
    }
    // Una mesa que ya se cobró y se vuelve a tocar es una mesa nueva: se abre directo (sin preguntar) y la cocina lo lee con el cartel «MESA NUEVA».
    seguir(true);
  }
  var [cobrando, setCobrando] = useState(null);   // {c, total}: la comanda que se está cobrando
  // Lo extra de la comanda abierta (descuento, factura, control), guardado aparte.
  var [extras, setExtras] = useState({});
  useEffect(function() {
    if (!abiertaId) return;
    var vivo = true;
    sbLeerExtra(abiertaId).then(function(e) { if (vivo) setExtras(function(prev) { return { ...prev, [abiertaId]: e }; }); });
    return function() { vivo = false; };
  }, [abiertaId]);
  // Cómo sale lo que se agrega a una mesa que ya tiene pedidos en la cocina: «junto» u «orden». Se guarda con la cuenta y la cocina lo muestra resaltado.
  function guardarSalida(comandaId, rondas, salida) {
    var antes = extras[comandaId] || {}, cx = comandas.find(function(x) { return x.id === comandaId; });
    var nuevo = { ...antes, salidas: { ...(antes.salidas || {}) } };
    rondas.forEach(function(r) { nuevo.salidas[r] = salida; });
    setExtras(function(prev) { return { ...prev, [comandaId]: nuevo }; });
    sbGuardarExtra(comandaId, nuevo, usuario);
    if (cx) registrar(cx, "Eligió cómo sale lo agregado", salida === "junto" ? "Todo junto con lo anterior" : "Por orden de comanda");
  }
  function guardarExtra(id, e) {
    var antes = extras[id] || {}, cx = comandas.find(function(x) { return x.id === id; });
    if (cx) {
      if (JSON.stringify(antes.descuento || null) !== JSON.stringify(e.descuento || null)) registrar(cx, e.descuento ? "Aplicó descuento" : "Quitó el descuento", e.descuento ? (e.descuento.tipo === "%" ? e.descuento.valor + "%" : pesos(e.descuento.valor)) + (e.descuento.motivo ? " — " + e.descuento.motivo : "") : "");
      if (JSON.stringify(antes.factura || null) !== JSON.stringify(e.factura || null)) registrar(cx, e.factura ? "Cargó datos para facturar" : "Quitó los datos de facturación", e.factura ? "Factura " + e.factura.tipo + (e.factura.razon ? " · " + e.factura.razon : "") : "");
      if (!antes.control_at && e.control_at) registrar(cx, "Marcó el control de la cuenta", "");
    }
    setExtras(function(prev) { return { ...prev, [id]: e }; });
    sbGuardarExtra(id, e, usuario);
  }
  function cerrar(c, total, sinMandar, subtotal, desc) {
    if (sinMandar) { alert("Quedan " + sinMandar + " ítem(s) sin marchar. Marchalos o sacalos antes de cerrar."); return; }
    var t = total === undefined ? c.total : total;
    var delPedido = items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
    var sinPrecio = delPedido.filter(function(i) { return !(Number(i.precio) > 0); });
    if (sinPrecio.length) {
      alert("Hay " + sinPrecio.length + " producto" + (sinPrecio.length === 1 ? "" : "s") + " sin precio: " + sinPrecio.map(function(i) { return i.nombre; }).join(", ") + ".\n\nTocá «Poner precio» al lado de cada uno antes de cerrar, así no se pierde la venta.");
      return;
    }
    if (!delPedido.length && !window.confirm("La cuenta está vacía. ¿Cerrarla sin cobrar nada?")) return;
    if (!(Number(t) > 0)) {   // sin importe no hay nada que cobrar: se cierra directo
      registrar(c, "Cerró la cuenta sin cobro", "Importe $0");
      guardar({ ...c, estado:"cerrada", cerrada_at:new Date().toISOString(), total:t });
      setAbiertaId(null);
      return;
    }
    setCobrando({ c:c, total:t, subtotal:subtotal === undefined ? t : subtotal, desc:desc || 0 });
  }
  function confirmarCobro(pagos) {
    var c = cobrando.c, total = cobrando.total, ahoraISO = new Date().toISOString();
    var fecha = fechaNegocio();
    // El cobro queda anotado aparte (para el cierre) y la comanda se cierra. Si el cobro no se pudo anotar, no se cierra: así no se pierde la plata.
    var ex = extras[c.id] || {};
    sbGuardarPago({ comanda_id:c.id, local:c.local, fecha:fecha, total:total, subtotal:cobrando.subtotal, descuento:cobrando.desc, descuento_motivo:(ex.descuento && ex.descuento.motivo) || "", factura:ex.factura || null, pagos:pagos, tipo:c.tipo, cobro_por:usuario, cobrado_at:ahoraISO }).then(function(err) {
      if (err) { alert("No se pudo anotar el cobro. La comanda sigue abierta.\n\n" + String(err).slice(0, 200)); setCobrando(null); return; }
      registrar(c, "Cobró y cerró la cuenta", pesos(total) + " · " + (pagos || []).map(function(q) { var m = mediosDeLocal(c.local).find(function(x) { return x.id === q.medio; }); return (m ? m.nombre : q.medio) + " " + pesos(q.monto); }).join(" + "));
      guardar({ ...c, estado:"cerrada", cerrada_at:ahoraISO, total:total });
      setCobrando(null); setAbiertaId(null);
    });
  }

  // ─── CONFIGURACIÓN DE MESAS ────────────────────────────────────────────────


  // ─── CARTA ─────────────────────────────────────────────────────────────────
  // Los platos con su precio de venta, por local. Los nombres ya existen en el menú
  // de stock, así que se traen de ahí y sólo hay que ponerles precio: tipear cien
  // platos a mano, habiendo estado ya cargados, no lo hace nadie.


  // ─── TARJETA DE MESA ───────────────────────────────────────────────────────
  function Mesa(props) {
    var m = props.mesa;
    var c = comandaDeMesa(m.id);
    var ocupada = !!c;
    var nom = String(m.nombre || "");
    // El color lo manda la cocina, no la mesa: una mesa recién abierta sin pedir no
    // es un problema, y una con una tanda de hace media hora sí. Por eso mientras no
    // haya nada en cocina va en el color del local, y cuando hay, en el de la demora.
    var demora = ocupada ? demoraDe(items.filter(function(i) { return i.comanda_id === c.id; }), listosMap, salidasDe(c.id)) : null;
    // Comiendo: ya recibió todo lo que pidió (nada pendiente en cocina ni en camino) → amarillo patito.
    var susItems = ocupada ? items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; }) : [];
    var comiendo = ocupada && susItems.length > 0 && susItems.every(function(i) { return i.estado === "listo" || i.estado === "entregado"; });
    var comiendoDesde = comiendo ? susItems.reduce(function(a, i) { return i.entregado_at && (!a || i.entregado_at > a) ? i.entregado_at : a; }, null) : null;
    var pasada = ocupada && demora !== null && demora >= limite;   // se pasó del tiempo elegido: titila en rojo
    var col = comiendo ? "#FFD60A" : (demora === null ? color : colorDemora(demora, limite));
    return (
      <button onClick={function() { ocupada ? setAbiertaId(c.id) : abrirMesa(m); }}
        title={ocupada ? "Abierta hace " + hace(c.abierta_at) : "Tocar para abrir"}
        style={{
          width:82, height:82, borderRadius:12, cursor:"pointer",
          border: pasada ? "2px solid #E0452E" : "1px solid " + (ocupada ? col : "#1E1E1E"),
          background: pasada ? "#E0452E55" : (ocupada ? col + (comiendo ? "33" : "22") : "#0F0F0F"),
          animation: pasada ? "nktPulso 1s infinite" : "none",
          color: ocupada ? col : "#555",
          fontFamily:"'Inter',sans-serif", display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:2, padding:4,
        }}>
        {/* Una mesa se llama "12", pero también "Reservado": el número entra grande
            y el nombre largo se achica para no desbordar la tarjeta. */}
        <div style={{ fontSize: nom.length <= 3 ? 22 : nom.length <= 7 ? 14 : 11, fontWeight:800, lineHeight:1.1, maxWidth:74, textAlign:"center", wordBreak:"break-word" }}>{nom}</div>
        {sectorDe(m) && <div style={{ fontSize:9, color:"#7E7E7E" }}>{sectorDe(m).emoji} {sectorDe(m).nombre}</div>}
        {ocupada && esComandaPrueba(c.id) && <div style={{ fontSize:9, fontWeight:900, color:"#B07CD8" }}>🧪 PRUEBA</div>}
        {ocupada && demora !== null && demora >= limite && <div style={{ fontSize:10, fontWeight:900, color:"#FF8A70", animation:"nktPulso 1.2s infinite" }}>⏰ +{limite} min</div>}
        {ocupada ? (
          <>
            <div style={{ fontSize:9, opacity:0.9, fontWeight:demora !== null ? 800 : 400 }}>
              {demora !== null ? "🍳 " + demora + " min" : comiendo ? "🍽️ comiendo" + (comiendoDesde ? " · " + hace(comiendoDesde) : "") : "⏱ " + hace(c.abierta_at)}
            </div>
            {c.mozo && <div style={{ fontSize:8, opacity:0.6, maxWidth:74, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.mozo}</div>}
          </>
        ) : (
          <div style={{ fontSize:9, color:"#333" }}>libre</div>
        )}
      </button>
    );
  }

  // ─── ALTA DE DELIVERY Y MOSTRADOR ──────────────────────────────────────────


  // ─── PANTALLA ──────────────────────────────────────────────────────────────
  if (verCocina) return <PanelCocina usuario={usuario} localFijo={localFijo} localInicial={localId} diaDeNegocio={fechaNegocio} onVolver={function() { setVerCocina(false); cargar(); }} />;

  return (
    <div style={{ fontFamily:"'Inter',sans-serif" }}>
      <style>{"@keyframes nktPulso{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5 }}>Módulo</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:800 }}>🍽️ Comandas</div>
      </div>

      {vista !== "delivery" && nuevosWeb.length > 0 && (
        <div style={{ background:"#2A1A00", border:"2px solid #D4A017", borderRadius:10, padding:"10px 13px", marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:900, color:"#FFD36B", animation:"nktPulso 1.2s infinite" }}>🔔 {nuevosWeb.length} pedido{nuevosWeb.length === 1 ? "" : "s"} nuevo{nuevosWeb.length === 1 ? "" : "s"} de Comunidad</div>
          <div style={{ fontSize:12, color:"#E0C080", marginTop:2 }}>Abrilo en la pestaña 🛵 Delivery para aceptarlo o rechazarlo. <button onClick={function() { setVista("delivery"); setConfig(false); }} style={{ ...GH, padding:"3px 10px", fontSize:11, marginLeft:6 }}>Ir a Delivery</button></div>
        </div>
      )}
      {turnos !== null && (
        turnoActual ? (
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", background:"#0E1F14", border:"1px solid #3A7D4466", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
            <span style={{ fontSize:13, fontWeight:800, color:"#4C9A5A" }}>🟢 Turno abierto{practica ? " (práctica)" : ""}</span>
            <span style={{ fontSize:12, color:"#C8C8C8", flex:1, minWidth:150 }}>Día {turnoActual.fecha.split("-").reverse().join("/")} · desde las {horaSeg(turnoActual.abierto_at).slice(0, 5)} · {turnoActual.abierto_por}</span>
            {verInforme && <button onClick={cerrarTurno} style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #C1440E", background:"#C1440E22", color:"#E0714A", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:800, cursor:"pointer" }}>⏹ Cerrar turno</button>}
          </div>
        ) : (
          <div style={{ background:"#2A0E0A", border:"1px solid #C1440E88", borderRadius:10, padding:"11px 12px", marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#E0714A" }}>🔴 Turno cerrado{practica ? " (práctica)" : ""}</div>
            <div style={{ fontSize:11.5, color:"#C9A79B", margin:"3px 0 8px" }}>Hay que abrir el turno para tomar pedidos. Las cuentas que ya estaban abiertas se pueden terminar de cobrar.</div>
            {verInforme ? (abriendoTurno ? (
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <input type="date" value={fechaTurno} onChange={function(e) { setFechaTurno(e.target.value); }} style={{ ...INP, width:"auto", padding:"8px 10px", fontSize:13 }} />
                <button onClick={abrirTurno} disabled={!fechaTurno} style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"#4C9A5A", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>Abrir turno</button>
                <button onClick={function() { setAbriendoTurno(false); }} style={{ ...GH, padding:"9px 12px", fontSize:12 }}>Cancelar</button>
              </div>
            ) : <button onClick={function() { setFechaTurno(p.diaDeNegocio ? p.diaDeNegocio() : new Date().toISOString().slice(0, 10)); setAbriendoTurno(true); }} style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"#4C9A5A", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>▶ Abrir turno</button>) : <div style={{ fontSize:11, color:"#9A7A70" }}>Pedile a un cajero o a administración que abra el turno.</div>}
          </div>
        )
      )}
      <div style={{ marginBottom:10, display:"flex", gap:8, flexWrap:"wrap" }}>
        {verInforme && <button onClick={function() { setVerCocina(true); }} style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #3A7D4488", background:"#3A7D4415", color:"#8FD19A", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:800, cursor:"pointer" }}>👨‍🍳 Pantalla de cocina</button>}
        {verInforme && <button onClick={function() { setDiscontinuando(true); }} style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #C1440E88", background:"#C1440E15", color:"#E0714A", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:800, cursor:"pointer" }}>🚫 Discontinuar</button>}
      </div>
      {!p.soloServicio && (
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", background:"#0F0F0F", border:"1px solid #2A2A2A", borderRadius:10, padding:"9px 12px", marginBottom:10 }}>
          <span style={{ fontSize:12, color:"#C8C8C8" }}>⏱ Avisar cuando un pedido lleve más de</span>
          <select value={limite} onChange={function(e) {
              var n = parseInt(e.target.value, 10);
              var nuevo = { ...cfgCom, limites: { ...cfgCom.limites, [localId]: n } };
              setCfgCom(nuevo);
              sbGuardarConfigCom(nuevo).then(function(ok) { if (!ok) alert("No se pudo guardar el tiempo de aviso."); });
            }}
            style={{ ...INP, width:"auto", padding:"6px 8px", fontSize:13, fontWeight:800 }}>
            {[5, 10, 15, 20, 25, 30, 40, 45, 60].concat([limite]).filter(function(v, i, a2) { return a2.indexOf(v) === i; }).sort(function(x, y) { return x - y; }).map(function(v) { return <option key={v} value={v}>{v} min</option>; })}
          </select>
          <span style={{ fontSize:12, color:"#C8C8C8" }}>en la cocina · {local ? local.nombre : ""}</span>
          <span style={{ fontSize:10.5, color:"#6A6A6A", flex:"1 1 100%" }}>Cuenta en las mesas, en la franja roja de aviso y en la pantalla de cocina (donde también suena si el sonido está activado). Cada local tiene el suyo.</span>
          <label style={{ display:"flex", alignItems:"center", gap:8, flex:"1 1 100%", fontSize:12, color:"#C8C8C8", cursor:"pointer", marginTop:4 }}>
            <input type="checkbox" checked={exigirCocina} onChange={function(e) {
                var nuevo = { ...cfgCom, exigir: { ...cfgCom.exigir, [localId]: e.target.checked } };
                setCfgCom(nuevo);
                sbGuardarConfigCom(nuevo).then(function(ok) { if (!ok) alert("No se pudo guardar el cambio."); });
              }} />
            ✋ El mozo o el cajero solo puede llevar a la mesa lo que la cocina ya entregó
          </label>
          {!exigirCocina && <span style={{ fontSize:10.5, color:"#D4A017", flex:"1 1 100%" }}>Apagado: se puede marcar «entregar» sin pasar por la pantalla de cocina (para un local que no la usa).</span>}
          <label style={{ display:"flex", alignItems:"center", gap:8, flex:"1 1 100%", fontSize:12, color:"#C8C8C8", cursor:"pointer", marginTop:4 }}>
            <input type="checkbox" checked={imprimeCocina(cfgCom, localId)} onChange={function(e) {
                var nuevo = { ...cfgCom, imprimir: { ...(cfgCom.imprimir || {}), [localId]: e.target.checked } };
                setCfgCom(nuevo);
                sbGuardarConfigCom(nuevo).then(function(ok) { if (!ok) alert("No se pudo guardar el cambio."); });
              }} />
            🖨️ Imprimir también en papel lo que va a la cocina
          </label>
          {imprimeCocina(cfgCom, localId) && <span style={{ fontSize:10.5, color:"#D4A017", flex:"1 1 100%" }}>Prendido: cada «Marchar» deja una comanda de cocina para imprimir (la pantalla de cocina sigue igual). Si este local ya imprime con otro sistema, saldría duplicado. Necesita el programa de la comandera corriendo con <b>--destino cocina</b>.</span>}
        </div>
      )}
      {discontinuando && <VentanaDiscontinuar localId={localId} usuario={usuario} diaDeNegocio={fechaNegocio} onCambio={function() { cargarCarta(); setRefInforme(function(n) { return n + 1; }); }} onCerrar={function() { setDiscontinuando(false); }} />}
      {(function() {
        // Aviso para el mozo y el cajero: pedidos que llevan más del tiempo elegido en la cocina, y deliverys o mostradores que se pasaron de la hora prometida al cliente.
        var tarde = abiertas.map(function(c) { return { c:c, min:demoraDe(items.filter(function(i) { return i.comanda_id === c.id; }), listosMap, salidasDe(c.id)) }; }).filter(function(x) { return x.min !== null && x.min >= limite; });
        var vencidas = abiertas.filter(function(c) { return c.tipo !== "mesa"; }).map(function(c) { return { c:c, over:minutosVencida(entregas[c.id], Date.now()) }; })
          .filter(function(x) { return x.over !== null && items.some(function(i) { return i.comanda_id === x.c.id && (i.estado === "enviado" || i.estado === "listo"); }); });
        if (!tarde.length && !vencidas.length) return null;
        return (
          <div style={{ background:"#E0452E", color:"#fff", borderRadius:10, padding:"10px 12px", marginBottom:10, animation:"nktPulso 1.3s infinite" }}>
            {tarde.length > 0 && <div>
              <div style={{ fontSize:14, fontWeight:900 }}>⏰ {tarde.length === 1 ? "1 pedido lleva" : tarde.length + " pedidos llevan"} más de {limite} minutos en la cocina</div>
              <div style={{ fontSize:13, fontWeight:700, marginTop:2 }}>{tarde.map(function(x) { return tituloDe(x.c) + " (" + x.min + " min)"; }).join(" · ")}</div>
            </div>}
            {vencidas.length > 0 && <div style={{ marginTop: tarde.length ? 8 : 0 }}>
              <div style={{ fontSize:14, fontWeight:900 }}>🕒 {vencidas.length === 1 ? "1 pedido se pasó" : vencidas.length + " pedidos se pasaron"} de la hora prometida al cliente</div>
              <div style={{ fontSize:13, fontWeight:700, marginTop:2 }}>{vencidas.map(function(x) { var st = estadoEntrega(entregas[x.c.id], Date.now()); return tituloDe(x.c) + " (+" + x.over + " min" + (st ? " · prometido " + horaSeg(entregas[x.c.id].prometida_at).slice(0, 5) : "") + ")"; }).join(" · ")}</div>
            </div>}
          </div>
        );
      })()}
      {!practica && verInforme && (pruebaVivo ? (
        <div style={{ background:"#1C1230", border:"2px dashed #B07CD8", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#B07CD8", letterSpacing:1 }}>🧪 PRUEBA COMPARTIDA</div>
          <div style={{ fontSize:11, color:"#CDB8E8", lineHeight:1.5, margin:"3px 0 8px" }}>Las cuentas que abras se guardan, se ven en todos los aparatos (también en la cocina) con el cartel «PRUEBA», y no entran al cierre de caja ni a los informes.</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <button onClick={borrarPruebas} style={{ ...GH, padding:"6px 11px", fontSize:11 }}>🗑️ Borrar todo lo de prueba</button>
            <button onClick={function() { setPruebaVivo(false); }} style={{ background:"#B07CD8", border:"none", borderRadius:8, color:"#160C26", padding:"6px 12px", fontSize:11, fontWeight:800, cursor:"pointer" }}>Salir de la prueba</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom:12, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <button onClick={function() { setPruebaVivo(true); }} style={{ ...GH, padding:"6px 12px", fontSize:11, borderColor:"#B07CD888", color:"#B07CD8" }}>🧪 Prueba compartida (se ve en todos los aparatos)</button>
          {comandas.some(function(c) { return c.local === localId && esComandaPrueba(c.id); }) && <button onClick={borrarPruebas} style={{ ...GH, padding:"6px 12px", fontSize:11, color:"#E0714A" }}>🗑️ Hay cuentas de prueba abiertas: borrarlas</button>}
        </div>
      ))}
      {practica ? (
        <div style={{ background:"#2A1F00", border:"2px dashed #D4A017", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#D4A017", letterSpacing:1 }}>🎮 MODO PRÁCTICA</div>
          <div style={{ fontSize:11, color:"#E8D9A0", lineHeight:1.5, margin:"3px 0 8px" }}>Probá abrir mesas, cargar pedidos y cobrar. Es de mentira: no se guarda nada ni entra al cierre de caja. Las mesas y la carta son las reales.</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <button onClick={reiniciarPractica} style={{ ...GH, padding:"6px 11px", fontSize:11 }}>🔄 Empezar de cero</button>
            <button onClick={salirPractica} style={{ background:"#D4A017", border:"none", borderRadius:8, color:"#1A1200", padding:"6px 12px", fontSize:11, fontWeight:800, cursor:"pointer" }}>Salir de la práctica</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom:12 }}>
          <button onClick={entrarPractica} style={{ ...GH, padding:"6px 12px", fontSize:11 }}>🎮 Practicar (simulador)</button>
        </div>
      )}

      {problemaTabla && (
        <div style={{ background:"#2A0A0A", border:"1px solid #C1440E", borderRadius:10, padding:"11px 13px", marginBottom:12, display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:15 }}>⚠️</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#C1440E", marginBottom:3 }}>Comandas no está guardando</div>
            <div style={{ fontSize:11, color:"#E8B9A8", lineHeight:1.5 }}>Podés mirar la pantalla, pero nada de lo que abras se guarda. Lo que contesta la base:</div>
            <div style={{ fontSize:10, color:"#E8B9A8", background:"#1A0505", border:"1px solid #C1440E33", borderRadius:6, padding:"6px 8px", marginTop:6, whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"monospace" }}>
              {String(problemaTabla).slice(0, 400)}
            </div>
            <div style={{ fontSize:10, color:"#8A6055", marginTop:6 }}>Supabase → SQL Editor → el bloque `comandas` del README.</div>
          </div>
        </div>
      )}

      {/* Local */}
      {!localFijo && (
        <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
          {LOCALES.filter(function(l) { return l.id !== "l4"; }).map(function(l) {
            var act = localId === l.id;
            var cuenta = comandas.filter(function(c) { return c.local === l.id; }).length;
            return (
              <button key={l.id} onClick={function() { setLocalId(l.id); setConfig(false); }}
                style={{ padding:"9px 15px", borderRadius:9, border:"1px solid "+(act?l.color:"#1E1E1E"), background:act?l.color+"22":"#111", color:act?l.color:"#666", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {l.emoji} {l.nombre}{cuenta > 0 ? " (" + cuenta + ")" : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* Mesas / Delivery / Mostrador */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {CMD_VISTAS.filter(function(v) { return v.id !== "informe" || verInforme; }).map(function(v) {
          var act = vista === v.id && !config;
          var cuenta = v.tipo ? abiertas.filter(function(c) { return c.tipo === v.tipo; }).length : 0;
          var colV = v.tipo ? CMD_TIPO[v.tipo].color : color;
          return (
            <button key={v.id} onClick={function() { setVista(v.id); setConfig(false); }}
              style={{ flex:1, minWidth:110, padding:"11px 12px", borderRadius:9, border:"2px solid "+(act?colV:colV+"33"), background:act?colV+"28":"#111", color:act?colV:colV+"AA", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {v.emoji} {v.nombre}{cuenta > 0 ? " (" + cuenta + ")" : ""}{v.id === "delivery" && nuevosWeb.length > 0 ? " 🔔" : ""}
            </button>
          );
        })}
      </div>

      {eligePersonas && <ElegirPersonas titulo={eligePersonas.titulo} color={color}
        onElegir={function(n) { var f = eligePersonas.alElegir; setEligePersonas(null); f(n); }}
        onOmitir={function() { var f = eligePersonas.alElegir; setEligePersonas(null); f(null); }}
        onCancelar={function() { setEligePersonas(null); }} />}
      {eligeMozo && <ElegirMozo mozos={mozos} color={color} ultimo={ultimoMozo} usuario={usuario} titulo={eligeMozo.titulo}
        onElegir={function(nombre) { var f = eligeMozo.alElegir; setEligeMozo(null); setUltimoMozo(nombre); f(nombre); }}
        onCancelar={function() { setEligeMozo(null); }} />}
      {cobrando && <Cobro localId={cobrando.c.local} total={cobrando.total} subtotal={cobrando.subtotal} descuento={cobrando.desc} factura={(extras[cobrando.c.id] || {}).factura} tipo={cobrando.c.tipo} titulo={tituloDe(cobrando.c)} color={color} onConfirmar={confirmarCobro} onCancelar={function() { setCobrando(null); }} />}
      {cargando ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#333" }}>Cargando…</div>
      ) : comandaAbierta ? (
        <ComandaDetalle
          comanda={comandaAbierta} items={items} carta={carta} color={color} usuario={usuario}
          titulo={tituloDe(comandaAbierta)}
          onVolver={function() { setAbiertaId(null); }}
          onGuardarItems={guardarItems}
          onBorrarItem={borrarItem}
          onCerrar={function(total, sinMandar, subtotal, desc) { cerrar(comandaAbierta, total, sinMandar, subtotal, desc); }}
          extra={extras[comandaAbierta.id]} onExtra={function(e) { guardarExtra(comandaAbierta.id, e); }}
          puedeDescuento={p.puedeDescuento} localNombre={local && local.nombre}
          entrega={entregas[comandaAbierta.id]} ahora={ahora} onEntrega={function(m) { fijarEntrega(comandaAbierta, m); }} onSumarEntrega={function(x) { sumarEntrega(comandaAbierta, x); }} esSinCocina={esSinCocina} onImprimirBarra={function(its, ronda) { imprimirBarra(comandaAbierta, its, ronda); }} onImprimirCocina={function(its, ronda, salida, separa) { imprimirCocina(comandaAbierta, its, ronda, salida, separa); }} onImprimirControl={function(d) { imprimirControl(comandaAbierta, d); }} onAnular={function(m) { anularCuenta(comandaAbierta, m); }} onMedioPago={function(m) { fijarMedioDelivery(comandaAbierta, m); }}
          colores={coloresCarta} limite={limite} exigirCocina={exigirCocina} listos={listosMap} onSalida={function(rondas, salida) { guardarSalida(comandaAbierta.id, rondas, salida); }}
          mozos={mozos} onCambiarMozo={function(nombre) { setUltimoMozo(nombre); registrar(comandaAbierta, "Cambió el mozo", (comandaAbierta.mozo || "—") + " → " + nombre); guardar({ ...comandaAbierta, mozo: nombre }); }}
        />
      ) : vista === "delivery" ? (
        <>
          <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
            {[["pedidos", "🛵 Pedidos (" + abiertas.filter(function(c) { return c.tipo === "delivery"; }).length + ")"], ["informe", "📊 Informe del día"]].map(function(t) {
              var act = vistaDel === t[0];
              return <button key={t[0]} onClick={function() { setVistaDel(t[0]); }} style={{ padding:"10px 16px", borderRadius:10, border:"2px solid " + (act ? CMD_TIPO.delivery.color : "#2A2A2A"), background: act ? CMD_TIPO.delivery.color + "26" : "#111", color: act ? CMD_TIPO.delivery.color : "#9A9A9A", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer" }}>{t[1]}</button>;
            })}
          </div>
          {vistaDel === "informe" ? (
            <InformeDelivery localId={localId} color={color} diaDeNegocio={fechaNegocio} refresco={refInforme + (practica ? 1000 : 0)} />
          ) : (
            <>
              <NuevaComanda tipo="delivery" color={CMD_TIPO.delivery.color} localId={localId} usuario={usuario} guardar={guardar} proximoNumero={proximoNumero} registrar={registrar} fijarEntrega={fijarEntrega} puedeAbrirCuenta={puedeAbrirCuenta} alCrear={function(id) { setAbiertaId(id); }} nuevoId={function() { return (pruebaVivo ? "cmdp_" : "cmd_") + Date.now(); }} />
              <BandejaDelivery comandas={abiertas.filter(function(c) { return c.tipo === "delivery"; })} items={items} entregas={entregas} despachos={despachos} ahora={ahora} color={color} localNombre={local && local.nombre}
                pedidosWeb={pedidosWeb} onAceptarWeb={aceptarWeb} onRechazarWeb={rechazarWeb} onTransferencia={confirmarTransferencia} cadetes={p.cadetes} onAsignar={asignarCadete} rendiciones={rendiciones} onRendir={rendir}
                onAbrir={function(c) { setAbiertaId(c.id); }} onDespacho={despachar} />
            </>
          )}
        </>
      ) : config ? (
        <>
          <button onClick={function() { setConfig(false); }} style={{ ...estiloVolver(color), marginBottom:12 }}>← Volver al plano</button>
          <ConfigMesas localId={localId} local={local} color={color} mesasLocal={mesasLocal} setMesas={setMesas} comandaDeMesa={comandaDeMesa} />
        </>
      ) : vista === "informe" ? (
        <InformeTurno localId={localId} color={color} mesas={mesas} diaDeNegocio={fechaNegocio} refresco={refInforme + (practica ? 1000 : 0)} />
      ) : vista === "carta" ? (
        (p.soloServicio && !p.puedeEditarCarta)
          ? <CartaConsulta localId={localId} color={color} carta={carta} colores={coloresCarta} />
          : <>
              <ConfigSinCocina localId={localId} color={color} carta={carta} cfg={cfgSinCocina} usuario={usuario} onGuardado={function(l) { setCfgSinCocina({ categorias:l }); }} />
              <Carta localId={localId} local={local} color={color} carta={carta} setCarta={setCarta} cargarCarta={cargarCarta} menuStock={p.menuStock} colores={coloresCarta} setColores={setColoresCarta} />
            </>
      ) : vista === "mesas" ? (
        mesasLocal.length === 0 ? (
          <div style={{ textAlign:"center", padding:"30px 0" }}>
            <div style={{ fontSize:30, marginBottom:8 }}>🪑</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#2E2E2E", marginBottom:14 }}>
              {local && local.nombre} todavía no tiene mesas cargadas
            </div>
            {(p.soloServicio && !p.puedeEditarPlano) ? <div style={{ fontSize:12, color:"#666" }}>Pedile a administración que cargue las mesas.</div> : (<button onClick={function() { setConfig(true); }}
              style={{ padding:"11px 20px", borderRadius:9, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer" }}>
              Cargar las mesas
            </button>)}
          </div>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:CMD_TIPO.mesa.color+"1A", border:"1px solid "+CMD_TIPO.mesa.color+"55", borderRadius:10, padding:"9px 12px", marginBottom:12 }}>
              <span style={{ fontSize:20 }}>{CMD_TIPO.mesa.emoji}</span>
              <span style={{ fontSize:13, fontWeight:800, color:CMD_TIPO.mesa.color, letterSpacing:0.5, textTransform:"uppercase" }}>Mesas del salón</span>
              <span style={{ marginLeft:"auto", fontSize:12, color:CMD_TIPO.mesa.color, fontWeight:700 }}>{mesasLocal.filter(function(m) { return !!comandaDeMesa(m.id); }).length} de {mesasLocal.length} ocupadas</span>
            </div>
            <LeyendaColores limite={limite} color={color} />
            <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
              {[[false, "☰ Lista"], [true, "🗺️ Plano"]].map(function(x) {
                var act = verPlano === x[0];
                return <button key={String(x[0])} onClick={function() { setVerPlano(x[0]); if (!x[0]) setAcomodando(false); }}
                  style={{ padding:"6px 13px", borderRadius:8, border:"1px solid " + (act ? color : "#222"), background: act ? color + "22" : "transparent", color: act ? color : "#777", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:"pointer" }}>{x[1]}</button>;
              })}
              {verPlano && (!p.soloServicio || p.puedeEditarPlano) && (
                <button onClick={function() { setAcomodando(!acomodando); }}
                  style={{ marginLeft:"auto", padding:"6px 13px", borderRadius:8, border:"1px solid #D4A017", background: acomodando ? "#D4A017" : "transparent", color: acomodando ? "#1A1200" : "#D4A017", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                  {acomodando ? "✓ Listo" : "✏️ Acomodar mesas"}
                </button>
              )}
            </div>
            {verPlano && (function() {
              var dimOk = !!(dimsPlano && Number(dimsPlano.ancho) > 0 && Number(dimsPlano.largo) > 0);
              var dimRatio = dimOk ? Number(dimsPlano.largo) / Number(dimsPlano.ancho) : 1;
              function posDe(m) {
                if (posPlano[m.id]) return posPlano[m.id];
                // Grilla automática dentro del recuadro del salón (o de todo el lienzo si no hay).
                var i = mesasLocal.filter(function(q) { return !posPlano[q.id]; }).indexOf(m);
                var sal = extrasPlano.find(function(z) { return z.tipo === "salon" && z.w; });
                var anchoPx = dimOk ? 640 : 600, altoPx = dimOk ? anchoPx * dimRatio : 520;
                var zw = sal ? sal.w : 100, zh = sal ? sal.h : 100, zx = sal ? sal.x - sal.w / 2 : 0, zy = sal ? sal.y - sal.h / 2 : 0;
                var cols = Math.max(1, Math.floor(anchoPx * zw / 100 / 90));
                return { x: Math.round(zx + (i % cols + 0.5) * zw / cols), y: Math.min(95, Math.round(zy + (Math.floor(i / cols) + 0.5) * 90 / altoPx * 100)) };
              }
              function mover(e) {
                if (!arrastre || !acomodando) return;
                var r = e.currentTarget.getBoundingClientRect();
                var x = Math.max(5, Math.min(95, Math.round((e.clientX - r.left) / r.width * 50) * 2));
                var y = Math.max(5, Math.min(95, Math.round((e.clientY - r.top) / r.height * 50) * 2));
                if (String(arrastre).indexOf("x_") === 0) setExtrasPlano(function(prev) { return prev.map(function(z) { return z.id === arrastre ? { ...z, x: x, y: y } : z; }); });
                else setPosPlano(function(prev) { var o = { ...prev }; o[arrastre] = { x: x, y: y }; return o; });
              }
              // Crear y borrar mesas directo desde el plano.
              function nuevaMesa() {
                var nombre = window.prompt("¿Cómo se llama la mesa? (número o nombre)", String(Math.max.apply(null, [0].concat(mesasLocal.map(function(m) { return parseInt(m.nombre, 10) || 0; }))) + 1));
                if (!nombre || !nombre.trim()) return;
                var m = { id: "mesa_" + localId + "_" + Date.now(), local: localId, sector: "salon", nombre: nombre.trim(), orden: parseInt(nombre, 10) || 900, activa: true };
                var fin = { ...posPlano }; mesasLocal.forEach(function(q) { fin[q.id] = posDe(q); });
                fin[m.id] = { x: 50, y: 50 };
                setMesas(function(prev) { return prev.concat([m]); });
                setPosPlano(fin);
                sbSaveMesa(m).then(function(err) { if (err) alert("No se pudo guardar la mesa:\n\n" + err); });
                sbGuardarPlano(localId, fin, extrasPlano, dimsPlano, usuario);
              }
              function borrarMesa(m) {
                if (comandaDeMesa(m.id)) { alert("Esa mesa tiene una comanda abierta. Cerrala antes de borrarla."); return; }
                if (!window.confirm("¿Borrar la mesa " + m.nombre + "?")) return;
                setMesas(function(prev) { return prev.filter(function(x) { return x.id !== m.id; }); });
                sbDeleteMesa(m.id);
              }
              function agregarExtra(tipo) {
                var nom = null;
                if (tipo === "otro") { nom = window.prompt("¿Qué es? (ej: Escenario, Fumadores)"); if (!nom || !nom.trim()) return; nom = nom.trim(); }
                var td = CMD_EXTRAS.find(function(e) { return e.id === tipo; });
                var nz = { id: "x_" + Date.now(), tipo: tipo, nombre: nom, x: 50, y: Math.min(90, 20 + extrasPlano.length * 7) };
                if (td && td.medidas && dimOk) { nz.w = Math.min(100, Math.round(td.medidas[0] / Number(dimsPlano.ancho) * 100)); nz.h = Math.min(100, Math.round(td.medidas[1] / Number(dimsPlano.largo) * 100)); }
                var nuevos = extrasPlano.concat([nz]);
                setExtrasPlano(nuevos); sbGuardarPlano(localId, posPlano, nuevos, dimsPlano, usuario);
              }
              // Agranda o achica un cuadro (ancho y alto en % del lienzo); la primera vez parte de un tamaño base.
              function tamanoExtra(id, dw, dh) {
                var nuevos = extrasPlano.map(function(z) {
                  if (z.id !== id) return z;
                  var w = z.w || 30, h = z.h || 8;
                  // dw y dh vienen en metros: se pasan a % del plano.
                  var pw = dimOk ? dw / Number(dimsPlano.ancho) * 100 : dw * 10, ph = dimOk ? dh / Number(dimsPlano.largo) * 100 : dh * 10;
                  return { ...z, w: Math.max(3, Math.min(100, Math.round((w + pw) * 10) / 10)), h: Math.max(1.5, Math.min(100, Math.round((h + ph) * 10) / 10)) };
                });
                setExtrasPlano(nuevos); sbGuardarPlano(localId, posPlano, nuevos, dimsPlano, usuario);
              }
              function renombrarExtra(z) {
                var n = window.prompt("Nombre de esta área (vacío = sin nombre):", z.nombre || "");
                if (n === null) return;
                var nuevos = extrasPlano.map(function(q) { return q.id === z.id ? { ...q, nombre: n.trim() || null } : q; });
                setExtrasPlano(nuevos); sbGuardarPlano(localId, posPlano, nuevos, dimsPlano, usuario);
              }
              function colorExtra(z, base) {
                var i = CMD_PALETA.indexOf(z.color || base);
                var nuevos = extrasPlano.map(function(q) { return q.id === z.id ? { ...q, color: CMD_PALETA[(i + 1) % CMD_PALETA.length] } : q; });
                setExtrasPlano(nuevos); sbGuardarPlano(localId, posPlano, nuevos, dimsPlano, usuario);
              }
              // Empezar de cero: saca todas las mesas del local y todos los recuadros. Se mantiene el tamaño del plano.
              function borrarTodo() {
                var abiertas = mesasLocal.filter(function(m) { return !!comandaDeMesa(m.id); });
                if (abiertas.length) { alert("Hay mesas con comanda abierta (" + abiertas.map(function(m) { return m.nombre; }).join(", ") + "). Cerralas antes de borrar todo."); return; }
                if (!window.confirm("¿Borrar TODO el plano de " + (local ? local.nombre : "este local") + "?\n\nSe sacan las " + mesas.filter(function(m) { return m.local === localId; }).length + " mesas y todos los recuadros. No se puede deshacer.")) return;
                if (!window.confirm("Última confirmación: ¿arrancamos el plano de cero?")) return;
                var ids = mesas.filter(function(m) { return m.local === localId; }).map(function(m) { return m.id; });
                setMesas(function(prev) { return prev.filter(function(m) { return m.local !== localId; }); });
                ids.forEach(function(id) { sbDeleteMesa(id); });
                setPosPlano({}); setExtrasPlano([]);
                sbGuardarPlano(localId, {}, [], dimsPlano, usuario);
              }
              function quitarExtra(id) {
                var nuevos = extrasPlano.filter(function(z) { return z.id !== id; });
                setExtrasPlano(nuevos); sbGuardarPlano(localId, posPlano, nuevos, dimsPlano, usuario);
              }
              function soltar() {
                if (!arrastre) return;
                setArrastre(null);
                // Las que nunca se movieron también se fijan donde se ven, para que no salten al mover otra.
                var fin = {}; mesasLocal.forEach(function(m) { fin[m.id] = posDe(m); });
                setPosPlano(fin);
                sbGuardarPlano(localId, fin, extrasPlano, dimsPlano, usuario);
              }
              return (
                <div>
                  {dimOk && <div style={{ fontSize:11, color:"#777", textAlign:"center", marginBottom:6 }}>Plano completo: {Number(dimsPlano.ancho)} m × {Number(dimsPlano.largo)} m</div>}
                  {acomodando && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, color:"#D4A017", marginBottom:6 }}>Arrastrá cada mesa a donde corresponde. Se guarda sola.</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8, fontSize:11, color:"#999" }}>
                        <span>📐 Tamaño del plano completo:</span>
                        <input type="number" min="1" max="60" value={dimsPlano ? dimsPlano.ancho : ""} placeholder="ancho" onChange={function(e) { setDimsPlano({ ancho:e.target.value, largo: dimsPlano ? dimsPlano.largo : "" }); }} onBlur={function() { sbGuardarPlano(localId, posPlano, extrasPlano, dimsPlano, usuario); }} style={{ ...INP, width:62, padding:"4px 6px", fontSize:12 }} />
                        <span>m de ancho ×</span>
                        <input type="number" min="1" max="60" value={dimsPlano ? dimsPlano.largo : ""} placeholder="largo" onChange={function(e) { setDimsPlano({ ancho: dimsPlano ? dimsPlano.ancho : "", largo:e.target.value }); }} onBlur={function() { sbGuardarPlano(localId, posPlano, extrasPlano, dimsPlano, usuario); }} style={{ ...INP, width:62, padding:"4px 6px", fontSize:12 }} />
                        <span>m de largo</span>
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <button onClick={borrarTodo} style={{ ...GH, padding:"5px 10px", fontSize:11, borderColor:"#C1440E", color:"#C1440E", marginLeft:"auto" }}>🗑️ Borrar todo y empezar de cero</button>
                        <button onClick={nuevaMesa} style={{ ...GH, padding:"5px 10px", fontSize:11, borderColor:color, color:color }}>+ 🪑 Mesa</button>
                        {CMD_EXTRAS.map(function(t) {
                          return <button key={t.id} onClick={function() { agregarExtra(t.id); }} style={{ ...GH, padding:"5px 10px", fontSize:11 }}>+ {t.emoji} {t.nombre}</button>;
                        })}
                      </div>
                    </div>
                  )}
                  <div onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
                    style={{ position:"relative", width:"100%", maxWidth: dimOk ? 640 : "none", margin:"0 auto", height: dimOk ? "auto" : 520, aspectRatio: dimOk ? (dimsPlano.ancho + " / " + dimsPlano.largo) : "auto", borderRadius:12, border:"1px solid " + (acomodando ? "#D4A017" : "#1E1E1E"), background:"#0A0A0A", backgroundImage:"linear-gradient(#141414 1px, transparent 1px), linear-gradient(90deg, #141414 1px, transparent 1px)", backgroundSize: dimOk ? (100 / Number(dimsPlano.ancho)) + "% " + (100 / Number(dimsPlano.largo)) + "%" : "10% 10%", overflow:"hidden", touchAction: acomodando ? "none" : "auto" }}>
                    {extrasPlano.map(function(z) {
                      var t0 = CMD_EXTRAS.find(function(e) { return e.id === z.tipo; }) || CMD_EXTRAS[0];
                      var t = { ...t0, color: z.color || t0.color };
                      return (
                        <div key={z.id}
                          onPointerDown={function(e) { if (!acomodando) return; e.preventDefault(); e.currentTarget.parentNode.setPointerCapture && e.currentTarget.parentNode.setPointerCapture(e.pointerId); setArrastre(z.id); }}
                          style={{ position:"absolute", left:z.x + "%", top:z.y + "%", transform:"translate(-50%,-50%)", ...(z.w ? { width:z.w + "%", height:z.h + "%" } : { minWidth:110, height:46 }), boxSizing:"border-box", padding: z.w ? "6px 14px 0" : "0 14px", borderRadius:8, background:t.color + "22", border:"1px solid " + t.color + "88", color:t.color, display:"flex", alignItems: z.w ? "flex-start" : "center", justifyContent:"center", gap:6, fontSize:12, fontWeight:800, letterSpacing:0.6, textTransform:"uppercase", cursor: acomodando ? "grab" : "default", zIndex: arrastre === z.id ? 5 : 0, userSelect:"none" }}>
                          <span style={{ textAlign:"center", lineHeight:1.2 }}>{z.tipo === "rect" && !z.nombre ? "" : t.emoji + " " + (z.nombre || t.nombre)}{z.w && dimOk ? <span style={{ display:"block", fontSize:9, opacity:0.75, fontWeight:600, textTransform:"none" }}>{Math.round(z.w * Number(dimsPlano.ancho) / 10) / 10} × {Math.round(z.h * Number(dimsPlano.largo) / 10) / 10} m</span> : null}</span>
                          {acomodando && (
                            <span style={{ position:"absolute", bottom:2, left:4, display:"flex", gap:2 }}>
                              {[["↔+", 0.5, 0], ["↔−", -0.5, 0], ["↕+", 0, 0.5], ["↕−", 0, -0.5]].map(function(q) {
                                return <button key={q[0]} onPointerDown={function(e) { e.stopPropagation(); }} onClick={function() { tamanoExtra(z.id, q[1], q[2]); }} style={{ background:"#000A", border:"1px solid " + t.color + "66", borderRadius:4, color:t.color, fontSize:9, cursor:"pointer", padding:"1px 3px" }}>{q[0]}</button>;
                              })}
                            </span>
                          )}
                          {acomodando && <button onPointerDown={function(e) { e.stopPropagation(); }} onClick={function() { renombrarExtra(z); }} title="Poner nombre" style={{ background:"transparent", border:"none", color:t.color, cursor:"pointer", fontSize:12, padding:0 }}>✎</button>}
                          {acomodando && <button onPointerDown={function(e) { e.stopPropagation(); }} onClick={function() { colorExtra(z, t0.color); }} title="Cambiar color" style={{ background:"transparent", border:"none", color:t.color, cursor:"pointer", fontSize:12, padding:0 }}>🎨</button>}
                          {acomodando && <button onPointerDown={function(e) { e.stopPropagation(); }} onClick={function() { quitarExtra(z.id); }} title="Quitar" style={{ background:"transparent", border:"none", color:t.color, cursor:"pointer", fontSize:13, padding:0 }}>✕</button>}
                        </div>
                      );
                    })}
                    {mesasLocal.map(function(m) {
                      var q = posDe(m);
                      return (
                        <div key={m.id}
                          onPointerDown={function(e) { if (!acomodando) return; e.preventDefault(); e.currentTarget.parentNode.setPointerCapture && e.currentTarget.parentNode.setPointerCapture(e.pointerId); setArrastre(m.id); }}
                          style={{ position:"absolute", left:q.x + "%", top:q.y + "%", transform:"translate(-50%,-50%) scale(0.85)", cursor: acomodando ? "grab" : "default", zIndex: arrastre === m.id ? 5 : 1, outline: acomodando ? "2px dashed #D4A01788" : "none", borderRadius:12 }}>
                          <div style={{ pointerEvents: acomodando ? "none" : "auto" }}><Mesa mesa={m} /></div>
                          {acomodando && <button onPointerDown={function(e) { e.stopPropagation(); }} onClick={function() { borrarMesa(m); }} title="Borrar mesa" style={{ position:"absolute", top:-8, right:-8, width:24, height:24, borderRadius:12, border:"none", background:"#C1440E", color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer", padding:0, zIndex:6 }}>✕</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {!verPlano && CMD_SECTORES.map(function(s) {
              var delSector = mesasLocal.filter(function(m) { var sc = sectorDe(m); return sc && sc.id === s.id; });
              if (!delSector.length) return null;
              var ocupadasSector = delSector.filter(function(m) { return !!comandaDeMesa(m.id); }).length;
              return (
                <div key={s.id} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>
                    {s.emoji} {s.nombre} · {ocupadasSector}/{delSector.length} ocupadas
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {delSector.map(function(m) { return <Mesa key={m.id} mesa={m} />; })}
                  </div>
                </div>
              );
            })}
            {(!p.soloServicio || p.puedeEditarPlano) && <button onClick={function() { setConfig(true); }} style={{ ...GH, padding:"8px 14px", fontSize:11, marginTop:4 }}>⚙️ Editar el plano</button>}
          </>
        )
      ) : (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:CMD_TIPO[vistaActual.tipo].color+"1A", border:"1px solid "+CMD_TIPO[vistaActual.tipo].color+"55", borderRadius:10, padding:"9px 12px", marginBottom:10 }}>
            <span style={{ fontSize:20 }}>{CMD_TIPO[vistaActual.tipo].emoji}</span>
            <span style={{ fontSize:13, fontWeight:800, color:CMD_TIPO[vistaActual.tipo].color, letterSpacing:0.5, textTransform:"uppercase" }}>{CMD_TIPO[vistaActual.tipo].plural}{vistaActual.tipo === "delivery" ? " · se entregan en la dirección" : " · se retira en el local"}</span>
            <span style={{ marginLeft:"auto", fontSize:12, color:CMD_TIPO[vistaActual.tipo].color, fontWeight:700 }}>{delTipo.length} abierto{delTipo.length === 1 ? "" : "s"}</span>
          </div>
          <NuevaComanda tipo={vistaActual.tipo} color={CMD_TIPO[vistaActual.tipo].color} localId={localId} usuario={usuario} guardar={guardar} proximoNumero={proximoNumero} registrar={registrar} fijarEntrega={fijarEntrega} puedeAbrirCuenta={puedeAbrirCuenta} alCrear={function(id) { setAbiertaId(id); }} nuevoId={function() { return (pruebaVivo ? "cmdp_" : "cmd_") + Date.now(); }} />
          {delTipo.length === 0 ? (
            <div style={{ textAlign:"center", padding:"30px 0", color:"#333" }}>
              <div style={{ fontSize:30, marginBottom:8 }}>{vistaActual.emoji}</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#2E2E2E" }}>
                Sin {vistaActual.nombre.toLowerCase()} abiertos
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {delTipo.map(function(c) {
                var T = CMD_TIPO[c.tipo] || CMD_TIPO.mostrador;
                return (
                  <div key={c.id} style={{ background:"#111", border:"1px solid "+T.color+"44", borderLeft:"6px solid "+T.color, borderRadius:10, padding:"12px 13px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:9 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ marginBottom:4 }}><span style={{ display:"inline-block", background:T.color+"26", color:T.color, border:"1px solid "+T.color+"66", borderRadius:6, padding:"2px 8px", fontSize:10.5, fontWeight:800, letterSpacing:0.8 }}>{T.emoji} {T.nombre.toUpperCase()} #{c.numero}</span>{esComandaPrueba(c.id) && <span style={{ marginLeft:6, background:"#B07CD833", color:"#B07CD8", border:"1px solid #B07CD8", borderRadius:6, padding:"2px 8px", fontSize:10.5, fontWeight:900 }}>🧪 PRUEBA</span>}</div>
                        <div style={{ fontSize:14, fontWeight:800, color:"#F0EDE8" }}>{c.cliente || "Sin nombre"}</div>
                        {c.direccion && <div style={{ fontSize:11, color:"#888", marginTop:3 }}>📍 {c.direccion}</div>}
                        {c.telefono && <div style={{ fontSize:11, color:"#666" }}>📞 {c.telefono}</div>}
                        {(function() { var st = estadoEntrega(entregas[c.id], ahora); return st ? <div style={{ display:"inline-block", marginTop:5, fontSize:12, fontWeight:800, color:st.col, background:st.col + "1F", border:"1px solid " + st.col + "66", borderRadius:6, padding:"2px 8px", animation: st.col === "#E0452E" ? "nktPulso 1.2s infinite" : "none" }}>{st.txt}</div> : null; })()}
                      </div>
                      <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                        <div style={{ fontSize:11, color:color, fontWeight:700 }}>⏱ {hace(c.abierta_at)}</div>
                        {c.mozo && <div style={{ fontSize:9, color:"#3A3A3A", marginTop:2 }}>{c.mozo}</div>}
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"flex-end", marginTop:9 }}>
                      <button onClick={function() { setAbiertaId(c.id); }}
                        style={{ padding:"6px 14px", borderRadius:7, border:"1px solid "+T.color+"77", background:T.color+"1A", color:T.color, fontFamily:"'Inter',sans-serif", fontSize:11, fontWeight:800, cursor:"pointer" }}>
                        Abrir pedido →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

    </div>
  );
}
