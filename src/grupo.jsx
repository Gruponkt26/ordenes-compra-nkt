// Grupo Nkt para el público: la página que se abre con el QR (sin usuario ni clave) y el panel donde se arma y se ve la comunidad.
//  · <GrupoNkt/>        la página pública: quiénes somos, los locales, pedir por WhatsApp, opinar y sumarse a la comunidad.
//  · <PanelComunidad/>  para administración: datos de cada local, el enlace con su QR y la lista de miembros.
import { MENSAJES_COMERCIOS } from "./material_comercios.js";
import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { SURL, SH } from "./comun.js";
import { PedirDelivery, SeguimientoPedido } from "./pedido_delivery.jsx";
import JuegoTickets from "./juego_tickets.jsx";

var URL_PUBLICA = "https://ordenes-compra-nkt.vercel.app";
var LOCALES_GRUPO = [
  { id: "l1", emoji: "🍷", nombre: "El Bodegón Nkt", color: "#C1440E", logo: "/logos/bodegon.png", alto: 34, desc: "Cocina de bodegón, buena mesa y buena compañía." },
  { id: "l2", emoji: "🍣", nombre: "Kusama", color: "#8B2FC9", logo: "/logos/kusama.png", alto: 64, desc: "Sushi en Punta Alta." },
  { id: "l3", emoji: "🍕", nombre: "Colantonio's", color: "#1A6B8A", logo: "/logos/colantonio.png", alto: 64, desc: "Pizza napolitana." },
];
var CONFIG_VACIA = { frase: "", bienvenida: "", gancho: "", cuponPct: 10, cuponDias: 30, cuponPctLocal: {}, cuponBenefLocal: {}, locales: {}, wspAdmin: "", ticketsActivo: false, ticketsPremio: "" };

// La comunidad vive en su propia ruta (/grupo/) para instalarse como una app aparte de la de gestión.
// ¿El aviso destacado de este local sigue vigente? Sin fecha, se muestra hasta que se borre; con fecha, hasta ese día inclusive.
function avisoVigente(d) {
  if (!d || !String(d.aviso || "").trim()) return false;
  if (!d.aviso_hasta) return true;
  var hoy = new Date(), iso = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
  return iso <= d.aviso_hasta;
}
export function urlGrupo() { return URL_PUBLICA + "/grupo/"; }
function esModoPrueba() { try { return new URLSearchParams(window.location.search).has("prueba"); } catch (e) { return false; } }
// Descuento del cupón: el del local donde la persona se sumó, si se cargó uno; si no, el general.
// El descuento depende del local donde se CANJEA (cada local tiene el suyo); un cupón con "pctFijo" (cargado a mano) lo mantiene en cualquier local.
export function pctCanje(c, cfg, localId) { return (c && c.pctFijo) ? c.pctFijo : pctPara(cfg, localId); }
// Para mostrar un cupón: ya canjeado → lo que se dio (beneficio o descuento); sin canjear → su valor fijo o "según el local".
function pctTexto(c) { return c.estado === "usado" ? (c.beneficio || c.pct + "%") : (c.pctFijo ? c.pctFijo + "%" : "según el local"); }
// Beneficio especial de un local en lugar del porcentaje (ej: "2x1 en pizzas", "1 vino de regalo"). Vacío = vale el descuento.
export function benefPara(cfg, local) { return String(((cfg && cfg.cuponBenefLocal) || {})[local] || "").trim(); }
function valoresPorLocal(cfg) { return LOCALES_GRUPO.map(function (l) { return { n: l.nombre, p: pctPara(cfg, l.id), b: benefPara(cfg, l.id) }; }); }
function mismoValor(cfg) { var v = valoresPorLocal(cfg); return v.every(function (x) { return x.p === v[0].p && x.b === v[0].b; }); }
// "10% de descuento" o, si cambia según el local, "El Bodegón Nkt 10% · Kusama 1 vino de regalo · …".
function fraseDescuento(cfg) { var v = valoresPorLocal(cfg); return mismoValor(cfg) && !v[0].b ? v[0].p + "% de descuento" : "beneficio según el local: " + v.map(function (x) { return x.n + " " + (x.b || x.p + "%"); }).join(" · "); }
export function pctPara(cfg, local) { return ((cfg && cfg.cuponPctLocal) || {})[local] || (cfg && cfg.cuponPct) || 10; }
export function nombreCompleto(m) { return ((m && m.nombre) || "") + (m && m.apellido ? " " + m.apellido : ""); }
export function idDispositivo() {
  try { var d = window.localStorage.getItem("nkt_dispositivo"); if (!d) { d = Math.random().toString(36).slice(2, 8); window.localStorage.setItem("nkt_dispositivo", d); } return d; } catch (e) { return ""; }
}
function soloDigitos(s) { return String(s || "").replace(/\D/g, ""); }
// Número de WhatsApp argentino listo para wa.me: acepta 0, 15, espacios, guiones, +54, 54 o 549 (los celulares van con 549).
function numeroWsp(w) {
  var n = soloDigitos(w); if (!n) return "";
  if (n.indexOf("549") === 0) return n;
  if (n.indexOf("54") === 0 && n.length >= 12) return "549" + n.slice(2);
  n = n.replace(/^0+/, "");
  if (n.length === 12 && (n.slice(2, 4) === "15" || n.slice(3, 5) === "15" || n.slice(4, 6) === "15")) n = n.slice(0, n.slice(2, 4) === "15" ? 2 : n.slice(3, 5) === "15" ? 3 : 4) + n.slice(n.slice(2, 4) === "15" ? 4 : n.slice(3, 5) === "15" ? 5 : 6);
  if (n.length === 10) return "549" + n;
  return n.length <= 10 ? "54" + n : n;
}
export function linkWsp(w, texto) {
  var n = numeroWsp(w); if (!n) return "";
  return "https://wa.me/" + n + (texto ? "?text=" + encodeURIComponent(texto) : "");
}
// Enlace web escrito a mano: si falta el https:// (o es un @usuario de Instagram) se completa para que abra bien.
function linkWeb(u, tipo) {
  u = String(u || "").trim(); if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (tipo === "instagram") return "https://www.instagram.com/" + u.replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  return "https://" + u.replace(/^\/+/, "");
}

export async function cargarConfigGrupo() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq.grupo_config&limit=1", { headers: SH });
    var d = await r.json();
    var x = Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
    return { frase: (x && x.frase) || "", bienvenida: (x && x.bienvenida) || "", gancho: (x && x.gancho) || "", cuponPct: (x && x.cuponPct) || 10, cuponDias: (x && x.cuponDias) || 30, cuponPctLocal: (x && x.cuponPctLocal) || {}, cuponBenefLocal: (x && x.cuponBenefLocal) || {}, locales: (x && x.locales) || {}, wspAdmin: (x && x.wspAdmin) || "", ticketsActivo: !!(x && x.ticketsActivo), ticketsPremio: (x && x.ticketsPremio) || "" };
  } catch (e) { return CONFIG_VACIA; }
}
export async function guardarFila(id, ambito, obj) {
  var ahora = new Date().toISOString();
  var r = await fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: id, ambito: ambito, texto: JSON.stringify(obj), usuario: "comunidad", created_at: ahora, updated_at: ahora }) });
  return r.ok;
}

// ─── TICKETS DEL SORTEO ───
// Cada premio de tickets es una fila (ámbito grupo_ticket, id tk_<wsp>_<momento>): {wsp, n, mes, local, fecha, origen}. El total del socio es la suma de sus filas del mes.
export function mesClave(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
export async function cargarTicketsSocio(wsp) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_ticket&id=like." + encodeURIComponent("tk_" + wsp + "_*") + "&limit=1000", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    var mes = mesClave(), n = 0, total = 0;
    (Array.isArray(d) ? d : []).forEach(function (f) { try { var t = JSON.parse(f.texto); var c = Number(t.n) || 0; total += c; if (t.mes === mes) n += c; } catch (e) {} });
    return { mes: n, total: total };
  } catch (e) { return { mes: 0, total: 0 }; }
}
// La tarjeta «Tus tickets» de la pantalla de la comunidad. Solo se muestra si administración activó los tickets.
function TarjetaTickets(props) {
  var [t, setT] = useState(null);
  var [premios, setPremios] = useState([]);
  useEffect(function () { cargarTicketsSocio(props.wsp).then(setT); cargarPremios(false).then(setPremios); }, [props.wsp]);
  return (
    <div style={{ background: "linear-gradient(135deg,#2A1208,#1A1A1A)", border: "1.5px solid #C1440E99", borderRadius: 16, padding: "13px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: "#E8602A", lineHeight: 1, minWidth: 58, textAlign: "center" }}>{t ? t.mes : "…"}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#F0EDE8" }}>🎟️ Tus tickets este mes</div>
          <div style={{ fontSize: 12, color: "#BDBDBD", lineHeight: 1.4, marginTop: 2 }}>Entran a todos los sorteos del mes. Sumá más dejando tu opinión en cualquiera de nuestros locales.</div>
        </div>
      </div>
      {premios.length > 0 && (
        <div style={{ marginTop: 10, background: "#141414", border: "1px dashed #444", borderRadius: 12, padding: "9px 11px" }}>
          <div style={{ fontSize: 12, color: "#E5C467", fontWeight: 800, marginBottom: 4 }}>🎁 Este mes se sortea{premios.length > 1 ? "n" : ""}:</div>
          {premios.map(function (pr) { return <div key={pr.id} style={{ fontSize: 12.5, color: "#CFCFCF", padding: "2px 0" }}>• <b style={{ color: "#F0EDE8" }}>{pr.premio}</b>{pr.de_nombre ? <span style={{ color: "#9A9A9A" }}> · de {pr.de_nombre}</span> : null}</div>; })}
        </div>
      )}
    </div>
  );
}

// ─── DE QUÉ COMERCIO VINO EL SOCIO ───
// El cartel de mostrador de cada comercio amigo lleva un QR a /grupo/?de=<id del comercio>. Se recuerda en el celular y, si la persona se suma, queda anotado en su ficha
// (origen): así cada comercio ve cuántos socios nuevos trajo. Quien ya era socio conserva su origen original.
export function origenGuardado() { try { var d = localStorage.getItem("nkt_de") || ""; return /^com_[A-Za-z0-9_]+$/.test(d) ? d : ""; } catch (e) { return ""; } }
function recordarOrigenDeUrl() {
  try { var d = new URLSearchParams(window.location.search).get("de") || ""; if (/^com_[A-Za-z0-9_]+$/.test(d)) localStorage.setItem("nkt_de", d); } catch (e) {}
}
// Socios que se sumaron por el QR de cada comercio: {comercio_id: {total, mes}} (sin pruebas).
export async function cargarSociosPorComercio() {
  try {
    var patron = encodeURIComponent('*"origen":"com_*');
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad&texto=like." + patron + "&limit=3000", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json(), out = {}, mes = mesClave();
    (Array.isArray(d) ? d : []).forEach(function (f) {
      try {
        var t = JSON.parse(f.texto); if (!t.origen || t.prueba) return;
        var o = out[t.origen] = out[t.origen] || { total: 0, mes: 0 };
        o.total++; var fe = new Date(t.fecha || f.created_at); if (!isNaN(fe.getTime()) && mesClave(fe) === mes) o.mes++;
      } catch (e) {}
    });
    return out;
  } catch (e) { return {}; }
}

// ─── OPINAR DESPUÉS DE CANJEAR ───
// El socio solo ve «Opiná y jugá» si canjeó su cupón en uno de los 3 locales en las últimas 24 horas: así la opinión viene de una visita real.
export function ultimoCanjeLocal(historial) {
  var lim = Date.now() - 24 * 3600 * 1000, mejor = null;
  (historial || []).forEach(function (c) {
    if (!c || c.estado !== "usado" || !c.usado_at || new Date(c.usado_at).getTime() < lim) return;
    var l = LOCALES_GRUPO.find(function (x) { return x.nombre === c.usado_local; });
    if (l && (!mejor || c.usado_at > mejor.at)) mejor = { local: l, at: c.usado_at };
  });
  return mejor;
}
function TarjetaOpinar(props) {
  var u = ultimoCanjeLocal(props.historial);
  if (!u) return null;
  // Si ya opinó de ese local hace poco desde este celular, no se le ofrece de nuevo (la opinión tiene un descanso de 6 horas).
  try { var t = parseInt(localStorage.getItem("opinion_" + u.local.id + "_salon") || "0", 10); if (t > 0 && Date.now() - t < 6 * 3600 * 1000) return null; } catch (e) {}
  var color = u.local.color;
  return (
    <div style={{ background: "linear-gradient(135deg," + color + "26,#161616)", border: "1.5px solid " + color + "99", borderRadius: 16, padding: "14px", marginBottom: 14, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#F0EDE8" }}>{u.local.emoji} ¿Cómo te fue en {u.local.nombre}?</div>
      <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.45, margin: "4px 0 10px" }}>{props.conJuego ? "Contanos en un minuto y jugá para ganar tickets del sorteo." : "Contanos en un minuto: tu opinión nos ayuda a mejorar."}</div>
      <a href={"/?opinar=" + u.local.id + "&c=salon" + (props.prueba ? "&prueba" : "")} style={{ display: "block", padding: "12px", borderRadius: 12, background: color, color: "#fff", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>{props.conJuego ? "🎟️ Opiná y jugá" : "⭐ Dejar mi opinión"}</a>
    </div>
  );
}

// ─── COMERCIOS AMIGOS ───
// Comercios que no son de Grupo Nkt pero forman parte de la comunidad: aparecen como una tarjeta más (ámbito grupo_comercio, uno por comercio).
export async function cargarComercios(soloActivos) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_comercio&order=created_at.asc&limit=200", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    var l = Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
    l.sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); });
    return soloActivos ? l.filter(function (c) { return c.activo !== false; }) : l;
  } catch (e) { return []; }
}
// La promo de un comercio solo se muestra mientras está vigente: pasada la fecha de fin, se oculta sola.
// ─── CANJES EN LOS COMERCIOS AMIGOS ───
// Cuando un comercio canjea el cupón de un socio (por código escrito, como en los locales de Grupo Nkt), el cupón se marca usado, al socio le llega
// el siguiente y queda un registro del canje (ámbito grupo_canje_comercio) con el que se arma el informe de cada comercio. Sin límite de uso por ahora.
export async function cargarCanjesComercios() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_canje_comercio&order=created_at.desc&limit=2000", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
// Números de un comercio en un período: canjes, socios distintos, cuántos volvieron (2 o más canjes) y el gasto que anotó el comercio.
export function resumenCanjes(lista, comercioId, dias) {
  var desde = dias ? Date.now() - dias * 864e5 : 0;
  var l = (lista || []).filter(function (x) { return (!comercioId || x.comercio_id === comercioId) && new Date(x.at).getTime() >= desde; });
  var porSocio = {}; l.forEach(function (x) { porSocio[x.wsp] = (porSocio[x.wsp] || 0) + 1; });
  var socios = Object.keys(porSocio);
  return { canjes: l.length, socios: socios.length, volvieron: socios.filter(function (k) { return porSocio[k] > 1; }).length, gasto: l.reduce(function (a, x) { return a + (Number(x.monto) || 0); }, 0), lista: l };
}
// ─── RECLAMOS DE LOS SOCIOS ───
// Un socio con cupón puede avisar a administración que tuvo un problema en un comercio amigo. Es privado: lo ve solo administración
// (ámbito grupo_reclamo, un registro por socio, comercio y semana). El comercio no lo ve; administración decide qué le comunica.
export var MOTIVOS_RECLAMO = ["No me respetaron el beneficio", "Mala atención", "Servicio fallido o demora", "Me cobraron de más", "Otro motivo"];
export var ESTADOS_RECLAMO = [{ id: "nuevo", txt: "Nuevo", col: "#E0714A" }, { id: "revision", txt: "En revisión", col: "#D4A017" }, { id: "resuelto", txt: "Resuelto", col: "#4C9A5A" }];
export function semanaClave() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); var s1 = new Date(d.getFullYear(), 0, 4); return d.getFullYear() + "-S" + String(1 + Math.round(((d - s1) / 864e5 - 3 + ((s1.getDay() + 6) % 7)) / 7)).padStart(2, "0"); }
export async function cargarReclamos() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_reclamo&order=created_at.desc&limit=500", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
// Cuántos reclamos tiene un comercio en los últimos 30 días (para marcar los que conviene revisar).
export function reclamosDe(lista, comercioId) { var desde = Date.now() - 30 * 864e5; return (lista || []).filter(function (x) { return x.comercio_id === comercioId && new Date(x.at).getTime() >= desde; }).length; }
function VentanaReclamo(props) {
  var c = props.c, cupon = props.cupon;
  var [motivo, setMotivo] = useState("");
  var [texto, setTexto] = useState("");
  var [enviando, setEnviando] = useState(false);
  var [msg, setMsg] = useState("");
  var [listo, setListo] = useState(false);
  function enviar() {
    if (!motivo) { setMsg("Elegí qué pasó."); return; }
    setEnviando(true); setMsg("");
    var id = "reclamo_" + c.id + "_" + cupon.wsp + "_" + semanaClave();
    leerPauta(id).then(function (ya) {
      if (ya) { setEnviando(false); setMsg("Ya recibimos tu reclamo sobre este comercio esta semana. Si hay algo nuevo, te escribimos nosotros."); return; }
      var ahora = new Date().toISOString();
      var obj = { comercio_id: c.id, comercio_nombre: c.nombre, wsp: cupon.wsp, nombre: cupon.nombre || "", motivo: motivo, comentario: texto.trim(), at: ahora, estado: "nuevo", nota: "" };
      fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: id, ambito: "grupo_reclamo", texto: JSON.stringify(obj), usuario: "", created_at: ahora, updated_at: ahora }) })
        .then(function (r) { setEnviando(false); if (r.ok) setListo(true); else setMsg("No se pudo enviar. Probá de nuevo."); })
        .catch(function () { setEnviando(false); setMsg("No se pudo enviar. Revisá tu conexión."); });
    });
  }
  var inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "inherit", fontSize: 14, marginBottom: 8 };
  return (
    <div onClick={props.onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={function (e) { e.stopPropagation(); }} style={{ background: "#141414", border: "1px solid #C1440E66", borderRadius: 16, padding: 16, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", color: "#F0EDE8" }}>
        {listo ? (
          <div style={{ textAlign: "center", padding: "10px 4px" }}>
            <div style={{ fontSize: 34 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, margin: "6px 0" }}>Recibimos tu reclamo</div>
            <div style={{ fontSize: 13.5, color: "#B8B8B8", lineHeight: 1.5 }}>Lo ve administración de Grupo Nkt. Si hace falta, te escribimos por WhatsApp. Gracias por avisarnos.</div>
            <button onClick={props.onCerrar} style={{ marginTop: 14, padding: "11px 22px", borderRadius: 10, border: "none", background: "#1A6B8A", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Cerrar</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>⚠️ Tuve un problema en {c.nombre}</div>
            <div style={{ fontSize: 12.5, color: "#9A9A9A", lineHeight: 1.45, margin: "4px 0 12px" }}>Esto lo ve solo administración de Grupo Nkt, no el comercio. Nos sirve para que la comunidad funcione bien.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {MOTIVOS_RECLAMO.map(function (m) { var on = motivo === m; return <button key={m} onClick={function () { setMotivo(m); }} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid " + (on ? "#E0714A" : "#2A2A2A"), background: on ? "#E0714A22" : "#161616", color: "#F0EDE8", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>{on ? "● " : "○ "}{m}</button>; })}
            </div>
            <textarea value={texto} onChange={function (e) { setTexto(e.target.value); }} rows={3} placeholder="Contanos qué pasó (opcional, pero nos ayuda)" style={{ ...inp, resize: "vertical" }} />
            {msg && <div style={{ fontSize: 12.5, color: "#F0A090", marginBottom: 8, lineHeight: 1.4 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={enviar} disabled={enviando} style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: enviando ? "#2A2A2A" : "#C1440E", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{enviando ? "Enviando…" : "Enviar a administración"}</button>
              <button onClick={props.onCerrar} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #2A2A2A", background: "none", color: "#9A9A9A", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export function promoVigente(c) {
  if (!c || !String(c.beneficio || "").trim()) return "";
  var hoy = new Date(), iso = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
  if (c.promo_hasta && iso > c.promo_hasta) return "";
  if (c.promo_desde && iso < c.promo_desde) return "";
  return String(c.beneficio).trim();
}
export function fechaCorta(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[3] + "/" + m[2] : ""; }
export function nuevoToken() { try { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); } catch (e) { return String(Date.now()) + Math.random().toString(16).slice(2, 10); } }
// Lo que cada comercio pidió cambiar desde su portal (ámbito grupo_comercio_cambio, uno por comercio): {comercio_id: {datos, estado, enviado_at}}.
export async function cargarCambiosComercios() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_comercio_cambio&limit=300", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json(), o = {};
    (Array.isArray(d) ? d : []).forEach(function (f) { try { o[String(f.id).replace(/^comcambio_/, "")] = JSON.parse(f.texto); } catch (e) {} });
    return o;
  } catch (e) { return {}; }
}
// Solicitudes de comercios nuevos que entraron por una invitación (ámbito grupo_comercio_alta): [{id, datos, comercio_id, estado, enviado_at}].
export async function cargarAltasComercios() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_comercio_alta&limit=300", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
var ETIQ_COMERCIO = { nombre: "Nombre", desc: "Descripción", direccion: "Dirección", horarios: "Horarios", wsp: "WhatsApp", carta: "Carta", instagram: "Instagram", color: "Color", logo: "Logo", beneficio: "Promo", promo_desde: "Promo desde", promo_hasta: "Promo hasta", promo_cond: "Condiciones de la promo" };
async function guardarComercio(c) { var o = { ...c }; var id = o.id; delete o.id; return guardarFila(id, "grupo_comercio", o); }
// Borra varias filas de pautas de una vez (por id).
async function borrarFilas(ids) {
  if (!ids || !ids.length) return true;
  try { var r = await fetch(SURL + "/rest/v1/pautas?id=in.(" + ids.map(function (x) { return encodeURIComponent(x); }).join(",") + ")", { method: "DELETE", headers: SH }); return r.ok; } catch (e) { return false; }
}
async function borrarComercio(id) { try { var r = await fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: SH }); return r.ok; } catch (e) { return false; } }
// El logo se achica en el celular o la compu (hasta 600 px) y se pone sobre fondo blanco, porque la tarjeta lo muestra así.
export function achicarLogo(file) {
  return new Promise(function (res) {
    try {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 600 / Math.max(img.width, img.height));
        var cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { URL.revokeObjectURL(url); res(b || null); }, "image/jpeg", 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    } catch (e) { res(null); }
  });
}
export async function subirLogoComercio(blob, id) {
  try {
    var r = await fetch(SURL + "/storage/v1/object/fichajes/comercios/" + id + ".jpg", { method: "POST", headers: { apikey: SH.apikey, Authorization: SH.Authorization, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: blob });
    if (!r.ok) return { ok: false, error: await r.text() };
    return { ok: true, url: SURL + "/storage/v1/object/public/fichajes/comercios/" + id + ".jpg" };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
// La tarjeta de un comercio amigo, como la de un local pero sin pedidos ni reservas.
export function TarjetaComercio(props) {
  var c = props.c, color = c.color || "#1A6B8A";
  var [reclamando, setReclamando] = useState(false);
  var [reclamando, setReclamando] = useState(false);
  var boton = { display: "block", textAlign: "center", padding: "11px 8px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#161616", color: "#F0EDE8", fontSize: 13, fontWeight: 700, textDecoration: "none" };
  var item = function (link, txt) { return link ? <a href={link} target="_blank" rel="noreferrer" style={boton}>{txt}</a> : <span style={{ ...boton, opacity: 0.4, cursor: "not-allowed" }} title="Pronto">{txt}</span>; };
  return (
    <div style={{ background: "#111", border: "1px solid " + color + "55", borderRadius: 16, padding: "16px", marginBottom: 14 }}>
      <div style={{ textAlign: "center" }}>
        {c.logo
          ? <div style={{ background: "#fff", borderRadius: 12, padding: "8px 14px", display: "inline-block", maxWidth: "100%" }}><img src={c.logo} alt={c.nombre} style={{ display: "block", height: 64, maxWidth: "100%", width: "auto", margin: "0 auto" }} /></div>
          : <div style={{ fontSize: 22, fontWeight: 800, color: color }}>{c.nombre}</div>}
        {c.desc && <div style={{ fontSize: 13.5, color: "#C8C8C8", marginTop: 8 }}>{c.desc}</div>}
      </div>
      {promoVigente(c) && <div style={{ background: color + "22", border: "1px dashed " + color + "99", borderRadius: 10, padding: "8px 12px", marginTop: 10, textAlign: "center", fontSize: 13, color: "#F0EDE8", fontWeight: 700 }}>🎟️ Con tu cupón: {promoVigente(c)}{c.promo_hasta ? <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#C8C8C8" }}>válido hasta el {fechaCorta(c.promo_hasta)}</span> : null}{c.promo_cond ? <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#C8C8C8" }}>{c.promo_cond}</span> : null}</div>}
      {(c.direccion || c.horarios) && (
        <div style={{ fontSize: 12.5, color: "#B8B8B8", lineHeight: 1.6, marginTop: 10, textAlign: "center" }}>
          {c.direccion && <div>📍 {c.direccion}</div>}
          {c.horarios && <div style={{ whiteSpace: "pre-wrap" }}>🕒 {c.horarios}</div>}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        {item(c.direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.direccion + " Punta Alta") : "", "📍 Cómo llegar")}
        {item(linkWeb(c.carta), "🍽️ Ver la carta")}
        {item(linkWsp(c.wsp, "Hola " + c.nombre + "! Los vi en la comunidad de Grupo Nkt."), "💬 Escribinos")}
        {item(linkWeb(c.instagram, "instagram"), "📸 Instagram")}
      </div>
      {props.cupon && props.cupon.wsp && <button onClick={function () { setReclamando(true); }} style={{ display: "block", width: "100%", marginTop: 10, padding: "9px", borderRadius: 10, border: "1px solid #3A3A3A", background: "none", color: "#B0A090", fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>⚠️ Tuve un problema con este comercio</button>}
      {reclamando && <VentanaReclamo c={c} cupon={props.cupon} onCerrar={function () { setReclamando(false); }} />}
    </div>
  );
}
// Franja de comercios amigos, justo debajo del cupón: se desliza de costado y, al tocar uno, se abre su tarjeta completa.
// Invitación a los comercios: bloque destacado + consulta por WhatsApp. Lo ven todos (socios y quien todavía no se unió).
function CtaComercio(props) {
  var linkConsulta = linkWsp(props.wspAdmin, "Hola! Tengo un comercio y quiero sumarme a la comunidad de Grupo Nkt. ¿Me cuentan cómo es?");
  return (
    <div>
      <div style={{ marginTop: 12, background: "linear-gradient(135deg,#C1440E,#E8602A)", borderRadius: 16, padding: "16px 16px 14px", textAlign: "center", boxShadow: "0 4px 18px #C1440E55" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>🤝 ¿Tenés un comercio?</div>
        <div style={{ fontSize: 13.5, color: "#FFE9DD", marginTop: 5, lineHeight: 1.4 }}>Sumalo a la comunidad: los socios te conocen, llegan con un beneficio y los primeros 2 meses no pagás nada.</div>
        <a href="/comercio/?alta=1" style={{ display: "block", marginTop: 12, padding: "13px", borderRadius: 12, background: "#fff", color: "#C1440E", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>Sumá tu comercio →</a>
      </div>
      {linkConsulta && <a href={linkConsulta} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 8, textAlign: "center", padding: "6px", color: "#B8B8B8", fontSize: 12.5, textDecoration: "underline" }}>Prefiero consultar primero por WhatsApp</a>}
    </div>
  );
}
function FranjaComercios(props) {
  var lista = props.comercios || [];
  var [abierto, setAbierto] = useState("");
  var sel = lista.find(function (c) { return c.id === abierto; });
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ margin: "0 4px 8px" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#F0EDE8" }}>🤝 Comercios amigos</div>
        <div style={{ fontSize: 11.5, color: "#8C8C8C", marginTop: 1 }}>Mostrá tu cupón y disfrutá sus beneficios{lista.length > 1 ? " · deslizá →" : ""}</div>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {lista.map(function (c) {
          var color = c.color || "#1A6B8A", on = abierto === c.id;
          return (
            <button key={c.id} onClick={function () { setAbierto(on ? "" : c.id); }} style={{ flex: "0 0 172px", textAlign: "left", cursor: "pointer", background: on ? color + "33" : "#111", border: "1px solid " + (on ? color : color + "66"), borderRadius: 14, padding: "10px 11px", color: "#F0EDE8", fontFamily: "'Inter',sans-serif" }}>
              <div style={{ height: 38, display: "flex", alignItems: "center", marginBottom: 7 }}>
                {c.logo ? <span style={{ background: "#fff", borderRadius: 8, padding: "3px 8px", display: "inline-block" }}><img src={c.logo} alt={c.nombre} style={{ display: "block", height: 30, maxWidth: 130, width: "auto" }} /></span>
                  : <span style={{ fontSize: 15, fontWeight: 800, color: color, lineHeight: 1.15 }}>{c.nombre}</span>}
              </div>
              {c.logo && <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>{c.nombre}</div>}
              <div style={{ fontSize: 11.5, color: "#C8C8C8", lineHeight: 1.35, marginTop: 3 }}>{promoVigente(c) ? "🎟️ " + promoVigente(c) : (c.desc || "")}</div>
              <div style={{ fontSize: 10.5, color: color, fontWeight: 700, marginTop: 6 }}>{on ? "▾ cerrar" : "▸ ver más"}</div>
            </button>
          );
        })}
      </div>
      {sel && <div style={{ marginTop: 8 }}><TarjetaComercio c={sel} cupon={props.cupon} /></div>}
      {!props.sinCta && <CtaComercio wspAdmin={props.wspAdmin} />}
    </div>
  );
}
// Administración: los reclamos que mandaron los socios sobre los comercios amigos (privados: el comercio no los ve).
function PanelReclamos(props) {
  var tarjeta = props.tarjeta;
  var [lista, setLista] = useState(null);
  var [abierto, setAbierto] = useState(false);
  var [filtro, setFiltro] = useState("abiertos");   // abiertos (nuevos y en revisión) | resueltos | todos
  var [notas, setNotas] = useState({});
  function recargar() { return cargarReclamos().then(setLista); }
  useEffect(function () { recargar(); }, []);
  function cambiar(r, estado) { var o = { ...r }; delete o.id; guardarFila(r.id, "grupo_reclamo", { ...o, estado: estado, nota: notas[r.id] !== undefined ? notas[r.id] : (r.nota || ""), resuelto_at: estado === "resuelto" ? new Date().toISOString() : "" }).then(function () { recargar(); }); }
  var nuevos = (lista || []).filter(function (r) { return r.estado === "nuevo"; }).length;
  var vista = (lista || []).filter(function (r) { return filtro === "todos" || (filtro === "resueltos" ? r.estado === "resuelto" : r.estado !== "resuelto"); });
  return (
    <div style={tarjeta}>
      <div onClick={function () { setAbierto(!abierto); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{abierto ? "▾" : "▸"} ⚠️ Reclamos de los socios{nuevos > 0 ? <span style={{ marginLeft: 8, background: "#C1440E", color: "#fff", borderRadius: 99, padding: "1px 8px", fontSize: 11 }}>{nuevos} nuevo{nuevos === 1 ? "" : "s"}</span> : (lista ? " (" + lista.length + ")" : "")}</div>
      {abierto && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: "#8C8C8C", lineHeight: 1.5, marginBottom: 8 }}>Lo que los socios cuentan desde la tarjeta de un comercio amigo. Es privado: el comercio no lo ve; vos decidís qué le decís y si lo pausás.</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["abiertos", "Abiertos"], ["resueltos", "Resueltos"], ["todos", "Todos"]].map(function (t) { var on = filtro === t[0]; return <button key={t[0]} onClick={function () { setFiltro(t[0]); }} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid " + (on ? "#D4A017" : "#2A2A2A"), background: on ? "#D4A01722" : "none", color: on ? "#F0EDE8" : "#8C8C8C", fontSize: 12, cursor: "pointer" }}>{t[1]}</button>; })}
          </div>
          {lista && vista.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "6px 0" }}>No hay reclamos {filtro === "abiertos" ? "abiertos" : filtro === "resueltos" ? "resueltos" : ""}.</div>}
          {vista.map(function (r) {
            var est = ESTADOS_RECLAMO.find(function (e) { return e.id === r.estado; }) || ESTADOS_RECLAMO[0];
            var wa = linkWsp(r.wsp, "Hola " + (r.nombre || "") + "! Te escribimos de Grupo Nkt por lo que nos contaste de " + (r.comercio_nombre || "un comercio amigo") + ". Queremos entender qué pasó para resolverlo. ¿Podés contarnos un poco más?");
            return (
              <div key={r.id} style={{ borderTop: "1px solid #1A1A1A", padding: "9px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{r.comercio_nombre || "Comercio"} <span style={{ color: est.col, fontSize: 11, fontWeight: 700 }}>· {est.txt}</span></div>
                  <div style={{ fontSize: 11, color: "#7E7E7E", whiteSpace: "nowrap" }}>{r.at ? new Date(r.at).toLocaleDateString("es-AR") : ""}</div>
                </div>
                <div style={{ fontSize: 12.5, color: "#E0A090", fontWeight: 700, marginTop: 2 }}>{r.motivo}</div>
                {r.comentario && <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.45, marginTop: 2, whiteSpace: "pre-wrap" }}>“{r.comentario}”</div>}
                <div style={{ fontSize: 11.5, color: "#8C8C8C", marginTop: 3 }}>🙋 {r.nombre || "Socio"} · {r.wsp}</div>
                <input value={notas[r.id] !== undefined ? notas[r.id] : (r.nota || "")} onChange={function (e) { var v = e.target.value; setNotas(function (n) { var m = { ...n }; m[r.id] = v; return m; }); }} placeholder="Nota interna (qué se habló, qué se decidió)" style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "7px 9px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12 }} />
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #3A7D44", color: "#8FD19A", fontSize: 12, textDecoration: "none" }}>💬 Escribirle al socio</a>}
                  {r.estado !== "revision" && r.estado !== "resuelto" && <button onClick={function () { cambiar(r, "revision"); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #D4A01788", background: "none", color: "#E5C467", fontSize: 12, cursor: "pointer" }}>En revisión</button>}
                  {r.estado !== "resuelto" && <button onClick={function () { cambiar(r, "resuelto"); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #3A7D44", background: "none", color: "#8FD19A", fontSize: 12, cursor: "pointer" }}>✓ Resuelto</button>}
                  {r.estado === "resuelto" && <button onClick={function () { cambiar(r, "nuevo"); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "none", color: "#9A9A9A", fontSize: 12, cursor: "pointer" }}>Reabrir</button>}
                  {notas[r.id] !== undefined && notas[r.id] !== (r.nota || "") && <button onClick={function () { cambiar(r, r.estado); }} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontSize: 12, cursor: "pointer" }}>Guardar nota</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// Administración: alta, edición y baja de los comercios amigos.
// ─── SORTEO DE TICKETS (administración) ───
// Cada ticket es una chance: quien tiene 5 tickets tiene 5 veces más probabilidades que quien tiene 1. El sorteo queda guardado (ámbito grupo_sorteo).
var MESES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function mesNombreLargo(clave) { var m = /^(\d{4})-(\d{2})$/.exec(clave || ""); return m ? MESES_NOMBRE[parseInt(m[2], 10) - 1] + " de " + m[1] : clave; }
function aleatorioEntero(max) {   // 0 .. max-1, sin sesgo, con el generador del navegador
  try { var a = new Uint32Array(1), lim = Math.floor(4294967296 / max) * max; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % max; }
  catch (e) { return Math.floor(Math.random() * max); }
}
export async function cargarTicketsTodos() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_ticket&order=created_at.desc&limit=5000", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
export async function cargarSorteos() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_sorteo&order=created_at.desc&limit=100", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
// Los premios del sorteo (ámbito grupo_premio). Pueden ser varios al mismo tiempo; cada uno dice de quién es (un local del grupo o un comercio amigo).
// Todos los tickets del mes participan en todos los premios; cada premio se sortea por separado.
export async function cargarPremios(todos) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_premio&order=created_at.asc&limit=100", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    var l = Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
    return todos ? l : l.filter(function (x) { return x.activo !== false; });
  } catch (e) { return []; }
}
function opcionesPremioDe(comercios) {
  return [{ id: "grupo", nombre: "Grupo Nkt" }].concat(LOCALES_GRUPO.map(function (l) { return { id: l.id, nombre: l.nombre }; }), (comercios || []).map(function (c) { return { id: c.id, nombre: c.nombre, amigo: true }; }));
}
function PanelSorteo(props) {
  var tarjeta = props.tarjeta, socios = props.socios || [];
  var [abierto, setAbierto] = useState(false);
  var [tickets, setTickets] = useState(null);
  var [sorteos, setSorteos] = useState([]);
  var [premios, setPremios] = useState([]);
  var [comercios, setComercios] = useState([]);
  var [mes, setMes] = useState(mesClave());
  var [nuevo, setNuevo] = useState({ premio: "", de: "grupo" });
  var [noRepetir, setNoRepetir] = useState(true);   // un mismo socio no gana dos premios del mismo mes
  var [ult, setUlt] = useState(null);      // el sorteo recién hecho (para avisarle y publicarlo)
  var [msg, setMsg] = useState("");
  var [ocupado, setOcupado] = useState(false);
  function recargar() { return Promise.all([cargarTicketsTodos(), cargarSorteos(), cargarPremios(true), cargarComercios(false)]).then(function (r) { setTickets(r[0]); setSorteos(r[1]); setPremios(r[2]); setComercios(r[3]); }); }
  useEffect(function () { if (abierto && tickets === null) recargar(); }, [abierto]);
  var meses = []; for (var i = 0; i < 6; i++) { var d = new Date(); d.setMonth(d.getMonth() - i, 1); meses.push(mesClave(d)); }
  // Los tickets del mes, sumados por persona, solo de quienes siguen en la comunidad (no pruebas ni empleados).
  var porWsp = {}; socios.forEach(function (m) { porWsp[m.wsp] = m; });
  var cuenta = {}, fuera = 0;
  (tickets || []).forEach(function (t) { if (t.mes !== mes) return; var c = Number(t.n) || 0; if (porWsp[t.wsp]) cuenta[t.wsp] = (cuenta[t.wsp] || 0) + c; else fuera += c; });
  var ranking = Object.keys(cuenta).map(function (w) { return { wsp: w, n: cuenta[w], m: porWsp[w] }; }).sort(function (a, b) { return b.n - a.n; });
  var totalTickets = ranking.reduce(function (a, r) { return a + r.n; }, 0);
  var hechosMes = sorteos.filter(function (x) { return x.mes === mes; });
  var yaGanaron = {}; hechosMes.forEach(function (x) { yaGanaron[x.ganador_wsp] = true; });
  var opciones = opcionesPremioDe(comercios);
  function nombreDe(id) { var o = opciones.find(function (x) { return x.id === id; }); return o ? o.nombre : "Grupo Nkt"; }
  function publico(m) { var ap = String((m && m.apellido) || "").trim(); return ((m && m.nombre) || "").trim() + (ap ? " " + ap.charAt(0).toUpperCase() + "." : ""); }
  function deTxt(x) { return x.premio_de_nombre ? " (premio de " + x.premio_de_nombre + ")" : ""; }
  function agregarPremio() {
    if (!nuevo.premio.trim()) { setMsg("Escribí cuál es el premio."); setTimeout(function () { setMsg(""); }, 3000); return; }
    var id = "prem_" + Date.now();
    guardarFila(id, "grupo_premio", { premio: nuevo.premio.trim(), de_id: nuevo.de, de_nombre: nombreDe(nuevo.de), activo: true, creado: new Date().toISOString() }).then(function (ok) {
      if (ok) { setNuevo({ premio: "", de: nuevo.de }); recargar(); setMsg("✓ Premio agregado: ya lo ven los socios."); } else setMsg("No se pudo guardar el premio.");
      setTimeout(function () { setMsg(""); }, 3500);
    });
  }
  function pausarPremio(pr) { var o = { ...pr }; delete o.id; guardarFila(pr.id, "grupo_premio", { ...o, activo: pr.activo === false }).then(function () { recargar(); }); }
  function quitarPremio(pr) { if (!window.confirm("¿Borrar el premio «" + pr.premio + "»? Los sorteos ya hechos se conservan.")) return; borrarFilas([pr.id]).then(function () { recargar(); }); }
  function sortear(pr) {
    if (ocupado) return;
    var elegibles = ranking.filter(function (r) { return !(noRepetir && yaGanaron[r.wsp]); });
    var total = elegibles.reduce(function (a, r) { return a + r.n; }, 0);
    if (!elegibles.length) { setMsg(ranking.length ? "Todos los socios con tickets ya ganaron un premio este mes. Destildá «No repetir ganadores» para sortear igual." : "Todavía no hay tickets este mes."); setTimeout(function () { setMsg(""); }, 5000); return; }
    var previo = hechosMes.find(function (x) { return x.premio_id === pr.id; });
    var extra = previo ? "\n\n⚠️ Este premio ya se sorteó en " + mesNombreLargo(mes) + " (ganó " + previo.ganador_nombre + "). Esto hace otro sorteo distinto." : "";
    if (!window.confirm("¿Sortear «" + pr.premio + "»" + (pr.de_nombre ? " (de " + pr.de_nombre + ")" : "") + "?\n\nParticipan " + elegibles.length + " socio" + (elegibles.length === 1 ? "" : "s") + " con " + total + " ticket" + (total === 1 ? "" : "s") + " de " + mesNombreLargo(mes) + ". Cada ticket es una chance." + (noRepetir && Object.keys(yaGanaron).length ? " Quedan afuera quienes ya ganaron otro premio este mes." : "") + extra + "\n\nEl resultado queda guardado y no se puede deshacer.")) return;
    setOcupado(true);
    var pos = aleatorioEntero(total), acum = 0, ganador = elegibles[0];
    for (var k = 0; k < elegibles.length; k++) { acum += elegibles[k].n; if (pos < acum) { ganador = elegibles[k]; break; } }
    var fila = { mes: mes, premio_id: pr.id, premio: pr.premio, premio_de_id: pr.de_id || "", premio_de_nombre: pr.de_nombre || "", ganador_wsp: ganador.wsp, ganador_nombre: nombreCompleto(ganador.m), ganador_publico: publico(ganador.m), tickets_ganador: ganador.n, tickets_total: total, participantes: elegibles.length, fecha: new Date().toISOString(), publicado: false };
    var id = "sorteo_" + mes + "_" + Date.now();
    guardarFila(id, "grupo_sorteo", fila).then(function (ok) {
      setOcupado(false);
      if (!ok) { setMsg("No se pudo guardar el sorteo. Probá de nuevo."); setTimeout(function () { setMsg(""); }, 4000); return; }
      setUlt({ id: id, ...fila }); recargar();
    });
  }
  function avisarGanador(x) {
    var txt = "Hola " + String(x.ganador_nombre || "").split(" ")[0] + "! 🎉 Ganaste el sorteo de " + mesNombreLargo(x.mes) + " de la Comunidad Grupo Nkt: " + (x.premio || "el premio") + (x.premio_de_nombre ? " (de " + x.premio_de_nombre + ")" : "") + ". Escribinos para coordinar cómo retirarlo. ¡Felicitaciones y gracias por ser parte!";
    window.open(linkWsp(x.ganador_wsp, txt), "_blank");
  }
  function publicar(x) {
    if (!window.confirm("Se va a publicar en Novedades: «" + x.ganador_publico + "» ganó " + (x.premio || "el sorteo") + deTxt(x) + ". Se muestra el nombre y la inicial del apellido.\n\n¿Publicar?")) return;
    var id = "nov_" + Date.now(), hasta = new Date(Date.now() + 30 * 86400000), iso = hasta.getFullYear() + "-" + String(hasta.getMonth() + 1).padStart(2, "0") + "-" + String(hasta.getDate()).padStart(2, "0");
    guardarFila(id, "grupo_novedad", { titulo: "🎉 Ganador/a: " + (x.premio || "sorteo de " + mesNombreLargo(x.mes)), texto: x.ganador_publico + " ganó " + (x.premio || "el sorteo del mes") + deTxt(x) + " con sus " + x.tickets_ganador + " ticket" + (x.tickets_ganador === 1 ? "" : "s") + ". ¡Gracias por participar! Sumá tickets dejando tu opinión en cualquiera de nuestros locales.", local: "todos", hasta: iso, foto_url: "", video: "", creado: new Date().toISOString(), activa: true }).then(function (ok) {
      if (!ok) { setMsg("No se pudo publicar. Probá de nuevo."); setTimeout(function () { setMsg(""); }, 4000); return; }
      var o = { ...x }; delete o.id; guardarFila(x.id, "grupo_sorteo", { ...o, publicado: true }).then(function () { setUlt(function (u) { return u && u.id === x.id ? { ...u, publicado: true } : u; }); recargar(); setMsg("✓ Publicado en Novedades."); setTimeout(function () { setMsg(""); }, 4000); });
    });
  }
  var btn = { padding: "9px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" };
  var inp = { padding: "8px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12.5, boxSizing: "border-box" };
  return (
    <div style={tarjeta}>
      <div onClick={function () { setAbierto(!abierto); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#D4A017" }}>{abierto ? "▾" : "▸"} 🎟️ Sorteos y premios</div>
      {abierto && (
        <div style={{ marginTop: 10 }}>
          {tickets === null ? <div style={{ fontSize: 12, color: "#8C8C8C" }}>Cargando…</div> : (
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <select value={mes} onChange={function (e) { setMes(e.target.value); setUlt(null); }} style={inp}>{meses.map(function (m) { return <option key={m} value={m}>{mesNombreLargo(m)}</option>; })}</select>
                <button onClick={recargar} style={{ ...btn, border: "1px solid #333", background: "#161616", color: "#F0EDE8" }}>↻ Actualizar</button>
              </div>
              <div style={{ fontSize: 12.5, color: "#C8C8C8", marginBottom: 8 }}><b style={{ color: "#F0EDE8" }}>{totalTickets}</b> ticket{totalTickets === 1 ? "" : "s"} entre <b style={{ color: "#F0EDE8" }}>{ranking.length}</b> socio{ranking.length === 1 ? "" : "s"} en {mesNombreLargo(mes)}.{fuera > 0 ? " (" + fuera + " ticket" + (fuera === 1 ? "" : "s") + " de pruebas o de personas que ya no están en la comunidad no participan.)" : ""}</div>
              {ranking.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "4px 0 8px" }}>Todavía no hay tickets este mes.</div>}
              {ranking.slice(0, 15).map(function (r) {
                return <div key={r.wsp} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}><span>{nombreCompleto(r.m)}{yaGanaron[r.wsp] ? " 🏆" : ""}</span><span style={{ color: "#8C8C8C" }}>{r.n} ticket{r.n === 1 ? "" : "s"} · {totalTickets ? Math.round(r.n / totalTickets * 1000) / 10 : 0} %</span></div>;
              })}
              {ranking.length > 15 && <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 4 }}>… y {ranking.length - 15} más.</div>}

              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#E5C467", margin: "16px 0 4px" }}>🎁 Premios (puede haber varios a la vez)</div>
              <div style={{ fontSize: 11, color: "#8C8C8C", lineHeight: 1.45, marginBottom: 6 }}>Todos los tickets del mes participan en todos los premios; cada premio se sortea por separado. Los socios ven la lista de premios activos en su pantalla.</div>
              {premios.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "4px 0" }}>Todavía no cargaste ningún premio.</div>}
              {premios.map(function (pr) {
                var h = hechosMes.filter(function (x) { return x.premio_id === pr.id; });
                return (
                  <div key={pr.id} style={{ borderTop: "1px solid #161616", padding: "8px 0", opacity: pr.activo === false ? 0.55 : 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{pr.premio}</div>
                    <div style={{ fontSize: 11.5, color: "#9A9A9A" }}>de <b style={{ color: "#C8C8C8" }}>{pr.de_nombre || "Grupo Nkt"}</b>{opciones.find(function (o) { return o.id === pr.de_id && o.amigo; }) ? " · comercio amigo" : ""}{pr.activo === false ? " · ⏸ pausado" : ""}{h.length ? " · 🏆 " + mesNombreLargo(mes) + ": " + h[0].ganador_publico : ""}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                      <button onClick={function () { sortear(pr); }} disabled={ocupado || pr.activo === false} style={{ ...btn, padding: "6px 12px", border: "none", background: pr.activo === false ? "#2A2A2A" : "#C1440E", color: "#fff", fontSize: 12 }}>{h.length ? "🎲 Sortear de nuevo" : "🎲 Sortear este premio"}</button>
                      <button onClick={function () { pausarPremio(pr); }} style={{ ...btn, padding: "6px 10px", border: "1px solid #333", background: "#161616", color: "#C8C8C8", fontSize: 12 }}>{pr.activo === false ? "▶ Reactivar" : "⏸ Pausar"}</button>
                      <button onClick={function () { quitarPremio(pr); }} title="Borrar el premio" style={{ ...btn, padding: "6px 10px", border: "1px solid #333", background: "#161616", color: "#C8C8C8", fontSize: 12 }}>🗑️</button>
                    </div>
                  </div>
                );
              })}
              <div style={{ background: "#0E0E0E", border: "1px solid #1E1E1E", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>+ Agregar un premio</div>
                <input value={nuevo.premio} onChange={function (e) { var v = e.target.value; setNuevo(function (n) { return { ...n, premio: v }; }); }} placeholder="Ej: una cena para dos" style={{ ...inp, width: "100%", marginBottom: 6 }} />
                <div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 3 }}>¿De quién es el premio?</div>
                <select value={nuevo.de} onChange={function (e) { var v = e.target.value; setNuevo(function (n) { return { ...n, de: v }; }); }} style={{ ...inp, width: "100%" }}>
                  <optgroup label="Grupo Nkt">{opciones.filter(function (o) { return !o.amigo; }).map(function (o) { return <option key={o.id} value={o.id}>{o.nombre}</option>; })}</optgroup>
                  {opciones.some(function (o) { return o.amigo; }) && <optgroup label="Comercios amigos">{opciones.filter(function (o) { return o.amigo; }).map(function (o) { return <option key={o.id} value={o.id}>{o.nombre}</option>; })}</optgroup>}
                </select>
                <button onClick={agregarPremio} style={{ ...btn, marginTop: 8, border: "none", background: "#1A6B8A", color: "#fff" }}>Agregar premio</button>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#C8C8C8", marginTop: 10 }}><input type="checkbox" checked={noRepetir} onChange={function (e) { setNoRepetir(e.target.checked); }} /> No repetir ganadores: quien ya ganó un premio este mes no entra a los demás sorteos (🏆)</label>
              <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 6, lineHeight: 1.45 }}>El resultado de cada sorteo queda guardado. Antes del primer sorteo real, confirmá con el abogado las bases (docs/sorteo-preguntas.md).</div>
              {msg && <div style={{ fontSize: 12.5, color: "#8FD19A", marginTop: 8, fontWeight: 700 }}>{msg}</div>}
              {ult && (
                <div style={{ marginTop: 12, background: "#0F2415", border: "1px solid #3A7D4488", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#9FE0AA", fontWeight: 800, letterSpacing: 1.4 }}>🎉 GANADOR/A</div>
                  <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>{ult.ganador_nombre}</div>
                  <div style={{ fontSize: 12, color: "#B8D8BE" }}>con {ult.tickets_ganador} de {ult.tickets_total} ticket{ult.tickets_total === 1 ? "" : "s"}{ult.premio ? " · " + ult.premio : ""}{ult.premio_de_nombre ? " (de " + ult.premio_de_nombre + ")" : ""}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
                    <button onClick={function () { avisarGanador(ult); }} style={{ ...btn, border: "none", background: "#25D366", color: "#08240F" }}>💬 Avisarle por WhatsApp</button>
                    {!ult.publicado ? <button onClick={function () { publicar(ult); }} style={{ ...btn, border: "1px solid #D4A017", background: "#D4A01722", color: "#E5C467" }}>📣 Publicar en Novedades</button> : <span style={{ fontSize: 12, color: "#9FE0AA", alignSelf: "center" }}>✓ Ya publicado</span>}
                  </div>
                </div>
              )}
              {sorteos.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Sorteos hechos</div>
                  {sorteos.map(function (x) {
                    return <div key={x.id} style={{ padding: "6px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
                      <b>{x.premio || "Sorteo"}</b>{x.premio_de_nombre ? <span style={{ color: "#8C8C8C" }}> · de {x.premio_de_nombre}</span> : null} · ganó <b>{x.ganador_nombre}</b> <span style={{ color: "#8C8C8C" }}>({x.tickets_ganador} de {x.tickets_total} tickets · {mesNombreLargo(x.mes)})</span>
                      <span style={{ display: "block", fontSize: 11, color: "#6E6E6E" }}>{new Date(x.fecha).toLocaleString("es-AR")} · {x.publicado ? "📣 publicado" : "sin publicar"}
                        <button onClick={function () { avisarGanador(x); }} style={{ marginLeft: 8, background: "none", border: "none", color: "#6FE0A0", cursor: "pointer", fontSize: 11 }}>💬 avisar</button>
                        {!x.publicado && <button onClick={function () { publicar(x); }} style={{ marginLeft: 6, background: "none", border: "none", color: "#E5C467", cursor: "pointer", fontSize: 11 }}>📣 publicar</button>}
                      </span>
                    </div>;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelComerciosRed(props) {
  var tarjeta = props.tarjeta;
  var [lista, setLista] = useState(null);
  var [abierto, setAbierto] = useState(false);
  var [form, setForm] = useState(null);   // el comercio que se está cargando o editando
  var [msg, setMsg] = useState("");
  var [subiendo, setSubiendo] = useState(false);
  var [sociosQR, setSociosQR] = useState({});   // socios que se sumaron por el QR de cada comercio
  var [verMat, setVerMat] = useState(false);       // «Material para comercios»: cerrado hasta que se toca
  var [nomMat, setNomMat] = useState("");          // el nombre que reemplaza a [nombre] en los mensajes
  var [copiadoMat, setCopiadoMat] = useState("");
  function copiarMensaje(m) {
    var txt = m.texto.replace(/\[nombre\]/g, nomMat.trim() || "[nombre]").replace(/\{socios\}/g, String(props.socios > 0 ? props.socios : 70));
    var aMano = function () { window.prompt("Copiá este mensaje:", txt); };
    try { navigator.clipboard.writeText(txt).then(function () { setCopiadoMat(m.id); setTimeout(function () { setCopiadoMat(""); }, 3000); }, aMano); } catch (e) { aMano(); }
  }
  var [cambios, setCambios] = useState({});      // lo que cada comercio pidió cambiar desde su portal
  var [reclamos, setReclamos] = useState([]);    // para marcar a los comercios con reclamos en los últimos 30 días
  var [novs, setNovs] = useState([]);            // novedades que mandaron los comercios (las pendientes se aprueban acá)
  var [canjes, setCanjes] = useState([]);        // canjes registrados por los comercios (para sus resultados)
  var [altas, setAltas] = useState([]);          // solicitudes de comercios nuevos
  var [avisoCom, setAvisoCom] = useState(null);  // después de aprobar o rechazar: el mensaje de WhatsApp para avisarle al comercio {nombre, link}
  var [verCambio, setVerCambio] = useState("");   // el comercio cuyos cambios se están revisando
  var sel = { width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 13, marginBottom: 6 };
  function recargar() { cargarSociosPorComercio().then(setSociosQR); cargarCambiosComercios().then(setCambios); cargarReclamos().then(setReclamos); cargarNovedadesComercios().then(setNovs); cargarCanjesComercios().then(setCanjes); cargarAltasComercios().then(setAltas); return cargarComercios(false).then(setLista); }
  useEffect(function () { recargar(); }, []);
  function nuevo() { setForm({ id: "com_" + Date.now(), nombre: "", desc: "", color: "#1A6B8A", logo: "", direccion: "", horarios: "", wsp: "", carta: "", instagram: "", beneficio: "", activo: true, orden: ((lista || []).length + 1) * 10 }); }
  function setF(k, v) { setForm(function (f) { var n = { ...f }; n[k] = v; return n; }); }
  function elegirLogo(e) {
    var file = e.target.files && e.target.files[0]; if (!file) return;
    setSubiendo(true);
    achicarLogo(file).then(function (blob) {
      if (!blob) { setSubiendo(false); setMsg("No se pudo leer esa imagen."); return; }
      subirLogoComercio(blob, form.id).then(function (r) { setSubiendo(false); if (r.ok) setF("logo", r.url); else setMsg("No se pudo subir el logo: " + (r.error || "")); });
    });
  }
  function guardar() {
    if (!String(form.nombre || "").trim()) { setMsg("Falta el nombre del comercio."); return; }
    guardarComercio({ ...form, nombre: form.nombre.trim() }).then(function (ok) {
      setMsg(ok ? "✓ Guardado" : "No se pudo guardar. Revisá la conexión.");
      if (ok) { setForm(null); recargar(); }
      setTimeout(function () { setMsg(""); }, 3000);
    });
  }
  function quitar(c) {
    if (!window.confirm("¿Borrar «" + c.nombre + "» de la comunidad?\n\nDeja de aparecer en la página y su link deja de servir. Se borran también su código de acceso, sus novedades y su solicitud de alta. Se conservan, como historia, sus canjes y reclamos.\n\nNo se puede deshacer. Si solo querés frenarlo, usá ⏸ Pausar.")) return;
    // Todo lo que le pertenece: su código, el último pedido de cambios, sus novedades y su solicitud de alta (con la invitación que usó).
    var ids = ["comkey_" + c.id, "comcambio_" + c.id];
    novs.filter(function (n) { return n.comercio_id === c.id; }).forEach(function (n) { ids.push(n.id); });
    altas.filter(function (a) { return a.comercio_id === c.id; }).forEach(function (a) { ids.push(a.id); ids.push("cominv_" + String(a.id).replace(/^comalta_/, "")); });
    borrarFilas(ids).then(function () { return borrarComercio(c.id); }).then(function () { recargar(); setMsg("🗑️ " + c.nombre + " se borró de la comunidad."); setTimeout(function () { setMsg(""); }, 4000); });
  }
  // Después de resolver algo, se ofrece avisarle al comercio por WhatsApp (el mensaje ya viene armado).
  function ofrecerAviso(c, texto) { setAvisoCom({ nombre: (c && c.nombre) || "el comercio", link: c && c.wsp ? linkWsp(c.wsp, texto) : "" }); }
  // Novedades de los comercios: se publican cuando administración las aprueba. Cada comercio puede mandar 1 por semana; las extra las habilita administración (se cobran aparte).
  function limpiarNov(n) { var o = { ...n }; delete o.id; delete o.comercio; return o; }
  function aprobarNov(n) { guardarFila(n.id, "grupo_novedad_comercio", { ...limpiarNov(n), estado: "aprobada", aprobada_at: new Date().toISOString() }).then(function () { recargar(); setMsg("✓ Novedad publicada."); setTimeout(function () { setMsg(""); }, 3000); ofrecerAviso((lista || []).find(function (x) { return x.id === n.comercio_id; }), "Hola! Tu novedad «" + n.titulo + "» ya está publicada para los socios de la comunidad de Grupo Nkt. ¡Gracias!"); }); }
  function rechazarNov(n) {
    var m = window.prompt("Motivo del rechazo (lo ve el comercio en su portal):", "");
    if (m === null) return;
    guardarFila(n.id, "grupo_novedad_comercio", { ...limpiarNov(n), estado: "rechazada", motivo: m.trim(), resuelto_at: new Date().toISOString() }).then(function () { recargar(); ofrecerAviso((lista || []).find(function (x) { return x.id === n.comercio_id; }), "Hola! No pudimos aprobar tu novedad «" + n.titulo + "» en la comunidad de Grupo Nkt" + (m.trim() ? ": " + m.trim() : "") + ". Podés corregirla desde tu portal."); });
  }
  function darExtra(c) {
    if (!window.confirm("¿Habilitar 1 novedad extra esta semana para «" + c.nombre + "»?\n\nSe cobra aparte.")) return;
    var sem = semanaClave(), ex = c.novedad_extra && c.novedad_extra.sem === sem ? c.novedad_extra.n : 0;
    guardarComercio({ ...c, novedad_extra: { sem: sem, n: ex + 1 } }).then(function () { recargar(); setMsg("✓ Novedad extra habilitada para " + c.nombre + " esta semana."); setTimeout(function () { setMsg(""); }, 4000); });
  }
  // Invitación para un comercio NUEVO: un link con el formulario vacío, de un solo uso. El comercio completa todo y queda pendiente de aprobación.
  function copiarUrl(url, ok) {
    var aMano = function () { window.prompt("Copiá este link y mandáselo:", url); };
    try { navigator.clipboard.writeText(url).then(function () { setMsg(ok); setTimeout(function () { setMsg(""); }, 5000); }, aMano); } catch (e) { aMano(); }
  }
  function invitar() {
    var nota = window.prompt("¿Para quién es la invitación? (opcional: te sirve para acordarte a quién se la diste)", "");
    if (nota === null) return;
    var t = nuevoToken();
    guardarFila("cominv_" + t, "grupo_comercio_invitacion", { creada_at: new Date().toISOString(), nota: (nota || "").trim() }).then(function (ok) {
      if (!ok) { setMsg("No se pudo crear la invitación. Probá de nuevo."); return; }
      copiarUrl(window.location.origin + "/comercio/?i=" + t, "✓ Invitación copiada. Mandásela por WhatsApp: sirve una sola vez.");
    });
  }
  // Invitar por WhatsApp: se pide el número del comercio, se crea la invitación y queda lista la barra para abrir el chat con el mensaje y el link.
  function invitarPorWsp() {
    var num = window.prompt("WhatsApp del comercio que querés invitar (con código de área, sin 0 ni 15). Ej: 2914123456", "");
    if (num === null) return;
    if (!numeroWsp(num)) { setMsg("Ese número de WhatsApp no parece válido."); setTimeout(function () { setMsg(""); }, 4000); return; }
    var nom = window.prompt("¿Cómo se llama el comercio o la persona? (opcional)", "");
    if (nom === null) return;
    var t = nuevoToken();
    guardarFila("cominv_" + t, "grupo_comercio_invitacion", { creada_at: new Date().toISOString(), nota: (nom || "").trim(), wsp: num }).then(function (ok) {
      if (!ok) { setMsg("No se pudo crear la invitación. Probá de nuevo."); return; }
      var url = window.location.origin + "/comercio/?i=" + t;
      var texto = "Hola" + (nom && nom.trim() ? " " + nom.trim() : "") + "! Te invitamos a sumar tu comercio a la comunidad de Grupo Nkt: lo mostramos a nuestros socios y ellos reciben un beneficio para visitarte. Completá tus datos y tu promo acá, sin compromiso, y lo revisamos: " + url;
      setAvisoCom({ nombre: (nom && nom.trim()) || "el comercio", link: linkWsp(num, texto), invitar: true });
    });
  }
  // Mandar por WhatsApp el link de la página pública de la comunidad (para que un comercio la vea): no crea nada, solo arma el mensaje.
  function enviarLinkComunidad() {
    var num = window.prompt("WhatsApp del comercio al que le querés mandar el link de la comunidad (con código de área, sin 0 ni 15). Ej: 2914123456", "");
    if (num === null) return;
    if (!numeroWsp(num)) { setMsg("Ese número de WhatsApp no parece válido."); setTimeout(function () { setMsg(""); }, 4000); return; }
    var nom = window.prompt("¿Cómo se llama el comercio o la persona? (opcional)", "");
    if (nom === null) return;
    var texto = "Hola" + (nom && nom.trim() ? " " + nom.trim() : "") + "! Te paso el link de la comunidad de Grupo Nkt, para que veas cómo la ven nuestros socios y cómo se muestran los comercios amigos: " + window.location.origin + "/grupo/ . Si te interesa sumar tu comercio, avisanos y te contamos cómo.";
    setAvisoCom({ nombre: (nom && nom.trim()) || "el comercio", link: linkWsp(num, texto), msj: "✓ Mensaje listo para ", boton: "💬 Enviar link de la comunidad" });
  }
  function aprobarAlta(a) {
    var d = { ...a.datos }; delete d.pautas_ok;
    var cid = a.comercio_id;
    guardarComercio({ id: cid, ...d, activo: true, orden: ((lista || []).length + 1) * 10, pautas_ok_at: a.enviado_at || "" }).then(function (ok) {
      if (!ok) { setMsg("No se pudo crear el comercio. Probá de nuevo."); return; }
      var t = nuevoToken();
      guardarFila("comkey_" + cid, "grupo_comercio_key", { token: t }).then(function () {
        var o = { ...a }; delete o.id;
        guardarFila(a.id, "grupo_comercio_alta", { ...o, estado: "aprobada", resuelto_at: new Date().toISOString() }).then(function () {
          recargar(); setMsg("✓ Comercio creado y publicado.");
          var url = window.location.origin + "/comercio/?c=" + encodeURIComponent(cid) + "&k=" + t;
          ofrecerAviso({ nombre: d.nombre, wsp: d.wsp }, "Hola! Tu comercio ya está en la comunidad de Grupo Nkt 🎉. Este es tu link para editar tu tarjeta, cargar novedades y canjear cupones. Guardalo: " + url);
        });
      });
    });
  }
  function rechazarAlta(a) {
    var m = window.prompt("Motivo del rechazo (lo ve el comercio):", "");
    if (m === null) return;
    var o = { ...a }; delete o.id;
    guardarFila(a.id, "grupo_comercio_alta", { ...o, estado: "rechazada", motivo: m.trim(), resuelto_at: new Date().toISOString() }).then(function () { recargar(); ofrecerAviso({ nombre: (a.datos || {}).nombre, wsp: (a.datos || {}).wsp }, "Hola! No pudimos aprobar la solicitud de tu comercio en la comunidad de Grupo Nkt" + (m.trim() ? ": " + m.trim() : "") + ". Podés corregirla con el mismo link que te pasamos y volver a enviarla."); });
  }
  // Pausar: deja de verse en la página y el comercio ve el motivo en su portal. Reactivar lo vuelve a mostrar.
  function pausar(c) {
    var m = window.prompt("Motivo de la pausa (lo va a ver el comercio en su portal):", "");
    if (m === null) return;
    guardarComercio({ ...c, activo: false, pausa_motivo: m.trim(), pausa_at: new Date().toISOString() }).then(function () { recargar(); });
  }
  function reactivar(c) { guardarComercio({ ...c, activo: true, pausa_motivo: "", pausa_at: "" }).then(function () { recargar(); }); }
  // Link privado del comercio: lleva su código; si todavía no tiene, se crea. «Regenerar» invalida el anterior.
  function copiarLink(c, regenerar) {
    leerPauta("comkey_" + c.id).then(function (k) {
      var tk = !regenerar && k && k.token ? Promise.resolve(k.token) : (function () { var t = nuevoToken(); return guardarFila("comkey_" + c.id, "grupo_comercio_key", { token: t }).then(function () { return t; }); })();
      tk.then(function (t) {
        var url = window.location.origin + "/comercio/?c=" + encodeURIComponent(c.id) + "&k=" + t;
        // Si el navegador no deja copiar (a veces pasa), se muestra el link para copiarlo a mano.
        var aMano = function () { window.prompt("Copiá este link y mandáselo al comercio:", url); };
        try { navigator.clipboard.writeText(url).then(function () { setMsg("✓ Link de " + c.nombre + " copiado. Mandáselo por WhatsApp."); setTimeout(function () { setMsg(""); }, 5000); }, aMano); } catch (e) { aMano(); }
      });
    });
  }
  function regenerarLink(c) { if (window.confirm("¿Generar un link nuevo para «" + c.nombre + "»? El anterior deja de servir.")) copiarLink(c, true); }
  // Campos que el comercio de verdad cambió: se comparan con lo que estaba publicado cuando mandó su pedido («base»). Lo que no tocó no se pisa,
  // aunque administración lo haya editado después.
  function camposCambiados(cam) {
    var d = cam.datos || {}, base = cam.base || null;
    return Object.keys(ETIQ_COMERCIO).filter(function (k) { return base ? String(d[k] || "") !== String(base[k] || "") : true; });
  }
  function aprobar(c, cam) {
    var d = cam.datos || {}, ks = camposCambiados(cam), aplicar = {}, anterior = {};
    ks.forEach(function (k) { aplicar[k] = d[k] === undefined ? "" : d[k]; anterior[k] = c[k] === undefined ? "" : c[k]; });
    guardarComercio({ ...c, ...aplicar, pautas_ok_at: cam.enviado_at || c.pautas_ok_at || "" }).then(function (ok) {
      if (!ok) { setMsg("No se pudo publicar. Probá de nuevo."); return; }
      guardarFila("comcambio_" + c.id, "grupo_comercio_cambio", { ...cam, estado: "aprobado", resuelto_at: new Date().toISOString(), anterior: anterior, aplicado: ks, deshecho: false }).then(function () { setVerCambio(""); recargar(); setMsg("✓ Publicado."); setTimeout(function () { setMsg(""); }, 3000); ofrecerAviso({ ...c, ...aplicar }, "Hola! Tu tarjeta en la comunidad de Grupo Nkt ya está publicada con los cambios que mandaste. ¡Gracias!"); });
    });
  }
  // Deshacer la última aprobación: vuelve a los valores que había antes de aprobar.
  function deshacer(c, cam) {
    if (!window.confirm("¿Deshacer la última aprobación de «" + c.nombre + "»?\n\nVuelve a lo que estaba publicado antes (" + (cam.aplicado || []).map(function (k) { return ETIQ_COMERCIO[k]; }).join(", ") + ").")) return;
    guardarComercio({ ...c, ...cam.anterior }).then(function (ok) {
      if (!ok) { setMsg("No se pudo deshacer. Probá de nuevo."); return; }
      guardarFila("comcambio_" + c.id, "grupo_comercio_cambio", { ...cam, deshecho: true, deshecho_at: new Date().toISOString() }).then(function () { recargar(); setMsg("↩️ Deshecho: volvió a lo anterior."); setTimeout(function () { setMsg(""); }, 4000); });
    });
  }
  function rechazar(c, cam) {
    var m = window.prompt("Motivo del rechazo (lo ve el comercio en su portal):", "");
    if (m === null) return;
    guardarFila("comcambio_" + c.id, "grupo_comercio_cambio", { ...cam, estado: "rechazado", motivo: m.trim(), resuelto_at: new Date().toISOString() }).then(function () { setVerCambio(""); recargar(); ofrecerAviso(c, "Hola! No pudimos aprobar los cambios de tu tarjeta en la comunidad de Grupo Nkt" + (m.trim() ? ": " + m.trim() : "") + ". Corregilos desde tu portal y volvé a enviarlos."); });
  }
  return (
    <div style={tarjeta}>
      <div onClick={function () { setAbierto(!abierto); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{abierto ? "▾" : "▸"} 🤝 Comercios amigos de la comunidad{lista ? " (" + lista.length + ")" : ""}</div>
      {abierto && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: "#8C8C8C", lineHeight: 1.5, marginBottom: 8 }}>Comercios que no son de Grupo Nkt pero forman parte de la comunidad. Aparecen en la página como una tarjeta más, debajo de los tres locales, con su beneficio para quien muestre el cupón.</div>
          {altas.filter(function (a) { return a.estado === "pendiente"; }).length > 0 && (
            <div style={{ background: "#0C1A12", border: "1px solid #3A7D4466", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#8FD19A", marginBottom: 6 }}>🆕 Comercios nuevos para aprobar ({altas.filter(function (a) { return a.estado === "pendiente"; }).length})</div>
              {altas.filter(function (a) { return a.estado === "pendiente"; }).map(function (a) { var d = a.datos || {}; return (
                <div key={a.id} style={{ borderTop: "1px solid #14281C", padding: "8px 0" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {d.logo ? <img src={d.logo} alt="" style={{ height: 34, background: "#fff", borderRadius: 6 }} /> : null}
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#F0EDE8" }}>{d.nombre}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.5, marginTop: 3 }}>
                    {d.desc && <div>{d.desc}</div>}
                    {d.direccion && <div>📍 {d.direccion}</div>}
                    {d.horarios && <div>🕒 {d.horarios}</div>}
                    {d.wsp && <div>💬 {d.wsp}</div>}
                    {d.beneficio && <div style={{ color: "#F0EDE8", fontWeight: 700 }}>🎟️ {d.beneficio}{d.promo_hasta ? " · hasta " + fechaCorta(d.promo_hasta) : ""}{d.promo_cond ? " · " + d.promo_cond : ""}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={function () { aprobarAlta(a); }} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#3A7D44", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>✓ Aprobar y crear</button>
                    <button onClick={function () { rechazarAlta(a); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #C1440E88", background: "none", color: "#E0714A", fontSize: 12.5, cursor: "pointer" }}>✕ Rechazar</button>
                  </div>
                </div>); })}
            </div>
          )}
          {avisoCom && (
            <div style={{ background: "#0F2415", border: "1px solid #3A7D4488", borderRadius: 10, padding: "9px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 180px", fontSize: 12.5, color: "#9FE0AA", fontWeight: 700 }}>{avisoCom.msj ? avisoCom.msj + avisoCom.nombre + "." : avisoCom.invitar ? "✓ Invitación lista para " + avisoCom.nombre + "." : "✓ Listo. ¿Le avisás a " + avisoCom.nombre + "?"}</span>
              {avisoCom.link ? <a href={avisoCom.link} target="_blank" rel="noreferrer" style={{ padding: "7px 12px", borderRadius: 8, background: "#25D366", color: "#08240F", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>{avisoCom.boton || (avisoCom.invitar ? "💬 Enviar invitación por WhatsApp" : "💬 Avisar por WhatsApp")}</a> : <span style={{ fontSize: 12, color: "#B8A070" }}>Este comercio no tiene WhatsApp cargado.</span>}
              <button onClick={function () { setAvisoCom(null); }} style={{ background: "none", border: "none", color: "#8C8C8C", cursor: "pointer", fontSize: 12 }}>✕ Ahora no</button>
            </div>
          )}
          {lista && lista.length > 0 && (
            <div style={{ background: "#0C1218", border: "1px solid #1A6B8A55", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#7FC4DE", marginBottom: 6 }}>📊 Resultados por comercio · últimos 30 días</div>
              {lista.map(function (c, i) { var r = resumenCanjes(canjes, c.id, 30); return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "6px 0", borderTop: i === 0 ? "none" : "1px solid #14202A", fontSize: 12.5 }}>
                  <b style={{ color: "#F0EDE8" }}>{c.nombre}</b>
                  <span style={{ color: "#B8C8D0", textAlign: "right" }}>{r.canjes} canje{r.canjes === 1 ? "" : "s"} · {r.socios} socio{r.socios === 1 ? "" : "s"}{r.volvieron > 0 ? " · " + r.volvieron + " volvió" + (r.volvieron === 1 ? "" : "ron") : ""}{r.gasto > 0 ? " · $" + Math.round(r.gasto).toLocaleString("es-AR") : ""}{(sociosQR[c.id] || {}).total ? " · 👥 " + sociosQR[c.id].total + " socio" + (sociosQR[c.id].total === 1 ? "" : "s") + " nuevo" + (sociosQR[c.id].total === 1 ? "" : "s") + " con su QR" : ""}</span>
                </div>); })}
              <div style={{ fontSize: 10.5, color: "#6E7E88", marginTop: 6 }}>El gasto suma lo que cada comercio anotó al canjear (es opcional).</div>
            </div>
          )}
          {novs.filter(function (n) { return n.estado === "pendiente"; }).length > 0 && (
            <div style={{ background: "#12100A", border: "1px solid #D4A01755", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#E5C467", marginBottom: 6 }}>📣 Novedades de comercios para aprobar ({novs.filter(function (n) { return n.estado === "pendiente"; }).length})</div>
              {novs.filter(function (n) { return n.estado === "pendiente"; }).map(function (n) { return (
                <div key={n.id} style={{ borderTop: "1px solid #1E1A10", padding: "8px 0" }}>
                  <div style={{ fontSize: 11.5, color: "#8FD1E6", fontWeight: 700 }}>🤝 {n.comercio_nombre}{n.hasta ? " · hasta el " + fechaCorta(n.hasta) : ""}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#F0EDE8", marginTop: 2 }}>{n.titulo}</div>
                  <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{n.texto}</div>
                  {n.foto_url && <img src={n.foto_url} alt="" style={{ marginTop: 6, maxWidth: "100%", maxHeight: 180, borderRadius: 8 }} />}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={function () { aprobarNov(n); }} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#3A7D44", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>✓ Aprobar y publicar</button>
                    <button onClick={function () { rechazarNov(n); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #C1440E88", background: "none", color: "#E0714A", fontSize: 12.5, cursor: "pointer" }}>✕ Rechazar</button>
                  </div>
                </div>); })}
            </div>
          )}
          {lista && lista.map(function (c) {
            var cam = cambios[c.id], pend = cam && cam.estado === "pendiente";
            var difs = pend ? camposCambiados(cam).filter(function (k) { return String((cam.datos || {})[k] || "") !== String(c[k] || "") || (cam.base && String(c[k] || "") !== String(cam.base[k] || "")); }) : [];
            return (
            <div key={c.id} style={{ padding: "8px 0", borderTop: "1px solid #1A1A1A" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: c.activo === false ? "#6E6E6E" : "#F0EDE8" }}>{c.nombre}{c.activo === false ? " · pausado" : ""}</div>
                  <div style={{ fontSize: 11, color: "#8C8C8C" }}>{c.activo === false && c.pausa_motivo ? "⏸ " + c.pausa_motivo : (promoVigente(c) ? "🎟️ " + promoVigente(c) + (c.promo_hasta ? " · hasta " + fechaCorta(c.promo_hasta) : "") : (c.beneficio ? "promo vencida o sin empezar" : "sin promo cargada"))}</div>
                </div>
                {reclamosDe(reclamos, c.id) > 0 && <span title="Reclamos de socios en los últimos 30 días" style={{ background: reclamosDe(reclamos, c.id) >= 3 ? "#C1121F" : "#5A3A1A", color: "#fff", borderRadius: 7, padding: "4px 8px", fontSize: 11.5, fontWeight: 800 }}>⚠️ {reclamosDe(reclamos, c.id)} reclamo{reclamosDe(reclamos, c.id) === 1 ? "" : "s"}{reclamosDe(reclamos, c.id) >= 3 ? " · revisar" : ""}</span>}
                {pend && <button onClick={function () { setVerCambio(verCambio === c.id ? "" : c.id); }} style={{ background: "#D4A01722", border: "1px solid #D4A01788", borderRadius: 7, color: "#E5C467", padding: "5px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>📝 Cambios para aprobar</button>}
                <button onClick={function () { darExtra(c); }} title="Habilitar una novedad extra esta semana (se cobra aparte)" style={{ background: "none", border: "1px solid #2A2A2A", borderRadius: 7, color: "#C8C8C8", padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>➕ Novedad extra{c.novedad_extra && c.novedad_extra.sem === semanaClave() ? " (" + c.novedad_extra.n + ")" : ""}</button>
                <button onClick={function () { copiarLink(c, false); }} style={{ background: "none", border: "1px solid #2A2A2A", borderRadius: 7, color: "#C8C8C8", padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>🔗 Link</button>
                <button onClick={function () { setForm({ ...c }); }} style={{ background: "none", border: "1px solid #2A2A2A", borderRadius: 7, color: "#C8C8C8", padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>✏️ Editar</button>
                {c.activo === false
                  ? <button onClick={function () { reactivar(c); }} style={{ background: "none", border: "1px solid #3A7D44", borderRadius: 7, color: "#8FD19A", padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>▶ Reactivar</button>
                  : <button onClick={function () { pausar(c); }} style={{ background: "none", border: "1px solid #2A2A2A", borderRadius: 7, color: "#C8C8C8", padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>⏸ Pausar</button>}
                <button onClick={function () { quitar(c); }} title="Borrar" style={{ background: "none", border: "none", color: "#6E6E6E", cursor: "pointer", fontSize: 13 }}>🗑️</button>
              </div>
              {cam && cam.estado === "aprobado" && cam.anterior && !cam.deshecho && <div style={{ marginTop: 4 }}><button onClick={function () { deshacer(c, cam); }} style={{ background: "none", border: "1px solid #5A4A2A", borderRadius: 7, color: "#C8B27A", padding: "4px 9px", fontSize: 11.5, cursor: "pointer" }}>↩️ Deshacer la última aprobación ({(cam.aplicado || []).map(function (k) { return ETIQ_COMERCIO[k]; }).join(", ")})</button></div>}
              {cam && cam.estado === "rechazado" && <div style={{ fontSize: 11, color: "#B07A6A", marginTop: 4 }}>Último pedido rechazado{cam.motivo ? ": " + cam.motivo : ""}</div>}
              {pend && verCambio === c.id && (
                <div style={{ marginTop: 8, background: "#12100A", border: "1px solid #D4A01744", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 6 }}>El comercio pidió estos cambios{cam.enviado_at ? " (" + new Date(cam.enviado_at).toLocaleDateString("es-AR") + ")" : ""}:</div>
                  {difs.length === 0 && <div style={{ fontSize: 12, color: "#8C8C8C" }}>No hay diferencias con lo publicado.</div>}
                  {difs.map(function (k) { return (
                    <div key={k} style={{ fontSize: 12.5, padding: "4px 0", borderTop: "1px solid #1E1A10", lineHeight: 1.4 }}>
                      <b style={{ color: "#E5C467" }}>{ETIQ_COMERCIO[k]}:</b>{" "}
                      {k === "logo" ? <span>logo nuevo <img src={(cam.datos || {}).logo} alt="" style={{ height: 24, background: "#fff", borderRadius: 4, verticalAlign: "middle" }} /></span>
                        : <span><span style={{ color: "#8C8C8C", textDecoration: "line-through" }}>{String(c[k] || "—")}</span> → <span style={{ color: "#F0EDE8" }}>{String((cam.datos || {})[k] || "—")}</span>{cam.base && String(c[k] || "") !== String(cam.base[k] || "") ? <span style={{ color: "#E0A050", fontSize: 11 }}> ⚠️ vos lo cambiaste desde que el comercio lo envió</span> : null}</span>}
                    </div>); })}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={function () { aprobar(c, cam); }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#3A7D44", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>✓ Aprobar y publicar</button>
                    <button onClick={function () { rechazar(c, cam); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #C1440E88", background: "none", color: "#E0714A", fontSize: 12.5, cursor: "pointer" }}>✕ Rechazar</button>
                    <button onClick={function () { regenerarLink(c); }} style={{ marginLeft: "auto", padding: "8px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "none", color: "#8C8C8C", fontSize: 11, cursor: "pointer" }}>Regenerar link</button>
                  </div>
                </div>
              )}
            </div>); })}
          {lista && lista.length === 0 && !form && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "6px 0" }}>Todavía no hay comercios cargados.</div>}
          {!form && <button onClick={invitarPorWsp} style={{ marginTop: 8, marginRight: 8, padding: "9px 14px", borderRadius: 8, border: "1px solid #25D36688", background: "#25D36622", color: "#6FE0A0", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>💬 Invitar por WhatsApp</button>}
          {!form && <button onClick={enviarLinkComunidad} style={{ marginTop: 8, marginRight: 8, padding: "9px 14px", borderRadius: 8, border: "1px solid #25D36688", background: "#25D36622", color: "#6FE0A0", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>📲 Enviar link de la comunidad</button>}
          {!form && <button onClick={invitar} style={{ marginTop: 8, marginRight: 8, padding: "9px 14px", borderRadius: 8, border: "1px solid #3A7D4488", background: "#3A7D4422", color: "#8FD19A", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>🔗 Invitar a un comercio nuevo</button>}
          {!form && <button onClick={nuevo} style={{ marginTop: 8, padding: "9px 14px", borderRadius: 8, border: "1px solid #1A6B8A88", background: "#1A6B8A22", color: "#7FC4DE", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Sumar un comercio</button>}
          {!form && (
            <div style={{ marginTop: 14, borderTop: "1px solid #1E1E1E", paddingTop: 10 }}>
              <div onClick={function () { setVerMat(!verMat); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{verMat ? "▾" : "▸"} 📁 Material para comercios</div>
              {verMat && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11.5, color: "#8C8C8C", lineHeight: 1.45, marginBottom: 8 }}>Para mandar a los comercios que quieren sumarse. La propuesta va cuando ya mostraron interés; las placas, en redes y mensajes.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[["/material/Propuesta-Comunidad-Grupo-Nkt.pdf", "📄 Propuesta (PDF)", "Propuesta-Comunidad-Grupo-Nkt.pdf"], ["/material/placa-comercios-cuadrada.png", "🖼️ Placa cuadrada", "placa-comercios-cuadrada.png"], ["/material/placa-comercios-historia.png", "📱 Placa para historias", "placa-comercios-historia.png"]].map(function (a) {
                      return <a key={a[0]} href={a[0]} download={a[2]} target="_blank" rel="noreferrer" style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid #3A7D4488", background: "#3A7D4422", color: "#8FD19A", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>{a[1]}</a>;
                    })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, margin: "14px 0 4px" }}>💬 Mensajes de WhatsApp</div>
                  <input value={nomMat} onChange={function (e) { setNomMat(e.target.value); }} placeholder="Nombre del comercio o de la persona (reemplaza a [nombre])" style={{ ...sel, marginBottom: 8 }} />
                  {MENSAJES_COMERCIOS.map(function (m) {
                    var vista = m.texto.replace(/\[nombre\]/g, nomMat.trim() || "[nombre]").replace(/\{socios\}/g, String(props.socios > 0 ? props.socios : 70));
                    return (
                      <div key={m.id} style={{ borderTop: "1px solid #161616", padding: "8px 0" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{m.titulo}</div>
                        {m.cuando && <div style={{ fontSize: 11, color: "#8C8C8C" }}>{m.cuando}</div>}
                        <div style={{ fontSize: 12, color: "#C8C8C8", lineHeight: 1.45, background: "#0E0E0E", borderRadius: 8, padding: "7px 9px", margin: "5px 0" }}>{vista}</div>
                        {m.pendiente ? <div style={{ fontSize: 11.5, color: "#E5C467" }}>⏳ {m.pendiente}</div>
                          : <button onClick={function () { copiarMensaje(m); }} style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #25D36688", background: "#25D36622", color: "#6FE0A0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{copiadoMat === m.id ? "✓ Copiado" : "📋 Copiar"}</button>}
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 6, lineHeight: 1.45 }}>La cantidad de socios sale de la comunidad de hoy. No prometas fechas ni precios de la cadetería, y no inventes el valor de la cuota mientras no esté definido.</div>
                </div>
              )}
            </div>
          )}
          {form && (
            <div style={{ marginTop: 10, borderTop: "1px solid #1A1A1A", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{(lista || []).some(function (c) { return c.id === form.id; }) ? "Editar comercio" : "Nuevo comercio"}</div>
              <input value={form.nombre} onChange={function (e) { setF("nombre", e.target.value); }} placeholder="Nombre (ej: Café San Juan) *" style={sel} />
              <input value={form.desc} onChange={function (e) { setF("desc", e.target.value); }} placeholder="Descripción corta (ej: Café de especialidad y pastelería)" style={sel} />
              <input value={form.beneficio} onChange={function (e) { setF("beneficio", e.target.value); }} placeholder="Beneficio para quien muestre el cupón (ej: 10% de descuento)" style={sel} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: "#8C8C8C" }}>Promo desde</span><input type="date" value={form.promo_desde || ""} onChange={function (e) { setF("promo_desde", e.target.value); }} style={{ ...sel, width: "auto", marginBottom: 0 }} />
                <span style={{ fontSize: 11.5, color: "#8C8C8C" }}>hasta</span><input type="date" value={form.promo_hasta || ""} onChange={function (e) { setF("promo_hasta", e.target.value); }} style={{ ...sel, width: "auto", marginBottom: 0 }} />
              </div>
              <input value={form.promo_cond || ""} onChange={function (e) { setF("promo_cond", e.target.value); }} placeholder="Condiciones de la promo (ej: una por mesa, no acumulable)" style={sel} />
              <input value={form.direccion} onChange={function (e) { setF("direccion", e.target.value); }} placeholder="Dirección (calle y número)" style={sel} />
              <textarea value={form.horarios} onChange={function (e) { setF("horarios", e.target.value); }} rows={2} placeholder="Horarios (ej: Lun a Sáb de 8 a 20 h)" style={{ ...sel, resize: "vertical" }} />
              <input value={form.wsp} onChange={function (e) { setF("wsp", e.target.value); }} placeholder="WhatsApp (ej: 2914123456)" style={sel} />
              <input value={form.carta} onChange={function (e) { setF("carta", e.target.value); }} placeholder="Enlace de la carta (opcional)" style={sel} />
              <input value={form.instagram} onChange={function (e) { setF("instagram", e.target.value); }} placeholder="Instagram (opcional)" style={sel} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: "#8C8C8C" }}>Color de la tarjeta</span>
                <input type="color" value={form.color || "#1A6B8A"} onChange={function (e) { setF("color", e.target.value); }} style={{ width: 44, height: 30, border: "none", background: "none", padding: 0 }} />
                <span style={{ fontSize: 11.5, color: "#8C8C8C" }}>Logo</span>
                <input type="file" accept="image/*" onChange={elegirLogo} style={{ fontSize: 11.5, color: "#C8C8C8", maxWidth: 190 }} />
                {subiendo && <span style={{ fontSize: 11.5, color: "#D4A017" }}>subiendo…</span>}
                {form.logo && !subiendo && <img src={form.logo} alt="logo" style={{ height: 28, background: "#fff", borderRadius: 4 }} />}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={guardar} disabled={subiendo} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
                <button onClick={function () { setForm(null); }} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #2A2A2A", background: "none", color: "#8C8C8C", fontSize: 12.5, cursor: "pointer" }}>Cancelar</button>
              </div>
            </div>
          )}
          {msg && <div style={{ fontSize: 12, color: msg.indexOf("✓") === 0 ? "#4C9A5A" : "#E0914A", marginTop: 8 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

// ─── NOVEDADES ───
// Las publica administración (módulo Comunidad) y las ve el miembro al entrar a su portal.
export async function cargarNovedades() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_novedad&order=created_at.desc&limit=60", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
// Foto de una novedad: se achica sola en el celular o la compu (a ~1200 px de ancho, JPEG comprimido, unos 150 a 300 KB) antes de subirla.
export function achicarFotoNov(file, maxLado) {
  return new Promise(function (res) {
    try {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var m = maxLado || 1200, k = Math.min(1, m / Math.max(img.width, img.height));
        var cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { URL.revokeObjectURL(url); res(b || null); }, "image/jpeg", 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    } catch (e) { res(null); }
  });
}
export async function subirFotoNovedad(blob, nombre) {
  try {
    var r = await fetch(SURL + "/storage/v1/object/fichajes/novedades/" + nombre + ".jpg", { method: "POST", headers: { apikey: SH.apikey, Authorization: SH.Authorization, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: blob });
    if (!r.ok) return { ok: false, error: await r.text() };
    return { ok: true, url: SURL + "/storage/v1/object/public/fichajes/novedades/" + nombre + ".jpg" };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
// Enlace de video: YouTube se reproduce adentro de la novedad; el resto (Instagram, TikTok, Facebook, Drive) abre el enlace.
function videoDe(u) {
  u = String(u || "").trim(); if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/.exec(u);
  return m ? { youtube: m[1], url: u } : { youtube: "", url: u };
}
function MediaNovedad(props) {
  var n = props.n, v = videoDe(n.video);
  if (!n.foto_url && !v) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {n.foto_url && <img src={n.foto_url} alt={n.titulo} loading="lazy" style={{ display: "block", width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 10, marginBottom: v ? 8 : 0 }} />}
      {v && v.youtube && <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", background: "#000" }}><iframe src={"https://www.youtube.com/embed/" + v.youtube} title={n.titulo} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} /></div>}
      {v && !v.youtube && <a href={v.url} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", padding: "11px 8px", borderRadius: 10, border: "1px solid #D4A01788", background: "#D4A01722", color: "#FFD36B", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>▶ Ver el video</a>}
    </div>
  );
}
// Novedades que mandan los comercios amigos desde su portal (ámbito grupo_novedad_comercio). Solo se publican las aprobadas y vigentes.
// Un comercio puede mandar 1 por semana; más novedades las habilita administración (se cobran aparte).
export async function cargarNovedadesComercios() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.grupo_novedad_comercio&order=created_at.desc&limit=300", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, comercio: true, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
function novedadVisible(n) {
  var hoy = new Date().toISOString().substring(0, 10);
  return n.activa !== false && (!n.hasta || n.hasta >= hoy);
}

// ─── CUPONES ─────────────────────────────────────────────────────────────────
// Un cupón por persona (por su WhatsApp): código único, vencimiento y un solo canje. Se guarda en pautas con id "cupon_<CÓDIGO>".
var LETRAS_CUPON = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function codigoNuevo() { var c = "NKT-"; for (var i = 0; i < 4; i++) c += LETRAS_CUPON[Math.floor(Math.random() * LETRAS_CUPON.length)]; return c; }
export function normCodigo(s) { var t = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (t.indexOf("NKT") === 0) t = t.slice(3); return t.length ? "NKT-" + t : ""; }
export async function leerPauta(id) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id) + "&limit=1", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
  } catch (e) { return null; }
}
// ─── ¿QUIÉN TIENE LA APP? ───────────────────────────────────────────────
// El navegador no avisa quién instaló la app, pero sí cuando se abre ya instalada ("standalone") o cuando termina de instalarse.
// Cada miembro que abre el portal así queda anotado (pautas, ámbito comunidad_app, un registro por WhatsApp):
//   toco_at → tocó «Descargar la app» (no se sabe si terminó) · instalada_at → el navegador avisó que se instaló
//   primera_app_at / ultima_app_at / usos → la abrió desde el ícono de su celular: ESA es la prueba de que la tiene.
export function enModoApp() { try { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; } catch (e) { return false; } }
export async function registrarApp(wsp, nombre, evento) {
  if (!wsp) return;
  try {
    var id = "app_" + wsp, prev = (await leerPauta(id)) || {}, ahora = new Date().toISOString(), ua = navigator.userAgent;
    var o = { ...prev, wsp: wsp, nombre: nombre || prev.nombre || "", plataforma: /iPhone|iPad|iPod/i.test(ua) ? "iPhone" : /Android/i.test(ua) ? "Android" : "Otro" };
    if (evento === "toco") o.toco_at = prev.toco_at || ahora;
    if (evento === "instalada") o.instalada_at = prev.instalada_at || ahora;
    if (evento === "abierta") { o.primera_app_at = prev.primera_app_at || ahora; o.ultima_app_at = ahora; o.usos = (prev.usos || 0) + 1; }
    await guardarFila(id, "comunidad_app", o);
  } catch (e) {}
}
// Los cupones canjeados en un local (sin los de prueba), para el cierre de caja: cada uno con el día de negocio en que se canjeó.
// El canje guarda el NOMBRE del local, por eso se compara por nombre.
export async function cuponesCanjeadosLocal(localId) {
  var nom = (LOCALES_GRUPO.find(function (l) { return l.id === localId; }) || {}).nombre || "";
  if (!nom) return [];
  try {
    var patron = encodeURIComponent('*"estado":"usado"*');
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&texto=like." + patron + "&order=created_at.desc&limit=2000", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return (Array.isArray(d) ? d : []).map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } })
      .filter(function (c) { return c && !c.prueba && c.estado === "usado" && c.usado_at && c.usado_local === nom; })
      .map(function (c) {
        var x = new Date(c.usado_at); if (x.getHours() < 6) x = new Date(x.getTime() - 86400000);   // antes de las 6 h sigue siendo el día anterior (el mismo corte del día de negocio de la app)
        return { ...c, dia: x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0") };
      });
  } catch (e) { return []; }
}
export function estadoCupon(c) {
  if (!c) return "no existe";
  if (c.estado === "usado") return "usado";
  if (c.vence && new Date(c.vence).getTime() < Date.now()) return "vencido";
  return "activo";
}
// Cupón siguiente: apenas se usa (o vence) el anterior, la persona recibe uno nuevo para su próxima compra. Siempre hay uno solo vigente por persona.
export async function renovarCupon(wsp, cfg) {
  var m = await leerPauta("com_" + wsp);
  if (!m) return null;
  if (await esEmpleadoWsp(wsp, nombreCompleto(m))) return null;   // los empleados no tienen cupones
  var codigo = "";
  for (var i = 0; i < 8; i++) { var c = codigoNuevo(); if (!(await leerPauta("cupon_" + c))) { codigo = c; break; } }
  if (!codigo) return null;
  var ahora = new Date();
  var cupon = { prueba: m.prueba ? 1 : 0, codigo: codigo, wsp: wsp, nombre: nombreCompleto(m), pct: pctPara(cfg, ""), creado: ahora.toISOString(), vence: new Date(ahora.getTime() + ((cfg && cfg.cuponDias) || 30) * 86400000).toISOString(), estado: "activo", renovado: 1 };
  if (!(await guardarFila("cupon_" + codigo, "cupon", cupon))) return null;
  await guardarFila("com_" + wsp, "comunidad", { ...m, cupon: codigo });
  return cupon;
}
// El cupón vigente de esa persona: si el que tenía ya se usó o venció, se le genera el siguiente.
export async function cuponActual(c, cfg) {
  var m = await leerPauta("com_" + c.wsp);
  if (!m) return null;
  var act = m.cupon && m.cupon !== c.codigo ? await leerPauta("cupon_" + m.cupon) : c;
  if (act && estadoCupon(act) === "activo") return act;
  return await renovarCupon(c.wsp, cfg || await cargarConfigGrupo());
}
// Crea el cupón de quien se suma (o devuelve el que ya tenía) y lo asocia a su ficha de la comunidad.
async function emitirCupon(socio, cfg) {
  if (!socio.prueba && await esEmpleadoWsp(socio.wsp, nombreCompleto(socio))) return null;   // los empleados no tienen cupones
  var w = socio.wsp, previo = await leerPauta("com_" + w);
  if (previo && previo.cupon) { var existente = await leerPauta("cupon_" + previo.cupon); if (existente) return existente; }
  var codigo = "";
  for (var i = 0; i < 8; i++) { var c = codigoNuevo(); if (!(await leerPauta("cupon_" + c))) { codigo = c; break; } }
  if (!codigo) return null;
  var ahora = new Date();
  var cupon = { prueba: socio.prueba ? 1 : 0, codigo: codigo, wsp: w, nombre: nombreCompleto(socio), pct: pctPara(cfg, ""), creado: ahora.toISOString(), vence: new Date(ahora.getTime() + (cfg.cuponDias || 30) * 86400000).toISOString(), estado: "activo" };
  if (!(await guardarFila("cupon_" + codigo, "cupon", cupon))) return null;
  await guardarFila("com_" + w, "comunidad", { ...socio, cupon: codigo });
  return cupon;
}

// Anota a una persona en la comunidad (conserva su alta y su cupón si ya estaba) y devuelve su cupón.
export async function sumarSocio(socio, cfg) {
  if (!socio.prueba && await esEmpleadoWsp(socio.wsp, nombreCompleto(socio))) return { empleado: true };   // los empleados ya tienen un descuento aparte
  var previo = await leerPauta("com_" + socio.wsp);
  socio = { ...socio, origen: previo && previo.origen ? previo.origen : (origenGuardado() || undefined) };
  var ok = await guardarFila("com_" + socio.wsp, "comunidad", { ...socio, cupon: previo && previo.cupon ? previo.cupon : undefined, fecha: previo && previo.fecha ? previo.fecha : socio.fecha });
  if (!ok) return null;
  if (!socio.prueba) { try { localStorage.setItem("nkt_comunidad", "1"); } catch (e) {} }
  var c = await emitirCupon(socio, cfg);
  if (c && !socio.prueba) { try { localStorage.setItem("nkt_cupon", c.codigo); } catch (e) {} }
  return c || { sinCupon: true };
}

// Dibuja el cupón como imagen para guardarla en la galería del celular (o compartirla): sirve para mostrarlo en caja sin internet.
function cuponComoImagen(c) {
  return new Promise(function (res) {
    var img = new Image();
    function dibujar(logo) {
      var cv = document.createElement("canvas"); cv.width = 900; cv.height = 1100;
      var x = cv.getContext("2d");
      x.fillStyle = "#0D0D0D"; x.fillRect(0, 0, 900, 1100);
      x.strokeStyle = "#4C9A5A"; x.lineWidth = 6; x.setLineDash([22, 14]); x.strokeRect(40, 40, 820, 1020); x.setLineDash([]);
      if (logo) x.drawImage(img, 330, 90, 240, 240);
      x.textAlign = "center";
      x.fillStyle = "#9A9A9A"; x.font = "28px sans-serif"; x.fillText("TU CUPÓN DE DESCUENTO", 450, 400);
      x.fillStyle = "#4C9A5A"; var tx = c.pctTxt || (c.pct + "% OFF"); x.font = "bold " + (tx.length > 10 ? 100 : 150) + "px serif"; x.fillText(tx, 450, 560);
      x.fillStyle = "#F0EDE8"; x.font = "bold 110px sans-serif"; x.fillText(c.codigo, 450, 720);
      x.fillStyle = "#C8C8C8"; x.font = "32px sans-serif";
      x.fillText("Válido hasta el " + new Date(c.vence).toLocaleDateString("es-AR"), 450, 810);
      x.fillText("Se usa una sola vez", 450, 860);
      x.fillStyle = "#8FD19A"; x.font = "bold 34px sans-serif"; x.fillText("Válido en cualquiera de los 3 locales", 450, 925);
      x.fillStyle = "#C8C8C8"; x.font = "30px sans-serif"; x.fillText("El Bodegón · Kusama · Colantonio's", 450, 970);
      x.fillStyle = "#8C8C8C"; x.font = "26px sans-serif"; x.fillText("Mostralo en caja · Grupo Nkt", 450, 1025);
      cv.toBlob(function (b) { res(b); }, "image/png");
    }
    img.onload = function () { dibujar(true); };
    img.onerror = function () { dibujar(false); };
    img.src = "/icon-192.png";
  });
}
async function guardarCuponImagen(c) {
  var blob = await cuponComoImagen(c);
  if (!blob) return;
  var archivo = null;
  try { archivo = new File([blob], "Cupon_GrupoNkt_" + c.codigo + ".png", { type: "image/png" }); } catch (e) {}
  // En el celular se abre el menú de compartir (ahí aparece "Guardar imagen" y WhatsApp); si no se puede, se descarga.
  if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: "Mi cupón Grupo Nkt" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Cupon_GrupoNkt_" + c.codigo + ".png"; a.click();
}

// El recuadro con lo que vale el cupón en cada local (descuento o beneficio especial), siempre al día con la configuración.
function ValoresPorLocal(props) {
  var cfgT = props.cfg;
  return (
    <div style={{ margin: "10px 0 12px", padding: "11px 8px 10px", textAlign: "center", borderRadius: 14, border: "2px solid #F5C542", background: "linear-gradient(160deg,#2A1D05,#0F1A10)", boxShadow: "0 0 16px rgba(245,197,66,0.25)" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#F5C542", marginBottom: 9, lineHeight: 1.3, textAlign: "center" }}>{props.titulo || "👇 Lo que vale tu cupón hoy según el local donde lo uses"}</div>
          <div style={{ display: "flex", gap: 7 }}>
            {LOCALES_GRUPO.map(function (l) {
              return <div key={l.id} style={{ flex: 1, border: "2px solid " + l.color, borderRadius: 12, padding: "9px 3px 8px", background: "rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize: 12, color: l.color, fontWeight: 800, lineHeight: 1.2, filter: "brightness(1.35)" }}>{l.nombre}</div>
                {benefPara(cfgT, l.id) ? (
                  <div><div style={{ fontSize: 22, lineHeight: 1.2 }}>🎁</div><div style={{ fontSize: 14.5, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.25, padding: "0 2px" }}>{benefPara(cfgT, l.id)}</div></div>
                ) : (
                  <div><div style={{ fontSize: 30, fontWeight: 800, color: "#FFFFFF", fontFamily: "'Playfair Display',serif", lineHeight: 1.15, marginTop: 2 }}>{pctPara(cfgT, l.id)}%</div>
                  <div style={{ fontSize: 10, color: "#C8C8C8", letterSpacing: 1 }}>DE DESCUENTO</div></div>
                )}
              </div>;
            })}
          </div>
        </div>
  );
}

export function TarjetaCupon(props) {
  var c = props.cupon, est = estadoCupon(c);
  var col = est === "activo" ? "#4C9A5A" : "#8C8C8C";
  var [cfgT, setCfgT] = useState(null);
  useEffect(function () { cargarConfigGrupo().then(setCfgT); }, []);
  // El descuento depende del local donde se canjea: si es el mismo en los 3 se muestra uno solo; si no, el más alto y el detalle abajo.
  var usado = est === "usado", vals = cfgT ? valoresPorLocal(cfgT) : [];
  var maxP = vals.length ? Math.max.apply(null, vals.map(function (x) { return x.p; })) : 0;
  var hayBen = vals.some(function (x) { return x.b; }), todosBen = vals.length > 0 && vals.every(function (x) { return x.b; });
  var grande = usado ? (c.beneficio || c.pct + "% OFF") : (c.pctFijo ? c.pctFijo + "% OFF" : (cfgT ? (hayBen ? (todosBen ? "🎁 Beneficios por local" : "Descuentos y beneficios") : (mismoValor(cfgT) ? maxP + "% OFF" : "Hasta " + maxP + "% OFF")) : "…"));
  return (
    <div style={{ background: "#0F1A10", border: "2px dashed " + col, borderRadius: 14, padding: "14px", marginTop: 14, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: 1.5 }}>Tu cupón de descuento{c.prueba ? " · 🧪 PRUEBA" : ""}</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 800, color: col, margin: "4px 0" }}>{grande}</div>
      {est === "activo" && (c.pctFijo ? (
        <div style={{ fontSize: 12, color: "#8FD19A", marginBottom: 6 }}>Descuento especial: {c.pctFijo}% en los 3 locales</div>
      ) : cfgT && <ValoresPorLocal cfg={cfgT} />)}
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "#F0EDE8" }}>{c.codigo}</div>
      <div style={{ fontSize: 12, color: "#B8B8B8", lineHeight: 1.6, marginTop: 8 }}>
        {est === "activo" && <span><b style={{ color: "#8FD19A" }}>Válido en cualquiera de nuestros 3 locales:</b> El Bodegón, Kusama y Colantonio's. Mostralo en caja. Vence el {new Date(c.vence).toLocaleDateString("es-AR")}. Se usa una sola vez; cuando lo uses, tu próximo cupón ya queda listo para tu siguiente compra.</span>}
        {est === "usado" && <span>✅ Este cupón ya fue usado.</span>}
        {est === "vencido" && <span>⌛ Este cupón venció el {new Date(c.vence).toLocaleDateString("es-AR")}.</span>}
      </div>
      {est === "activo" && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={function () { guardarCuponImagen({ ...c, pctTxt: grande }); }} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #4C9A5A", background: "#14301A", color: "#8FD19A", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Guardar mi cupón en el celular</button>
        </div>
      )}
    </div>
  );
}

// ─── PÁGINA PÚBLICA ──────────────────────────────────────────────────────────
export function GrupoNkt() {
  var [cfg, setCfg] = useState(CONFIG_VACIA);
  var [cfgListo, setCfgListo] = useState(false);   // para no mostrar valores de relleno mientras carga
  var [comercios, setComercios] = useState([]);   // comercios amigos de la comunidad (los carga administración)
  var [nombre, setNombre] = useState("");
  var [apellido, setApellido] = useState("");
  var [wsp, setWsp] = useState("");
  var [dia, setDia] = useState("");
  var [mes, setMes] = useState("");
  var [fav, setFav] = useState("");
  var [acepta, setAcepta] = useState(false);
  var [enviando, setEnviando] = useState(false);
  var [error, setError] = useState("");
  var modoPrueba = esModoPrueba();   // /grupo/?prueba: no usa lo guardado en el celular y todo lo que se carga queda marcado de prueba
  var [hecho, setHecho] = useState(function () { if (modoPrueba) return ""; try { return localStorage.getItem("nkt_comunidad") ? "ya" : ""; } catch (e) { return ""; } });
  var [instalar, setInstalar] = useState(null);
  var [localSel, setLocalSel] = useState("");   // el local cuya tarjeta está abierta (se elige tocando su logo)
  var [verInstructivo, setVerInstructivo] = useState(false);   // «¿Sabés cómo usar tus cupones?»: cerrado, se abre al tocarlo
  var [verPasos, setVerPasos] = useState(function () { try { return new URLSearchParams(window.location.search).has("instalar"); } catch (e) { return false; } });
  var [cupon, setCupon] = useState(null);
  var cuponRef = useRef(null); cuponRef.current = cupon;
  var [novedades, setNovedades] = useState([]);
  var [bienvenidaCerrada, setBienvenidaCerrada] = useState(false);   // el regalo de bienvenida ya se vio y se cerró
  var [historial, setHistorial] = useState([]);   // todos los cupones de este cliente
  var [verMi, setVerMi] = useState(false);   // "Ya soy parte: ver mi cupón"
  var [wspVer, setWspVer] = useState("");
  var [msgVer, setMsgVer] = useState("");
  var [buscando, setBuscando] = useState(false);
  var [segKey, setSegKey] = useState(0);   // al cerrar el pedido se vuelve a leer el seguimiento
  var [pedirLocal, setPedirLocal] = useState(null);   // el local del que se está armando un pedido de delivery

  useEffect(function () {
    Promise.all([cargarNovedades(), cargarNovedadesComercios(), cargarComercios(true)]).then(function (r) {
      var activos = {}; r[2].forEach(function (c) { activos[c.id] = true; });
      var delGrupo = r[0].filter(novedadVisible).slice(0, 8);
      var deComercios = r[1].filter(function (n) { return n.estado === "aprobada" && novedadVisible(n) && activos[n.comercio_id]; }).slice(0, 6);
      setNovedades(delGrupo.concat(deComercios));   // primero las del Grupo Nkt, después las de los comercios amigos
    });
  }, []);
  // Si el miembro abre el portal desde el ícono de la app (no desde el navegador), queda anotado una vez por visita.
  useEffect(function () {
    if (modoPrueba || !cupon || !cupon.wsp || !enModoApp()) return;
    try { if (sessionStorage.getItem("nkt_app_reg") === cupon.wsp) return; sessionStorage.setItem("nkt_app_reg", cupon.wsp); } catch (e) {}
    registrarApp(cupon.wsp, cupon.nombre, "abierta");
  }, [cupon && cupon.wsp]);
  // Con el cupón a la vista, se trae el historial del cliente (cuántos lleva y dónde los usó).
  useEffect(function () {
    if (!cupon || !cupon.wsp) return;
    var patron = encodeURIComponent('*"wsp":"' + cupon.wsp + '"*');
    fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&texto=like." + patron + "&limit=200", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setHistorial(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(function (c) { return c && !c.prueba === !cupon.prueba; }) : []);
    }).catch(function () {});
  }, [cupon && cupon.codigo]);
  useEffect(function () {
    document.title = "Comunidad Grupo Nkt";
    // Al agregarla al inicio, el celular instala "Grupo Nkt" (no la app de gestión) y la abre siempre en esta página.
    try {
      var lm = document.querySelector('link[rel="manifest"]'); if (lm) lm.setAttribute("href", "/manifest-grupo.json");
      var mt = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (mt) mt.setAttribute("content", "Grupo Nkt");
    } catch (e) {}
    recordarOrigenDeUrl();
    cargarConfigGrupo().then(function (c) { setCfg(c); setCfgListo(true); });
    cargarComercios(true).then(setComercios);
    var cg = ""; try { if (!modoPrueba) cg = localStorage.getItem("nkt_cupon") || ""; } catch (e) {}
    if (cg) leerPauta("cupon_" + cg).then(function (c) {
      // Si lo sacaron de la lista, se olvida lo guardado en el celular y se le vuelve a ofrecer sumarse.
      if (!c) { try { localStorage.removeItem("nkt_comunidad"); localStorage.removeItem("nkt_cupon"); } catch (e) {} setHecho(""); return; }
      leerMiembro(c.wsp).then(function (m) {
        if (m) cuponActual(c).then(function (a) { if (a) { setCupon(a); if (!modoPrueba) { try { localStorage.setItem("nkt_cupon", a.codigo); } catch (e) {} } } else setCupon(c); }); else { try { localStorage.removeItem("nkt_comunidad"); localStorage.removeItem("nkt_cupon"); } catch (e) {} setHecho(""); }
      });
    });
    function antes(e) { e.preventDefault(); setInstalar(e); }
    // Cuando el navegador avisa que se instaló, se anota para el miembro que la estaba mirando.
    function instalada() { var c = cuponRef.current; if (c && c.wsp && !modoPrueba) registrarApp(c.wsp, c.nombre, "instalada"); }
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", instalada);
    return function () { window.removeEventListener("beforeinstallprompt", antes); window.removeEventListener("appinstalled", instalada); };
  }, []);

  var fondo = { minHeight: "100vh", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", padding: "22px 16px 50px", boxSizing: "border-box" };
  var caja = { maxWidth: 460, margin: "0 auto" };
  var inp = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 15, marginBottom: 8 };
  var boton = { display: "block", textAlign: "center", padding: "11px 8px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#161616", color: "#F0EDE8", fontSize: 13, fontWeight: 700, textDecoration: "none" };

  // Quien ya es parte ve su cupón con solo su WhatsApp, sin volver a llenar el formulario.
  // "Cerrar sesión": este celular se olvida de quién es (no se borra nada de la comunidad ni del cupón).
  function cerrarSesion() {
    if (!window.confirm("¿Cerrar sesión en este celular? Tu cupón y tu lugar en la comunidad siguen guardados: para volver a entrar usás «Ingresar» con tu WhatsApp.")) return;
    try { localStorage.removeItem("nkt_comunidad"); localStorage.removeItem("nkt_cupon"); } catch (e) {}
    setCupon(null); setHistorial([]); setHecho(""); setVerMi(false); setWspVer(""); setMsgVer("");
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function verMiCupon() {
    var w = soloDigitos(wspVer);
    if (w.length < 8) { setMsgVer("Escribí tu WhatsApp completo."); return; }
    setBuscando(true); setMsgVer("");
    (modoPrueba ? leerPauta("com_" + w) : leerMiembroOEmp(w)).then(function (m) {
      if (m === "EMP") { setBuscando(false); setMsgVer(MSG_ACCESO_EMPLEADO); return null; }
      if (!m || !m.cupon) { setBuscando(false); setMsgVer("No encontramos ese WhatsApp en la comunidad. Si todavía no te sumaste, hacelo en el formulario de más abajo."); return null; }
      return leerPauta("cupon_" + m.cupon).then(function (c) {
        setBuscando(false);
        if (!c) { setMsgVer("No encontramos tu cupón. Escribinos y lo revisamos."); return; }
        return cuponActual(c).then(function (a) {
          var v = a || c;
          setCupon(v); setHecho("ya");
          if (!modoPrueba) { try { localStorage.setItem("nkt_comunidad", "1"); localStorage.setItem("nkt_cupon", v.codigo); } catch (e) {} }
        });
      });
    });
  }
  function unirse() {
    var w = soloDigitos(wsp);
    if (!nombre.trim() || !apellido.trim() || w.length < 8) { setError("Escribí tu nombre, tu apellido y tu WhatsApp."); return; }
    if (!acepta) { setError("Tildá la casilla para sumarte."); return; }
    setEnviando(true); setError("");
    var socio = { nombre: nombre.trim().slice(0, 60), apellido: apellido.trim().slice(0, 60), disp: idDispositivo(), wsp: w.slice(0, 20), dia: parseInt(dia, 10) || 0, mes: parseInt(mes, 10) || 0, fav: fav, origen: origenGuardado() || undefined, fecha: new Date().toISOString(), prueba: modoPrueba ? 1 : 0 };
    (modoPrueba ? Promise.resolve(false) : esEmpleadoWsp(w, nombre.trim() + " " + apellido.trim())).then(function (esEmp) {
      if (esEmp) { setError(MSG_EMPLEADO); setEnviando(false); return null; }
      return leerPauta("com_" + w).then(function (previo) {
      // Si ya estaba, se conserva su cupón y su fecha de alta.
        return guardarFila("com_" + w, "comunidad", { ...socio, origen: previo && previo.origen ? previo.origen : socio.origen, cupon: previo && previo.cupon ? previo.cupon : undefined, fecha: previo && previo.fecha ? previo.fecha : socio.fecha });
      }).then(function (ok) {
      if (ok === null) return;   // era empleado: ya se avisó
      if (!ok) { setError("No pudimos sumarte. Probá de nuevo."); setEnviando(false); return; }
      if (!modoPrueba) { try { localStorage.setItem("nkt_comunidad", "1"); } catch (e) {} }
      return emitirCupon(socio, cfg).then(function (c) {
        if (c) { setCupon(c); if (!modoPrueba) { try { localStorage.setItem("nkt_cupon", c.codigo); } catch (e) {} } }
        setHecho("ok");
      });
    });
    });
  }

  var bInstalar = (function () {
        // Ya está instalada (se abrió desde el ícono): no hace falta mostrar nada.
        var instalada = false;
        try { instalada = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; } catch (e) {}
        if (instalada) return null;
        var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        return (
          <div style={{ background: "#14100A", border: "1px solid #D4A01766", borderRadius: 16, padding: "14px", marginBottom: 14, textAlign: "center" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, color: "#D4A017" }}>📲 Descargá la app Grupo Nkt</div>
            <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.5, margin: "6px 0 10px" }}>Tené tu cupón, las novedades, el delivery y las reservas siempre a mano, como una app más de tu celular. Es gratis y no ocupa espacio.</div>
            <button onClick={function () {
              if (cupon && cupon.wsp && !modoPrueba) registrarApp(cupon.wsp, cupon.nombre, "toco");
              // Si el navegador deja instalar con un toque, se lo ofrece; los pasos quedan a la vista por si no aparece el cartel.
              if (instalar) { try { instalar.prompt(); } catch (e) {} setTimeout(function () { setVerPasos(true); }, 1200); } else { setVerPasos(!verPasos); }
            }} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#C1440E", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Descargar la app</button>
            {!instalar && verPasos && (
              <div style={{ textAlign: "left", fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.8, background: "#0D0D0D", border: "1px solid #2A2A2A", borderRadius: 12, padding: "10px 12px", marginTop: 10 }}>
                {ios ? (
                  <div><b>En iPhone (con Safari):</b><br />1. Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).<br />2. Elegí <b>«Agregar a pantalla de inicio»</b>.<br />3. Tocá <b>Agregar</b>. ¡Listo! Te queda el ícono de Grupo Nkt.</div>
                ) : (
                  <div><b>En Android (con Chrome):</b><br />1. Tocá los <b>tres puntos</b> de arriba a la derecha.<br />2. Elegí <b>«Instalar app»</b> o <b>«Agregar a la pantalla de inicio»</b>.<br />3. Confirmá. ¡Listo! Te queda el ícono de Grupo Nkt.</div>
                )}
              </div>
            )}
          </div>
        );
      })();
  var bIngresar = !cupon && hecho !== "ok" && (
        <div style={{ background: "#0F1A10", border: "1px solid #3A7D4466", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
          <details>
          <summary style={{ cursor: "pointer", fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 800, color: "#8FD19A", textAlign: "center" }}>¿Ya sos parte? Ingresar</summary>
          <div style={{ fontSize: 12.5, color: "#B8B8B8", lineHeight: 1.5, margin: "6px 0 10px", textAlign: "center" }}>Si ya sos parte de la comunidad, entrá con tu WhatsApp para ver tu cupón y tus novedades.</div>
          <input value={wspVer} onChange={function (e) { setWspVer(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") verMiCupon(); }} inputMode="tel" placeholder="Tu WhatsApp" style={inp} />
          {msgVer && <div style={{ color: "#E0714A", fontSize: 12.5, marginBottom: 8 }}>{msgVer}</div>}
          <button onClick={verMiCupon} disabled={buscando} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{buscando ? "Ingresando…" : "Ingresar"}</button>
          </details>
        </div>
      );
  var bCupon = cupon && (function () {
        var usados = historial.filter(function (c) { return c.estado === "usado"; }).sort(function (a, b) { return String(b.usado_at || "").localeCompare(String(a.usado_at || "")); });
        return (
          <div style={{ background: "#0F1A10", border: "1px solid #3A7D4466", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, color: "#D4A017", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>Mi cupón</div>
            <TarjetaCupon cupon={cupon} />
            {historial.length > 0 && <div style={{ textAlign: "center", fontSize: 12.5, color: "#C8C8C8", marginTop: 12 }}>🎟️ Llevás <b>{usados.length}</b> {usados.length === 1 ? "cupón" : "cupones"} canjeado{usados.length === 1 ? "" : "s"}</div>}
            {usados.length > 0 && (
              <details style={{ marginTop: 8, fontSize: 12, color: "#9A9A9A" }}>
                <summary style={{ cursor: "pointer", textAlign: "center" }}>Ver mi historial</summary>
                {usados.map(function (c) {
                  return <div key={c.codigo} style={{ padding: "5px 0", borderTop: "1px solid #1E2A1E" }}>{c.codigo} · {c.beneficio || c.pct + "%"} · usado el {c.usado_at ? new Date(c.usado_at).toLocaleDateString("es-AR") : "—"}{c.usado_local ? " en " + c.usado_local : ""}</div>;
                })}
              </details>
            )}
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={cerrarSesion} style={{ background: "none", border: "none", color: "#8C8C8C", fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Cerrar sesión</button>
            </div>
          </div>
        );
      })();
  // Las novedades van primero y bien a la vista: es lo que más mueve al cliente (promos, platos nuevos, eventos).
  var bNovedades = novedades.length > 0 && (
        <div style={{ background: "linear-gradient(160deg,#2A1D05,#16110A)", border: "2px solid #D4A017", borderRadius: 18, padding: "16px 14px", marginBottom: 16, boxShadow: "0 0 22px rgba(212,160,23,0.28)" }}>
          <style>{"@keyframes nktPulso{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}"}</style>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 26 }}>📣</span>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: "#F5C542", letterSpacing: 0.5 }}>Novedades</span>
            <span style={{ background: "#C1440E", color: "#fff", borderRadius: 12, fontSize: 12, fontWeight: 800, padding: "2px 9px", animation: "nktPulso 1.6s ease-in-out infinite" }}>{novedades.length}</span>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: "#C8B27A", marginBottom: 8 }}>Promos, platos nuevos y beneficios de Grupo Nkt</div>
          {novedades.map(function (n, i) {
            var l = LOCALES_GRUPO.find(function (x) { return x.id === n.local; });
            var nuevo = (n.creado || n.enviado_at) && (Date.now() - new Date(n.creado || n.enviado_at).getTime()) < 7 * 86400000;
            var primeraDeComercio = n.comercio && (i === 0 || !novedades[i - 1].comercio);
            return (
              <div key={n.id}>
              {primeraDeComercio && <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#C8B27A", margin: "16px 0 2px", letterSpacing: 0.5 }}>🤝 De los comercios amigos</div>}
              <div style={{ background: "rgba(0,0,0,0.35)", border: "1px solid " + (n.comercio ? (n.color || "#1A6B8A") + "88" : (l ? l.color + "88" : "#D4A01755")), borderRadius: 12, padding: "11px 12px", marginTop: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: "#FFF3D0", lineHeight: 1.25 }}>{n.titulo}</span>
                  {nuevo && <span style={{ background: "#3A7D44", color: "#fff", borderRadius: 6, fontSize: 10, fontWeight: 800, padding: "2px 6px", letterSpacing: 1 }}>NUEVO</span>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: n.comercio ? "#8FD1E6" : (l ? l.color : "#C8B27A"), margin: "3px 0 6px" }}>{n.comercio ? "🤝 " + (n.comercio_nombre || "Comercio amigo") : (l ? "📍 Solo en " + l.nombre : "📍 En los 3 locales")}{n.hasta ? " · válido hasta el " + n.hasta.split("-").reverse().join("/") : ""}</div>
                <div style={{ fontSize: 14, color: "#F0EDE8", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{n.texto}</div>
                <MediaNovedad n={n} />
              </div>
              </div>
            );
          })}
        </div>
      );
  // Lo que dan los cupones hoy en cada local: lo ve quien todavía no es parte, para que sepa qué se pierde.
  var bValores = cfgListo && <div style={{ marginBottom: 14 }}><ValoresPorLocal cfg={cfg} titulo="🎟️ Lo que te dan los cupones de la comunidad hoy, según el local donde los uses" /></div>;
  // Instructivo rápido para el miembro: cómo se usa el cupón.
  var bInstructivo = (
    <div style={{ background: "#0F1620", border: "1px solid #1A6B8A88", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
      <button onClick={function () { setVerInstructivo(!verInstructivo); }} aria-expanded={verInstructivo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 800, color: "#5BB8DC", textAlign: "left", marginBottom: verInstructivo ? 10 : 0 }}>
        <span>🤔 ¿Sabés cómo usar tus cupones?</span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, color: "#8CC9E0", whiteSpace: "nowrap" }}>{verInstructivo ? "▾ cerrar" : "▸ ver cómo"}</span>
      </button>
      {verInstructivo && [
        ["1", "Mostrá tu código", "Elegí cualquiera de los 3 locales y mostrale tu código (por ejemplo NKT-4K7P) al cajero. Podés guardar el cupón en tu celular para tenerlo sin internet."],
        ["2", "También sentado en la mesa", "Si estás sentado en la mesa del local, también podés usarlo. Pedí que lo canjeen antes de pagar la cuenta. Ojo: se puede usar un solo cupón por mesa."],
        ["3", "Pedí que lo canjeen antes de pagar", "El cajero lo busca y te aplica lo que corresponde en ese local: puede ser un descuento o un beneficio especial. Mirá arriba lo que vale hoy en cada uno."],
        ["4", "Se usa una sola vez", "Cuando lo canjean, listo: ese cupón ya no se puede volver a usar."],
        ["5", "Te llega el siguiente solo", "Apenas canjeás uno, ya queda listo el próximo para tu siguiente visita, con un código nuevo. Lo ves acá, al entrar a Grupo Nkt."],
        ["6", "Ojo con el vencimiento", "Cada cupón vale " + (cfg.cuponDias || 30) + " días. La fecha figura en tu cupón. Si se vence sin usar, al volver a entrar recibís uno nuevo."]
      ].map(function (p) {
        return (
          <div key={p[0]} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderTop: p[0] === "1" ? "none" : "1px solid #1A2A36" }}>
            <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: "#1A6B8A", color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{p[0]}</div>
            <div><div style={{ fontSize: 14, fontWeight: 800, color: "#F0EDE8" }}>{p[1]}</div><div style={{ fontSize: 12.5, color: "#B8C4CC", lineHeight: 1.5, marginTop: 1 }}>{p[2]}</div></div>
          </div>
        );
      })}
    </div>
  );
  var cartasLocales = {};
  LOCALES_GRUPO.forEach(function (l) {
        var d = cfg.locales[l.id] || {};
        var wa = linkWsp(d.wsp, "Hola " + l.nombre + "! Quiero hacer un pedido de delivery.");
        var reserva = linkWsp(d.wsp, "Hola " + l.nombre + "! Quiero reservar una mesa. Día: ___ · Hora: ___ · Personas: ___ · A nombre de: ___");
        var consulta = linkWsp(d.wsp, "Hola " + l.nombre + "! Quería hacerles una consulta.");
        // Todas las opciones se ven siempre; las que todavía no tienen su dato quedan apagadas ("pronto").
        var itemLocal = function (link, txt, estilo) {
          return link
            ? <a href={link} target="_blank" rel="noreferrer" style={{ ...boton, ...(estilo || {}) }}>{txt}</a>
            : <span style={{ ...boton, opacity: 0.4, cursor: "not-allowed" }} title="Pronto">{txt}</span>;
        };
        cartasLocales[l.id] = (
          <div key={l.id} style={{ position: "relative", overflow: "hidden", background: "#111", border: "1px solid " + l.color + "55", borderRadius: 16, padding: "16px", marginBottom: 14 }}>
            {avisoVigente(d) && (
              <div style={{ background: l.color + "26", border: "1px solid " + l.color + "99", borderRadius: 12, padding: "9px 12px", marginBottom: 12, textAlign: "center", color: "#F0EDE8", fontSize: 13.5, fontWeight: 700, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>📣 {d.aviso}</div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: l.color === "#1A6B8A" ? "#4CB6DC" : "#F0EDE8" }}>{l.nombre}</div>
              <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.35 }}>{l.desc}</div>
            </div>
            {(function () {
              // Botón principal de cada local: Pedir delivery si lo tiene habilitado; Reservar en Colantonio's; si no, Cómo llegar. El resto se abre con «ver más».
              var abierto = true;   // la tarjeta ya se abrió al tocar el logo: se ve todo
              var hayDelivery = d.delivery === true && cupon;
              var pk = hayDelivery ? "delivery" : (l.id === "l3" ? "reserva" : "llegar");
              var todas = [
                ["delivery", hayDelivery
                  ? <button key="delivery" onClick={function () { setPedirLocal(l); }} style={{ ...boton, cursor: "pointer", background: l.color, borderColor: l.color, color: "#fff" }}>🛵 Pedir delivery</button>
                  : <span key="delivery" style={{ ...boton, opacity: 0.6, cursor: "default", background: "#161616" }}>🛵 Pedir delivery<span style={{ display: "block", fontSize: 10.5, color: "#D4A017", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>Próximamente</span></span>],
                ["reserva", l.id === "l3" ? React.cloneElement(itemLocal(reserva, "📅 Reservar mesa", { background: "#1F4D2A", borderColor: "#3A7D44" }), { key: "reserva" }) : null],   // El Bodegón y Kusama no toman reservas por acá
                ["llegar", React.cloneElement(itemLocal(d.direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.direccion + " Punta Alta") : "", "📍 Cómo llegar"), { key: "llegar" })],
                ["carta", React.cloneElement(itemLocal(linkWeb(d.carta), "🍽️ Ver la carta"), { key: "carta" })],
                ["wsp", React.cloneElement(itemLocal(consulta, "💬 Escribinos"), { key: "wsp" })],
                ["ig", React.cloneElement(itemLocal(linkWeb(d.instagram, "instagram"), "📸 Instagram"), { key: "ig" })],
                ["opinion", <a key="opinion" href={"/?opinar=" + l.id + "&c=salon" + (modoPrueba ? "&prueba" : "")} style={boton}>⭐ Dejar mi opinión</a>],
              ].filter(function (x) { return x[1]; });
              var principal = todas.find(function (x) { return x[0] === pk; });
              return (
                <div>
                  <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{principal && principal[1]}</div>
                    <button onClick={function () { setLocalSel(""); }} style={{ ...boton, flex: "0 0 auto", cursor: "pointer", background: "none", padding: "11px 14px" }}>cerrar ▴</button>
                  </div>
                  {abierto && (
                    <div>
                      {(d.direccion || d.horarios) && (
                        <div style={{ fontSize: 12.5, color: "#B8B8B8", lineHeight: 1.6, marginTop: 10, textAlign: "center" }}>
                          {d.direccion && <div>📍 {d.direccion}</div>}
                          {d.horarios && <div style={{ whiteSpace: "pre-wrap" }}>🕒 {d.horarios}</div>}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                        {todas.filter(function (x) { return x[0] !== pk; }).map(function (x) { return x[1]; })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      });
  // Los tres locales de Grupo Nkt, como una fila de logos: al tocar uno se abre su tarjeta con todo lo que se puede hacer (uno a la vez).
  var bLocales = (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: localSel ? 10 : 14 }}>
        {LOCALES_GRUPO.map(function (l) {
          var d = cfg.locales[l.id] || {}, on = localSel === l.id, hayDelivery = d.delivery === true && cupon;
          return (
            <button key={l.id} onClick={function () { setLocalSel(on ? "" : l.id); }} aria-pressed={on} aria-label={l.nombre} style={{ position: "relative", cursor: "pointer", background: on ? l.color + "26" : "#111", border: "2px solid " + (on ? l.color : l.color + "66"), borderRadius: 14, padding: "10px 6px", minHeight: 74, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
              <span style={{ background: "#fff", borderRadius: 9, padding: "4px 6px", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 44, boxSizing: "border-box" }}>
                <img src={l.logo} alt={l.nombre} style={{ maxWidth: "100%", maxHeight: 34, width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
              </span>
              {hayDelivery && <span title="Se puede pedir delivery" style={{ position: "absolute", top: -7, right: -5, width: 23, height: 23, borderRadius: 12, background: l.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🛵</span>}
            </button>
          );
        })}
      </div>
      {localSel && cartasLocales[localSel]}
    </div>
  );
  var bSumarse = (
<div style={{ background: "#14100A", border: "1px solid #D4A01766", borderRadius: 16, padding: "16px", marginTop: 6 }}>
        {hecho === "ok" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, marginTop: 6 }}>¡Ya sos parte!</div>
            <div style={{ fontSize: 14, color: "#C8C8C8", marginTop: 8, lineHeight: 1.6 }}>{cfg.bienvenida || "Te vamos a avisar de las novedades, los platos nuevos y los beneficios de la comunidad."}</div>
          </div>
        ) : hecho === "ya" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#C8C8C8", lineHeight: 1.6 }}>✅ Ya sos parte de la comunidad Grupo Nkt. ¡Gracias por acompañarnos!</div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 800, color: "#D4A017", textAlign: "center" }}>Sumate a la comunidad para comenzar a recibir tus cupones de beneficios</div>
            <div style={{ fontSize: 13, color: "#B8B8B8", lineHeight: 1.55, margin: "6px 0 12px", textAlign: "center" }}>Enterate primero de las novedades, los platos nuevos, los sorteos y los beneficios de Grupo Nkt.</div>
            <input value={nombre} onChange={function (e) { setNombre(e.target.value); }} maxLength={60} placeholder="Tu nombre" style={inp} />
            <input value={apellido} onChange={function (e) { setApellido(e.target.value); }} maxLength={60} placeholder="Tu apellido" style={inp} />
            <input value={wsp} onChange={function (e) { setWsp(e.target.value); }} maxLength={20} inputMode="tel" placeholder="Tu WhatsApp (ej: 2914123456)" style={inp} />
            <div style={{ fontSize: 11.5, color: "#8C8C8C", margin: "2px 0 4px" }}>Tu cumpleaños (opcional, para saludarte)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={dia} onChange={function (e) { setDia(e.target.value.replace(/\D/g, "").slice(0, 2)); }} inputMode="numeric" placeholder="Día" style={{ ...inp, flex: 1 }} />
              <input value={mes} onChange={function (e) { setMes(e.target.value.replace(/\D/g, "").slice(0, 2)); }} inputMode="numeric" placeholder="Mes" style={{ ...inp, flex: 1 }} />
            </div>
            <select value={fav} onChange={function (e) { setFav(e.target.value); }} style={inp}>
              <option value="">¿Cuál es tu lugar favorito? (opcional)</option>
              {LOCALES_GRUPO.map(function (l) { return <option key={l.id} value={l.id}>{l.nombre}</option>; })}
            </select>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#9A9A9A", lineHeight: 1.5, margin: "4px 0 10px", cursor: "pointer" }}>
              <input type="checkbox" checked={acepta} onChange={function (e) { setAcepta(e.target.checked); }} style={{ marginTop: 2 }} />
              <span>Acepto que Grupo Nkt me escriba por WhatsApp con novedades y beneficios. Puedo pedir que me saquen de la lista cuando quiera.</span>
            </label>
            {error && <div style={{ color: "#E0714A", fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <button onClick={unirse} disabled={enviando} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#C1440E", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>{enviando ? "Sumándote…" : "Sumarme"}</button>
          </div>
        )}
      </div>
  );

  // Quien todavía no es parte: las novedades y lo que dan los cupones hoy, enseguida "Ya sos parte · Ingresar" y "Sumate".
  // Los 3 locales aparecen recién cuando la persona se une o ingresa. Miembro: sus novedades, su cupón y los locales.
  var esParte = !!cupon || hecho === "ok" || hecho === "ya";   // "ya": este celular ya se había unido (se confirma en la base mientras carga)
  return (
    <div style={fondo}><div style={caja}>
      {modoPrueba && <div style={{ background: "#2A1A00", border: "1px solid #E0914A", color: "#E0914A", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, textAlign: "center", marginBottom: 14 }}>🧪 Modo prueba: lo que cargues acá no cuenta y lo podés borrar desde el panel.</div>}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <img src="/icon-192.png" alt="Grupo Nkt" style={{ width: 112, height: 112, borderRadius: 24, display: "block", margin: "0 auto 8px" }} />
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, color: "#F0EDE8" }}>Comunidad Grupo Nkt</div>
        <div style={{ fontSize: 14, color: "#B8B8B8", marginTop: 4, lineHeight: 1.5 }}>{cfg.frase || "Tus lugares en Punta Alta"}</div>
      </div>
      {esParte ? (
        <div>
          <SeguimientoPedido key={segKey} locales={LOCALES_GRUPO} cfgLocales={cfg.locales} />
          {/* Regalo de bienvenida: solo recién sumado (en esta visita), con los tickets encendidos. Siempre 1 ticket, una vez por WhatsApp. */}
          {hecho === "ok" && cfg.ticketsActivo && cupon && !bienvenidaCerrada && <JuegoTickets key={"bv" + cupon.wsp} wsp={cupon.wsp} localId="" prueba={modoPrueba || !!cupon.prueba} bienvenida onListo={function () { setBienvenidaCerrada(true); }} />}
          {bCupon}
          {cfg.ticketsActivo && cupon && <TarjetaTickets wsp={cupon.wsp} />}
          {cupon && <TarjetaOpinar historial={historial} conJuego={!!cfg.ticketsActivo} prueba={modoPrueba || !!cupon.prueba} />}
          {bNovedades}
          {hecho === "ok" && <div style={{ marginBottom: 14 }}>{bSumarse}</div>}
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "#9A9A9A", margin: "18px 4px 8px" }}>Dónde usar tu cupón</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#F0EDE8", margin: "0 4px 8px" }}>🍷 Nuestros locales</div>
          {bLocales}
          <FranjaComercios comercios={comercios} cupon={cupon} wspAdmin={cfg.wspAdmin || (cfg.locales.l1 || {}).wsp || ""} />
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "#9A9A9A", margin: "18px 4px 8px" }}>Ayuda</div>
          {cupon && bInstructivo}
          {bInstalar}
          {hecho !== "ok" && <div style={{ marginTop: 6 }}>{bSumarse}</div>}
        </div>
      ) : (
        <div>
          {bNovedades}
          {bValores}
          {/* Los comercios amigos también los ve quien todavía no se unió: es lo que le muestra a un comercio (y a un cliente) cómo se ve la red. */}
          {comercios.length > 0 && <FranjaComercios comercios={comercios} cupon={null} wspAdmin={cfg.wspAdmin || (cfg.locales.l1 || {}).wsp || ""} sinCta />}
          {bIngresar}
          <div style={{ marginBottom: 14 }}>{bSumarse}</div>
          {bInstalar}
          <CtaComercio wspAdmin={cfg.wspAdmin || (cfg.locales.l1 || {}).wsp || ""} />
        </div>
      )}
      {pedirLocal && cupon && <PedirDelivery local={pedirLocal} info={cfg.locales[pedirLocal.id]} miembro={{ nombre: cupon.nombre, wsp: cupon.wsp }} prueba={modoPrueba || !!cupon.prueba} onCerrar={function () { setPedirLocal(null); setSegKey(function (k) { return k + 1; }); }} />}
    </div></div>
  );
}

// Los empleados no pueden usar cupones de la comunidad. App.jsx le pasa la lista de empleados; se los reconoce por el teléfono de su ficha
// (se comparan los últimos 8 dígitos, para que no importe el 54 9, el 0 o el 15).
var EMPLEADOS_GRUPO = [];
export function setEmpleadosGrupo(lista) { EMPLEADOS_GRUPO = Array.isArray(lista) ? lista : []; }
function tel8(s) { var d = String(s || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; }
// Nombre y apellido sin tildes ni mayúsculas, en palabras: "Martínez, Florencia" y "florencia martinez" dan lo mismo.
function palabrasNombre(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean); }
// Mismo nombre y apellido (mínimo dos palabras de cada lado): coincide si todas las palabras de uno están en el otro, en cualquier orden.
function mismoNombre(a, b) {
  var A = palabrasNombre(a), B = palabrasNombre(b);
  if (A.length < 2 || B.length < 2) return false;
  var dentro = function (x, y) { return x.every(function (t) { return y.indexOf(t) !== -1; }); };
  return dentro(A, B) || dentro(B, A);
}
// ¿Esta persona es el empleado? Si coincide el teléfono de su ficha O el nombre y apellido, se la considera empleada.
function esEmpleadoDe(e, wsp, nombre) {
  if (!e || e.activo === false) return false;
  var w = tel8(wsp);
  return (!!w && tel8(e.telefono) === w) || (!!nombre && mismoNombre(e.nombre, nombre));
}
export function empleadoDeWsp(wsp, nombre) {
  return EMPLEADOS_GRUPO.find(function (e) { return esEmpleadoDe(e, wsp, nombre); }) || null;
}

export var DESCUENTO_EMPLEADOS = 25;   // el descuento que ya tienen los empleados, aparte de la comunidad
export var MSG_ACCESO_EMPLEADO = "No se puede: los empleados ya tienen su descuento del " + DESCUENTO_EMPLEADOS + "%, por eso no tienen acceso a la comunidad.";
// Como leerPauta("com_…") pero un empleado cuenta como "no es miembro": no ve su cupón aunque ya estuviera sumado.
export async function leerMiembro(wsp) {
  if (await esEmpleadoWsp(wsp)) return null;
  var m = await leerPauta("com_" + wsp);
  if (m && await esEmpleadoWsp(wsp, nombreCompleto(m))) return null;
  return m;
}
// Para ingresar con el WhatsApp: devuelve "EMP" si es un empleado (por teléfono, o por el nombre y apellido con que se sumó), o la ficha del miembro.
export async function leerMiembroOEmp(wsp) {
  if (await esEmpleadoWsp(wsp)) return "EMP";
  var m = await leerPauta("com_" + wsp);
  if (m && await esEmpleadoWsp(wsp, nombreCompleto(m))) return "EMP";
  return m;
}
export var MSG_EMPLEADO = "No se puede: los empleados ya tienen su descuento del " + DESCUENTO_EMPLEADOS + "%, por eso no pueden sumarse a la comunidad.";
// Para el que se está sumando (sin sesión): se mira la lista de empleados en la base y se compara por teléfono o por nombre y apellido.
export async function esEmpleadoWsp(wsp, nombre) {
  try {
    var r = await fetch(SURL + "/rest/v1/empleados", { headers: SH });
    var d = await r.json();
    if (Array.isArray(d)) return d.some(function (e) { return esEmpleadoDe(e, wsp, nombre); });
  } catch (e) {}
  return !!empleadoDeWsp(wsp, nombre);
}

// ─── CANJE EN CAJA ───────────────────────────────────────────────────────────
export function PanelCanje(props) {
  var [codigo, setCodigo] = useState("");
  var [cupon, setCupon] = useState(null);
  var [msg, setMsg] = useState("");
  var [ocupado, setOcupado] = useState(false);
  var [cfgC, setCfgC] = useState(null);
  useEffect(function () { cargarConfigGrupo().then(setCfgC); }, []);
  function buscar() {
    var c = normCodigo(codigo); if (!c) return;
    setOcupado(true); setMsg(""); setCupon(null);
    leerPauta("cupon_" + c).then(function (x) { setOcupado(false); if (!x) setMsg("No existe un cupón con el código " + c + "."); else setCupon(x); });
  }
  function canjear() {
    if (!cupon || estadoCupon(cupon) !== "activo") return;
    var empC = empleadoDeWsp(cupon.wsp, cupon.nombre); if (empC) { setMsg("🚫 No se puede canjear: " + empC.nombre + " es empleado/a y ya tiene su descuento del " + DESCUENTO_EMPLEADOS + "%."); return; }
    // El descuento es el del local donde se canjea; se lee la configuración al momento para no usar un valor viejo.
    cargarConfigGrupo().then(function (cfgF) {
      var pctApl = pctCanje(cupon, cfgF, props.localId);
      var benApl = cupon.pctFijo ? "" : benefPara(cfgF, props.localId);   // beneficio especial del local (2x1, regalo…) en lugar del %
      var dar = benApl ? "el beneficio «" + benApl + "»" : pctApl + "% de descuento";
      if (!window.confirm("¿Canjear el cupón " + cupon.codigo + " de " + cupon.nombre + " con " + dar + "? Después no se puede volver a usar.")) return;
      var nuevo = { ...cupon, pct: pctApl, ...(benApl ? { beneficio: benApl } : {}), estado: "usado", usado_at: new Date().toISOString(), usado_local: props.local || "", usado_por: props.usuario || "" };
      // Se vuelve a leer justo antes de guardar, por si otro local lo canjeó recién.
      leerPauta("cupon_" + cupon.codigo).then(function (fresco) {
        if (fresco && fresco.estado === "usado") { setCupon(fresco); setMsg("Ese cupón ya fue canjeado."); return; }
        guardarFila("cupon_" + cupon.codigo, "cupon", nuevo).then(function (ok) { if (ok) {
          setCupon(nuevo); setMsg("✅ Canjeado. Aplicá " + dar + ".");
          // Se le deja listo el siguiente cupón para su próxima compra.
          renovarCupon(cupon.wsp, cfgF).then(function (sig) {
            if (sig) setMsg("✅ Canjeado. Aplicá " + dar + ". Su próximo cupón ya quedó listo: " + sig.codigo + ".");
            if (props.onCanje) props.onCanje();
          });
        } else setMsg("No se pudo guardar el canje. Probá de nuevo."); });
      });
    });
  }
  var empCupon = cupon ? empleadoDeWsp(cupon.wsp, cupon.nombre) : null;
  var est = estadoCupon(cupon);
  var col = est === "activo" ? "#4C9A5A" : "#E0714A";
  var inpS = { flex: 1, padding: "11px 13px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 16, letterSpacing: 2, textTransform: "uppercase" };
  return (
    <div style={{ background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>🎟️ Canjear cupón de la comunidad</div>
      <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.5, marginBottom: 10 }}>Pedile al cliente el código que le figura en su celular (por ejemplo NKT-4K7P) y escribilo acá.</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={codigo} onChange={function (e) { setCodigo(e.target.value); }} placeholder="NKT-XXXX" style={inpS} />
        <button onClick={buscar} disabled={ocupado} style={{ padding: "0 16px", borderRadius: 10, border: "none", background: "#1A6B8A", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{ocupado ? "…" : "Buscar"}</button>
      </div>
      {msg && <div style={{ fontSize: 13, color: msg.indexOf("✅") === 0 ? "#4C9A5A" : "#E0714A", marginTop: 10 }}>{msg}</div>}
      {cupon && (
        <div style={{ marginTop: 10, border: "1px solid " + col + "66", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{cupon.nombre} · <span style={{ color: col }}>{est === "usado" ? (cupon.beneficio ? "🎁 " + cupon.beneficio : cupon.pct + "% OFF") : (cfgC ? (!cupon.pctFijo && benefPara(cfgC, props.localId) ? "🎁 " + benefPara(cfgC, props.localId) : pctCanje(cupon, cfgC, props.localId) + "% OFF") : "…")}</span>{est === "activo" && <span style={{ color: "#9A9A9A", fontSize: 11.5, fontWeight: 400 }}> · lo que corresponde en {props.local || "este local"}</span>}</div>
          <div style={{ fontSize: 12, color: "#B8B8B8", marginTop: 4, lineHeight: 1.6 }}>
            Estado: <b style={{ color: col }}>{est === "activo" ? "válido" : est === "usado" ? "ya usado" : "vencido"}</b> · vence el {new Date(cupon.vence).toLocaleDateString("es-AR")}
            {cupon.usado_at && <div>Canjeado el {new Date(cupon.usado_at).toLocaleString("es-AR")}{cupon.usado_local ? " en " + cupon.usado_local : ""}</div>}
          </div>
          {empCupon && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#1A0D0A", border: "1px solid #C1440E88", fontSize: 12.5, color: "#FF8A5C", fontWeight: 700 }}>🚫 No se puede canjear: {empCupon.nombre} es empleado/a y ya tiene su descuento del {DESCUENTO_EMPLEADOS}%. No lo canjees.</div>}
          {est === "activo" && !empCupon && <button onClick={canjear} style={{ marginTop: 10, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#3A7D44", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Canjear ahora</button>}
        </div>
      )}
    </div>
  );
}

// ─── VISTA DEL CAJERO ────────────────────────────────────────────────────────
// Lo de la comunidad que ve el cajero: solo lo de su local, en lectura, sin WhatsApp ni cumpleaños de los clientes. Puede canjear cupones.
export function PanelComunidadCajero(props) {
  var local = props.local || "";
  var nomLocal = (LOCALES_GRUPO.find(function (l) { return l.id === local; }) || {}).nombre || "";
  var [miembros, setMiembros] = useState(null);
  var [cupones, setCupones] = useState([]);
  var [filtro, setFiltro] = useState("todos");
  var [qrC, setQrC] = useState("");
  var [qrGrande, setQrGrande] = useState(false);
  var [cfgV, setCfgV] = useState(null);      // lo que ven los clientes: configuración (descuentos, bienvenida, datos de los locales)
  var [novV, setNovV] = useState(null);      // y las novedades vigentes
  useEffect(function () {
    cargarConfigGrupo().then(setCfgV);
    // Las de todos los locales y las del propio local del cajero.
    cargarNovedades().then(function (l) { setNovV(l.filter(novedadVisible).filter(function (n) { return !n.local || n.local === "todos" || n.local === local; })); });
  }, []);
  useEffect(function () { QRCode.toDataURL(urlGrupo(), { margin: 2, width: 720, errorCorrectionLevel: "M" }).then(setQrC).catch(function () {}); }, []);
  function cargar() {
    fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setMiembros(Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () { setMiembros([]); });
    fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setCupones(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () {});
  }
  useEffect(function () { cargar(); }, []);
  var tarjeta = { background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px 16px", marginBottom: 12 };
  // Todos los miembros de la comunidad, sin importar dónde se sumaron: el cupón se canjea en cualquiera de los 3 locales.
  var mios = (miembros || []).filter(function (m) { return !m.prueba && !empleadoDeWsp(m.wsp, nombreCompleto(m)); }).sort(function (a, b) { return String(b.fecha || "").localeCompare(String(a.fecha || "")); });
  var wsps = {}; mios.forEach(function (m) { wsps[m.wsp] = true; });
  // Los cupones de los clientes de este local, más los que se canjearon acá aunque el cliente se haya sumado en otro.
  // Solo de quienes siguen en la comunidad: los que administración sacó de la lista ya no figuran (ni con sus cupones).
  var wspActivos = {}; (miembros || []).forEach(function (m) { if (!m.prueba && !empleadoDeWsp(m.wsp, nombreCompleto(m))) wspActivos[m.wsp] = true; });
  var cups = cupones.filter(function (c) { return !c.prueba && wspActivos[c.wsp]; }).sort(function (a, b) { return String(b.creado || "").localeCompare(String(a.creado || "")); });
  var est = function (c) { var e = estadoCupon(c); return e === "activo" ? "vigentes" : e === "usado" ? "usados" : "vencidos"; };
  var cuenta = { todos: cups.length, vigentes: 0, usados: 0, vencidos: 0 };
  cups.forEach(function (c) { cuenta[est(c)]++; });
  var lista = cups.filter(function (c) { return filtro === "todos" || est(c) === filtro; });
  function resumenCup(wsp) {
    var m = cupones.filter(function (c) { return !c.prueba && c.wsp === wsp; });
    return { total: m.length, usados: m.filter(function (c) { return c.estado === "usado"; }).length };
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 10 }}>🌐 Comunidad Grupo Nkt{nomLocal ? " · " + nomLocal : ""}</div>
      <PanelCanje local={nomLocal} localId={local} usuario={props.usuario} onCanje={cargar} />
      <div style={{ ...tarjeta, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>📲 QR para sumar clientes</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.5, marginBottom: 10 }}>Mostrale este QR al cliente: lo escanea con la cámara, se suma a la comunidad y recibe su cupón.</div>
        {qrC && <div style={{ background: "#fff", padding: 8, borderRadius: 12, display: "inline-block" }}><img src={qrC} alt="QR Grupo Nkt" style={{ width: 170, display: "block" }} /></div>}
        <div><button onClick={function () { setQrGrande(true); }} style={{ marginTop: 10, padding: "10px 16px", borderRadius: 10, border: "none", background: "#C1440E", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>🔍 Mostrar en pantalla grande</button></div>
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 8 }}>👀 Lo que ven los clientes</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.5, marginBottom: 10 }}>Así podés contestarles si preguntan por promos, descuentos o por los otros locales. Es solo para consultar.</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#F0EDE8", marginBottom: 6 }}>📣 Novedades y promos vigentes</div>
        {novV === null && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Cargando…</div>}
        {novV && novV.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Por ahora no hay novedades ni promos publicadas.</div>}
        {novV && novV.map(function (n) {
          var ln = LOCALES_GRUPO.find(function (x) { return x.id === n.local; });
          return (
            <div key={n.id} style={{ padding: "8px 0", borderTop: "1px solid #1A1A1A" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F0EDE8" }}>{n.titulo}</div>
              <div style={{ fontSize: 10.5, color: ln ? ln.color : "#7E7E7E", margin: "2px 0 3px" }}>{ln ? ln.nombre : "Todos los locales"}{n.hasta ? " · hasta el " + n.hasta.split("-").reverse().join("/") : ""}</div>
              <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.texto}</div>
            </div>
          );
        })}
        {cfgV && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F0EDE8", margin: "12px 0 6px" }}>🎟️ Lo que vale el cupón hoy, según el local</div>
            <div style={{ display: "flex", gap: 6 }}>
              {LOCALES_GRUPO.map(function (l) {
                return <div key={l.id} style={{ flex: 1, textAlign: "center", border: "1px solid " + l.color + "99", borderRadius: 10, padding: "7px 4px" }}>
                  <div style={{ fontSize: 10.5, color: l.color, fontWeight: 800, lineHeight: 1.2 }}>{l.nombre}</div>
                  {benefPara(cfgV, l.id) ? <div style={{ fontSize: 12.5, fontWeight: 800, color: "#F0EDE8", lineHeight: 1.25 }}>🎁 {benefPara(cfgV, l.id)}</div> : <div style={{ fontSize: 19, fontWeight: 800, color: "#F0EDE8", fontFamily: "'Playfair Display',serif" }}>{pctPara(cfgV, l.id)}%</div>}
                </div>;
              })}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F0EDE8", margin: "12px 0 6px" }}>🌟 Beneficios de la comunidad</div>
            <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{cfgV.bienvenida || "Te vamos a avisar de las novedades, los platos nuevos y los beneficios de la comunidad."}</div>
            <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.55, marginTop: 4 }}>Cada cupón se usa una sola vez y vence a los {cfgV.cuponDias || 30} días; al canjearlo, el cliente recibe el siguiente.</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F0EDE8", margin: "12px 0 6px" }}>🏠 Datos de los locales</div>
            {LOCALES_GRUPO.map(function (l) {
              var d = (cfgV.locales || {})[l.id] || {};
              return (
                <div key={l.id} style={{ padding: "7px 0", borderTop: "1px solid #1A1A1A", fontSize: 12, color: "#C8C8C8", lineHeight: 1.6 }}>
                  <b style={{ color: l.color }}>{l.nombre}</b>
                  <div>📍 {d.direccion || "—"}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>🕒 {d.horarios || "—"}</div>
                  {d.wsp && <div>💬 {d.wsp}</div>}
                  {d.carta && <div>🍽️ <a href={linkWeb(d.carta)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A" }}>Ver la carta</a></div>}
                  {d.instagram && <div>📸 <a href={linkWeb(d.instagram, "instagram")} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A" }}>Instagram</a></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {qrGrande && (
        <div onClick={function () { setQrGrande(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, color: "#F0EDE8", marginBottom: 6 }}>Sumate a Grupo Nkt</div>
          <div style={{ fontSize: 13.5, color: "#C8C8C8", marginBottom: 14 }}>Escaneá el QR con la cámara de tu celular</div>
          <div style={{ background: "#fff", padding: 12, borderRadius: 16 }}><img src={qrC} alt="QR Grupo Nkt" style={{ width: "min(78vw, 360px)", display: "block" }} /></div>
          <div style={{ fontSize: 12, color: "#8C8C8C", marginTop: 16 }}>Tocá la pantalla para cerrar</div>
        </div>
      )}
      <MovimientoComunidad ancho={9999} margen={12} />
      <div style={{ ...tarjeta, fontSize: 12, color: "#C8C8C8", lineHeight: 1.7 }}>
        👥 <b>{mios.length}</b> miembro{mios.length === 1 ? "" : "s"} en la comunidad · 🎟️ <b>{cuenta.todos}</b> cupones: <b style={{ color: "#4C9A5A" }}>{cuenta.vigentes}</b> vigentes · <b>{cuenta.usados}</b> usados · <b>{cuenta.vencidos}</b> vencidos
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 8 }}>🎟️ Cupones</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {[["todos", "Todos"], ["vigentes", "Vigentes"], ["usados", "Usados"], ["vencidos", "Vencidos"]].map(function (t) {
            var act = filtro === t[0];
            return <button key={t[0]} onClick={function () { setFiltro(t[0]); }} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid " + (act ? "#D4A017" : "#2A2A2A"), background: act ? "#D4A01722" : "#111", color: act ? "#D4A017" : "#8C8C8C", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t[1]} · {cuenta[t[0]]}</button>;
          })}
        </div>
        {lista.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>No hay cupones en esta vista.</div>}
        {lista.slice(0, 80).map(function (c) {
          var e = estadoCupon(c), col = e === "activo" ? "#4C9A5A" : e === "usado" ? "#8C8C8C" : "#E0714A";
          return (
            <div key={c.codigo} style={{ padding: "7px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{c.nombre}</b><span style={{ color: col, fontWeight: 800, fontSize: 11.5 }}>{e === "activo" ? "VIGENTE" : e === "usado" ? "USADO" : "VENCIDO"}</span></div>
              <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>🎟️ <b style={{ color: "#C8C8C8" }}>{c.codigo}</b> · {pctTexto(c)} · vence {c.vence ? new Date(c.vence).toLocaleDateString("es-AR") : "—"}</div>
              {c.usado_at && <div style={{ fontSize: 11, color: "#8C8C8C", marginTop: 1 }}>✅ Canjeado el {new Date(c.usado_at).toLocaleString("es-AR")}{c.usado_local ? " en " + c.usado_local : ""}</div>}
            </div>
          );
        })}
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>👥 Miembros de la comunidad · {mios.length}</div>
        {miembros === null && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Cargando…</div>}
        {miembros && mios.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Todavía no se sumó nadie.</div>}
        {mios.slice(0, 100).map(function (m) {
          var rc = resumenCup(m.wsp), cp = cupones.find(function (x) { return x.codigo === m.cupon; });
          var e = cp ? estadoCupon(cp) : "";
          return (
            <div key={m.id} style={{ padding: "6px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
              <b>{nombreCompleto(m)}</b>
              <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>{m.cupon ? "🎟️ " + m.cupon + (e ? " · " + (e === "activo" ? "vigente" : e === "usado" ? "usado" : "vencido") : "") + " · " : ""}<b style={{ color: "#D4A017" }}>{rc.total} {rc.total === 1 ? "cupón" : "cupones"} · {rc.usados} canjeado{rc.usados === 1 ? "" : "s"}</b>{m.fecha ? " · desde " + new Date(m.fecha).toLocaleDateString("es-AR") : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PANEL DE ADMINISTRACIÓN ─────────────────────────────────────────────────
function mesNombre(m) { return ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m] || ""; }

// ─── MOVIMIENTO: cuántos entran y cuántos se van, por local ─────────────────
// Las bajas se anotan al sacar a alguien de la lista (ámbito "comunidad_baja"): desde que existe este registro. Las de antes no figuran.
function registrarBaja(m, motivo) {
  return guardarFila("baja_" + Date.now() + "_" + m.wsp, "comunidad_baja", { wsp: m.wsp, nombre: nombreCompleto(m), fav: m.fav || "", entro: m.fecha || "", fecha: new Date().toISOString(), motivo: motivo, prueba: m.prueba ? 1 : 0 });
}
function diaAR(iso) { try { return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }); } catch (e) { return ""; } }
async function leerAmbito(amb) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq." + amb + "&order=created_at.desc&limit=2000", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d.map(function (f) { try { return { id: f.id, ...JSON.parse(f.texto) }; } catch (e) { return null; } }).filter(Boolean) : [];
  } catch (e) { return []; }
}
// Cuadro de movimiento de la comunidad: por local, cuántos entraron, cuántos se fueron y cuántos hay hoy. Se usa en Comunidad y en el panel de gestión.
export function MovimientoComunidad(props) {
  var [datos, setDatos] = useState(null);
  var [per, setPer] = useState("mes");
  useEffect(function () { Promise.all([leerAmbito("comunidad"), leerAmbito("comunidad_baja")]).then(function (r) { setDatos({ miembros: r[0], bajas: r[1] }); }); }, []);
  var hoy = diaAR(new Date().toISOString());
  var hace7 = diaAR(new Date(Date.now() - 6 * 86400000).toISOString());
  function enPeriodo(d) {
    if (!d) return false;
    if (per === "hoy") return d === hoy;
    if (per === "semana") return d >= hace7 && d <= hoy;
    if (per === "mes") return d.slice(0, 7) === hoy.slice(0, 7);
    return true;
  }
  var miembros = datos ? datos.miembros.filter(function (m) { return !m.prueba && !empleadoDeWsp(m.wsp, nombreCompleto(m)); }) : [];
  var bajas = datos ? datos.bajas.filter(function (b) { return !b.prueba && b.motivo !== "empleado"; }) : [];
  var cols = LOCALES_GRUPO.slice().reverse().map(function (l) { return { id: l.id, l: l }; });   // Colantonio's, Kusama, Bodegón: igual que Disponibilidad hoy
  var sinLocal = miembros.filter(function (m) { return !LOCALES_GRUPO.some(function (l) { return l.id === m.fav; }); }).length + bajas.filter(function (b) { return !LOCALES_GRUPO.some(function (l) { return l.id === b.fav; }); }).length;
  if (sinLocal > 0) cols.push({ id: "", l: { nombre: "Sin local", emoji: "❔", color: "#9A9A9A" } });
  function delLocal(id, x) { return id === "" ? !LOCALES_GRUPO.some(function (l) { return l.id === x.fav; }) : x.fav === id; }
  var calc = cols.map(function (c) {
    var ms = miembros.filter(function (m) { return delLocal(c.id, m); }), bs = bajas.filter(function (b) { return delLocal(c.id, b); });
    var entraron = per === "total" ? ms.length + bs.length : ms.filter(function (m) { return enPeriodo(diaAR(m.fecha)); }).length;
    var fueron = bs.filter(function (b) { return enPeriodo(diaAR(b.fecha)); }).length;
    return { entraron: entraron, fueron: fueron, neto: entraron - fueron, hoy: ms.length };
  });
  var suma = function (k) { return calc.reduce(function (a, x) { return a + x[k]; }, 0); };
  var th = { fontSize: 9.5, color: "#7E7E7E", textTransform: "uppercase", letterSpacing: 1, textAlign: "right", padding: "0 0 6px" };
  var num = function (col) { return { textAlign: "right", fontSize: "clamp(11px,3.2vw,14px)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: col || "#F0EDE8", padding: "9px 0" }; };
  var filas = [["Entraron", "entraron", "#4C9A5A", "+"], ["Se fueron", "fueron", "#E0714A", "−"], ["Neto", "neto", "#F0EDE8", ""], ["Miembros hoy", "hoy", "#D4A017", ""]];
  return (
    <div style={{ width: "100%", maxWidth: props.ancho || 440, boxSizing: "border-box", margin: "0 auto", background: "#0C0C0C", border: "1px solid #D4A01744", borderRadius: 16, padding: "14px 14px", marginBottom: props.margen || 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#D4A017", textTransform: "uppercase", letterSpacing: 1.5 }}>👥 Comunidad · entran y se van</div>
        {!datos && <div style={{ fontSize: 10, color: "#6E6E6E" }}>Calculando…</div>}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        {[["hoy", "Hoy"], ["semana", "7 días"], ["mes", "Este mes"], ["total", "Total"]].map(function (t) {
          var act = per === t[0];
          return <button key={t[0]} onClick={function () { setPer(t[0]); }} style={{ flex: 1, padding: "5px 2px", borderRadius: 7, border: "1px solid " + (act ? "#D4A017" : "#2A2A2A"), background: act ? "#D4A01722" : "none", color: act ? "#D4A017" : "#8C8C8C", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{t[1]}</button>;
        })}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", width: "25%" }}></th>
            {cols.map(function (c) { return <th key={c.id || "sin"} style={{ ...th, color: c.l.color, fontWeight: 800 }}><div style={{ fontSize: 14, letterSpacing: 0 }}>{c.l.emoji}</div>{String(c.l.nombre || "").replace(/^El /, "").replace(" Nkt", "").replace("'s", "").toUpperCase().slice(0, 11)}</th>; })}
            <th style={{ ...th, color: "#F0EDE8", fontWeight: 800 }}><div style={{ fontSize: 14, letterSpacing: 0 }}>∑</div>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(function (f) {
            return (
              <tr key={f[1]} style={{ borderTop: f[1] === "hoy" ? "2px solid #222" : "1px solid #1A1A1A" }}>
                <td style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9A9A", padding: "9px 4px 9px 0", lineHeight: 1.2 }}>{f[0]}</td>
                {calc.map(function (x, i) { var v = x[f[1]]; return <td key={i} style={num(f[1] === "neto" ? (v > 0 ? "#4C9A5A" : v < 0 ? "#E0714A" : "#F0EDE8") : f[2])}>{datos ? (f[1] === "neto" && v > 0 ? "+" : "") + v : "—"}</td>; })}
                <td style={{ ...num(f[1] === "neto" ? (suma("neto") > 0 ? "#4C9A5A" : suma("neto") < 0 ? "#E0714A" : "#F0EDE8") : f[2]), fontWeight: 900 }}>{datos ? (f[1] === "neto" && suma("neto") > 0 ? "+" : "") + suma(f[1]) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 9.5, color: "#6E6E6E", marginTop: 6, lineHeight: 1.4 }}>El local es el que eligió cada cliente al sumarse. Las bajas se cuentan desde que se empezaron a anotar (cuando se saca a alguien de la lista). No incluye empleados ni pruebas.</div>
    </div>
  );
}

export function PanelComunidad() {
  var [cfg, setCfg] = useState(CONFIG_VACIA);
  var [miembros, setMiembros] = useState(null);
  var [apps, setApps] = useState({});          // quién abrió la app instalada: {wsp: registro}
  var [filtroApp, setFiltroApp] = useState("todos");
  var [vistaCanje, setVistaCanje] = useState("local");   // cupones canjeados: por local o por cliente
  var [filtroCom, setFiltroCom] = useState("todos");   // lista de miembros: todos o los de un local
  var [qr, setQr] = useState("");
  var [msg, setMsg] = useState("");
  var [copiado, setCopiado] = useState(false);
  var [verDatos, setVerDatos] = useState(false);
  var [verCup, setVerCup] = useState(false);   // «Cupones otorgados» y «La comunidad»: cerrados para que el panel no sea tan largo
  var [verSoc, setVerSoc] = useState(false);
  var [cupones, setCupones] = useState([]);
  var [msgPrueba, setMsgPrueba] = useState("");
  var [filtroCup, setFiltroCup] = useState("todos");
  var [msgCup, setMsgCup] = useState("");
  var [msgDesc, setMsgDesc] = useState("");
  var [novAdm, setNovAdm] = useState([]);
  var [envNov, setEnvNov] = useState(null);       // novedad que se está mandando por WhatsApp
  var [envMsg, setEnvMsg] = useState("");         // texto del mensaje ({nombre} se reemplaza por el de cada persona)
  var [envLocal, setEnvLocal] = useState("todos");
  var [fotoNov, setFotoNov] = useState(null);   // foto elegida para la novedad: {blob, vista, kb}
  var [formNov, setFormNov] = useState({ titulo: "", texto: "", local: "todos", hasta: "", video: "" });
  var [msgNov, setMsgNov] = useState("");

  useEffect(function () {
    cargarConfigGrupo().then(setCfg);
    cargarMiembros();
    cargarCupones();
    cargarNovedades().then(setNovAdm);
    QRCode.toDataURL(urlGrupo(), { margin: 1, width: 360, errorCorrectionLevel: "M" }).then(setQr).catch(function () {});
  }, []);

  var sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12, width: "100%", boxSizing: "border-box", marginBottom: 6 };
  var tarjeta = { background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px 16px", marginBottom: 12 };

  function elegirFotoNov(file) {
    if (!file) return;
    setMsgNov("Preparando la foto…");
    achicarFotoNov(file, 1200).then(function (blob) {
      if (!blob) { setMsgNov("No se pudo leer esa foto. Probá con otra."); return; }
      setFotoNov({ blob: blob, vista: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024) });
      setMsgNov("");
    });
  }
  function publicarNovedad() {
    if (!formNov.titulo.trim() || !formNov.texto.trim()) { setMsgNov("Poné el título y el texto."); setTimeout(function () { setMsgNov(""); }, 3000); return; }
    setMsgNov(fotoNov ? "Subiendo la foto…" : "Publicando…");
    var id = "nov_" + Date.now();
    (fotoNov ? subirFotoNovedad(fotoNov.blob, id) : Promise.resolve({ ok: true, url: "" })).then(function (sub) {
      if (!sub.ok) return { fallo: "No se pudo subir la foto. Probá de nuevo o publicá sin foto." };
      return guardarFila(id, "grupo_novedad", { titulo: formNov.titulo.trim(), texto: formNov.texto.trim(), local: formNov.local, hasta: formNov.hasta || "", foto_url: sub.url || "", video: formNov.video.trim(), creado: new Date().toISOString(), activa: true }).then(function (ok) { return ok ? { ok: true } : { fallo: "No se pudo publicar." }; });
    }).then(function (r) {
      if (r.ok) { setFormNov({ titulo: "", texto: "", local: "todos", hasta: "", video: "" }); setFotoNov(null); cargarNovedades().then(setNovAdm); setMsgNov("✓ Publicada: ya la ven los miembros."); }
      else setMsgNov(r.fallo);
      setTimeout(function () { setMsgNov(""); }, 4000);
    });
  }
  // Mandar una novedad por WhatsApp, persona por persona: se abre el chat con el mensaje listo y queda marcado quién ya lo recibió
  // (se guarda en la misma novedad, así no se repite aunque se cierre o se use otra compu).
  function abrirEnvio(n) {
    setEnvNov(n); setEnvLocal("todos");
    setEnvMsg("Hola {nombre}! Novedad de Grupo Nkt 🎉\n\n*" + n.titulo + "*\n" + n.texto + "\n\nMirá todo en " + urlGrupo());
  }
  function enviarA(m) {
    var url = linkWsp(m.wsp, envMsg.replace(/\{nombre\}/g, (m.nombre || "").split(" ")[0]));
    if (!url) return;
    window.open(url, "_blank");
    var env = { ...(envNov.enviados || {}), [m.wsp]: new Date().toISOString() };
    var nuevo = { ...envNov, enviados: env };
    setEnvNov(nuevo);
    var o = { ...nuevo }; delete o.id;
    guardarFila(envNov.id, "grupo_novedad", o).then(function () { setNovAdm(function (p) { return p.map(function (x) { return x.id === nuevo.id ? nuevo : x; }); }); });
  }
  function reiniciarEnvio() {
    if (!window.confirm("¿Marcar a todos como que todavía no recibieron esta novedad?")) return;
    var nuevo = { ...envNov, enviados: {} };
    setEnvNov(nuevo);
    var o = { ...nuevo }; delete o.id;
    guardarFila(envNov.id, "grupo_novedad", o).then(function () { setNovAdm(function (p) { return p.map(function (x) { return x.id === nuevo.id ? nuevo : x; }); }); });
  }
  function ocultarNovedad(n, activa) {
    var o = { ...n }; delete o.id; o.activa = activa;
    guardarFila(n.id, "grupo_novedad", o).then(function () { cargarNovedades().then(setNovAdm); });
  }
  function borrarNovedad(n) {
    if (!window.confirm("¿Borrar la novedad «" + n.titulo + "»?")) return;
    fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(n.id), { method: "DELETE", headers: SH }).then(function () { setNovAdm(function (p) { return p.filter(function (x) { return x.id !== n.id; }); }); });
  }
  function guardarValores() {
    guardarFila("grupo_config", "grupo_config", cfg).then(function (ok) { setMsgCup(ok ? "✓ Guardado: vale ya mismo para todos los cupones." : "No se pudo guardar"); setTimeout(function () { setMsgCup(""); }, 4000); });
  }
  function cambiarPctCupon(c) {
    var v = window.prompt("Descuento fijo para el cupón " + c.codigo + " de " + c.nombre + " (%), igual en los 3 locales. Sin esto, el cupón toma el descuento del local donde se canjea:", String(c.pctFijo || ""));
    if (v === null) return;
    var n = parseInt(String(v).replace(/\D/g, ""), 10);
    if (!(n >= 1 && n <= 100)) { window.alert("Poné un número entre 1 y 100."); return; }
    guardarFila("cupon_" + c.codigo, "cupon", { ...c, pct: n, pctFijo: n }).then(function () { cargarCupones(); });
  }
  // Cuántos cupones lleva cada cliente (emitidos y canjeados), sin contar los de prueba.
  function resumenCup(wsp) {
    var mios = cupones.filter(function (c) { return !c.prueba && c.wsp === wsp; });
    return { total: mios.length, usados: mios.filter(function (c) { return c.estado === "usado"; }).length, vencidos: mios.filter(function (c) { return estadoCupon(c) === "vencido"; }).length };
  }
  // Número de orden de un cupón dentro de los de ese cliente: el 1.º, el 2.º…
  function ordenCupon(c) {
    var mios = cupones.filter(function (x) { return !x.prueba && x.wsp === c.wsp; }).sort(function (a, b) { return String(a.creado || "").localeCompare(String(b.creado || "")); });
    return mios.findIndex(function (x) { return x.codigo === c.codigo; }) + 1;
  }
  function cargarApps() {
    fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad_app&limit=3000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      var o = {}; (Array.isArray(d) ? d : []).forEach(function (f) { try { var x = JSON.parse(f.texto); if (x && x.wsp) o[x.wsp] = x; } catch (e) {} }); setApps(o);
    }).catch(function () {});
  }
  // "app" = la abrió desde el ícono (o el navegador avisó la instalación) · "toco" = tocó Descargar pero no se sabe más · "no" = sin registro
  function estadoApp(m) { var a = apps[m.wsp]; return a && (a.primera_app_at || a.instalada_at) ? "app" : a && a.toco_at ? "toco" : "no"; }
  function cargarMiembros() {
    cargarApps();
    fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setMiembros(Array.isArray(d) ? d.map(function (f) { try { var x = JSON.parse(f.texto); return { id: f.id, ...x }; } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () { setMiembros([]); });
  }
  function cargarCupones() {
    fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setCupones(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () {});
  }
  function csvCanjeados() {
    var filas = [["Local del canje", "Cliente", "WhatsApp", "Código", "Descuento", "Canjeado el", "Canjeado por"]].concat(canjeados.slice().sort(function (a, b) { return String(a.usado_local || "").localeCompare(String(b.usado_local || ""), "es") || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"); }).map(function (c) {
      return [c.usado_local || "", c.nombre, c.wsp, c.codigo, c.beneficio || c.pct + "%", c.usado_at ? new Date(c.usado_at).toLocaleString("es-AR") : "", c.usado_por || ""];
    }));
    var txt = "\ufeff" + filas.map(function (f) { return f.map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "cupones_canjeados_grupo_nkt.csv"; a.click();
  }
  function csvCupones() {
    var filas = [["Código", "Cliente", "WhatsApp", "Descuento", "Emitido", "Vence", "Estado", "Canjeado el", "Local del canje", "Canjeado por", "Nº de cupón del cliente"]].concat(cupones.filter(esDeMiembro).map(function (c) {
      var e = estadoCupon(c);
      return [c.codigo, c.nombre, c.wsp, pctTexto(c), c.creado ? new Date(c.creado).toLocaleDateString("es-AR") : "", c.vence ? new Date(c.vence).toLocaleDateString("es-AR") : "", e === "activo" ? "vigente" : e === "usado" ? "usado" : "vencido", c.usado_at ? new Date(c.usado_at).toLocaleString("es-AR") : "", c.usado_local || "", c.usado_por || "", ordenCupon(c)];
    }));
    var txt = "\ufeff" + filas.map(function (f) { return f.map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "cupones_grupo_nkt.csv"; a.click();
  }
  function setLocal(id, k, v) { setCfg(function (c) { var l = { ...c.locales }; l[id] = { ...(l[id] || {}), [k]: v }; return { ...c, locales: l }; }); }
  function guardar() {
    guardarFila("grupo_config", "grupo_config", cfg).then(function (ok) { setMsg(ok ? "✓ Guardado" : "No se pudo guardar"); setTimeout(function () { setMsg(""); }, 2500); });
  }
  function copiar() {
    try { navigator.clipboard.writeText(urlGrupo()); setCopiado(true); setTimeout(function () { setCopiado(false); }, 1800); } catch (e) {}
  }
  function csv() {
    var filas = [["Nombre", "WhatsApp", "Cumpleaños", "Lugar favorito", "Fecha de alta", "Cupón actual", "Cupones emitidos", "Cupones canjeados", "Cupones vencidos", "App instalada", "Veces que abrió la app", "Última vez en la app"]].concat(reales.slice().sort(function (x, y) { return String(y.fecha || "").localeCompare(String(x.fecha || "")); }).map(function (m) {
      var l = LOCALES_GRUPO.find(function (x) { return x.id === m.fav; });
      return [nombreCompleto(m), m.wsp, m.dia && m.mes ? m.dia + "/" + m.mes : "", l ? l.nombre : "", m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "", m.cupon || "", resumenCup(m.wsp).total, resumenCup(m.wsp).usados, resumenCup(m.wsp).vencidos, estadoApp(m) === "app" ? "Sí" : estadoApp(m) === "toco" ? "Tocó descargar, sin confirmar" : "No", (apps[m.wsp] || {}).usos || 0, (apps[m.wsp] || {}).ultima_app_at ? new Date(apps[m.wsp].ultima_app_at).toLocaleDateString("es-AR") : ""];
    }));
    var txt = "﻿" + filas.map(function (f) { return f.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "comunidad_grupo_nkt.csv"; a.click();
  }
  // Borra lo cargado en modo prueba: miembros, cupones y opiniones marcados como de prueba.
  function borrarPruebas() {
    if (!window.confirm("¿Borrar todos los miembros, cupones y opiniones de prueba? No toca nada de los clientes reales.")) return;
    var patron = encodeURIComponent('*"prueba":1*');
    Promise.all(["comunidad", "cupon", "opinion"].map(function (a) {
      return fetch(SURL + "/rest/v1/pautas?ambito=eq." + a + "&texto=like." + patron, { method: "DELETE", headers: SH });
    })).then(function () {
      setMiembros(function (p) { return (p || []).filter(function (m) { return !m.prueba; }); });
      setCupones(function (p) { return (p || []).filter(function (c) { return !c.prueba; }); });
      setMsgPrueba("✓ Pruebas borradas");
      setTimeout(function () { setMsgPrueba(""); }, 2500);
    });
  }
  function sacarEmpleados() {
    var wl = {}; empleadosEnCom.forEach(function (m) { wl[m.wsp] = 1; });
    var cs = cupones.filter(function (c) { return wl[c.wsp] && c.estado !== "usado"; });
    if (!window.confirm("¿Sacar de la comunidad a " + empleadosEnCom.map(nombreCompleto).join(", ") + "?\n\nSe borran sus fichas y sus " + cs.length + " cupón" + (cs.length === 1 ? "" : "es") + " sin usar.")) return;
    Promise.all(empleadosEnCom.map(function (m) { registrarBaja(m, "empleado"); return fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(m.id), { method: "DELETE", headers: SH }); })
      .concat(cs.map(function (c) { return fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent("cupon_" + c.codigo), { method: "DELETE", headers: SH }); }))).then(function () { cargarMiembros(); cargarCupones(); });
  }
  // Al sacar a alguien de la comunidad también se borran sus cupones sin usar (vigentes o vencidos): si no, seguirían figurando
  // y podrían canjearse en caja. Los que ya canjeó quedan en el historial de canjeados.
  function quitar(m) {
    var propios = cupones.filter(function (c) { return c.wsp === m.wsp && c.estado !== "usado"; });
    var msg = "¿Sacar a " + nombreCompleto(m) + " de la comunidad?" + (propios.length ? "\n\nTambién se borran sus " + propios.length + " cupón" + (propios.length === 1 ? "" : "es") + " sin usar. Los que ya canjeó quedan en el historial." : "");
    if (!window.confirm(msg)) return;
    // Queda anotada la baja (quién, de qué local, cuándo) para poder contar cuántos se van.
    var pedidos = [registrarBaja(m, "admin"), fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(m.id), { method: "DELETE", headers: SH })].concat(propios.map(function (c) {
      return fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent("cupon_" + c.codigo), { method: "DELETE", headers: SH });
    }));
    Promise.all(pedidos).then(function () {
      setMiembros(function (p) { return (p || []).filter(function (x) { return x.id !== m.id; }); });
      setCupones(function (p) { return (p || []).filter(function (c) { return !(c.wsp === m.wsp && c.estado !== "usado"); }); });
    });
  }

  var pruebas = (miembros || []).filter(function (m) { return m.prueba; });
  var reales = (miembros || []).filter(function (m) { return !m.prueba && !empleadoDeWsp(m.wsp, nombreCompleto(m)); });
  // Empleados que figuran como miembros (se sumaron antes de que se los bloqueara): no cuentan, y se pueden sacar de una vez.
  var empleadosEnCom = (miembros || []).filter(function (m) { return !m.prueba && empleadoDeWsp(m.wsp, nombreCompleto(m)); });
  var hoy = new Date(), cumples = reales.filter(function (m) { return m.dia === hoy.getDate() && m.mes === hoy.getMonth() + 1; });
  var conCumple = reales.filter(function (m) { return m.dia && m.mes; }).length;
  // "Cupones otorgados" muestra solo los de quienes siguen en la comunidad hoy (los de quien se sacó de la lista ya no figuran).
  var wspMiembros = {}; reales.forEach(function (m) { wspMiembros[m.wsp] = 1; });
  function esDeMiembro(c) { return !c.prueba && !!wspMiembros[c.wsp]; }
  // Por fecha de entrada: el último que se sumó, primero.
  var ordenados = (miembros || []).filter(function (m) { return !empleadoDeWsp(m.wsp, nombreCompleto(m)); }).sort(function (a, b) { return String(b.fecha || "").localeCompare(String(a.fecha || "")); });
  var ordenadosVista = (filtroCom === "todos" ? ordenados : ordenados.filter(function (m) { return m.fav === filtroCom; })).filter(function (m) { return filtroApp === "todos" || (filtroApp === "con" ? estadoApp(m) === "app" : estadoApp(m) !== "app"); });
  // Cupones canjeados de los miembros actuales (sin los de prueba), del más reciente al más viejo.
  var canjeados = cupones.filter(function (c) { return esDeMiembro(c) && c.estado === "usado"; }).sort(function (a, b) { return String(b.usado_at || "").localeCompare(String(a.usado_at || "")); });
  function agrupar(clave) {
    var m = {};
    canjeados.forEach(function (c) { var k = clave(c) || "(sin dato)"; (m[k] = m[k] || []).push(c); });
    return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, "es"); }).map(function (k) { return { k: k, lista: m[k] }; });
  }
  var porLocalCanje = vistaCanje === "local" ? agrupar(function (c) { return c.usado_local; }) : agrupar(function (c) { return c.nombre; });
  // Resumen por local: miembros, cupones emitidos, canjeados, vencidos y vigentes (sin los de prueba).
  function statsDe(lista) {
    var ws = {}; lista.forEach(function (m) { ws[m.wsp] = 1; });
    var cs = cupones.filter(function (c) { return !c.prueba && ws[c.wsp]; });
    return { miembros: lista.length, total: cs.length, usados: cs.filter(function (c) { return c.estado === "usado"; }).length, vencidos: cs.filter(function (c) { return estadoCupon(c) === "vencido"; }).length, vigentes: cs.filter(function (c) { return estadoCupon(c) === "activo"; }).length };
  }
  var filasResumen = LOCALES_GRUPO.map(function (l) { return { id: l.id, txt: l.emoji + " " + l.nombre, s: statsDe(reales.filter(function (m) { return m.fav === l.id; })) }; })
    .concat([{ id: "", txt: "Sin local elegido", s: statsDe(reales.filter(function (m) { return !LOCALES_GRUPO.some(function (l) { return l.id === m.fav; }); })) }])
    .filter(function (f) { return f.id !== "" || f.s.miembros > 0; });
  var totalResumen = statsDe(reales);
  var porLocalCom = LOCALES_GRUPO.map(function (l) { return { l: l, n: reales.filter(function (m) { return m.fav === l.id; }).length }; });

  return (
    <div>
      {empleadosEnCom.length > 0 && (
        <div style={{ ...tarjeta, border: "1px solid #C1440E88", background: "#1A0D0A" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#FF8A5C", marginBottom: 4 }}>👷 Hay {empleadosEnCom.length} empleado{empleadosEnCom.length === 1 ? "" : "s"} entre los miembros</div>
          <div style={{ fontSize: 12, color: "#E0B8A8", lineHeight: 1.5, marginBottom: 8 }}>{empleadosEnCom.map(nombreCompleto).join(", ")}. Los empleados no pueden tener cupones: no se cuentan ni figuran en las listas, y ya no pueden canjear.</div>
          <button onClick={sacarEmpleados} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#C1440E", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Sacarlos de la comunidad (y borrar sus cupones)</button>
        </div>
      )}
      <MovimientoComunidad ancho={9999} margen={12} />
      <div style={{ ...tarjeta, textAlign: "center", border: "1px solid #D4A01766", background: "#14110A" }}>
        <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: 1.5 }}>Clientes en la comunidad</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 64, fontWeight: 800, color: "#D4A017", lineHeight: 1.1, marginTop: 2 }}>{miembros === null ? "…" : reales.length}</div>
        <div style={{ fontSize: 12.5, color: "#C8C8C8", marginTop: 2 }}>{miembros === null ? "Cargando…" : (reales.length === 1 ? "cliente sumado" : "clientes sumados")}{pruebas.length > 0 ? " · (+ " + pruebas.length + " de prueba, que no cuentan)" : ""}</div>
        {miembros && reales.length > 0 && <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: "#B8B8B8" }}>
          {porLocalCom.map(function (x) { return <span key={x.l.id}>{x.l.emoji} {x.l.nombre}: <b style={{ color: "#F0EDE8" }}>{x.n}</b></span>; })}
        </div>}
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>🌐 Página «Grupo Nkt» para el público</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 10 }}>Es lo que ve el cliente al escanear este QR: los locales, pedir por WhatsApp, opinar y sumarse a la comunidad. Podés ponerlo en las mesas, en la bolsa del delivery y en las redes.</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {qr && <div style={{ background: "#fff", padding: 8, borderRadius: 10 }}><img src={qr} alt="QR Grupo Nkt" style={{ width: 130, display: "block" }} /></div>}
          <div style={{ flex: 1, minWidth: 190 }}>
            <div style={{ fontSize: 11.5, color: "#C8C8C8", wordBreak: "break-all", marginBottom: 8 }}>{urlGrupo()}</div>
            <button onClick={copiar} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, cursor: "pointer", marginRight: 8 }}>{copiado ? "✓ Copiado" : "Copiar enlace"}</button>
            <button onClick={function () { try { navigator.clipboard.writeText(urlGrupo() + "?instalar"); setMsgDesc("✓ Enlace de descarga copiado"); setTimeout(function () { setMsgDesc(""); }, 2500); } catch (e) {} }} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #D4A01766", background: "#D4A01722", color: "#D4A017", fontSize: 12, cursor: "pointer", marginRight: 8 }}>📲 Copiar enlace de descarga</button>
            <a href={urlGrupo()} target="_blank" rel="noreferrer" style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, textDecoration: "none" }}>Verla</a>
            {msgDesc && <div style={{ fontSize: 11.5, color: "#8FD19A", marginTop: 8 }}>{msgDesc}</div>}
            <div style={{ fontSize: 11, color: "#7E7E7E", lineHeight: 1.5, marginTop: 8 }}>El enlace de descarga abre la página con las instrucciones para instalar la app. Sirve para mandarlo por WhatsApp o ponerlo en Instagram.</div>
          </div>
        </div>
      </div>

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#E0914A", marginBottom: 4 }}>🧪 Probar como cliente</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 10 }}>Estos enlaces se abren en modo prueba: podés registrarte y opinar todas las veces que quieras, y nada cuenta en el ranking, ni en el sorteo ni en las estadísticas. Después, para ver el canje, usá el cupón que te dé acá abajo en «Canjear cupón».</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <a href={urlGrupo() + "?prueba"} target="_blank" rel="noreferrer" style={{ padding: "8px 13px", borderRadius: 8, border: "1px solid #E0914A66", background: "#E0914A18", color: "#E0914A", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>🌐 Página de la comunidad</a>
          {LOCALES_GRUPO.map(function (l) {
            return <a key={l.id} href={URL_PUBLICA + "/?opinar=" + l.id + "&c=salon&prueba"} target="_blank" rel="noreferrer" style={{ padding: "8px 13px", borderRadius: 8, border: "1px solid " + l.color + "66", background: l.color + "18", color: l.color, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>⭐ Opinar en {l.nombre}</a>;
          })}
        </div>
        <button onClick={borrarPruebas} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #C1440E66", background: "#C1440E18", color: "#E0714A", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑️ Borrar todo lo de prueba</button>
        {msgPrueba && <span style={{ fontSize: 11.5, color: "#4C9A5A", marginLeft: 10 }}>{msgPrueba}</span>}
      </div>

      <PanelCanje local="Oficina" usuario="Administración" onCanje={function () { cargarCupones(); cargarMiembros(); }} />
      {cupones.filter(function (c) { return !c.prueba; }).length > 0 && (function () {
        var cr = cupones.filter(function (c) { return !c.prueba; });
        var emit = cr.length, us = cr.filter(function (c) { return c.estado === "usado"; }).length, ven = cr.filter(function (c) { return estadoCupon(c) === "vencido"; }).length;
        return <div style={{ ...tarjeta, fontSize: 12, color: "#C8C8C8", lineHeight: 1.7 }}>🎟️ Cupones: <b>{emit}</b> emitidos · <b style={{ color: "#4C9A5A" }}>{us}</b> canjeados ({Math.round(us / emit * 100)}%) · <b>{ven}</b> vencidos sin usar · <b>{emit - us - ven}</b> vigentes</div>;
      })()}

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>📣 Novedades para los miembros</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 10 }}>Lo que publiques acá lo ven los clientes al entrar a «Grupo Nkt»: promociones, platos nuevos, eventos, cambios de horario.</div>
        <input value={formNov.titulo} onChange={function (e) { var v = e.target.value; setFormNov(function (f) { return { ...f, titulo: v }; }); }} maxLength={80} placeholder="Título (ej: Noche de pizzas 2x1)" style={sel} />
        <textarea value={formNov.texto} onChange={function (e) { var v = e.target.value; setFormNov(function (f) { return { ...f, texto: v }; }); }} rows={3} placeholder="Texto de la novedad" style={{ ...sel, resize: "vertical" }} />
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, color: "#8C8C8C", marginBottom: 3 }}>📷 Foto (opcional): se achica sola antes de subirla</div>
          <input type="file" accept="image/*" onChange={function (e) { elegirFotoNov(e.target.files && e.target.files[0]); e.target.value = ""; }} style={{ ...sel, padding: "6px" }} />
          {fotoNov && <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
            <img src={fotoNov.vista} alt="vista previa" style={{ height: 70, borderRadius: 8, border: "1px solid #2A2A2A" }} />
            <span style={{ fontSize: 11.5, color: "#8FD19A" }}>Lista · {fotoNov.kb} KB</span>
            <button onClick={function () { setFotoNov(null); }} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #333", background: "none", color: "#C8C8C8", fontSize: 11, cursor: "pointer" }}>Quitar</button>
          </div>}
        </div>
        <input value={formNov.video} onChange={function (e) { var v = e.target.value; setFormNov(function (f) { return { ...f, video: v }; }); }} placeholder="🎬 Enlace de un video (YouTube, Instagram, TikTok, Drive…) — opcional" style={sel} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ flex: "1 1 140px" }}><div style={{ fontSize: 10.5, color: "#8C8C8C", marginBottom: 3 }}>Para</div>
            <select value={formNov.local} onChange={function (e) { var v = e.target.value; setFormNov(function (f) { return { ...f, local: v }; }); }} style={sel}>
              <option value="todos">Todos los locales</option>
              {LOCALES_GRUPO.map(function (l) { return <option key={l.id} value={l.id}>{l.nombre}</option>; })}
            </select></div>
          <div style={{ flex: "1 1 140px" }}><div style={{ fontSize: 10.5, color: "#8C8C8C", marginBottom: 3 }}>Se muestra hasta (opcional)</div>
            <input type="date" value={formNov.hasta} onChange={function (e) { var v = e.target.value; setFormNov(function (f) { return { ...f, hasta: v }; }); }} style={sel} /></div>
        </div>
        <button onClick={publicarNovedad} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Publicar novedad</button>
        {msgNov && <span style={{ fontSize: 12, color: "#8FD19A", marginLeft: 10 }}>{msgNov}</span>}
        {novAdm.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {novAdm.map(function (n) {
              var l = LOCALES_GRUPO.find(function (x) { return x.id === n.local; });
              var vis = novedadVisible(n);
              return (
                <div key={n.id} style={{ padding: "7px 0", borderTop: "1px solid #161616", fontSize: 12.5, opacity: vis ? 1 : 0.55 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <div><b>{n.titulo}</b>{n.foto_url ? " 📷" : ""}{n.video ? " 🎬" : ""} <span style={{ fontSize: 10.5, color: l ? l.color : "#7E7E7E" }}>· {l ? l.nombre : "todos"}{n.hasta ? " · hasta " + n.hasta.split("-").reverse().join("/") : ""}{!vis ? " · oculta" : ""}</span></div>
                    <div style={{ display: "flex", gap: 8, whiteSpace: "nowrap" }}>
                      <button onClick={function () { abrirEnvio(n); }} style={{ background: "none", border: "none", color: "#25D366", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>📲 Mandar por WhatsApp{n.enviados && Object.keys(n.enviados).length > 0 ? " (" + Object.keys(n.enviados).length + ")" : ""}</button>
                      <button onClick={function () { ocultarNovedad(n, n.activa === false); }} style={{ background: "none", border: "none", color: "#D4A017", fontSize: 11.5, cursor: "pointer", padding: 0 }}>{n.activa === false ? "Mostrar" : "Ocultar"}</button>
                      <button onClick={function () { borrarNovedad(n); }} title="Borrar" style={{ background: "none", border: "none", color: "#6E6E6E", cursor: "pointer", fontSize: 12, padding: 0 }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#9A9A9A", marginTop: 2, whiteSpace: "pre-wrap" }}>{n.texto}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {envNov && (function () {
        var dest = reales.filter(function (m) { return envLocal === "todos" || m.fav === envLocal; });
        var env = envNov.enviados || {};
        var hechos = dest.filter(function (m) { return env[m.wsp]; }).length;
        var pendientes = dest.filter(function (m) { return !env[m.wsp]; });
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
            <div style={{ background: "#0F0F0F", border: "1px solid #25D36666", borderRadius: 14, padding: "14px 16px", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#25D366" }}>📲 Mandar por WhatsApp · {envNov.titulo}</div>
                <button onClick={function () { setEnvNov(null); }} style={{ background: "none", border: "none", color: "#9A9A9A", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.5, margin: "6px 0 8px" }}>Tocá «Enviar» al lado de cada persona: se abre su chat de WhatsApp con el mensaje ya escrito y solo tenés que mandarlo. Queda marcado quién ya lo recibió.</div>
              <textarea value={envMsg} onChange={function (e) { setEnvMsg(e.target.value); }} rows={6} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12.5, resize: "vertical" }} />
              <div style={{ fontSize: 10.5, color: "#7E7E7E", marginBottom: 8 }}>«{"{nombre}"}» se reemplaza por el nombre de cada persona.</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {[{ id: "todos", txt: "Todos" }].concat(LOCALES_GRUPO.map(function (l) { return { id: l.id, txt: l.nombre }; })).map(function (t) {
                  var act = envLocal === t.id;
                  return <button key={t.id} onClick={function () { setEnvLocal(t.id); }} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid " + (act ? "#25D366" : "#2A2A2A"), background: act ? "#25D36622" : "none", color: act ? "#25D366" : "#9A9A9A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t.txt}</button>;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: "#C8C8C8" }}><b>{hechos}</b> de <b>{dest.length}</b> ya la recibieron</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {pendientes.length > 0 && <button onClick={function () { enviarA(pendientes[0]); }} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#25D366", color: "#000", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Enviar al siguiente ({pendientes[0].nombre})</button>}
                  {hechos > 0 && <button onClick={reiniciarEnvio} style={{ background: "none", border: "none", color: "#8C8C8C", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>Reiniciar</button>}
                </div>
              </div>
              {dest.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "8px 0" }}>No hay miembros para esta selección.</div>}
              {dest.map(function (m) {
                var ya = env[m.wsp];
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #1A1A1A", fontSize: 12.5 }}>
                    <div style={{ minWidth: 0 }}><b>{nombreCompleto(m)}</b>{ya ? <span style={{ color: "#4C9A5A", fontSize: 11 }}> · ✅ enviado {new Date(ya).toLocaleDateString("es-AR")}</span> : null}<div style={{ fontSize: 10.5, color: "#7E7E7E" }}>{m.wsp}</div></div>
                    <button onClick={function () { enviarA(m); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + (ya ? "#2A2A2A" : "#25D366"), background: ya ? "none" : "#25D36622", color: ya ? "#8C8C8C" : "#25D366", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>{ya ? "Reenviar" : "Enviar"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>⚙️ Valor de los cupones</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 10 }}>El cupón se usa en cualquiera de los 3 locales, y el descuento es el del local donde se canjea: lo que pongas acá vale para todos los cupones, los que ya están emitidos y los nuevos.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Descuento general (%)</div>
            <input value={cfg.cuponPct} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { return { ...c, cuponPct: Math.min(v, 100) }; }); }} inputMode="numeric" style={sel} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Días de validez</div>
            <input value={cfg.cuponDias} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { return { ...c, cuponDias: v }; }); }} inputMode="numeric" style={sel} /></div>
        </div>
        <div style={{ fontSize: 11, color: "#8C8C8C", margin: "4px 0" }}>Descuento al canjear en cada local (vacío = el general)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {LOCALES_GRUPO.map(function (l) {
            return (
              <div key={l.id} style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10.5, color: l.color, fontWeight: 700, marginBottom: 3 }}>{l.nombre}</div>
                <input value={(cfg.cuponPctLocal || {})[l.id] || ""} placeholder={String(cfg.cuponPct)} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { var o = { ...(c.cuponPctLocal || {}) }; if (v > 0) o[l.id] = Math.min(v, 100); else delete o[l.id]; return { ...c, cuponPctLocal: o }; }); }} inputMode="numeric" style={sel} />
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "#8C8C8C", margin: "6px 0 2px" }}>🎁 Beneficio especial en cada local (opcional): reemplaza al porcentaje en ese local. Ej: «2x1 en pizzas», «1 vino de regalo»</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {LOCALES_GRUPO.map(function (l) {
            return (
              <div key={l.id} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 10.5, color: l.color, fontWeight: 700, marginBottom: 3 }}>{l.nombre}</div>
                <input value={(cfg.cuponBenefLocal || {})[l.id] || ""} maxLength={60} placeholder="Vacío = solo el descuento" onChange={function (e) { var v = e.target.value; setCfg(function (c) { var o = { ...(c.cuponBenefLocal || {}) }; if (v.trim()) o[l.id] = v; else delete o[l.id]; return { ...c, cuponBenefLocal: o }; }); }} style={sel} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={guardarValores} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Guardar valores</button>
        </div>
        {msgCup && <div style={{ fontSize: 12, color: "#8FD19A", marginTop: 8 }}>{msgCup}</div>}
      </div>

      {(function () {
        var todos = cupones.filter(esDeMiembro).sort(function (a, b) { return String(b.creado || "").localeCompare(String(a.creado || "")); });
        var est = function (c) { var e = estadoCupon(c); return e === "activo" ? "vigentes" : e === "usado" ? "usados" : "vencidos"; };
        var cuenta = { todos: todos.length, vigentes: 0, usados: 0, vencidos: 0 };
        todos.forEach(function (c) { cuenta[est(c)]++; });
        var lista = todos.filter(function (c) { return filtroCup === "todos" || est(c) === filtroCup; });
        return (
          <div style={tarjeta}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: verCup ? 8 : 0 }}>
              <div onClick={function () { setVerCup(!verCup); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#D4A017" }}>{verCup ? "▾ " : "▸ "}🎟️ Cupones otorgados · {todos.length}<span style={{ fontWeight: 600, color: "#6E6E6E", fontSize: 11.5 }}> · {verCup ? "ocultar" : "ver"}</span></div>
              {verCup && <div style={{ display: "flex", gap: 6 }}>
                <button onClick={cargarCupones} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 11.5, cursor: "pointer" }}>↻ Actualizar</button>
                {todos.length > 0 && <button onClick={csvCupones} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 11.5, cursor: "pointer" }}>⬇️ Excel</button>}
              </div>}
            </div>
            {verCup && (<div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {[["todos", "Todos"], ["vigentes", "Vigentes"], ["usados", "Usados"], ["vencidos", "Vencidos"]].map(function (t) {
                var act = filtroCup === t[0];
                return <button key={t[0]} onClick={function () { setFiltroCup(t[0]); }} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid " + (act ? "#D4A017" : "#2A2A2A"), background: act ? "#D4A01722" : "#111", color: act ? "#D4A017" : "#8C8C8C", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t[1]} · {cuenta[t[0]]}</button>;
              })}
            </div>
            {lista.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "6px 0" }}>No hay cupones en esta vista.</div>}
            {lista.slice(0, 100).map(function (c) {
              var e = estadoCupon(c), col = e === "activo" ? "#4C9A5A" : e === "usado" ? "#8C8C8C" : "#E0714A";
              var primer = String(c.nombre || "").split(" ")[0];
              var txt = "Hola " + primer + "! Te recordamos que tenés un cupón de Grupo Nkt de " + fraseDescuento(cfg) + " (" + c.codigo + "), válido hasta el " + new Date(c.vence).toLocaleDateString("es-AR") + " en cualquiera de nuestros locales. Tu portal con novedades, delivery y reservas: " + urlGrupo() + " ¡Te esperamos!";
              return (
                <div key={c.codigo} style={{ padding: "7px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div><b>{c.nombre}</b>{empleadoDeWsp(c.wsp, c.nombre) ? <span style={{ color: "#FF8A5C", fontSize: 10.5, fontWeight: 700 }}> 👷 empleado/a</span> : null} <a href={linkWsp(c.wsp)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", fontSize: 11.5 }}>💬 {c.wsp}</a></div>
                    <span style={{ color: col, fontWeight: 800, fontSize: 11.5 }}>{e === "activo" ? "VIGENTE" : e === "usado" ? "USADO" : "VENCIDO"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>🎟️ <b style={{ color: "#C8C8C8" }}>{c.codigo}</b> · cupón {ordenCupon(c)} de {resumenCup(c.wsp).total} del cliente · {pctTexto(c)} · emitido {c.creado ? new Date(c.creado).toLocaleDateString("es-AR") : "—"} · vence {c.vence ? new Date(c.vence).toLocaleDateString("es-AR") : "—"}</div>
                  {c.usado_at && <div style={{ fontSize: 11, color: "#8C8C8C", marginTop: 1 }}>✅ Canjeado el {new Date(c.usado_at).toLocaleString("es-AR")}{c.usado_local ? " en " + c.usado_local : ""}{c.usado_por ? " · por " + c.usado_por : ""}</div>}
                  {e === "activo" && <button onClick={function () { cambiarPctCupon(c); }} style={{ background: "none", border: "none", color: "#D4A017", fontSize: 11.5, cursor: "pointer", marginRight: 12, padding: 0, marginTop: 4 }}>✏️ Cambiar descuento</button>}
                  {e === "activo" && <a href={linkWsp(c.wsp, txt)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 4, fontSize: 11.5, color: "#4C9A5A", textDecoration: "none" }}>💬 Recordarle que lo use</a>}
                </div>
              );
            })}
            {lista.length > 100 && <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 6 }}>Se muestran los últimos 100. Bajá el Excel para verlos a todos.</div>}
            </div>)}
          </div>
        );
      })()}

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 6 }}>✅ Cupones canjeados · {canjeados.length}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {[["local", "Por local"], ["cliente", "Por cliente"]].map(function (t) {
            var act = vistaCanje === t[0];
            return <button key={t[0]} onClick={function () { setVistaCanje(t[0]); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + (act ? "#D4A017" : "#2A2A2A"), background: act ? "#D4A01722" : "none", color: act ? "#D4A017" : "#9A9A9A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t[1]}</button>;
          })}
        </div>
        {canjeados.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Todavía no se canjeó ningún cupón.</div>}
        {porLocalCanje.map(function (gr) {
          return (
            <div key={gr.k} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#F0EDE8", borderBottom: "1px solid #2A2A2A", paddingBottom: 3 }}>{vistaCanje === "local" ? "📍 " : "👤 "}{gr.k} · <span style={{ color: "#D4A017" }}>{gr.lista.length} {gr.lista.length === 1 ? "cupón" : "cupones"}</span></div>
              {gr.lista.map(function (c) {
                return <div key={c.codigo} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "5px 0", borderBottom: "1px solid #141414", fontSize: 12 }}>
                  <span style={{ color: "#C8C8C8" }}>{vistaCanje === "local" ? c.nombre : (c.usado_local || "—")}{empleadoDeWsp(c.wsp, c.nombre) ? <span style={{ color: "#FF8A5C", fontWeight: 700 }}> 👷</span> : null}</span>
                  <span style={{ color: "#8C8C8C" }}>{c.usado_at ? new Date(c.usado_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} · {c.codigo} · {c.beneficio || c.pct + "%"}{c.usado_por ? " · por " + c.usado_por : ""}</span>
                </div>;
              })}
            </div>
          );
        })}
        {canjeados.length > 0 && <button onClick={csvCanjeados} style={{ marginTop: 12, padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, cursor: "pointer" }}>⬇️ Bajar canjeados (Excel)</button>}
      </div>

      <div style={tarjeta}>
        <div onClick={function () { setVerSoc(!verSoc); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, marginBottom: verSoc ? 6 : 0 }}>{verSoc ? "▾ " : "▸ "}👥 La comunidad · {miembros === null ? "…" : reales.length + " miembro" + (reales.length === 1 ? "" : "s")}{pruebas.length > 0 ? " (+ " + pruebas.length + " de prueba)" : ""}<span style={{ fontWeight: 600, color: "#6E6E6E", fontSize: 11.5 }}> · {verSoc ? "ocultar" : "ver"}</span></div>
        {verSoc && (<div>
        {miembros && miembros.length > 0 && <div style={{ fontSize: 11.5, color: "#9A9A9A", marginBottom: 8 }}>{conCumple} dejaron su cumpleaños.{cumples.length > 0 ? " 🎂 Hoy cumple: " + cumples.map(function (m) { return m.nombre; }).join(", ") + "." : ""}</div>}
        {miembros && miembros.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Todavía no se sumó nadie.</div>}
        {miembros && miembros.length > 0 && (
          <div>
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ color: "#8C8C8C", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Local</th><th style={{ padding: "4px 6px", fontWeight: 600 }}>Miembros</th><th style={{ padding: "4px 6px", fontWeight: 600 }}>Cupones</th><th style={{ padding: "4px 6px", fontWeight: 600 }}>Canjeados</th><th style={{ padding: "4px 6px", fontWeight: 600 }}>Vencidos</th><th style={{ padding: "4px 6px", fontWeight: 600 }}>Vigentes</th>
                </tr></thead>
                <tbody>
                  {filasResumen.map(function (f) { return <tr key={f.id || "sin"} style={{ borderTop: "1px solid #1E1E1E", textAlign: "right", color: "#C8C8C8" }}>
                    <td style={{ textAlign: "left", padding: "5px 6px", color: "#F0EDE8" }}>{f.txt}</td><td style={{ padding: "5px 6px", fontWeight: 700 }}>{f.s.miembros}</td><td style={{ padding: "5px 6px" }}>{f.s.total}</td><td style={{ padding: "5px 6px", color: "#4C9A5A", fontWeight: 700 }}>{f.s.usados}</td><td style={{ padding: "5px 6px", color: "#E0714A" }}>{f.s.vencidos}</td><td style={{ padding: "5px 6px" }}>{f.s.vigentes}</td>
                  </tr>; })}
                  <tr style={{ borderTop: "2px solid #2A2A2A", textAlign: "right", color: "#F0EDE8", fontWeight: 800 }}>
                    <td style={{ textAlign: "left", padding: "5px 6px" }}>Total</td><td style={{ padding: "5px 6px" }}>{totalResumen.miembros}</td><td style={{ padding: "5px 6px" }}>{totalResumen.total}</td><td style={{ padding: "5px 6px", color: "#4C9A5A" }}>{totalResumen.usados}</td><td style={{ padding: "5px 6px", color: "#E0714A" }}>{totalResumen.vencidos}</td><td style={{ padding: "5px 6px" }}>{totalResumen.vigentes}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {[{ id: "todos", txt: "Todos · " + reales.length }].concat(porLocalCom.map(function (x) { return { id: x.l.id, txt: x.l.emoji + " " + x.l.nombre + " · " + x.n }; })).map(function (t) {
                var act = filtroCom === t.id;
                return <button key={t.id} onClick={function () { setFiltroCom(t.id); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + (act ? "#D4A017" : "#2A2A2A"), background: act ? "#D4A01722" : "none", color: act ? "#D4A017" : "#9A9A9A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t.txt}</button>;
              })}
            </div>
            {(function () {
              var con = reales.filter(function (m) { return estadoApp(m) === "app"; }).length, toco = reales.filter(function (m) { return estadoApp(m) === "toco"; }).length;
              return (
                <div style={{ background: "#0B1410", border: "1px solid #3A7D4455", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#F0EDE8" }}>📲 App instalada: <span style={{ color: "#4C9A5A" }}>{con}</span> de {reales.length} miembros{reales.length ? " (" + Math.round(con / reales.length * 100) + "%)" : ""}</div>
                  <div style={{ fontSize: 11, color: "#8FA89A", margin: "3px 0 7px", lineHeight: 1.5 }}>Cuenta a quien abrió el portal desde el ícono de la app en su celular (o cuyo navegador avisó la instalación). {toco > 0 ? toco + " tocó «Descargar» pero todavía no la abrió como app. " : ""}Un cliente que la instaló pero no volvió a abrirla, o que borró los datos del navegador, figura como «sin app».</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[["todos", "Todos"], ["con", "📲 Con app"], ["sin", "Sin app"]].map(function (t) {
                      var act = filtroApp === t[0];
                      return <button key={t[0]} onClick={function () { setFiltroApp(t[0]); }} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid " + (act ? "#4C9A5A" : "#2A2A2A"), background: act ? "#4C9A5A22" : "none", color: act ? "#4C9A5A" : "#9A9A9A", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t[1]}</button>;
                    })}
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: 11, color: "#7E7E7E", marginBottom: 6 }}>Ordenados por fecha de entrada: el último que se sumó, primero.</div>
            <button onClick={csv} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>⬇️ Bajar la lista (Excel)</button>
            {ordenadosVista.slice(0, 100).map(function (m) {
              var l = LOCALES_GRUPO.find(function (x) { return x.id === m.fav; });
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{nombreCompleto(m)}</b>{m.prueba ? <span style={{ color: "#E0914A", fontSize: 10.5 }}> 🧪 prueba</span> : null}{empleadoDeWsp(m.wsp, nombreCompleto(m)) ? <span style={{ color: "#FF8A5C", fontSize: 10.5, fontWeight: 700 }}> 👷 empleado/a</span> : null} <a href={linkWsp(m.wsp)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", fontSize: 11.5 }}>💬 {m.wsp}</a>{m.fecha ? <span style={{ color: "#7E7E7E", fontSize: 11 }}> · entró el {new Date(m.fecha).toLocaleDateString("es-AR")}</span> : null}
                    {m.cupon && (function () {
                      var cp = cupones.find(function (x) { return x.codigo === m.cupon; });
                      var est = cp ? estadoCupon(cp) : "";
                      var txt = "Hola " + m.nombre + "! Este es tu cupón de Grupo Nkt: " + m.cupon + (cp ? " (" + fraseDescuento(cfg) + ", válido hasta el " + new Date(cp.vence).toLocaleDateString("es-AR") + "). Es válido en cualquiera de los 3 locales (El Bodegón, Kusama y Colantonio's): mostralo en caja. Entrá a tu portal con novedades, delivery y reservas: " + urlGrupo() : ".");
                      var rc = resumenCup(m.wsp);
                      return <div style={{ fontSize: 11, color: "#C8C8C8", marginTop: 2 }}>🎟️ {m.cupon}{est ? " · " + (est === "activo" ? "vigente" : est === "usado" ? "usado" : "vencido") : ""} · <b style={{ color: "#D4A017" }}>{rc.total} {rc.total === 1 ? "cupón" : "cupones"} · {rc.usados} canjeado{rc.usados === 1 ? "" : "s"} · {rc.vencidos} vencido{rc.vencidos === 1 ? "" : "s"}</b> <a href={linkWsp(m.wsp, txt)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", marginLeft: 6 }}>💬 Enviarle su cupón</a></div>;
                    })()}
                    {(function () {
                      var e = estadoApp(m), a = apps[m.wsp] || {};
                      if (e === "app") return <div style={{ fontSize: 11, color: "#4C9A5A", marginTop: 2 }}>📲 App instalada{a.plataforma ? " (" + a.plataforma + ")" : ""}{a.usos ? " · la abrió " + a.usos + " vez" + (a.usos === 1 ? "" : "es") : ""}{a.ultima_app_at ? " · última: " + new Date(a.ultima_app_at).toLocaleDateString("es-AR") : ""}</div>;
                      if (e === "toco") return <div style={{ fontSize: 11, color: "#D4A017", marginTop: 2 }}>🟡 Tocó «Descargar la app» el {new Date(a.toco_at).toLocaleDateString("es-AR")}, pero no la abrió como app</div>;
                      return <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 2 }}>— Sin app registrada</div>;
                    })()}
                    <div style={{ fontSize: 10.5, color: "#6E6E6E" }}>{m.dia && m.mes ? "🎂 " + m.dia + " " + mesNombre(m.mes) + " · " : ""}{l ? l.nombre + " · " : ""}{m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : ""}</div>
                  </div>
                  <button onClick={function () { quitar(m); }} title="Sacar de la lista" style={{ background: "none", border: "none", color: "#6E6E6E", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                </div>
              );
            })}
            {miembros.length > 100 && <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 6 }}>Se muestran los últimos 100. Bajá la lista para verlos a todos.</div>}
          </div>
        )}
        </div>)}
      </div>

      <div style={tarjeta}>
        <div onClick={function () { setVerDatos(!verDatos); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{verDatos ? "▾" : "▸"} ✏️ Datos que se muestran en la página</div>
        {verDatos && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Frase de presentación</div>
            <input value={cfg.frase} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, frase: v }; }); }} placeholder="Tus lugares en Punta Alta" style={sel} />
            <div style={{ fontSize: 11, color: "#8C8C8C", margin: "6px 0 4px" }}>Invitación que ve quien termina de opinar (qué se lleva si se suma)</div>
            <input value={cfg.gancho} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, gancho: v }; }); }} placeholder="Sumate y participá de los sorteos y beneficios del grupo." style={sel} />
            <div style={{ fontSize: 11, color: "#8C8C8C", margin: "6px 0 4px" }}>WhatsApp de administración (el botón «Sumá tu comercio» de la página abre este chat)</div>
            <input value={cfg.wspAdmin || ""} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, wspAdmin: v }; }); }} inputMode="tel" placeholder="Ej: 2914123456 (si queda vacío, se usa el del Bodegón)" style={sel} />
            <div style={{ margin: "12px 0 6px", padding: "10px 12px", border: "1px solid " + (cfg.ticketsActivo ? "#3A7D4488" : "#2A2A2A"), borderRadius: 10, background: cfg.ticketsActivo ? "#3A7D4414" : "#0E0E0E" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                <input type="checkbox" checked={!!cfg.ticketsActivo} onChange={function (e) { var v = e.target.checked; setCfg(function (c) { return { ...c, ticketsActivo: v }; }); }} />
                🎟️ Tickets del sorteo {cfg.ticketsActivo ? "· ENCENDIDO" : "· apagado"}
              </label>
              <div style={{ fontSize: 11, color: "#8C8C8C", lineHeight: 1.45, margin: "4px 0 6px" }}>Cuando está encendido, los socios ven «Tus tickets» en su pantalla de la comunidad. Dejalo apagado hasta tener el visto bueno del abogado. Acordate de tocar Guardar.</div>
              <div style={{ fontSize: 11, color: "#8C8C8C", lineHeight: 1.45 }}>Los premios (puede haber varios a la vez, de un local del grupo o de un comercio amigo) se cargan y se sortean más abajo, en <b style={{ color: "#C8C8C8" }}>🎟️ Sorteos y premios</b>.</div>
            </div>
            <div style={{ fontSize: 11, color: "#8C8C8C", margin: "6px 0 4px" }}>Mensaje al sumarse (ej: un beneficio de bienvenida)</div>
            <input value={cfg.bienvenida} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, bienvenida: v }; }); }} placeholder="Mostrá este mensaje en caja y te regalamos un café." style={sel} />
            {LOCALES_GRUPO.map(function (l) {
              var d = cfg.locales[l.id] || {};
              return (
                <div key={l.id} style={{ borderTop: "1px solid #1A1A1A", marginTop: 10, paddingTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: l.color, marginBottom: 6 }}>{l.nombre}</div>
                  <input value={d.direccion || ""} onChange={function (e) { setLocal(l.id, "direccion", e.target.value); }} placeholder="Dirección (calle y número)" style={sel} />
                  <textarea value={d.aviso || ""} onChange={function (e) { setLocal(l.id, "aviso", e.target.value); }} rows={2} placeholder={"Aviso destacado arriba de la tarjeta (opcional). Ej: Kusama se muda al Bodegón desde el 1 de diciembre"} style={{ ...sel, resize: "vertical" }} />
                  {d.aviso && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 11, color: "#8C8C8C" }}>Mostrar hasta</span><input type="date" value={d.aviso_hasta || ""} onChange={function (e) { setLocal(l.id, "aviso_hasta", e.target.value); }} style={{ ...sel, width: "auto", marginBottom: 0 }} /><span style={{ fontSize: 11, color: "#6E6E6E" }}>(vacío: hasta que lo borres)</span></div>}
                  <input value={d.wsp || ""} onChange={function (e) { setLocal(l.id, "wsp", e.target.value); }} placeholder="WhatsApp para pedidos (ej: 2914123456)" style={sel} />
                  <textarea value={d.horarios || ""} onChange={function (e) { setLocal(l.id, "horarios", e.target.value); }} rows={2} placeholder={"Horarios (ej: Mar a Dom de 20 a 00 h)"} style={{ ...sel, resize: "vertical" }} />
                  <input value={d.carta || ""} onChange={function (e) { setLocal(l.id, "carta", e.target.value); }} placeholder="Enlace de la carta (opcional)" style={sel} />
                  <input value={d.instagram || ""} onChange={function (e) { setLocal(l.id, "instagram", e.target.value); }} placeholder="Enlace de Instagram (opcional)" style={sel} />
                  <input value={d.demora || ""} onChange={function (e) { setLocal(l.id, "demora", e.target.value); }} placeholder="Demora aproximada del delivery (ej: 40 a 50 min). Se muestra al cliente" style={sel} />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#C8C8C8", marginTop: 4, cursor: "pointer" }}><input type="checkbox" checked={d.delivery === true} onChange={function (e) { setLocal(l.id, "delivery", e.target.checked); }} />🛵 Recibir pedidos de delivery por la comunidad (los clientes ven la carta y piden)</label>
                </div>
              );
            })}
            <button onClick={guardar} style={{ marginTop: 10, padding: "9px 16px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
            {msg && <span style={{ fontSize: 12, color: "#4C9A5A", marginLeft: 10 }}>{msg}</span>}
          </div>
        )}
      </div>

      <PanelSorteo tarjeta={tarjeta} socios={reales} />
      <PanelReclamos tarjeta={tarjeta} />
      <PanelComerciosRed tarjeta={tarjeta} socios={reales.length} />
    </div>
  );
}
