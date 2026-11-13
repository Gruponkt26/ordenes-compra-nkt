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
var CONFIG_VACIA = { frase: "", bienvenida: "", gancho: "", cuponPct: 10, cuponDias: 30, cuponPctLocal: {}, locales: {} };

// La comunidad vive en su propia ruta (/grupo/) para instalarse como una app aparte de la de gestión.
export function urlGrupo() { return URL_PUBLICA + "/grupo/"; }
function esModoPrueba() { try { return new URLSearchParams(window.location.search).has("prueba"); } catch (e) { return false; } }
// Descuento del cupón: el del local donde la persona se sumó, si se cargó uno; si no, el general.
export function pctPara(cfg, local) { return ((cfg && cfg.cuponPctLocal) || {})[local] || (cfg && cfg.cuponPct) || 10; }
export function nombreCompleto(m) { return ((m && m.nombre) || "") + (m && m.apellido ? " " + m.apellido : ""); }
export function idDispositivo() {
  try { var d = window.localStorage.getItem("nkt_dispositivo"); if (!d) { d = Math.random().toString(36).slice(2, 8); window.localStorage.setItem("nkt_dispositivo", d); } return d; } catch (e) { return ""; }
}
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
    return { frase: (x && x.frase) || "", bienvenida: (x && x.bienvenida) || "", gancho: (x && x.gancho) || "", cuponPct: (x && x.cuponPct) || 10, cuponDias: (x && x.cuponDias) || 30, cuponPctLocal: (x && x.cuponPctLocal) || {}, locales: (x && x.locales) || {} };
  } catch (e) { return CONFIG_VACIA; }
}
async function guardarFila(id, ambito, obj) {
  var ahora = new Date().toISOString();
  var r = await fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: id, ambito: ambito, texto: JSON.stringify(obj), usuario: "comunidad", created_at: ahora, updated_at: ahora }) });
  return r.ok;
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
function novedadVisible(n) {
  var hoy = new Date().toISOString().substring(0, 10);
  return n.activa !== false && (!n.hasta || n.hasta >= hoy);
}

// ─── CUPONES ─────────────────────────────────────────────────────────────────
// Un cupón por persona (por su WhatsApp): código único, vencimiento y un solo canje. Se guarda en pautas con id "cupon_<CÓDIGO>".
var LETRAS_CUPON = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function codigoNuevo() { var c = "NKT-"; for (var i = 0; i < 4; i++) c += LETRAS_CUPON[Math.floor(Math.random() * LETRAS_CUPON.length)]; return c; }
function normCodigo(s) { var t = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (t.indexOf("NKT") === 0) t = t.slice(3); return t.length ? "NKT-" + t : ""; }
export async function leerPauta(id) {
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
// Cupón siguiente: apenas se usa (o vence) el anterior, la persona recibe uno nuevo para su próxima compra. Siempre hay uno solo vigente por persona.
export async function renovarCupon(wsp, cfg) {
  var m = await leerPauta("com_" + wsp);
  if (!m) return null;
  var codigo = "";
  for (var i = 0; i < 8; i++) { var c = codigoNuevo(); if (!(await leerPauta("cupon_" + c))) { codigo = c; break; } }
  if (!codigo) return null;
  var ahora = new Date();
  var cupon = { prueba: m.prueba ? 1 : 0, codigo: codigo, wsp: wsp, nombre: nombreCompleto(m), pct: pctPara(cfg, m.fav), creado: ahora.toISOString(), vence: new Date(ahora.getTime() + ((cfg && cfg.cuponDias) || 30) * 86400000).toISOString(), estado: "activo", renovado: 1 };
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
  var w = socio.wsp, previo = await leerPauta("com_" + w);
  if (previo && previo.cupon) { var existente = await leerPauta("cupon_" + previo.cupon); if (existente) return existente; }
  var codigo = "";
  for (var i = 0; i < 8; i++) { var c = codigoNuevo(); if (!(await leerPauta("cupon_" + c))) { codigo = c; break; } }
  if (!codigo) return null;
  var ahora = new Date();
  var cupon = { prueba: socio.prueba ? 1 : 0, codigo: codigo, wsp: w, nombre: nombreCompleto(socio), pct: pctPara(cfg, socio.fav), creado: ahora.toISOString(), vence: new Date(ahora.getTime() + (cfg.cuponDias || 30) * 86400000).toISOString(), estado: "activo" };
  if (!(await guardarFila("cupon_" + codigo, "cupon", cupon))) return null;
  await guardarFila("com_" + w, "comunidad", { ...socio, cupon: codigo });
  return cupon;
}

// Anota a una persona en la comunidad (conserva su alta y su cupón si ya estaba) y devuelve su cupón.
export async function sumarSocio(socio, cfg) {
  if (!socio.prueba && await esEmpleadoWsp(socio.wsp)) return { empleado: true };   // los empleados ya tienen un descuento aparte
  var previo = await leerPauta("com_" + socio.wsp);
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
      x.fillStyle = "#4C9A5A"; x.font = "bold 150px serif"; x.fillText(c.pct + "% OFF", 450, 560);
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

export function TarjetaCupon(props) {
  var c = props.cupon, est = estadoCupon(c);
  var col = est === "activo" ? "#4C9A5A" : "#8C8C8C";
  return (
    <div style={{ background: "#0F1A10", border: "2px dashed " + col, borderRadius: 14, padding: "14px", marginTop: 14, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: 1.5 }}>Tu cupón de descuento{c.prueba ? " · 🧪 PRUEBA" : ""}</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 800, color: col, margin: "4px 0" }}>{c.pct}% OFF</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "#F0EDE8" }}>{c.codigo}</div>
      <div style={{ fontSize: 12, color: "#B8B8B8", lineHeight: 1.6, marginTop: 8 }}>
        {est === "activo" && <span><b style={{ color: "#8FD19A" }}>Válido en cualquiera de nuestros 3 locales:</b> El Bodegón, Kusama y Colantonio's. Mostralo en caja. Vence el {new Date(c.vence).toLocaleDateString("es-AR")}. Se usa una sola vez; cuando lo uses, tu próximo cupón ya queda listo para tu siguiente compra.</span>}
        {est === "usado" && <span>✅ Este cupón ya fue usado.</span>}
        {est === "vencido" && <span>⌛ Este cupón venció el {new Date(c.vence).toLocaleDateString("es-AR")}.</span>}
      </div>
      {est === "activo" && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={function () { guardarCuponImagen(c); }} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #4C9A5A", background: "#14301A", color: "#8FD19A", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Guardar mi cupón en el celular</button>
        </div>
      )}
    </div>
  );
}

// ─── PÁGINA PÚBLICA ──────────────────────────────────────────────────────────
export function GrupoNkt() {
  var [cfg, setCfg] = useState(CONFIG_VACIA);
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
  var [verPasos, setVerPasos] = useState(function () { try { return new URLSearchParams(window.location.search).has("instalar"); } catch (e) { return false; } });
  var [cupon, setCupon] = useState(null);
  var [novedades, setNovedades] = useState([]);
  var [historial, setHistorial] = useState([]);   // todos los cupones de este cliente
  var [verMi, setVerMi] = useState(false);   // "Ya soy parte: ver mi cupón"
  var [wspVer, setWspVer] = useState("");
  var [msgVer, setMsgVer] = useState("");
  var [buscando, setBuscando] = useState(false);

  useEffect(function () { cargarNovedades().then(function (l) { setNovedades(l.filter(novedadVisible).slice(0, 8)); }); }, []);
  // Con el cupón a la vista, se trae el historial del cliente (cuántos lleva y dónde los usó).
  useEffect(function () {
    if (!cupon || !cupon.wsp) return;
    var patron = encodeURIComponent('*"wsp":"' + cupon.wsp + '"*');
    fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&texto=like." + patron + "&limit=200", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setHistorial(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(function (c) { return c && !c.prueba === !cupon.prueba; }) : []);
    }).catch(function () {});
  }, [cupon && cupon.codigo]);
  useEffect(function () {
    document.title = "GrupoNkt";
    // Al agregarla al inicio, el celular instala "Grupo Nkt" (no la app de gestión) y la abre siempre en esta página.
    try {
      var lm = document.querySelector('link[rel="manifest"]'); if (lm) lm.setAttribute("href", "/manifest-grupo.json");
      var mt = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (mt) mt.setAttribute("content", "Grupo Nkt");
    } catch (e) {}
    cargarConfigGrupo().then(setCfg);
    var cg = ""; try { if (!modoPrueba) cg = localStorage.getItem("nkt_cupon") || ""; } catch (e) {}
    if (cg) leerPauta("cupon_" + cg).then(function (c) {
      // Si lo sacaron de la lista, se olvida lo guardado en el celular y se le vuelve a ofrecer sumarse.
      if (!c) { try { localStorage.removeItem("nkt_comunidad"); localStorage.removeItem("nkt_cupon"); } catch (e) {} setHecho(""); return; }
      leerPauta("com_" + c.wsp).then(function (m) {
        if (m) cuponActual(c).then(function (a) { if (a) { setCupon(a); if (!modoPrueba) { try { localStorage.setItem("nkt_cupon", a.codigo); } catch (e) {} } } else setCupon(c); }); else { try { localStorage.removeItem("nkt_comunidad"); localStorage.removeItem("nkt_cupon"); } catch (e) {} setHecho(""); }
      });
    });
    function antes(e) { e.preventDefault(); setInstalar(e); }
    window.addEventListener("beforeinstallprompt", antes);
    return function () { window.removeEventListener("beforeinstallprompt", antes); };
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
    leerPauta("com_" + w).then(function (m) {
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
    var socio = { nombre: nombre.trim().slice(0, 60), apellido: apellido.trim().slice(0, 60), disp: idDispositivo(), wsp: w.slice(0, 20), dia: parseInt(dia, 10) || 0, mes: parseInt(mes, 10) || 0, fav: fav, fecha: new Date().toISOString(), prueba: modoPrueba ? 1 : 0 };
    (modoPrueba ? Promise.resolve(false) : esEmpleadoWsp(w)).then(function (esEmp) {
      if (esEmp) { setError(MSG_EMPLEADO); setEnviando(false); return null; }
      return leerPauta("com_" + w).then(function (previo) {
      // Si ya estaba, se conserva su cupón y su fecha de alta.
        return guardarFila("com_" + w, "comunidad", { ...socio, cupon: previo && previo.cupon ? previo.cupon : undefined, fecha: previo && previo.fecha ? previo.fecha : socio.fecha });
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

  return (
    <div style={fondo}><div style={caja}>
      {modoPrueba && <div style={{ background: "#2A1A00", border: "1px solid #E0914A", color: "#E0914A", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, textAlign: "center", marginBottom: 14 }}>🧪 Modo prueba: lo que cargues acá no cuenta y lo podés borrar desde el panel.</div>}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <img src="/icon-192.png" alt="Grupo Nkt" style={{ width: 112, height: 112, borderRadius: 24, display: "block", margin: "0 auto 8px" }} />
        <div style={{ fontSize: 14, color: "#B8B8B8", marginTop: 6, lineHeight: 1.5 }}>{cfg.frase || "Tres lugares de Punta Alta, una misma comunidad."}</div>
      </div>

      {(function () {
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
      })()}

      {!cupon && hecho !== "ok" && (
        <div style={{ background: "#0F1A10", border: "1px solid #3A7D4466", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, color: "#8FD19A", textAlign: "center" }}>Ingresar</div>
          <div style={{ fontSize: 12.5, color: "#B8B8B8", lineHeight: 1.5, margin: "6px 0 10px", textAlign: "center" }}>Si ya sos parte de la comunidad, entrá con tu WhatsApp para ver tu cupón y tus novedades.</div>
          <input value={wspVer} onChange={function (e) { setWspVer(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") verMiCupon(); }} inputMode="tel" placeholder="Tu WhatsApp" style={inp} />
          {msgVer && <div style={{ color: "#E0714A", fontSize: 12.5, marginBottom: 8 }}>{msgVer}</div>}
          <button onClick={verMiCupon} disabled={buscando} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{buscando ? "Ingresando…" : "Ingresar"}</button>
          <div style={{ fontSize: 11.5, color: "#8C8C8C", textAlign: "center", marginTop: 8 }}>¿Todavía no sos parte? Sumate más abajo.</div>
        </div>
      )}

      {cupon && (function () {
        var usados = historial.filter(function (c) { return c.estado === "usado"; }).sort(function (a, b) { return String(b.usado_at || "").localeCompare(String(a.usado_at || "")); });
        return (
          <div style={{ background: "#0F1A10", border: "1px solid #3A7D4466", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, color: "#D4A017", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>Mi cupón</div>
            <TarjetaCupon cupon={cupon} />
            {historial.length > 0 && <div style={{ textAlign: "center", fontSize: 12.5, color: "#C8C8C8", marginTop: 12 }}>🎟️ Llevás <b>{usados.length}</b> cupón{usados.length === 1 ? "" : "es"} canjeado{usados.length === 1 ? "" : "s"}</div>}
            {usados.length > 0 && (
              <details style={{ marginTop: 8, fontSize: 12, color: "#9A9A9A" }}>
                <summary style={{ cursor: "pointer", textAlign: "center" }}>Ver mi historial</summary>
                {usados.map(function (c) {
                  return <div key={c.codigo} style={{ padding: "5px 0", borderTop: "1px solid #1E2A1E" }}>{c.codigo} · {c.pct}% · usado el {c.usado_at ? new Date(c.usado_at).toLocaleDateString("es-AR") : "—"}{c.usado_local ? " en " + c.usado_local : ""}</div>;
                })}
              </details>
            )}
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={cerrarSesion} style={{ background: "none", border: "none", color: "#8C8C8C", fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Cerrar sesión</button>
            </div>
          </div>
        );
      })()}

      {novedades.length > 0 && (
        <div style={{ background: "#111", border: "1px solid #D4A01744", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, color: "#D4A017", marginBottom: 8 }}>📣 Novedades</div>
          {novedades.map(function (n, i) {
            var l = LOCALES_GRUPO.find(function (x) { return x.id === n.local; });
            return (
              <div key={n.id} style={{ padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid #1E1E1E" }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: "#F0EDE8" }}>{n.titulo}</div>
                <div style={{ fontSize: 10.5, color: l ? l.color : "#7E7E7E", margin: "2px 0 4px" }}>{l ? l.nombre : "Todos los locales"}{n.creado ? " · " + new Date(n.creado).toLocaleDateString("es-AR") : ""}{n.hasta ? " · hasta el " + n.hasta.split("-").reverse().join("/") : ""}</div>
                <div style={{ fontSize: 13, color: "#C8C8C8", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{n.texto}</div>
              </div>
            );
          })}
        </div>
      )}

      {LOCALES_GRUPO.map(function (l) {
        var d = cfg.locales[l.id] || {};
        var wa = linkWsp(d.wsp, "Hola " + l.nombre + "! Quiero hacer un pedido de delivery.");
        var reserva = linkWsp(d.wsp, "Hola " + l.nombre + "! Quiero reservar una mesa. Día: ___ · Hora: ___ · Personas: ___ · A nombre de: ___");
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
              {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...boton, background: "#1F4D2A", borderColor: "#3A7D44" }}>🛵 Pedir delivery</a>}
              {reserva && <a href={reserva} target="_blank" rel="noreferrer" style={{ ...boton, background: "#1F4D2A", borderColor: "#3A7D44" }}>📅 Reservar mesa</a>}
              {d.direccion && <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.direccion + " Punta Alta")} target="_blank" rel="noreferrer" style={boton}>📍 Cómo llegar</a>}
              {d.carta && <a href={d.carta} target="_blank" rel="noreferrer" style={boton}>🍽️ Ver la carta</a>}
              {d.instagram && <a href={d.instagram} target="_blank" rel="noreferrer" style={boton}>📸 Instagram</a>}
              <a href={"/?opinar=" + l.id + "&c=salon" + (modoPrueba ? "&prueba" : "")} style={boton}>⭐ Dejar mi opinión</a>
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
          </div>
        ) : hecho === "ya" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#C8C8C8", lineHeight: 1.6 }}>✅ Ya sos parte de la comunidad Grupo Nkt. ¡Gracias por acompañarnos!</div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 800, color: "#D4A017", textAlign: "center" }}>¿Todavía no sos parte? Sumate a la comunidad</div>
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

    </div></div>
  );
}

// Los empleados no pueden usar cupones de la comunidad. App.jsx le pasa la lista de empleados; se los reconoce por el teléfono de su ficha
// (se comparan los últimos 8 dígitos, para que no importe el 54 9, el 0 o el 15).
var EMPLEADOS_GRUPO = [];
export function setEmpleadosGrupo(lista) { EMPLEADOS_GRUPO = Array.isArray(lista) ? lista : []; }
function tel8(s) { var d = String(s || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; }
export function empleadoDeWsp(wsp) {
  var w = tel8(wsp); if (!w) return null;
  return EMPLEADOS_GRUPO.find(function (e) { return e && e.activo !== false && tel8(e.telefono) === w; }) || null;
}

export var MSG_EMPLEADO = "Los empleados del grupo no pueden sumarse a la comunidad: ya tienen un descuento aparte.";
// Para el que se está sumando (sin sesión): se mira la lista de empleados en la base y se compara por teléfono.
export async function esEmpleadoWsp(wsp) {
  var w = tel8(wsp); if (!w) return false;
  try {
    var r = await fetch(SURL + "/rest/v1/empleados", { headers: SH });
    var d = await r.json();
    if (Array.isArray(d)) return d.some(function (e) { return e && e.activo !== false && tel8(e.telefono) === w; });
  } catch (e) {}
  return !!empleadoDeWsp(wsp);
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
    var empC = empleadoDeWsp(cupon.wsp); if (empC) { setMsg("🚫 Este cupón es de " + empC.nombre + ", que trabaja en el grupo: los empleados no pueden usar cupones."); return; }
    if (!window.confirm("¿Canjear el cupón " + cupon.codigo + " de " + cupon.nombre + " (" + cupon.pct + "% de descuento)? Después no se puede volver a usar.")) return;
    var nuevo = { ...cupon, estado: "usado", usado_at: new Date().toISOString(), usado_local: props.local || "", usado_por: props.usuario || "" };
    // Se vuelve a leer justo antes de guardar, por si otro local lo canjeó recién.
    leerPauta("cupon_" + cupon.codigo).then(function (fresco) {
      if (fresco && fresco.estado === "usado") { setCupon(fresco); setMsg("Ese cupón ya fue canjeado."); return; }
      guardarFila("cupon_" + cupon.codigo, "cupon", nuevo).then(function (ok) { if (ok) {
        setCupon(nuevo); setMsg("✅ Canjeado. Aplicá el " + cupon.pct + "% de descuento.");
        // Se le deja listo el siguiente cupón para su próxima compra.
        cargarConfigGrupo().then(function (cfgG) { return renovarCupon(cupon.wsp, cfgG); }).then(function (sig) {
          if (sig) setMsg("✅ Canjeado. Aplicá el " + cupon.pct + "% de descuento. Su próximo cupón ya quedó listo: " + sig.codigo + ".");
          if (props.onCanje) props.onCanje();
        });
      } else setMsg("No se pudo guardar el canje. Probá de nuevo."); });
    });
  }
  var empCupon = cupon ? empleadoDeWsp(cupon.wsp) : null;
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
          {empCupon && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#1A0D0A", border: "1px solid #C1440E88", fontSize: 12.5, color: "#FF8A5C", fontWeight: 700 }}>🚫 Es de {empCupon.nombre}, empleado/a del grupo: los empleados no pueden usar cupones. No lo canjees.</div>}
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
  var mios = (miembros || []).filter(function (m) { return !m.prueba && (!local || m.fav === local); });
  var wsps = {}; mios.forEach(function (m) { wsps[m.wsp] = true; });
  // Los cupones de los clientes de este local, más los que se canjearon acá aunque el cliente se haya sumado en otro.
  var cups = cupones.filter(function (c) { return !c.prueba && (wsps[c.wsp] || (nomLocal && c.usado_local === nomLocal)); }).sort(function (a, b) { return String(b.creado || "").localeCompare(String(a.creado || "")); });
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
      <PanelCanje local={nomLocal} usuario={props.usuario} onCanje={cargar} />
      <div style={{ ...tarjeta, fontSize: 12, color: "#C8C8C8", lineHeight: 1.7 }}>
        👥 <b>{mios.length}</b> miembro{mios.length === 1 ? " se sumó" : "s se sumaron"} desde {nomLocal || "los locales"} · 🎟️ <b>{cuenta.todos}</b> cupones: <b style={{ color: "#4C9A5A" }}>{cuenta.vigentes}</b> vigentes · <b>{cuenta.usados}</b> usados · <b>{cuenta.vencidos}</b> vencidos
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
              <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>🎟️ <b style={{ color: "#C8C8C8" }}>{c.codigo}</b> · {c.pct}% · vence {c.vence ? new Date(c.vence).toLocaleDateString("es-AR") : "—"}</div>
              {c.usado_at && <div style={{ fontSize: 11, color: "#8C8C8C", marginTop: 1 }}>✅ Canjeado el {new Date(c.usado_at).toLocaleString("es-AR")}{c.usado_local ? " en " + c.usado_local : ""}</div>}
            </div>
          );
        })}
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>👥 Miembros de {nomLocal || "la comunidad"}</div>
        {miembros === null && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Cargando…</div>}
        {miembros && mios.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Todavía no se sumó nadie desde acá.</div>}
        {mios.slice(0, 100).map(function (m) {
          var rc = resumenCup(m.wsp), cp = cupones.find(function (x) { return x.codigo === m.cupon; });
          var e = cp ? estadoCupon(cp) : "";
          return (
            <div key={m.id} style={{ padding: "6px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
              <b>{nombreCompleto(m)}</b>
              <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>{m.cupon ? "🎟️ " + m.cupon + (e ? " · " + (e === "activo" ? "vigente" : e === "usado" ? "usado" : "vencido") : "") + " · " : ""}<b style={{ color: "#D4A017" }}>{rc.total} cupón{rc.total === 1 ? "" : "es"} · {rc.usados} canjeado{rc.usados === 1 ? "" : "s"}</b>{m.fecha ? " · desde " + new Date(m.fecha).toLocaleDateString("es-AR") : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PANEL DE ADMINISTRACIÓN ─────────────────────────────────────────────────
function mesNombre(m) { return ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m] || ""; }

export function PanelComunidad() {
  var [cfg, setCfg] = useState(CONFIG_VACIA);
  var [miembros, setMiembros] = useState(null);
  var [filtroCom, setFiltroCom] = useState("todos");   // lista de miembros: todos o los de un local
  var [qr, setQr] = useState("");
  var [msg, setMsg] = useState("");
  var [copiado, setCopiado] = useState(false);
  var [verDatos, setVerDatos] = useState(false);
  var [cupones, setCupones] = useState([]);
  var [msgPrueba, setMsgPrueba] = useState("");
  var [filtroCup, setFiltroCup] = useState("todos");
  var [msgCup, setMsgCup] = useState("");
  var [msgDesc, setMsgDesc] = useState("");
  var [novAdm, setNovAdm] = useState([]);
  var [formNov, setFormNov] = useState({ titulo: "", texto: "", local: "todos", hasta: "" });
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

  function publicarNovedad() {
    if (!formNov.titulo.trim() || !formNov.texto.trim()) { setMsgNov("Poné el título y el texto."); setTimeout(function () { setMsgNov(""); }, 3000); return; }
    guardarFila("nov_" + Date.now(), "grupo_novedad", { titulo: formNov.titulo.trim(), texto: formNov.texto.trim(), local: formNov.local, hasta: formNov.hasta || "", creado: new Date().toISOString(), activa: true }).then(function (ok) {
      if (ok) { setFormNov({ titulo: "", texto: "", local: "todos", hasta: "" }); cargarNovedades().then(setNovAdm); setMsgNov("✓ Publicada: ya la ven los miembros."); } else setMsgNov("No se pudo publicar.");
      setTimeout(function () { setMsgNov(""); }, 3500);
    });
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
    guardarFila("grupo_config", "grupo_config", cfg).then(function (ok) { setMsgCup(ok ? "✓ Guardado: vale para los cupones nuevos y los que se generen al canjear." : "No se pudo guardar"); setTimeout(function () { setMsgCup(""); }, 4000); });
  }
  // Pasa los cupones vigentes sin usar al descuento que figura ahora (el de su local, o el general).
  function aplicarAVigentes() {
    var vig = cupones.filter(function (c) { return !c.prueba && estadoCupon(c) === "activo"; });
    if (vig.length === 0) { setMsgCup("No hay cupones vigentes para actualizar."); setTimeout(function () { setMsgCup(""); }, 3000); return; }
    if (!window.confirm("¿Cambiar el descuento de los " + vig.length + " cupones vigentes sin usar al valor actual? Los ya usados no se tocan.")) return;
    Promise.all(vig.map(function (c) {
      var m = (miembros || []).find(function (x) { return x.wsp === c.wsp; });
      return guardarFila("cupon_" + c.codigo, "cupon", { ...c, pct: pctPara(cfg, m ? m.fav : "") });
    })).then(function () { cargarCupones(); setMsgCup("✓ Se actualizaron " + vig.length + " cupones vigentes."); setTimeout(function () { setMsgCup(""); }, 4000); });
  }
  function cambiarPctCupon(c) {
    var v = window.prompt("Descuento para el cupón " + c.codigo + " de " + c.nombre + " (%):", String(c.pct));
    if (v === null) return;
    var n = parseInt(String(v).replace(/\D/g, ""), 10);
    if (!(n >= 1 && n <= 100)) { window.alert("Poné un número entre 1 y 100."); return; }
    guardarFila("cupon_" + c.codigo, "cupon", { ...c, pct: n }).then(function () { cargarCupones(); });
  }
  // Cuántos cupones lleva cada cliente (emitidos y canjeados), sin contar los de prueba.
  function resumenCup(wsp) {
    var mios = cupones.filter(function (c) { return !c.prueba && c.wsp === wsp; });
    return { total: mios.length, usados: mios.filter(function (c) { return c.estado === "usado"; }).length };
  }
  // Número de orden de un cupón dentro de los de ese cliente: el 1.º, el 2.º…
  function ordenCupon(c) {
    var mios = cupones.filter(function (x) { return !x.prueba && x.wsp === c.wsp; }).sort(function (a, b) { return String(a.creado || "").localeCompare(String(b.creado || "")); });
    return mios.findIndex(function (x) { return x.codigo === c.codigo; }) + 1;
  }
  function cargarMiembros() {
    fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setMiembros(Array.isArray(d) ? d.map(function (f) { try { var x = JSON.parse(f.texto); return { id: f.id, ...x }; } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () { setMiembros([]); });
  }
  function cargarCupones() {
    fetch(SURL + "/rest/v1/pautas?ambito=eq.cupon&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setCupones(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () {});
  }
  function csvCupones() {
    var filas = [["Código", "Cliente", "WhatsApp", "Descuento", "Emitido", "Vence", "Estado", "Canjeado el", "Local del canje", "Canjeado por", "Nº de cupón del cliente"]].concat(cupones.filter(function (c) { return !c.prueba; }).map(function (c) {
      var e = estadoCupon(c);
      return [c.codigo, c.nombre, c.wsp, c.pct + "%", c.creado ? new Date(c.creado).toLocaleDateString("es-AR") : "", c.vence ? new Date(c.vence).toLocaleDateString("es-AR") : "", e === "activo" ? "vigente" : e === "usado" ? "usado" : "vencido", c.usado_at ? new Date(c.usado_at).toLocaleString("es-AR") : "", c.usado_local || "", c.usado_por || "", ordenCupon(c)];
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
    var filas = [["Nombre", "WhatsApp", "Cumpleaños", "Lugar favorito", "Fecha de alta", "Cupón actual", "Cupones emitidos", "Cupones canjeados"]].concat(reales.map(function (m) {
      var l = LOCALES_GRUPO.find(function (x) { return x.id === m.fav; });
      return [nombreCompleto(m), m.wsp, m.dia && m.mes ? m.dia + "/" + m.mes : "", l ? l.nombre : "", m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "", m.cupon || "", resumenCup(m.wsp).total, resumenCup(m.wsp).usados];
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
  function quitar(id) {
    if (!window.confirm("¿Sacar a esta persona de la comunidad?")) return;
    fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: SH }).then(function () {
      setMiembros(function (p) { return (p || []).filter(function (m) { return m.id !== id; }); });
    });
  }

  var pruebas = (miembros || []).filter(function (m) { return m.prueba; });
  var reales = (miembros || []).filter(function (m) { return !m.prueba; });
  var hoy = new Date(), cumples = reales.filter(function (m) { return m.dia === hoy.getDate() && m.mes === hoy.getMonth() + 1; });
  var conCumple = reales.filter(function (m) { return m.dia && m.mes; }).length;
  // Por fecha de entrada: el último que se sumó, primero.
  var ordenados = (miembros || []).slice().sort(function (a, b) { return String(b.fecha || "").localeCompare(String(a.fecha || "")); });
  var ordenadosVista = filtroCom === "todos" ? ordenados : ordenados.filter(function (m) { return m.fav === filtroCom; });
  var porLocalCom = LOCALES_GRUPO.map(function (l) { return { l: l, n: reales.filter(function (m) { return m.fav === l.id; }).length }; });

  return (
    <div>
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
                    <div><b>{n.titulo}</b> <span style={{ fontSize: 10.5, color: l ? l.color : "#7E7E7E" }}>· {l ? l.nombre : "todos"}{n.hasta ? " · hasta " + n.hasta.split("-").reverse().join("/") : ""}{!vis ? " · oculta" : ""}</span></div>
                    <div style={{ display: "flex", gap: 8, whiteSpace: "nowrap" }}>
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

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017", marginBottom: 4 }}>⚙️ Valor de los cupones</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 10 }}>El descuento que se cambia acá vale para los cupones nuevos y para el siguiente que reciba cada persona al canjear. Podés poner un valor distinto según el local donde se sumó el cliente; el cupón se usa igual en cualquiera de los 3.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Descuento general (%)</div>
            <input value={cfg.cuponPct} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { return { ...c, cuponPct: Math.min(v, 100) }; }); }} inputMode="numeric" style={sel} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#8C8C8C", marginBottom: 4 }}>Días de validez</div>
            <input value={cfg.cuponDias} onChange={function (e) { var v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0; setCfg(function (c) { return { ...c, cuponDias: v }; }); }} inputMode="numeric" style={sel} /></div>
        </div>
        <div style={{ fontSize: 11, color: "#8C8C8C", margin: "4px 0" }}>Según el local donde se sumó (vacío = el general)</div>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={guardarValores} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Guardar valores</button>
          <button onClick={aplicarAVigentes} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D4A01766", background: "#D4A01722", color: "#D4A017", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Aplicar también a los cupones vigentes</button>
        </div>
        {msgCup && <div style={{ fontSize: 12, color: "#8FD19A", marginTop: 8 }}>{msgCup}</div>}
      </div>

      {(function () {
        var todos = cupones.filter(function (c) { return !c.prueba; }).sort(function (a, b) { return String(b.creado || "").localeCompare(String(a.creado || "")); });
        var est = function (c) { var e = estadoCupon(c); return e === "activo" ? "vigentes" : e === "usado" ? "usados" : "vencidos"; };
        var cuenta = { todos: todos.length, vigentes: 0, usados: 0, vencidos: 0 };
        todos.forEach(function (c) { cuenta[est(c)]++; });
        var lista = todos.filter(function (c) { return filtroCup === "todos" || est(c) === filtroCup; });
        return (
          <div style={tarjeta}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#D4A017" }}>🎟️ Cupones otorgados · {todos.length}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={cargarCupones} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 11.5, cursor: "pointer" }}>↻ Actualizar</button>
                {todos.length > 0 && <button onClick={csvCupones} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 11.5, cursor: "pointer" }}>⬇️ Excel</button>}
              </div>
            </div>
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
              var txt = "Hola " + primer + "! Te recordamos que tenés un cupón de Grupo Nkt de " + c.pct + "% de descuento (" + c.codigo + "), válido hasta el " + new Date(c.vence).toLocaleDateString("es-AR") + " en cualquiera de nuestros locales. Tu portal con novedades, delivery y reservas: " + urlGrupo() + " ¡Te esperamos!";
              return (
                <div key={c.codigo} style={{ padding: "7px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div><b>{c.nombre}</b>{empleadoDeWsp(c.wsp) ? <span style={{ color: "#FF8A5C", fontSize: 10.5, fontWeight: 700 }}> 👷 empleado/a</span> : null} <a href={linkWsp(c.wsp)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", fontSize: 11.5 }}>💬 {c.wsp}</a></div>
                    <span style={{ color: col, fontWeight: 800, fontSize: 11.5 }}>{e === "activo" ? "VIGENTE" : e === "usado" ? "USADO" : "VENCIDO"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>🎟️ <b style={{ color: "#C8C8C8" }}>{c.codigo}</b> · cupón {ordenCupon(c)} de {resumenCup(c.wsp).total} del cliente · {c.pct}% · emitido {c.creado ? new Date(c.creado).toLocaleDateString("es-AR") : "—"} · vence {c.vence ? new Date(c.vence).toLocaleDateString("es-AR") : "—"}</div>
                  {c.usado_at && <div style={{ fontSize: 11, color: "#8C8C8C", marginTop: 1 }}>✅ Canjeado el {new Date(c.usado_at).toLocaleString("es-AR")}{c.usado_local ? " en " + c.usado_local : ""}{c.usado_por ? " · por " + c.usado_por : ""}</div>}
                  {e === "activo" && <button onClick={function () { cambiarPctCupon(c); }} style={{ background: "none", border: "none", color: "#D4A017", fontSize: 11.5, cursor: "pointer", marginRight: 12, padding: 0, marginTop: 4 }}>✏️ Cambiar descuento</button>}
                  {e === "activo" && <a href={linkWsp(c.wsp, txt)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 4, fontSize: 11.5, color: "#4C9A5A", textDecoration: "none" }}>💬 Recordarle que lo use</a>}
                </div>
              );
            })}
            {lista.length > 100 && <div style={{ fontSize: 11, color: "#6E6E6E", marginTop: 6 }}>Se muestran los últimos 100. Bajá el Excel para verlos a todos.</div>}
          </div>
        );
      })()}

      <div style={tarjeta}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>👥 La comunidad · {miembros === null ? "…" : reales.length + " miembro" + (reales.length === 1 ? "" : "s")}{pruebas.length > 0 ? " (+ " + pruebas.length + " de prueba)" : ""}</div>
        {miembros && miembros.length > 0 && <div style={{ fontSize: 11.5, color: "#9A9A9A", marginBottom: 8 }}>{conCumple} dejaron su cumpleaños.{cumples.length > 0 ? " 🎂 Hoy cumple: " + cumples.map(function (m) { return m.nombre; }).join(", ") + "." : ""}</div>}
        {miembros && miembros.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E" }}>Todavía no se sumó nadie.</div>}
        {miembros && miembros.length > 0 && (
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {[{ id: "todos", txt: "Todos · " + miembros.filter(function (m) { return !m.prueba; }).length }].concat(porLocalCom.map(function (x) { return { id: x.l.id, txt: x.l.emoji + " " + x.l.nombre + " · " + x.n }; })).map(function (t) {
                var act = filtroCom === t.id;
                return <button key={t.id} onClick={function () { setFiltroCom(t.id); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + (act ? "#D4A017" : "#2A2A2A"), background: act ? "#D4A01722" : "none", color: act ? "#D4A017" : "#9A9A9A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t.txt}</button>;
              })}
            </div>
            <div style={{ fontSize: 11, color: "#7E7E7E", marginBottom: 6 }}>Ordenados por fecha de entrada: el último que se sumó, primero.</div>
            <button onClick={csv} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#F0EDE8", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>⬇️ Bajar la lista (Excel)</button>
            {ordenadosVista.slice(0, 100).map(function (m) {
              var l = LOCALES_GRUPO.find(function (x) { return x.id === m.fav; });
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #161616", fontSize: 12.5 }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{nombreCompleto(m)}</b>{m.prueba ? <span style={{ color: "#E0914A", fontSize: 10.5 }}> 🧪 prueba</span> : null}{empleadoDeWsp(m.wsp) ? <span style={{ color: "#FF8A5C", fontSize: 10.5, fontWeight: 700 }}> 👷 empleado/a</span> : null} <a href={linkWsp(m.wsp)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", fontSize: 11.5 }}>💬 {m.wsp}</a>{m.fecha ? <span style={{ color: "#7E7E7E", fontSize: 11 }}> · entró el {new Date(m.fecha).toLocaleDateString("es-AR")}</span> : null}
                    {m.cupon && (function () {
                      var cp = cupones.find(function (x) { return x.codigo === m.cupon; });
                      var est = cp ? estadoCupon(cp) : "";
                      var txt = "Hola " + m.nombre + "! Este es tu cupón de Grupo Nkt: " + m.cupon + (cp ? " (" + cp.pct + "% de descuento, válido hasta el " + new Date(cp.vence).toLocaleDateString("es-AR") + "). Es válido en cualquiera de los 3 locales (El Bodegón, Kusama y Colantonio's): mostralo en caja. Entrá a tu portal con novedades, delivery y reservas: " + urlGrupo() : ".");
                      var rc = resumenCup(m.wsp);
                      return <div style={{ fontSize: 11, color: "#C8C8C8", marginTop: 2 }}>🎟️ {m.cupon}{est ? " · " + (est === "activo" ? "vigente" : est === "usado" ? "usado" : "vencido") : ""} · <b style={{ color: "#D4A017" }}>{rc.total} cupón{rc.total === 1 ? "" : "es"} · {rc.usados} canjeado{rc.usados === 1 ? "" : "s"}</b> <a href={linkWsp(m.wsp, txt)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none", marginLeft: 6 }}>💬 Enviarle su cupón</a></div>;
                    })()}
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
