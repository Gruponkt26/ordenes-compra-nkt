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

import { useState, useEffect } from "react";
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
export var MEDIOS_COBRO = [
  { id:"efectivo",      emoji:"💵", nombre:"Efectivo" },
  { id:"transferencia", emoji:"📲", nombre:"Transferencia" },
  { id:"debito",        emoji:"💳", nombre:"Débito" },
  { id:"credito",       emoji:"💳", nombre:"Crédito" },
  { id:"qr",            emoji:"📱", nombre:"QR / Mercado Pago" },
];
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
// Lo que se descuenta de un subtotal: {tipo:"%"|"$", valor}.
function montoDescuento(subtotal, d) {
  if (!d || !(Number(d.valor) > 0)) return 0;
  var m = d.tipo === "%" ? subtotal * Math.min(100, Number(d.valor)) / 100 : Math.min(subtotal, Number(d.valor));
  return Math.round(m * 100) / 100;
}
// Lo cobrado en comandas de un local en un día de negocio, para el cierre de caja.
export async function cargarPagosComandas(localId, fecha) {
  try {
    var d0 = new Date(fecha + "T00:00:00"); d0.setDate(d0.getDate() - 1);
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.comanda_pago&created_at=gte." + d0.toISOString() + "&order=created_at.desc&limit=2000", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function(f) { try { return JSON.parse(f.texto); } catch(e) { return null; } }).filter(function(x) { return x && x.local === localId && x.fecha === fecha; }) : [];
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
function colorDemora(min) {
  if (min === null) return "#555";
  return min < 10 ? "#3A7D44" : min < 20 ? "#D4A017" : "#C1440E";
}
// La tanda más vieja que la cocina todavía no entregó, que es la que manda en el
// color de la mesa: si hay tres rondas, la que importa es la que más espera.
function demoraDe(itemsComanda) {
  var enviados = (itemsComanda || []).filter(function(i) { return i.estado === "enviado" && i.enviado_at; });
  if (!enviados.length) return null;
  var viejo = enviados.reduce(function(a, b) { return a.enviado_at < b.enviado_at ? a : b; });
  return minutosDesde(viejo.enviado_at);
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
                {MEDIOS_COBRO.map(function(m) { return <option key={m.id} value={m.id}>{m.emoji} {m.nombre}</option>; })}
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
    <Ventana titulo="➖ Quitar un plato" onCerrar={props.onCerrar}>
      <label style={{ display:"block", fontSize:9, color:"#8C8C8C", textTransform:"uppercase", marginBottom:4 }}>Motivo (para lo que ya se mandó a la cocina)</label>
      <select value={motivo} onChange={function(e) { setMotivo(e.target.value); }} style={{ ...INP, marginBottom:motivo === "Otro" ? 6 : 12 }}>
        {["Error de carga", "El cliente cambió de idea", "No hay stock", "Reclamo del cliente", "Otro"].map(function(m) { return <option key={m} value={m}>{m}</option>; })}
      </select>
      {motivo === "Otro" && <input value={otro} onChange={function(e) { setOtro(e.target.value); }} placeholder="Escribí el motivo" style={{ ...INP, marginBottom:12 }} />}
      {lista.length === 0 && <div style={{ fontSize:13, color:"#777", padding:"10px 0" }}>No hay platos para quitar.</div>}
      {lista.map(function(i) {
        var mandado = i.estado !== "pendiente";
        return (
          <div key={i.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"8px 0", borderTop:"1px solid #1A1A1A" }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, color:"#F0EDE8" }}>{i.cant}× {i.nombre}</div>
              <div style={{ fontSize:10.5, color:mandado ? "#E0914A" : "#777" }}>{mandado ? "Ya mandado a la cocina" : "Sin mandar"} · {pesos((Number(i.precio) || 0) * (Number(i.cant) || 1))}</div>
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
        <button onClick={imprimir} style={{ flex:1, padding:"11px", borderRadius:9, border:"none", background:"#3A7D44", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>🖨️ Imprimir</button>
        <button onClick={function() { try { navigator.clipboard.writeText(textoPlano()); alert("Copiado."); } catch (e) {} }} style={{ ...GH, flex:1, padding:"11px", fontSize:13 }}>📋 Copiar</button>
      </div>
      <div style={{ fontSize:10.5, color:"#777", marginTop:8 }}>Es un control para el cliente, no una factura.</div>
    </Ventana>
  );
}

function ComandaDetalle(props) {
  var c = props.comanda, items = props.items, carta = props.carta, color = props.color;
  var [agregando, setAgregando] = useState(false);
  var [categoria, setCategoria] = useState(null);
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
    return !categoria || x.categoria === categoria;
  }).sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

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
    var notaQ = "Quitado: " + motivo + (quien ? " (" + quien + ")" : "") + (i.nota ? " · " + i.nota : "");
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
  function mandar() {
    if (!pendientes.length) return;
    var ronda = mandados.reduce(function(a, i) { return Math.max(a, Number(i.ronda) || 0); }, 0) + 1;
    var ahora = new Date().toISOString();
    props.onGuardarItems(pendientes.map(function(i) {
      return { ...i, estado:"enviado", ronda:ronda, enviado_at:ahora };
    }));
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
        <button onClick={props.onVolver} style={{ ...GH, padding:"7px 13px", fontSize:12 }}>← Volver</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ background:(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color+"26", color:(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color, border:"1px solid "+(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color+"66", borderRadius:6, padding:"2px 8px", fontSize:10.5, fontWeight:800, letterSpacing:0.8 }}>{(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).emoji} {(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).nombre.toUpperCase()}</span>
            <span style={{ fontSize:15, fontWeight:800, color:(CMD_TIPO[c.tipo] || CMD_TIPO.mesa).color }}>{props.titulo}</span>
          </div>
          <div style={{ fontSize:10, color:"#555" }}>
            #{c.numero}{c.mozo ? " · " + c.mozo : ""}{c.abierta_at ? " · abierta hace " + hace(c.abierta_at) : ""}
          </div>
        </div>
      </div>

      {/* Lo anotado en esta cuenta: descuento, facturación, control */}
      {(extra.descuento || extra.factura || extra.control_at) && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
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
            { id:"marchar",  txt:"🔥 Marchar",     sub:pendientes.length ? pendientes.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0) + " a la cocina" : "nada para mandar", col:"#E0914A", off:!pendientes.length, fn:mandar },
            { id:"sumar",    txt:"➕ Sumar plato",  sub:"de la carta",                                                                    col:"#4C9A5A", off:false, fn:function() { setAgregando(true); } },
            { id:"quitar",   txt:"➖ Quitar plato", sub:"con motivo",                                                                     col:"#E0714A", off:!mios.length, fn:function() { setVentana("quitar"); } },
            { id:"control",  txt:"🧾 Control",      sub:"precuenta",                                                                      col:"#8FD19A", off:!mios.length, fn:function() { setVentana("control"); if (props.onExtra) props.onExtra({ ...extra, control_at:new Date().toISOString() }); } },
            { id:"desc",     txt:"🏷️ Descuento",    sub:props.puedeDescuento === false ? "lo aplica el cajero" : (descM > 0 ? "−" + pesos(descM) : "% o $"),                       col:"#D4A017", off:!mios.length || props.puedeDescuento === false, fn:function() { setVentana("descuento"); } },
            { id:"facturar", txt:"🧾 Facturar",     sub:extra.factura ? "anotado" : "datos de factura",                                    col:"#5BB8DC", off:!mios.length, fn:function() { setVentana("factura"); } },
          ].map(function(b) {
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
          <div style={LBL}>Sin mandar</div>
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
                  <button onClick={function() { setNotaDe(notaDe === i.id ? null : i.id); }} title="Aclaración"
                    style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:i.nota?color:"#555", fontSize:11, cursor:"pointer" }}>✎</button>
                </div>
                {(notaDe === i.id || i.nota) && (
                  <input defaultValue={i.nota || ""} placeholder="Sin cebolla, bien cocido…"
                    onBlur={function(e) { var v = e.target.value.trim(); if (v !== (i.nota || "")) props.onGuardarItems([{ ...i, nota:v || null }]); }}
                    style={{ ...INP, fontSize:12, marginTop:5, marginLeft:70, width:"calc(100% - 70px)" }} />
                )}
              </div>
            );
          })}
          <button onClick={mandar}
            style={{ width:"100%", marginTop:8, padding:"12px", borderRadius:9, border:"none", background:color, color:"#fff", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer" }}>
            🔔 Mandar a la cocina ({pendientes.reduce(function(a, i) { return a + (Number(i.cant) || 1); }, 0)})
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
            <input value={busqueda} onChange={function(e) { setBusqueda(e.target.value); }} placeholder="Buscar un plato…" style={{ ...INP, fontSize:12 }} />
            <button onClick={function() { setAgregando(false); setBusqueda(""); }} style={{ ...GH, padding:"8px 13px", fontSize:12 }}>Listo</button>
          </div>
          {!q && (
            <div style={{ display:"flex", gap:5, marginBottom:9, flexWrap:"wrap" }}>
              {cats.map(function(cat) {
                var act = categoria === cat;
                return (
                  <button key={cat} onClick={function() { setCategoria(act ? null : cat); }}
                    style={{ padding:"6px 11px", borderRadius:7, border:"1px solid "+(act?color:"#1E1E1E"), background:act?color+"22":"#111", color:act?color:"#666", fontFamily:"'Inter',sans-serif", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
          {delLocal.length === 0 ? (
            <div style={{ fontSize:12, color:"#8A6055", lineHeight:1.6 }}>
              Este local todavía no tiene carta cargada. Se carga en la pestaña 📖 Carta.
            </div>
          ) : (!categoria && !q) ? (
            <div style={{ fontSize:11, color:"#444" }}>Elegí una categoría o buscá un plato.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:340, overflowY:"auto" }}>
              {platos.map(function(x) {
                return (
                  <button key={x.id} onClick={function() { agregar(x); }}
                    style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:9, padding:"9px 11px", borderRadius:8, border:"1px solid #1A1A1A", background:"#111", color:"#F0EDE8", fontFamily:"'Inter',sans-serif", fontSize:12, cursor:"pointer", textAlign:"left" }}>
                    <span style={{ flex:1, minWidth:0 }}>{x.nombre}</span>
                    <span style={{ color:x.precio ? "#666" : "#D4A017", whiteSpace:"nowrap" }}>{x.precio ? pesos(x.precio) : "sin precio"}</span>
                  </button>
                );
              })}
              {platos.length === 0 && <div style={{ fontSize:11, color:"#444", padding:"6px 0" }}>Nada con ese nombre.</div>}
            </div>
          )}
        </div>
      )}

      {/* Lo que ya está en la cocina, por tanda */}
      {rondas.map(function(r) {
        var min = r.items.some(function(i) { return i.estado === "enviado"; }) ? minutosDesde(r.enviado_at) : null;
        var col = min === null ? "#3A7D44" : colorDemora(min);
        var entregada = r.items.every(function(i) { return i.estado === "entregado"; });
        return (
          <div key={r.ronda} style={{ background:"#111", border:"1px solid "+col+"33", borderRadius:10, padding:"11px 12px", marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, gap:9 }}>
              <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1 }}>
                Tanda {r.ronda}{r.enviado_at ? " · " + fmtHora(r.enviado_at) : ""}
              </div>
              <div style={{ fontSize:12, fontWeight:800, color:col, whiteSpace:"nowrap" }}>
                {entregada ? "✅ entregada" : min === null ? "" : "⏱ " + min + " min"}
              </div>
            </div>
            {r.items.map(function(i) {
              var listo = i.estado === "entregado";
              return (
                <div key={i.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"4px 0", opacity:listo?0.5:1 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#888", minWidth:24 }}>{i.cant}x</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:"#F0EDE8", textDecoration:listo?"line-through":"none" }}>{i.nombre}</div>
                    {i.nota && <div style={{ fontSize:11, color:"#D4A017" }}>▸ {i.nota}</div>}
                  </div>
                  {PrecioItem({ i:i, chico:true })}
                  <button onClick={function() {
                      props.onGuardarItems([{ ...i, estado: listo ? "enviado" : "entregado", entregado_at: listo ? null : new Date().toISOString() }]);
                    }}
                    title={listo ? "Marcar como no entregado" : "Marcar como entregado"}
                    style={{ background:"none", border:"1px solid "+(listo?"#2A2A2A":col+"55"), borderRadius:6, padding:"3px 9px", color:listo?"#444":col, fontSize:11, cursor:"pointer", whiteSpace:"nowrap" }}>
                    {listo ? "✓" : "entregar"}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

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
      {ventana === "control" && <VentanaControl titulo={props.titulo} localNombre={props.localNombre} items={mios} subtotal={subtotal} descuento={descM} motivoDesc={extra.descuento && extra.descuento.motivo} total={total} onCerrar={function() { setVentana(null); }} />}
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
function CartaConsulta(props) {
  var localId = props.localId, color = props.color, carta = props.carta;
  var [buscar, setBuscar] = useState("");
  var delLocal = carta.filter(function(x) { return x.local === localId; });
  var q = buscar.trim().toLowerCase();
  var minOrden = {};
  delLocal.forEach(function(x) {
    var o = x.orden === null || x.orden === undefined ? 9999 : x.orden;
    if (minOrden[x.categoria] === undefined || o < minOrden[x.categoria]) minOrden[x.categoria] = o;
  });
  var categorias = Object.keys(minOrden).sort(function(a, b) { return minOrden[a] !== minOrden[b] ? minOrden[a] - minOrden[b] : a.localeCompare(b); });
  return (
    <div>
      <input value={buscar} onChange={function(e) { setBuscar(e.target.value); }} placeholder="🔎 Buscar un plato…" style={{ ...INP, marginBottom:12 }} />
      {delLocal.length === 0 && <div style={{ textAlign:"center", padding:"30px 0", color:"#666", fontSize:13 }}>Este local todavía no tiene carta cargada.</div>}
      {categorias.map(function(cat) {
        var platos = delLocal.filter(function(x) { return x.categoria === cat && (!q || String(x.nombre || "").toLowerCase().indexOf(q) !== -1); })
          .sort(function(a, b) { return (a.orden || 0) - (b.orden || 0) || String(a.nombre).localeCompare(String(b.nombre)); });
        if (!platos.length) return null;
        return (
          <div key={cat} style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:800, color:color, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>{cat}</div>
            {platos.map(function(x) {
              var fuera = x.activo === false;
              var sinPrecio = x.precio === null || x.precio === undefined || x.precio === "";
              return (
                <div key={x.id} style={{ display:"flex", justifyContent:"space-between", gap:10, padding:"8px 0", borderTop:"1px solid #161616", opacity:fuera ? 0.45 : 1 }}>
                  <div style={{ fontSize:13.5, color:"#F0EDE8", textDecoration:fuera ? "line-through" : "none" }}>{x.nombre}{fuera && <span style={{ fontSize:10, color:"#E0714A", marginLeft:6 }}>fuera de la carta</span>}</div>
                  <div style={{ fontSize:13.5, fontWeight:800, color:sinPrecio ? "#555" : "#F0EDE8", whiteSpace:"nowrap" }}>{sinPrecio ? "sin precio" : pesos(x.precio)}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Carta(props) {
  var localId = props.localId, local = props.local, color = props.color;
  var carta = props.carta, setCarta = props.setCarta, cargarCarta = props.cargarCarta;
  var p = { menuStock: props.menuStock };

    var [nuevoPlato, setNuevoPlato] = useState({});
    var [nuevaCat, setNuevaCat] = useState("");
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
        if (err) alert("No se pudo guardar el plato:\n\n" + err + "\n\nSi el error menciona la tabla carta, hay que crearla en Supabase (el SQL está en el README).");
      });
    }
    function borrarPlato(x) {
      if (!window.confirm("¿Sacar \"" + x.nombre + "\" de la carta?")) return;
      setCarta(function(prev) { return prev.filter(function(y) { return y.id !== x.id; }); });
      sbDeleteCarta(x.id);
    }
    // Categorías: cambiarles el nombre (se les cambia a todos sus platos) o borrarlas enteras, con sus platos.
    function renombrarCat(cat) {
      var nuevo = window.prompt("Nuevo nombre para la categoría «" + cat + "»:", cat);
      if (nuevo === null) return;
      nuevo = nuevo.trim();
      if (!nuevo || nuevo === cat) return;
      if (categorias.indexOf(nuevo) !== -1) { alert("Ya existe una categoría que se llama «" + nuevo + "». Para juntarlas, movés los platos de una a la otra."); return; }
      var cambiados = delLocal.filter(function(x) { return x.categoria === cat; }).map(function(x) { return { ...x, categoria:nuevo }; });
      setCarta(function(prev) { return prev.filter(function(y) { return !(y.local === localId && y.categoria === cat); }).concat(cambiados); });
      sbSaveCartaMuchos(cambiados).then(function(err) { if (err) { alert("No se pudo cambiar el nombre:\n\n" + String(err).slice(0, 200)); cargarCarta(); } });
    }
    function borrarCat(cat) {
      var platosCat = delLocal.filter(function(x) { return x.categoria === cat; });
      if (!window.confirm("¿Borrar la categoría «" + cat + "» con sus " + platosCat.length + " plato" + (platosCat.length === 1 ? "" : "s") + "?\n\nSi solo querés cambiar un plato de lugar, usá la flecha ↪ de cada plato.")) return;
      setCarta(function(prev) { return prev.filter(function(y) { return !(y.local === localId && y.categoria === cat); }); });
      platosCat.forEach(function(x) { sbDeleteCarta(x.id); });
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
      if (!nuevos.length) { alert("La carta de " + ((local && local.nombre) || "este local") + " ya tiene los " + cartaMx.length + " platos de Maxirest. No hay nada nuevo para cargar."); return; }
      if (!window.confirm("¿Cargar la carta de " + ((local && local.nombre) || "este local") + " tal como figura en Maxirest?\n\nSe suman " + nuevos.length + " platos con su precio" + (cartaMx.length - nuevos.length > 0 ? " (otros " + (cartaMx.length - nuevos.length) + " ya estaban y no se tocan)" : "") + ".\n\nDespués los podés editar, sacar o cambiar de categoría.")) return;
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
        alert("Listo: se cargaron " + nuevos.length + " platos con su precio.");
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
        alert("El menú de stock de " + ((local && local.nombre) || "este local") + " está vacío, así que no hay platos para traer.\n\nSe cargan en Compras → Stock, o se pueden escribir acá a mano con \"+ Categoría\" y el campo de agregar de cada una.");
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
        alert("La carta de " + ((local && local.nombre) || "este local") + " ya tiene los " + cuantosEnMenu + " platos del menú de stock. No hay nada nuevo para traer.");
        return;
      }
      setTrayendo(true);
      setCarta(function(prev) { return prev.concat(nuevos); });
      sbSaveCartaMuchos(nuevos).then(function(err) {
        setTrayendo(false);
        if (err) {
          setCarta(function(prev) { return prev.filter(function(x) { return nuevos.indexOf(x) === -1; }); });
          alert("No se pudieron traer los platos:\n\n" + err + "\n\nSi el error menciona la tabla carta, hay que crearla en Supabase (el SQL está en el README). Acordate del alter de RLS.");
          return;
        }
        cargarCarta();
      });
    }

    return (
      <div>
        <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"13px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:9 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:color }}>Carta de {local && local.nombre}</div>
              <div style={{ fontSize:11, color:"#555", marginTop:3 }}>
                {delLocal.length} plato{delLocal.length === 1 ? "" : "s"}
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
              {trayendo ? "Trayendo…" : "↓ Traer los platos del stock"}
            </button>
          </div>
          <div style={{ fontSize:11, color:"#7E7E7E", marginTop:9, lineHeight:1.5 }}>✎ Tocá el nombre o el precio de un plato para cambiarlo: se guarda solo al salir del campo.</div>
          {sinPrecio > 0 && (
            <div style={{ fontSize:11, color:"#8A6055", marginTop:9, lineHeight:1.5 }}>
              Un plato sin precio no se puede cobrar. Se puede mandar igual a la cocina, así que
              sirve para empezar, pero conviene completarlos antes de usar la cuenta.
            </div>
          )}
        </div>

        {/* Categoría nueva */}
        <div style={{ display:"flex", gap:7, marginBottom:14 }}>
          <input value={nuevaCat} onChange={function(e) { setNuevaCat(e.target.value); }}
            placeholder="Categoría nueva (Bebidas, Postres...)" style={{ ...INP, fontSize:12 }} />
          <button onClick={function() {
              var cat = nuevaCat.trim();
              if (!cat || categorias.indexOf(cat) !== -1) return;
              guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:"Nuevo plato", precio:null, activo:true, orden:0 });
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
              Los platos de este local ya están cargados en el menú de stock. Traelos con el botón de
              arriba y completá los precios: es mucho menos trabajo que escribirlos de nuevo.
            </div>
          </div>
        ) : categorias.map(function(cat) {
          // Dentro de cada categoría, el orden del menú; lo agregado a mano al final.
          var platos = delLocal.filter(function(x) { return x.categoria === cat; })
            .sort(function(a, b) {
              var oa = a.orden === null || a.orden === undefined ? 999 : a.orden;
              var ob = b.orden === null || b.orden === undefined ? 999 : b.orden;
              return oa !== ob ? oa - ob : String(a.nombre).localeCompare(String(b.nombre));
            });
          return (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1.5, flex:1 }}>{cat} ({platos.length})</div>
                <button onClick={function() { renombrarCat(cat); }} title="Cambiarle el nombre a la categoría" style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"2px 8px", color:"#888", fontSize:11, cursor:"pointer" }}>✎ Renombrar</button>
                <button onClick={function() { borrarCat(cat); }} title="Borrar la categoría entera" style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"2px 8px", color:"#888", fontSize:11, cursor:"pointer" }}>🗑️</button>
              </div>
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
        })}
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

    function crear() {
      if (esDelivery && !direccion.trim()) return;
      guardar({
        id: "cmd_" + Date.now(),
        local: localId, tipo: props.tipo, numero: proximoNumero(), estado: "abierta",
        mozo: usuario, cliente: cliente.trim() || null,
        direccion: esDelivery ? direccion.trim() : null,
        telefono: telefono.trim() || null,
        abierta_at: new Date().toISOString(), usuario: usuario,
      });
      setCliente(""); setDireccion(""); setTelefono(""); setAbierto(false);
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
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={crear} disabled={esDelivery && !direccion.trim()}
            style={{ flex:1, padding:"11px", borderRadius:8, border:"none", background:(!esDelivery || direccion.trim())?color:"#1A1A1A", color:(!esDelivery || direccion.trim())?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:(!esDelivery || direccion.trim())?"pointer":"not-allowed" }}>
            + Abrir
          </button>
          <button onClick={function() { setAbierto(false); }} style={{ ...GH, padding:"11px 16px", fontSize:13 }}>Cancelar</button>
        </div>
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
    return Promise.all([sbLoadMesas(), sbLoadComandas()]).then(function(r) {
      setMesas(r[0]); setComandas(r[1]); setCargando(false);
      return sbLoadItems(r[1].map(function(c) { return c.id; })).then(setItems);
    }).catch(function() { setCargando(false); });
  }
  function cargarCarta() { return sbLoadCarta().then(setCarta).catch(function() {}); }

  useEffect(function() {
    var vivo = true;
    sbComandasDisponible().then(function(err) { if (vivo) setProblemaTabla(err); });
    cargar();
    cargarCarta();
    // Durante el servicio la pantalla la miran varios a la vez: el mozo abre la
    // mesa y el encargado tiene que verla sin apretar nada. Refrescar solo cada 20
    // segundos es lo mínimo para que no sea una foto vieja. Lo correcto sería
    // Supabase Realtime, que además necesita abrir el CSP a wss://.
    var t = setInterval(function() { if (vivo) { cargar(); setAhora(Date.now()); } }, 20000);
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
  var delTipo = abiertas.filter(function(c) { return c.tipo === vistaActual.tipo; });

  var comandaAbierta = abiertaId ? comandas.find(function(x) { return x.id === abiertaId; }) : null;
  function tituloDe(c) {
    if (!c) return "";
    if (c.tipo === "mesa") {
      var m = mesas.find(function(x) { return x.id === c.mesa_id; });
      return "🪑 Mesa " + ((m && m.nombre) || "");
    }
    return (c.tipo === "delivery" ? "🛵 Delivery" : "🥡 Mostrador") + (c.cliente ? " · " + c.cliente : "");
  }

  function proximoNumero() {
    var hoy = new Date().toISOString().slice(0, 10);
    var nums = comandas.filter(function(c) { return c.local === localId && String(c.abierta_at || "").slice(0, 10) === hoy; })
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
  function borrarItem(id) {
    setItems(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    sbDeleteItem(id);
  }

  function abrirMesa(mesa) {
    var ya = comandaDeMesa(mesa.id);
    if (ya) { setAbiertaId(ya.id); return; }
    var nueva = {
      id: "cmd_" + Date.now(),
      local: localId, tipo: "mesa", mesa_id: mesa.id,
      numero: proximoNumero(), estado: "abierta",
      mozo: usuario, abierta_at: new Date().toISOString(), usuario: usuario,
    };
    guardar(nueva).then(function(err) { if (!err) setAbiertaId(nueva.id); });
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
  function guardarExtra(id, e) {
    setExtras(function(prev) { return { ...prev, [id]: e }; });
    sbGuardarExtra(id, e, usuario);
  }
  function cerrar(c, total, sinMandar, subtotal, desc) {
    if (sinMandar) { alert("Quedan " + sinMandar + " ítem(s) sin mandar a la cocina. Mandalos o sacalos antes de cerrar."); return; }
    var t = total === undefined ? c.total : total;
    var delPedido = items.filter(function(i) { return i.comanda_id === c.id && i.estado !== "cancelado"; });
    var sinPrecio = delPedido.filter(function(i) { return !(Number(i.precio) > 0); });
    if (sinPrecio.length) {
      alert("Hay " + sinPrecio.length + " plato" + (sinPrecio.length === 1 ? "" : "s") + " sin precio: " + sinPrecio.map(function(i) { return i.nombre; }).join(", ") + ".\n\nTocá «Poner precio» al lado de cada uno antes de cerrar, así no se pierde la venta.");
      return;
    }
    if (!delPedido.length && !window.confirm("La cuenta está vacía. ¿Cerrarla sin cobrar nada?")) return;
    if (!(Number(t) > 0)) {   // sin importe no hay nada que cobrar: se cierra directo
      guardar({ ...c, estado:"cerrada", cerrada_at:new Date().toISOString(), total:t });
      setAbiertaId(null);
      return;
    }
    setCobrando({ c:c, total:t, subtotal:subtotal === undefined ? t : subtotal, desc:desc || 0 });
  }
  function confirmarCobro(pagos) {
    var c = cobrando.c, total = cobrando.total, ahoraISO = new Date().toISOString();
    var fecha = p.diaDeNegocio ? p.diaDeNegocio() : ahoraISO.slice(0, 10);
    // El cobro queda anotado aparte (para el cierre) y la comanda se cierra. Si el cobro no se pudo anotar, no se cierra: así no se pierde la plata.
    var ex = extras[c.id] || {};
    sbGuardarPago({ comanda_id:c.id, local:c.local, fecha:fecha, total:total, subtotal:cobrando.subtotal, descuento:cobrando.desc, descuento_motivo:(ex.descuento && ex.descuento.motivo) || "", factura:ex.factura || null, pagos:pagos, tipo:c.tipo, cobro_por:usuario, cobrado_at:ahoraISO }).then(function(err) {
      if (err) { alert("No se pudo anotar el cobro. La comanda sigue abierta.\n\n" + String(err).slice(0, 200)); setCobrando(null); return; }
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
    var demora = ocupada ? demoraDe(items.filter(function(i) { return i.comanda_id === c.id; })) : null;
    var col = demora === null ? color : colorDemora(demora);
    return (
      <button onClick={function() { ocupada ? setAbiertaId(c.id) : abrirMesa(m); }}
        title={ocupada ? "Abierta hace " + hace(c.abierta_at) : "Tocar para abrir"}
        style={{
          width:82, height:82, borderRadius:12, cursor:"pointer",
          border:"1px solid " + (ocupada ? col : "#1E1E1E"),
          background: ocupada ? col + "22" : "#0F0F0F",
          color: ocupada ? col : "#555",
          fontFamily:"'Inter',sans-serif", display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:2, padding:4,
        }}>
        {/* Una mesa se llama "12", pero también "Reservado": el número entra grande
            y el nombre largo se achica para no desbordar la tarjeta. */}
        <div style={{ fontSize: nom.length <= 3 ? 22 : nom.length <= 7 ? 14 : 11, fontWeight:800, lineHeight:1.1, maxWidth:74, textAlign:"center", wordBreak:"break-word" }}>{nom}</div>
        {ocupada ? (
          <>
            <div style={{ fontSize:9, opacity:0.9, fontWeight:demora !== null ? 800 : 400 }}>
              {demora !== null ? "🍳 " + demora + " min" : "⏱ " + hace(c.abierta_at)}
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
  return (
    <div style={{ fontFamily:"'Inter',sans-serif" }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5 }}>Módulo</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:800 }}>🍽️ Comandas</div>
      </div>

      {practica ? (
        <div style={{ background:"#2A1F00", border:"2px dashed #D4A017", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#D4A017", letterSpacing:1 }}>🎮 MODO PRÁCTICA</div>
          <div style={{ fontSize:11, color:"#E8D9A0", lineHeight:1.5, margin:"3px 0 8px" }}>Probá abrir mesas, cargar platos y cobrar. Es de mentira: no se guarda nada ni entra al cierre de caja. Las mesas y la carta son las reales.</div>
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
        {CMD_VISTAS.map(function(v) {
          var act = vista === v.id && !config;
          var cuenta = v.tipo ? abiertas.filter(function(c) { return c.tipo === v.tipo; }).length : 0;
          var colV = v.tipo ? CMD_TIPO[v.tipo].color : color;
          return (
            <button key={v.id} onClick={function() { setVista(v.id); setConfig(false); }}
              style={{ flex:1, minWidth:110, padding:"11px 12px", borderRadius:9, border:"2px solid "+(act?colV:colV+"33"), background:act?colV+"28":"#111", color:act?colV:colV+"AA", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {v.emoji} {v.nombre}{cuenta > 0 ? " (" + cuenta + ")" : ""}
            </button>
          );
        })}
      </div>

      {cobrando && <Cobro total={cobrando.total} subtotal={cobrando.subtotal} descuento={cobrando.desc} factura={(extras[cobrando.c.id] || {}).factura} tipo={cobrando.c.tipo} titulo={tituloDe(cobrando.c)} color={color} onConfirmar={confirmarCobro} onCancelar={function() { setCobrando(null); }} />}
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
        />
      ) : config ? (
        <>
          <button onClick={function() { setConfig(false); }} style={{ ...GH, padding:"7px 13px", fontSize:12, marginBottom:12 }}>← Volver al plano</button>
          <ConfigMesas localId={localId} local={local} color={color} mesasLocal={mesasLocal} setMesas={setMesas} comandaDeMesa={comandaDeMesa} />
        </>
      ) : vista === "carta" ? (
        (p.soloServicio && !p.puedeEditarCarta)
          ? <CartaConsulta localId={localId} color={color} carta={carta} />
          : <Carta localId={localId} local={local} color={color} carta={carta} setCarta={setCarta} cargarCarta={cargarCarta} menuStock={p.menuStock} />
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
                          style={{ position:"absolute", left:z.x + "%", top:z.y + "%", transform:"translate(-50%,-50%)", ...(z.w ? { width:z.w + "%", height:z.h + "%" } : { minWidth:110, height:46 }), boxSizing:"border-box", padding:"0 14px", borderRadius:8, background:t.color + "22", border:"1px solid " + t.color + "88", color:t.color, display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:12, fontWeight:800, letterSpacing:0.6, textTransform:"uppercase", cursor: acomodando ? "grab" : "default", zIndex: arrastre === z.id ? 5 : 0, userSelect:"none" }}>
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
              var delSector = mesasLocal.filter(function(m) { return m.sector === s.id; });
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
          <NuevaComanda tipo={vistaActual.tipo} color={CMD_TIPO[vistaActual.tipo].color} localId={localId} usuario={usuario} guardar={guardar} proximoNumero={proximoNumero} />
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
                        <div style={{ marginBottom:4 }}><span style={{ display:"inline-block", background:T.color+"26", color:T.color, border:"1px solid "+T.color+"66", borderRadius:6, padding:"2px 8px", fontSize:10.5, fontWeight:800, letterSpacing:0.8 }}>{T.emoji} {T.nombre.toUpperCase()} #{c.numero}</span></div>
                        <div style={{ fontSize:14, fontWeight:800, color:"#F0EDE8" }}>{c.cliente || "Sin nombre"}</div>
                        {c.direccion && <div style={{ fontSize:11, color:"#888", marginTop:3 }}>📍 {c.direccion}</div>}
                        {c.telefono && <div style={{ fontSize:11, color:"#666" }}>📞 {c.telefono}</div>}
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
