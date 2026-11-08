// Grupo Nkt para el público: la página que se abre con el QR (sin usuario ni clave) y el panel donde se arma y se ve la comunidad.
//  · <GrupoNkt/>        la página pública: quiénes somos, los locales, pedir por WhatsApp, opinar y sumarse a la comunidad.
//  · <PanelComunidad/>  para administración: datos de cada local, el enlace con su QR y la lista de miembros.
import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { SURL, SH } from "./comun.js";

var URL_PUBLICA = "https://ordenes-compra-nkt.vercel.app";
var LOCALES_GRUPO = [
  { id: "l1", nombre: "El Bodegón Nkt", color: "#C1440E", logo: "/logos/bodegon.png", alto: 34, desc: "Cocina de bodegón, buena mesa y buena compañía." },
  { id: "l2", nombre: "Kusama", color: "#8B2FC9", logo: "/logos/kusama.png", alto: 64, desc: "Sushi en Punta Alta." },
  { id: "l3", nombre: "Colantonio's", color: "#1A6B8A", logo: "/logos/colantonio.png", alto: 64, desc: "Pizza napolitana." },
];
var CONFIG_VACIA = { frase: "", bienvenida: "", gancho: "", cuponPct: 10, cuponDias: 30, locales: {} };

export function urlGrupo() { return URL_PUBLICA + "/?grupo"; }
function soloDigitos(s) { return String(s || "").replace(/\D/g, ""); }
function linkWsp(w, texto) {
  var n = soloDigitos(w); if (!n) return "";
  return "https://wa.me/" + (n.length <= 10 ? "54" + n : n) + (texto ? "?text=" + encodeURIComponent(texto) : "");
}

export async function cargarConfigGrupo() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq.grupo_config&limit=1", { headers: SH });
    var d = await r.json();
    var x = Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
    return { frase: (x && x.frase) || "", bienvenida: (x && x.bienvenida) || "", gancho: (x && x.gancho) || "", cuponPct: (x && x.cuponPct) || 10, cuponDias: (x && x.cuponDias) || 30, locales: (x && x.locales) || {} };
  } catch (e) { return CONFIG_VACIA; }
}
async function guardarFila(id, ambito, obj) {
  var ahora = new Date().toISOString();
  var r = await fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: id, ambito: ambito, texto: JSON.stringify(obj), usuario: "comunidad", created_at: ahora, updated_at: ahora }) });
  return r.ok;
}

// ─── CUPONES ─────────────────────────────────────────────────────────────────
// Un cupón por persona (por su WhatsApp): código único, vencimiento y un solo canje. Se guarda en pautas con id "cupon_<CÓDIGO>".
var LETRAS_CUPON = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function codigoNuevo() { var c = "NKT-"; for (var i = 0; i < 4; i++) c += LETRAS_CUPON[Math.floor(Math.random() * LETRAS_CUPON.length)]; return c; }
function normCodigo(s) { var t = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (t.indexOf("NKT") === 0) t = t.slice(3); return t.length ? "NKT-" + t : ""; }
async function leerPauta(id) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id) + "&limit=1", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
  } catch (e) { return null; }
}
function estadoCupon(c) {
  if (!c) return "no existe";
  if (c.estado === "usado") return "usado";
  if (c.vence && new Date(c.vence).getTime() < Date.now()) return "vencido";
  return "activo";
}
// Crea el cupón de quien se suma (o devuelve el que ya tenía) y lo asocia a su ficha de la comunidad.
async function emitirCupon(socio, cfg) {
  var w = socio.wsp, previo = await leerPauta("com_" + w);
  if (previo && previo.cupon) { var existente = await leerPauta("cupon_" + previo.cupon); if (existente) return existente; }
  var codigo = "";
  for (var i = 0; i < 8; i++) { var c = codigoNuevo(); if (!(await leerPauta("cupon_" + c))) { codigo = c; break; } }
  if (!codigo) return null;
  var ahora = new Date();
  var cupon = { codigo: codigo, wsp: w, nombre: socio.nombre, pct: cfg.cuponPct || 10, creado: ahora.toISOString(), vence: new Date(ahora.getTime() + (cfg.cuponDias || 30) * 86400000).toISOString(), estado: "activo" };
  if (!(await guardarFila("cupon_" + codigo, "cupon", cupon))) return null;
  await guardarFila("com_" + w, "comunidad", { ...socio, cupon: codigo });
  return cupon;
}

function TarjetaCupon(props) {
  var c = props.cupon, est = estadoCupon(c);
  var col = est === "activo" ? "#4C9A5A" : "#8C8C8C";
  return (
    <div style={{ background: "#0F1A10", border: "2px dashed " + col, borderRadius: 14, padding: "14px", marginTop: 14, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: 1.5 }}>Tu cupón de descuento</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 800, color: col, margin: "4px 0" }}>{c.pct}% OFF</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "#F0EDE8" }}>{c.codigo}</div>
      <div style={{ fontSize: 12, color: "#B8B8B8", lineHeight: 1.6, marginTop: 8 }}>
        {est === "activo" && <span>Mostralo en caja en El Bodegón, Kusama o Colantonio's. Válido hasta el {new Date(c.vence).toLocaleDateString("es-AR")}. Se usa una sola vez.</span>}
        {est === "usado" && <span>✅ Este cupón ya fue usado.</span>}
        {est === "vencido" && <span>⌛ Este cupón venció el {new Date(c.vence).toLocaleDateString("es-AR")}.</span>}
      </div>
    </div>
  );
}

// ─── PÁGINA PÚBLICA ──────────────────────────────────────────────────────────
export function GrupoNkt() {
  var [cfg, setCfg] = useState(CONFIG_VACIA);
  var [nombre, setNombre] = useState("");
  var [wsp, setWsp] = useState("");
  var [dia, setDia] = useState("");
  var [mes, setMes] = useState("");
  var [fav, setFav] = useState("");
  var [acepta, setAcepta] = useState(false);
  var [enviando, setEnviando] = useState(false);
  var [error, setError] = useState("");
  var [hecho, setHecho] = useState(function () { try { return localStorage.getItem("nkt_comunidad") ? "ya" : ""; } catch (e) { return ""; } });
  var [instalar, setInstalar] = useState(null);
  var [cupon, setCupon] = useState(null);

  useEffect(function () {
    document.title = "GrupoNkt";
    cargarConfigGrupo().then(setCfg);
    var cg = ""; try { cg = localStorage.getItem("nkt_cupon") || ""; } catch (e) {}
    if (cg) leerPauta("cupon_" + cg).then(function (c) { if (c) setCupon(c); });
    function antes(e) { e.preventDefault(); setInstalar(e); }
    window.addEventListener("beforeinstallprompt", antes);
    return function () { window.removeEventListener("beforeinstallprompt", antes); };
  }, []);

  var fondo = { minHeight: "100vh", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", padding: "22px 16px 50px", boxSizing: "border-box" };
  var caja = { maxWidth: 460, margin: "0 auto" };
  var inp = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 15, marginBottom: 8 };
  var boton = { display: "block", textAlign: "center", padding: "11px 8px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#161616", color: "#F0EDE8", fontSize: 13, fontWeight: 700, textDecoration: "none" };

  function unirse() {
    var w = soloDigitos(wsp);
    if (!nombre.trim() || w.length < 8) { setError("Escribí tu nombre y tu WhatsApp."); return; }
    if (!acepta) { setError("Tildá la casilla para sumarte."); return; }
    setEnviando(true); setError("");
    var socio = { nombre: nombre.trim().slice(0, 60), wsp: w.slice(0, 20), dia: parseInt(dia, 10) || 0, mes: parseInt(mes, 10) || 0, fav: fav, fecha: new Date().toISOString() };
    leerPauta("com_" + w).then(function (previo) {
      // Si ya estaba, se conserva su cupón y su fecha de alta.
      return guardarFila("com_" + w, "comunidad", { ...socio, cupon: previo && previo.cupon ? previo.cupon : undefined, fecha: previo && previo.fecha ? previo.fecha : socio.fecha });
    }).then(function (ok) {
      if (!ok) { setError("No pudimos sumarte. Probá de nuevo."); setEnviando(false); return; }
      try { localStorage.setItem("nkt_comunidad", "1"); } catch (e) {}
      return emitirCupon(socio, cfg).then(function (c) {
        if (c) { setCupon(c); try { localStorage.setItem("nkt_cupon", c.codigo); } catch (e) {} }
        setHecho("ok");
      });
    });
  }

  return (
    <div style={fondo}><div style={caja}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 34, fontWeight: 800, letterSpacing: 0.5 }}>Grupo Nkt</div>
        <div style={{ fontSize: 14, color: "#B8B8B8", marginTop: 6, lineHeight: 1.5 }}>{cfg.frase || "Tres lugares de Punta Alta, una misma comunidad."}</div>
      </div>

      {LOCALES_GRUPO.map(function (l) {
        var d = cfg.locales[l.id] || {};
        var wa = linkWsp(d.wsp, "Hola " + l.nombre + "! Quiero hacer un pedido.");
        return (
          <div key={l.id} style={{ background: "#111", border: "1px solid " + l.color + "55", borderRadius: 16, padding: "16px", marginBottom: 14 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: "8px 14px", display: "inline-block", maxWidth: "100%" }}>
                <img src={l.logo} alt={l.nombre} style={{ display: "block", height: l.alto, maxWidth: "100%", width: "auto", margin: "0 auto" }} />
              </div>
              <div style={{ fontSize: 13.5, color: "#C8C8C8", marginTop: 8 }}>{l.desc}</div>
            </div>
            {(d.direccion || d.horarios) && (
              <div style={{ fontSize: 12.5, color: "#B8B8B8", lineHeight: 1.6, marginTop: 10, textAlign: "center" }}>
                {d.direccion && <div>📍 {d.direccion}</div>}
                {d.horarios && <div style={{ whiteSpace: "pre-wrap" }}>🕒 {d.horarios}</div>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...boton, background: "#1F4D2A", borderColor: "#3A7D44" }}>💬 Pedir por WhatsApp</a>}
              {d.direccion && <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.direccion + " Punta Alta")} target="_blank" rel="noreferrer" style={boton}>📍 Cómo llegar</a>}
              {d.carta && <a href={d.carta} target="_blank" rel="noreferrer" style={boton}>🍽️ Ver la carta</a>}
              {d.instagram && <a href={d.instagram} target="_blank" rel="noreferrer" style={boton}>📸 Instagram</a>}
              <a href={"/?opinar=" + l.id + "&c=salon"} style={boton}>⭐ Dejar mi opinión</a>
            </div>
          </div>
        );
      })}

      <div style={{ background: "#14100A", border: "1px solid #D4A01766", borderRadius: 16, padding: "16px", marginTop: 6 }}>
        {hecho === "ok" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, marginTop: 6 }}>¡Ya sos parte!</div>
            <div style={{ fontSize: 14, color: "#C8C8C8", marginTop: 8, lineHeight: 1.6 }}>{cfg.bienvenida || "Te vamos a avisar de las novedades, los platos nuevos y los beneficios de la comunidad."}</div>
            {cupon && <TarjetaCupon cupon={cupon} />}
          </div>
        ) : hecho === "ya" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#C8C8C8", lineHeight: 1.6 }}>✅ Ya sos parte de la comunidad Grupo Nkt. ¡Gracias por acompañarnos!</div>
            {cupon && <TarjetaCupon cupon={cupon} />}
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 800, color: "#D4A017", textAlign: "center" }}>Sumate a la comunidad</div>
            <div style={{ fontSize: 13, color: "#B8B8B8", lineHeight: 1.55, margin: "6px 0 12px", textAlign: "center" }}>Enterate primero de las novedades, los platos nuevos, los sorteos y los beneficios de Grupo Nkt.</div>
            <input value={nombre} onChange={function (e) { setNombre(e.target.value); }} maxLength={60} placeholder="Tu nombre" style={inp} />
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

      <div style={{ textAlign: "center", marginTop: 18 }}>
        {instalar
          ? <button onClick={function () { instalar.prompt(); }} style={{ ...boton, display: "inline-block", padding: "11px 18px" }}>📲 Agregar Grupo Nkt a mi inicio</button>
          : <div style={{ fontSize: 11.5, color: "#6E6E6E", lineHeight: 1.6 }}>Para tenerla a mano: en el menú del navegador tocá «Agregar a pantalla de inicio».</div>}
      </div>
    </div></div>
  );
}

// ─── CANJE EN CAJA ───────────────────────────────────────────────────────────
export function PanelCanje(props) {
  var [codigo, setCodigo] = useState("");
  var [cupon, setCupon] = useState(null);
  var [msg, setMsg] = useState("");
  var [ocupado, setOcupado] = useState(false);
  function buscar() {
    var c = normCodigo(codigo); if (!c) return;
    setOcupado(true); setMsg(""); setCupon(null);
    leerPauta("cupon_" + c).then(function (x) { setOcupado(false); if (!x) setMsg("No existe un cupón con el código " + c + "."); else setCupon(x); });
  }
  function canjear() {
    if (!cupon || estadoCupon(cupon) !== "activo") return;
    if (!window.confirm("¿Canjear el cupón " + cupon.codigo + " de " + cupon.nombre + " (" + cupon.pct + "% de descuento)? Después no se puede volver a usar.")) return;
    var nuevo = { ...cupon, estado: "usado", usado_at: new Date().toISOString(), usado_local: props.local || "", usado_por: props.usuario || "" };
    // Se vuelve a leer justo antes de guardar, por si otro local lo canjeó recién.
    leerPauta("cupon_" + cupon.codigo).then(function (fresco) {
      if (fresco && fresco.estado === "usado") { setCupon(fresco); setMsg("Ese cupón ya fue canjeado."); return; }
      guardarFila("cupon_" + cupon.codigo, "cupon", nuevo).then(function (ok) { if (ok) { setCupon(nuevo); setMsg("✅ Canjeado. Aplicá el " + cupon.pct + "% de descuento."); } else setMsg("No se pudo guardar el canje. Probá de nuevo."); });
    });
  }
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
          <div style={{ fontSize: 15, fontWeight: 800 }}>{cupon.nombre} · <span style={{ color: col }}>{cupon.pct}% OFF</span></div>
          <div style={{ fontSize: 12, color: "#B8B8B8", marginTop: 4, lineHeight: 1.6 }}>
            Estado: <b style={{ color: col }}>{est === "activo" ? "válido" : est === "usado" ? "ya usado" : "vencido"}</b> · vence el {new Date(cupon.vence).toLocaleDateString("es-AR")}
            {cupon.usado_at && <div>Canjeado el {new Date(cupon.usado_at).toLocaleString("es-AR")}{cupon.usado_local ? " en " + cupon.usado_local : ""}</div>}
          </div>
          {est === "activo" && <button onClick={canjear} style={{ marginTop: 10, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#3A7D44", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Canjear ahora</button>}
        </div>
      )}
    </div>
  );
}

// ─── PANEL DE ADMINISTRACIÓN ─────────────────────────────────────────────────
function mesNombre(m) { return ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m] || ""; }

export function PanelComunidad() {
  var [cfg, setCfg] = useState(CONFIG_VACIA);
  var [miembros, setMiembros] = useState(null);
  var [qr, setQr] = useState("");
  var [msg, setMsg] = useState("");
  var [copiado, setCopiado] = useState(false);
  var [verDatos, setVerDatos] = useState(false);
  var [cupones, setCupones] = useState([]);

  useEffect(function () {
    cargarConfigGrupo().then(setCfg);
    fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setMiembros(Array.isArray(d) ? d.map(function (f) { try { var x = JSON.parse(f.texto); return { id: f.id, ...x }; } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () { setMiembros([]); });
    fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setCupones(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () {});
    QRCode.toDataURL(urlGrupo(), { margin: 1, width: 360, errorCorrectionLevel: "M" }).then(setQr).catch(function () {});
  }, []);

  var sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12, width: "100%", boxSizing: "border-box", marginBottom: 6 };
  var tarjeta = { background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px 16px", marginBottom: 12 };

  function setLocal(id, k, v) { setCfg(function (c) { var l = { ...c.locales }; l[id] = { ...(l[id] || {}), [k]: v }; return { ...c, locales: l }; }); }
  function guardar() {
    guardarFila("grupo_config", "grupo_config", cfg).then(function (ok) { setMsg(ok ? "✓ Guardado" : "No se pudo guardar"); setTimeout(function () { setMsg(""); }, 2500); });
  }
  function copiar() {
    try { navigator.clipboard.writeText(urlGrupo()); setCopiado(true); setTimeout(function () { setCopiado(false); }, 1800); } catch (e) {}
  }
  function csv() {
    var filas = [["Nombre", "WhatsApp", "Cumpleaños", "Lugar favorito", "Fecha de alta", "Cupón"]].concat((miembros || []).map(function (m) {
      var l = LOCALES_GRUPO.find(function (x) { return x.id === m.fav; });
      return [m.nombre, m.wsp, m.dia && m.mes ? m.dia + "/" + m.mes : "", l ? l.nombre : "", m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "", m.cupon || ""];
    }));
    var txt = "﻿" + filas.map(function (f) { return f.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "comunidad_grupo_nkt.csv"; a.click();
  }
  function quitar(id) {
    if (!window.confirm("¿Sacar a esta persona de la comunidad?")) return;
    fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: SH }).then(function () {
      setMiembros(function (p) { return (p || []).filter(function (m) { return m.id !== id; }); });
    });
  }

  var hoy = new Date(), cumples = (miembros || []).filter(function (m) { return m.dia === hoy.getDate() && m.mes === hoy.getMonth() + 1; });
  var conCumple = (miembros || []).filter(function (m) { return m.dia && m.mes; }).length;

  return (
    <div>
      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>🌐 Página «Grupo Nkt» para el público</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 10 }}>Es lo que ve el cliente al escanear este QR: los locales, pedir por WhatsApp, opinar y sumarse a la comunidad. Podés ponerlo en las mesas, en la bolsa del delivery y en las redes.</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {qr && <div style={{ background: "#fff", padding: 8, borderRadius: 10 }}><img src={qr} alt="QR Grupo Nkt" style={{ width: 130, display: "block" }} /></div>}
          <div style={{ flex: 1, minWidth: 190 }}>
            <div style={{ fontSize: 11.5, color: "#C8C8C8", wordBreak: "break-all", marginBottom: 8 }}>{urlGrupo()}</div>
            <button onClick={copiar} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, cursor: "pointer", marginRight: 8 }}>{copiado ? "✓ Copiado" : "Copiar enlace"}</button>
            <a href={urlGrupo()} target="_blank" rel="noreferrer" style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, textDecoration: "none" }}>Verla</a>
          </div>
        </div>
      </div>

      <PanelCanje local="Oficina" usuario="Administración" />
      {cupones.length > 0 && (function () {
        var emit = cupones.length, us = cupones.filter(function (c) { return c.estado === "usado"; }).length, ven = cupones.filter(function (c) { return estadoCupon(c) === "vencido"; }).length;
        return <div style={{ ...tarjeta, fontSize: 12, color: "#C8C8C8", lineHeight: 1.7 }}>🎟️ Cupones: <b>{emit}</b> emitidos · <b style={{ color: "#4C9A5A" }}>{us}</b> canjeados ({Math.round(us / emit * 100)}%) · <b>{ven}</b> vencidos sin usar · <b>{emit - us - ven}</b> vigentes</div>;
      })()}

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>👥 La comunidad · {miembros === null ? "…" : miembros.length + " miembro" + (miembros.length === 1 ? "" : "s")}</div>
        {miembros && miembros.length > 0 && <div style={{ fontSize: 11.5, color: "#9A9A9A", marginBottom: 8 }}>{conCumple} dejaron su cumpleaños.{cumples.length > 0 ? " 🎂 Hoy cumple: " + cumples.map(function (m) { return m.nombre; }).join(", ") + "." : ""}</div>}
        {miembros && miembros.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Todavía no se sumó nadie.</div>}
        {miembros && miembros.length > 0 && (
          <div>
            <button onClick={csv} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>⬇️ Bajar la lista (Excel)</button>
            {miembros.slice(0, 100).map(function (m) {
              var l = LOCALES_GRUPO.find(function (x) { return x.id === m.fav; });
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{m.nombre}</b> <a href={linkWsp(m.wsp)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", fontSize: 11.5 }}>💬 {m.wsp}</a>
                    <div style={{ fontSize: 10.5, color: "#6E6E6E" }}>{m.dia && m.mes ? "🎂 " + m.dia + " " + mesNombre(m.mes) + " · " : ""}{l ? l.nombre + " · " : ""}{m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : ""}</div>
                  </div>
                  <button onClick={function () { quitar(m.id); }} title="Sacar de la lista" style={{ background: "none", border: "none", color: "#6E6E6E", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                </div>
              );
            })}
            {miembros.length > 100 && <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 6 }}>Se muestran los últimos 100. Bajá la lista para verlos a todos.</div>}
          </div>
        )}
      </div>

      <div style={tarjeta}>
        <div onClick={function () { setVerDatos(!verDatos); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{verDatos ? "▾" : "▸"} ✏️ Datos que se muestran en la página</div>
        {verDatos && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Frase de presentación</div>
            <input value={cfg.frase} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, frase: v }; }); }} placeholder="Tres lugares de Punta Alta, una misma comunidad." style={sel} />
            <div style={{ fontSize: 11, color: "#8C8C8C", margin: "6px 0 4px" }}>Invitación que ve quien termina de opinar (qué se lleva si se suma)</div>
            <input value={cfg.gancho} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, gancho: v }; }); }} placeholder="Sumate y participá de los sorteos y beneficios del grupo." style={sel} />
            <div style={{ display: "flex", gap: 8, margin: "6px 0 4px" }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Descuento del cupón (%)</div>
                <input value={cfg.cuponPct} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { return { ...c, cuponPct: Math.min(v, 100) }; }); }} inputMode="numeric" style={sel} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Días de validez</div>
                <input value={cfg.cuponDias} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { return { ...c, cuponDias: v }; }); }} inputMode="numeric" style={sel} /></div>
            </div>
            <div style={{ fontSize: 11, color: "#8C8C8C", margin: "6px 0 4px" }}>Mensaje al sumarse (ej: un beneficio de bienvenida)</div>
            <input value={cfg.bienvenida} onChange={function (e) { var v = e.target.value; setCfg(function (c) { return { ...c, bienvenida: v }; }); }} placeholder="Mostrá este mensaje en caja y te regalamos un café." style={sel} />
            {LOCALES_GRUPO.map(function (l) {
              var d = cfg.locales[l.id] || {};
              return (
                <div key={l.id} style={{ borderTop: "1px solid #1A1A1A", marginTop: 10, paddingTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: l.color, marginBottom: 6 }}>{l.nombre}</div>
                  <input value={d.direccion || ""} onChange={function (e) { setLocal(l.id, "direccion", e.target.value); }} placeholder="Dirección (calle y número)" style={sel} />
                  <input value={d.wsp || ""} onChange={function (e) { setLocal(l.id, "wsp", e.target.value); }} placeholder="WhatsApp para pedidos (ej: 2914123456)" style={sel} />
                  <textarea value={d.horarios || ""} onChange={function (e) { setLocal(l.id, "horarios", e.target.value); }} rows={2} placeholder={"Horarios (ej: Mar a Dom de 20 a 00 h)"} style={{ ...sel, resize: "vertical" }} />
                  <input value={d.carta || ""} onChange={function (e) { setLocal(l.id, "carta", e.target.value); }} placeholder="Enlace de la carta (opcional)" style={sel} />
                  <input value={d.instagram || ""} onChange={function (e) { setLocal(l.id, "instagram", e.target.value); }} placeholder="Enlace de Instagram (opcional)" style={sel} />
                </div>
              );
            })}
            <button onClick={guardar} style={{ marginTop: 10, padding: "9px 16px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
            {msg && <span style={{ fontSize: 12, color: "#4C9A5A", marginLeft: 10 }}>{msg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
