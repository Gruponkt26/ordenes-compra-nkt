// Opiniones de los clientes por QR + tablero de la competencia entre locales.
//
//  · <Opinar/>            la pantalla pública que se abre al escanear el QR (sin usuario ni clave).
//  · <PanelCompetencia/>  el tablero de Sofía: promedios por local, comentarios y QR para imprimir.
//
// Las opiniones se guardan en la tabla pautas que ya existe, con ámbito "opinion" (no hace falta crear
// nada en Supabase). La app principal no las trae a su lista de pautas (ver sbLoadPautas).
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { SURL, SH, LOCALES } from "./comun.js";
import { cargarConfigGrupo, sumarSocio, MSG_EMPLEADO, MSG_ACCESO_EMPLEADO, leerMiembro, esEmpleadoWsp, TarjetaCupon, leerPauta, nombreCompleto, cuponActual } from "./grupo.jsx";

// El QR se imprime: apunta siempre a la dirección real de la app, no a la pantalla desde donde se arme.
var URL_PUBLICA = "https://ordenes-compra-nkt.vercel.app";
var LOCALES_COMPETENCIA = ["l1", "l2", "l3"];
var HORAS_ENTRE_OPINIONES = 6;
var MINIMO_OPINIONES = 10;

var PREGUNTAS = {
  salon: [["servicio", "Servicio y atención"], ["ambiente", "Ambiente"], ["comida", "Comida"], ["limpieza", "Limpieza"]],
  delivery: [["comida", "La comida"], ["entrega", "La entrega (tiempo y estado)"], ["atencion", "La atención al pedir"]],
};
var NOMBRE_PREGUNTA = {};
Object.keys(PREGUNTAS).forEach(function (c) { PREGUNTAS[c].forEach(function (q) { NOMBRE_PREGUNTA[c + "_" + q[0]] = q[1]; }); });

// Logos originales de cada local (public/logos). Son negros sobre blanco, por eso van dentro de un recuadro blanco.
var LOGOS = { l1: "/logos/bodegon.png", l2: "/logos/kusama.png", l3: "/logos/colantonio.png" };
function LogoLocal(props) {
  var src = LOGOS[props.id];
  if (!src) return null;
  return <div style={{ background: "#fff", borderRadius: 12, padding: props.chico ? "6px 8px" : "12px 16px", display: "inline-block", maxWidth: "100%" }}>
    <img src={src} alt="" style={{ display: "block", height: props.alto, maxWidth: "100%", width: "auto", margin: "0 auto" }} />
  </div>;
}

// Identifica este celular (el mismo ID que usa el fichaje): sirve para detectar opiniones repetidas o del personal.
function idDispositivo() {
  try {
    var d = window.localStorage.getItem("nkt_dispositivo");
    if (!d) { d = Math.random().toString(36).slice(2, 8); window.localStorage.setItem("nkt_dispositivo", d); }
    return d;
  } catch (e) { return ""; }
}

// Lo que votó en cada pregunta, en chips: "Servicio 5 · Ambiente 4 · …" (rojo si puso 1 o 2).
function DetalleVotos(props) {
  var o = props.o;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
      {PREGUNTAS[o.canal === "delivery" ? "delivery" : "salon"].map(function (q) {
        var n = o.notas[q[0]];
        if (!(n > 0)) return null;
        var col = n <= 2 ? "#E0714A" : n === 3 ? "#D4A017" : "#4C9A5A";
        return <span key={q[0]} style={{ fontSize: 10.5, color: "#B8B8B8", background: "#161616", border: "1px solid #222", borderRadius: 6, padding: "1px 7px" }}>{q[1]} <b style={{ color: col }}>{n}</b></span>;
      })}
    </div>
  );
}

// Configuración de las opiniones (link de reseñas de Google por local y premio del sorteo) y sorteos hechos, guardados en la tabla de pautas.
async function cargarConfigOpiniones() {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq.opinion_config&limit=1", { headers: SH });
    var d = await r.json();
    var x = Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
    return { google: (x && x.google) || {}, premio: (x && x.premio) || "" };
  } catch (e) { return { google: {}, premio: "" }; }
}
async function guardarFilaPauta(id, ambito, obj) {
  var ahora = new Date().toISOString();
  var r = await fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: id, ambito: ambito, texto: JSON.stringify(obj), usuario: "opiniones", created_at: ahora, updated_at: ahora }) });
  return r.ok;
}
function linkWsp(w) { var n = String(w || "").replace(/\D/g, ""); return "https://wa.me/" + (n.length <= 10 ? "54" + n : n); }

function localDe(id) { return LOCALES.find(function (l) { return l.id === id; }); }

export function urlOpinion(local, canal, zona) {
  var u = URL_PUBLICA + "/?opinar=" + local + "&c=" + canal;
  if (zona) u += "&z=" + zona;
  return u;
}

// ─── PANTALLA PÚBLICA DEL QR ─────────────────────────────────────────────────
export function Opinar() {
  var params = new URLSearchParams(window.location.search);
  var localId = params.get("opinar");
  var canal = params.get("c") === "delivery" ? "delivery" : "salon";
  var zona = params.get("z") || "";
  var local = localDe(localId);
  var valido = !!local && LOCALES_COMPETENCIA.indexOf(localId) !== -1;
  var preguntas = PREGUNTAS[canal];
  var claveLS = "opinion_" + localId + "_" + canal;
  var modoPrueba = params.has("prueba");   // enlace de prueba: sin el límite de 6 horas y la opinión no cuenta en el ranking

  var [notas, setNotas] = useState({});
  var [comentario, setComentario] = useState("");
  var [cfg, setCfg] = useState({ google: {}, premio: "" });
  var [notaFinal, setNotaFinal] = useState(0);
  var [gancho, setGancho] = useState("");
  var [cfgGrupo, setCfgGrupo] = useState(null);
  // Invitación a la comunidad al terminar de opinar.
  var [abrirForm, setAbrirForm] = useState(false);
  var [fNombre, setFNombre] = useState("");
  var [fApellido, setFApellido] = useState("");
  var [fWsp, setFWsp] = useState("");
  var [fDia, setFDia] = useState("");
  var [fMes, setFMes] = useState("");
  var [opReg, setOpReg] = useState(null);   // la opinión recién enviada {id, texto}: se le agrega el nombre si el cliente se identifica
  var [identificado, setIdentificado] = useState(false);
  var [socioAct, setSocioAct] = useState(null);   // el socio recién anotado, para agregarle el cumpleaños
  var [cumpleOk, setCumpleOk] = useState(false);
  var [errCom, setErrCom] = useState("");
  var [errId, setErrId] = useState("");
  var [ingWsp, setIngWsp] = useState("");
  var [ingMsg, setIngMsg] = useState("");
  var [ingBusy, setIngBusy] = useState(false);
  var [sumando, setSumando] = useState(false);
  var [cuponNuevo, setCuponNuevo] = useState(null);   // cupón recién obtenido
  var [cuponYa, setCuponYa] = useState(null);         // cupón de quien ya era parte (confirmado en la base)
  var [yaEsParte, setYaEsParte] = useState(false);
  useEffect(function () {
    cargarConfigOpiniones().then(setCfg);
    cargarConfigGrupo().then(function (c) { setGancho(c.gancho || ""); setCfgGrupo(c); });
    // Si este celular ya se anotó, se confirma en la base (no alcanza con lo que recuerda el celular).
    var cg = ""; try { if (!modoPrueba) cg = localStorage.getItem("nkt_cupon") || ""; } catch (e) {}
    if (cg) leerPauta("cupon_" + cg).then(function (c) {
      if (!c) return;
      leerMiembro(c.wsp).then(function (m) { if (m) { setYaEsParte(true); setCuponYa(c); cuponActual(c).then(function (a) { if (a) setCuponYa(a); }); } });
    });
  }, []);
  var [enviando, setEnviando] = useState(false);
  var [error, setError] = useState("");
  var [hecho, setHecho] = useState(function () {
    if (modoPrueba) return "";
    try {
      var t = parseInt(localStorage.getItem(claveLS) || "0", 10);
      return t > 0 && Date.now() - t < HORAS_ENTRE_OPINIONES * 3600 * 1000 ? "ya" : "";
    } catch (e) { return ""; }
  });

  useEffect(function () {
    document.title = "GrupoNkt";
  }, []);

  var fondo = { minHeight: "100vh", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", padding: "22px 16px 40px", boxSizing: "border-box" };
  var caja = { maxWidth: 440, margin: "0 auto" };

  var wDig = fWsp.replace(/\D/g, "");
  // "Ya soy parte": entra con su WhatsApp, sin volver a cargar sus datos. La opinión queda con su nombre.
  function ingresarMiembro() {
    var w = ingWsp.replace(/\D/g, "");
    if (w.length < 8) { setIngMsg("Escribí tu WhatsApp completo."); return; }
    setIngBusy(true); setIngMsg("");
    (modoPrueba ? Promise.resolve(false) : esEmpleadoWsp(w)).then(function (esEmp) { return esEmp ? "EMP" : leerPauta("com_" + w); }).then(function (m) {
      if (m === "EMP") { setIngBusy(false); setIngMsg(MSG_ACCESO_EMPLEADO); return null; }
      if (!m || !m.cupon) { setIngBusy(false); setIngMsg("No encontramos ese WhatsApp en la comunidad. Si todavía no te sumaste, hacelo más abajo."); return null; }
      return leerPauta("cupon_" + m.cupon).then(function (c) {
        if (!c) { setIngBusy(false); setIngMsg("No encontramos tu cupón. Escribinos y lo revisamos."); return; }
        return cuponActual(c).then(function (a) {
          var v = a || c;
          setIngBusy(false); setYaEsParte(true); setCuponYa(v); setIdentificado(true);
          if (!modoPrueba) { try { localStorage.setItem("nkt_comunidad", "1"); localStorage.setItem("nkt_cupon", v.codigo); } catch (e) {} }
          if (opReg) guardarFilaPauta(opReg.id, "opinion", { ...opReg.texto, nombre: m.nombre || "", apellido: m.apellido || "", wsp: w });
        });
      });
    });
  }
  // Paso 1 (opcional): el cliente se identifica y su nombre queda en la opinión.
  function identificarse() {
    if (!fNombre.trim() || !fApellido.trim()) { setErrId("Escribí tu nombre y tu apellido."); return; }
    setErrId("");
    if (opReg) guardarFilaPauta(opReg.id, "opinion", { ...opReg.texto, nombre: fNombre.trim().slice(0, 60), apellido: fApellido.trim().slice(0, 60), wsp: wDig.slice(0, 20) });
    setIdentificado(true);
  }
  // Paso 2: unirse a la comunidad con los datos que ya dio (si falta alguno, se piden antes).
  function hacerUnirse() {
    if (!fNombre.trim() || !fApellido.trim() || wDig.length < 8) {
      var arriba = opReg && !identificado;   // si el recuadro de arriba sigue visible, los datos se completan ahí
      setErrCom(arriba ? "Para unirte completá arriba tu nombre, tu apellido y tu WhatsApp." : "Para unirte escribí tu nombre, tu apellido y tu WhatsApp.");
      if (!arriba) setAbrirForm(true);
      return;
    }
    setErrCom(""); setSumando(true);
    var socio = { nombre: fNombre.trim().slice(0, 60), apellido: fApellido.trim().slice(0, 60), wsp: wDig.slice(0, 20), dia: 0, mes: 0, fav: localId, disp: idDispositivo(), fecha: new Date().toISOString(), prueba: modoPrueba ? 1 : 0 };
    (cfgGrupo ? Promise.resolve(cfgGrupo) : cargarConfigGrupo()).then(function (cg) { return sumarSocio(socio, cg); }).then(function (c) {
      setSumando(false);
      if (c && c.empleado) { setErrCom(MSG_EMPLEADO); return; }
      if (!c) { setErrCom("No pudimos sumarte. Probá de nuevo."); return; }
      setCuponNuevo(c); setSocioAct({ ...socio, cupon: c.codigo });
      // Si todavía no se había identificado, el nombre también queda en su opinión.
      if (opReg && !identificado) guardarFilaPauta(opReg.id, "opinion", { ...opReg.texto, nombre: socio.nombre, apellido: socio.apellido, wsp: socio.wsp });
    });
  }
  // Paso 3: ya con el cupón, el cumpleaños (opcional).
  function guardarCumple() {
    var d = parseInt(fDia, 10) || 0, m = parseInt(fMes, 10) || 0;
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) { setErrCom("Poné el día y el mes de tu cumpleaños."); return; }
    setErrCom("");
    guardarFilaPauta("com_" + socioAct.wsp, "comunidad", { ...socioAct, dia: d, mes: m }).then(function () { setCumpleOk(true); });
  }
  // Lo que aparece debajo del "¡Gracias!": identificarse, unirse a la comunidad y, ya dentro, el cumpleaños.
  function invitacionComunidad() {
    var tarjeta = { marginTop: 22, background: "#14100A", border: "1px solid #D4A01766", borderRadius: 14, padding: "14px" };
    var tit = { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, color: "#D4A017" };
    var inpS = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 15, marginBottom: 8 };
    var btn = { width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#C1440E", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 800, cursor: "pointer" };
    var beneficios = <div style={{ fontSize: 13, color: "#C8C8C8", lineHeight: 1.6, marginTop: 12 }}>Cada compra en cualquiera de nuestros locales va a tener beneficios si sos parte de la comunidad. ¡Mostrá tu cupón en caja!</div>;
    var consentimiento = <div style={{ fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.5, marginTop: 8 }}>Al unirme acepto que Grupo Nkt me escriba por WhatsApp con novedades y beneficios. Puedo pedir que me saquen de la lista cuando quiera.</div>;
    var irPortal = (
      <div style={{ marginTop: 14 }}>
        <a href={"/grupo/" + (modoPrueba ? "?prueba" : "")} style={{ display: "block", padding: "14px", borderRadius: 12, background: "#1F4D2A", border: "1px solid #3A7D44", color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Entrar a mi Grupo Nkt</a>
        <a href={"/grupo/?instalar" + (modoPrueba ? "&prueba" : "")} style={{ display: "block", marginTop: 8, padding: "12px", borderRadius: 12, background: "#14100A", border: "1px solid #D4A01766", color: "#D4A017", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>📲 Descargar la app</a>
        <div style={{ fontSize: 11.5, color: "#8C8C8C", lineHeight: 1.5, marginTop: 6 }}>Ahí tenés tu cupón, las novedades, delivery y reservas. Agregalo a tu inicio para tenerlo siempre a mano.</div>
      </div>
    );
    if (cuponNuevo) return (
      <div style={tarjeta}>
        <div style={tit}>🎉 ¡Ya sos parte de la comunidad Grupo Nkt!</div>
        {!cuponNuevo.sinCupon && <TarjetaCupon cupon={cuponNuevo} />}
        {beneficios}
        {socioAct && !(socioAct.dia && socioAct.mes) && !cumpleOk && (
          <div style={{ marginTop: 14, borderTop: "1px solid #2A2208", paddingTop: 12, textAlign: "left" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F0EDE8" }}>🎂 ¿Cuándo es tu cumpleaños?</div>
            <div style={{ fontSize: 12, color: "#9A9A9A", margin: "3px 0 8px" }}>Dejanos tu fecha y te saludamos con un regalo (opcional).</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={fDia} onChange={function (e) { setFDia(e.target.value.replace(/\D/g, "").slice(0, 2)); }} inputMode="numeric" placeholder="Día" style={{ ...inpS, flex: 1 }} />
              <input value={fMes} onChange={function (e) { setFMes(e.target.value.replace(/\D/g, "").slice(0, 2)); }} inputMode="numeric" placeholder="Mes" style={{ ...inpS, flex: 1 }} />
            </div>
            {errCom && <div style={{ color: "#E0714A", fontSize: 12.5, marginBottom: 8 }}>{errCom}</div>}
            <button onClick={guardarCumple} style={{ ...btn, background: "#1A6B8A" }}>Guardar mi cumpleaños</button>
          </div>
        )}
        {cumpleOk && <div style={{ fontSize: 13, color: "#8FD19A", marginTop: 12 }}>🎂 ¡Listo! Te vamos a saludar en tu cumpleaños.</div>}
        {irPortal}
      </div>
    );
    if (yaEsParte) return (
      <div style={tarjeta}>
        <div style={tit}>✅ Ya sos parte de la comunidad Grupo Nkt</div>
        {cuponYa && <TarjetaCupon cupon={cuponYa} />}
        {beneficios}
        {irPortal}
      </div>
    );
    return (
      <div>
        <div style={{ ...tarjeta, textAlign: "left", borderColor: "#3A7D4466", background: "#0F1A10" }}>
          <div style={{ ...tit, fontSize: 16, color: "#8FD19A" }}>¿Ya sos parte de la comunidad?</div>
          <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.5, margin: "6px 0 10px" }}>Ingresá con tu WhatsApp y listo: no hace falta cargar tus datos de nuevo.</div>
          <input value={ingWsp} onChange={function (e) { setIngWsp(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") ingresarMiembro(); }} inputMode="tel" placeholder="Tu WhatsApp" style={inpS} />
          {ingMsg && <div style={{ color: "#E0714A", fontSize: 12.5, marginBottom: 8 }}>{ingMsg}</div>}
          <button onClick={ingresarMiembro} disabled={ingBusy} style={{ ...btn, background: "#1A6B8A" }}>{ingBusy ? "Ingresando…" : "Ingresar"}</button>
        </div>
        {opReg && !identificado && (
          <div style={{ ...tarjeta, textAlign: "left" }}>
            <div style={{ ...tit, fontSize: 16 }}>¿Querés dejar tu nombre?</div>
            <div style={{ fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.5, margin: "6px 0 10px" }}>Tu opinión va a figurar con tu nombre. Si lo dejás vacío, queda como anónima.</div>
            <input value={fNombre} onChange={function (e) { setFNombre(e.target.value); }} maxLength={60} placeholder="Tu nombre" style={inpS} />
            <input value={fApellido} onChange={function (e) { setFApellido(e.target.value); }} maxLength={60} placeholder="Tu apellido" style={inpS} />
            <input value={fWsp} onChange={function (e) { setFWsp(e.target.value); }} maxLength={20} inputMode="tel" placeholder="Tu WhatsApp (opcional)" style={inpS} />
            {errId && <div style={{ color: "#E0714A", fontSize: 12.5, marginBottom: 8 }}>{errId}</div>}
            <button onClick={identificarse} style={{ ...btn, background: "#1A6B8A" }}>Guardar mi nombre</button>
          </div>
        )}
        {opReg && identificado && <div style={{ fontSize: 13, color: "#8FD19A", marginTop: 16 }}>✅ Tu opinión quedó con tu nombre, {fNombre.trim()}.</div>}
        <div style={{ ...tarjeta, textAlign: "left" }}>
          <div style={{ ...tit, textAlign: "center" }}>Sumate a nuestra comunidad de beneficios, descuentos, regalos y más</div>
          <div style={{ fontSize: 13, color: "#C8C8C8", lineHeight: 1.55, margin: "8px 0 12px", textAlign: "center" }}>{gancho || "Recibí un cupón de descuento y enterate primero de las novedades."}{cfg.premio ? " 🎁 Sorteo mensual: " + cfg.premio + "." : ""}</div>
          {abrirForm && !(opReg && !identificado) && (
            <div>
              <input value={fNombre} onChange={function (e) { setFNombre(e.target.value); }} maxLength={60} placeholder="Tu nombre" style={inpS} />
              <input value={fApellido} onChange={function (e) { setFApellido(e.target.value); }} maxLength={60} placeholder="Tu apellido" style={inpS} />
              <input value={fWsp} onChange={function (e) { setFWsp(e.target.value); }} maxLength={20} inputMode="tel" placeholder="Tu WhatsApp (ej: 2914123456)" style={inpS} />
            </div>
          )}
          {errCom && <div style={{ color: "#E0714A", fontSize: 12.5, marginBottom: 8 }}>{errCom}</div>}
          <button onClick={hacerUnirse} disabled={sumando} style={btn}>{sumando ? "Sumándote…" : "Unirme a la comunidad de beneficios Grupo Nkt"}</button>
          {consentimiento}
        </div>
      </div>
    );
  }

  if (!valido) {
    return <div style={fondo}><div style={caja}><div style={{ fontSize: 15, marginTop: 40, textAlign: "center" }}>Este enlace no es válido. Escaneá de nuevo el código QR.</div></div></div>;
  }
  if (hecho) {
    return (
      <div style={fondo}><div style={{ ...caja, textAlign: "center", marginTop: 50 }}>
        <div style={{ fontSize: 46 }}>🙌</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, marginTop: 10 }}>¡Gracias!</div>
        <div style={{ fontSize: 14, color: "#9A9A9A", marginTop: 10, lineHeight: 1.6 }}>
          {hecho === "ya" ? "Ya recibimos tu opinión. Podés volver a opinar más tarde." : "Recibimos tu opinión. Nos ayuda a mejorar todos los días."}
        </div>
        {hecho === "ok" && notaFinal >= 4 && cfg.google[localId] && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13.5, color: "#C8C8C8", lineHeight: 1.5, marginBottom: 10 }}>¡Qué bueno que la pasaste bien! ¿Nos ayudás dejando tu opinión también en Google? Nos suma muchísimo.</div>
            <a href={cfg.google[localId]} target="_blank" rel="noreferrer" style={{ display: "block", padding: "14px", borderRadius: 12, background: "#fff", color: "#222", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>⭐ Dejar mi reseña en Google</a>
          </div>
        )}
        {invitacionComunidad()}
        <div style={{ fontSize: 13, color: local.color, marginTop: 18, fontWeight: 700 }}>{local.emoji} {local.nombre}</div>
      </div></div>
    );
  }

  var completas = preguntas.every(function (q) { return notas[q[0]] > 0; });

  function enviar() {
    if (!completas || enviando) return;
    setEnviando(true); setError("");
    var ahora = new Date().toISOString();
    var fila = {
      id: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      ambito: "opinion",
      texto: JSON.stringify({ local: localId, canal: canal, zona: zona, notas: notas, comentario: comentario.trim().slice(0, 600), disp: idDispositivo(), prueba: modoPrueba ? 1 : 0 }),
      usuario: "cliente", created_at: ahora, updated_at: ahora,
    };
    fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "return=minimal" }, body: JSON.stringify(fila) })
      .then(function (r) {
        if (!r.ok) throw new Error("No se pudo enviar (" + r.status + ")");
        try { localStorage.setItem(claveLS, String(Date.now())); } catch (e) {}
        setOpReg({ id: fila.id, texto: JSON.parse(fila.texto) });
        var vs = Object.keys(notas).map(function (k) { return notas[k]; }).filter(function (v) { return v > 0; });
        setNotaFinal(vs.length ? vs.reduce(function (a, b) { return a + b; }, 0) / vs.length : 0);
        setHecho("ok");
      })
      .catch(function () { setError("No pudimos enviar tu opinión. Revisá tu conexión y probá de nuevo."); setEnviando(false); });
  }

  return (
    <div style={fondo}><div style={caja}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        {LOGOS[localId]
          ? <LogoLocal id={localId} alto={localId === "l1" ? 34 : 70} />
          : <div><div style={{ fontSize: 34 }}>{local.emoji}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: local.color }}>{local.nombre}</div></div>}
        <div style={{ fontSize: 14, color: "#C8C8C8", marginTop: 8, lineHeight: 1.5 }}>
          {canal === "delivery" ? "Contanos cómo fue tu pedido." : "Contanos cómo te atendimos hoy."} Son 20 segundos.
        </div>
      </div>

      {preguntas.map(function (q) {
        return (
          <div key={q[0]} style={{ background: "#111", border: "1px solid #1E1E1E", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{q[1]}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
              {[1, 2, 3, 4, 5].map(function (n) {
                var on = (notas[q[0]] || 0) >= n;
                return (
                  <button key={n} onClick={function () { setNotas(function (p) { var x = { ...p }; x[q[0]] = n; return x; }); }}
                    style={{ flex: 1, height: 46, borderRadius: 10, border: "1px solid " + (on ? "#D4A017" : "#2A2A2A"), background: on ? "#D4A01722" : "#0D0D0D", color: on ? "#D4A017" : "#4A4A4A", fontSize: 26, cursor: "pointer", padding: 0 }}>★</button>
                );
              })}
            </div>
          </div>
        );
      })}

      <textarea value={comentario} onChange={function (e) { setComentario(e.target.value); }} maxLength={600} rows={3}
        placeholder="¿Algo más que quieras contarnos? (opcional)"
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 12, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 14, resize: "vertical", outline: "none", marginTop: 4 }} />

      {error && <div style={{ color: "#E0714A", fontSize: 13, marginTop: 10 }}>{error}</div>}
      <button onClick={enviar} disabled={!completas || enviando}
        style={{ width: "100%", marginTop: 14, padding: "15px", borderRadius: 12, border: "none", background: completas ? "#C1440E" : "#2A2A2A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 800, cursor: completas ? "pointer" : "default" }}>
        {enviando ? "Enviando…" : "Enviar opinión"}
      </button>
      {!completas && <div style={{ fontSize: 12, color: "#6E6E6E", textAlign: "center", marginTop: 8 }}>Puntuá todas las opciones con estrellas para poder enviar.</div>}
    </div></div>
  );
}

// ─── TABLERO DE SOFÍA ────────────────────────────────────────────────────────
async function cargarOpiniones() {
  var todas = [];
  try {
    for (var pagina = 0; pagina < 10; pagina++) {
      var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.opinion&order=created_at.desc&limit=1000&offset=" + (pagina * 1000), { headers: SH });
      var d = await r.json();
      if (!Array.isArray(d)) break;
      todas = todas.concat(d);
      if (d.length < 1000) break;
    }
  } catch (e) {}
  return todas.map(function (f) {
    var x = null;
    try { x = JSON.parse(f.texto); } catch (e) {}
    if (!x || !x.local || !x.notas) return null;
    return { id: f.id, fecha: f.created_at, local: x.local, canal: x.canal === "delivery" ? "delivery" : "salon", zona: x.zona || "", notas: x.notas, comentario: x.comentario || "", nombre: x.nombre || "", wsp: x.wsp || "", apellido: x.apellido || "", disp: x.disp || "", prueba: !!x.prueba };
  }).filter(Boolean);
}

function promedio(lista) {
  if (!lista.length) return null;
  return lista.reduce(function (a, n) { return a + n; }, 0) / lista.length;
}
function fmtNota(n) { return n === null ? "—" : n.toFixed(2).replace(".", ","); }

var MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// La temporada va de octubre 2026 a marzo 2027.
// Noviembre es el mes de prueba (se ve todo, pero no suma a la temporada). La competencia real son diciembre, enero y febrero.
var PERIODOS = ["2026-11", "2026-12", "2027-01", "2027-02"];
var TEMPORADA_MESES = ["2026-12", "2027-01", "2027-02"];
var MES_PRUEBA = "2026-11";
function nombrePeriodo(p) { var s = p.split("-"); return MESES[parseInt(s[1], 10) - 1] + " " + s[0] + (p === MES_PRUEBA ? " (prueba)" : ""); }

// ─── PUNTUALIDAD Y CAJA ──────────────────────────────────────────────────────
var INICIO_TEMPORADA = "2026-12-01";
var FIN_TEMPORADA = "2027-02-28";
var INICIO_DATOS = "2026-11-01";            // desde cuándo se leen los fichajes (incluye el mes de prueba)
var TOLERANCIA_MIN = 10;                    // minutos de gracia para llegar
// Cómo se reparten los 100 puntos entre los indicadores que hoy se miden. Si alguno todavía no tiene
// datos, el resto se reparte en proporción. Más adelante se suman ventas y checklists.
var PESOS = { ventas: 0.35, opiniones: 0.25, puntualidad: 0.2, caja: 0.2 };
var NOMBRE_INDICADOR = { ventas: "Facturación", opiniones: "Opiniones de clientes", puntualidad: "Puntualidad", caja: "Caja prolija" };

// Facturación, en dos pasos: 1) cuánto creció el local contra su propio mes anterior (0% = 50 puntos, +20% = 100, −20% = 0) y
// 2) cuánto creció comparado con el promedio de los tres locales (igual al promedio = 50 puntos). Cada punto de diferencia suma o resta 2,5.
var PUNTOS_POR_PUNTO = 2.5;
function sumaVentas(p, localId, mes, hastaDia) {
  var total = 0;
  (p.cierres || []).forEach(function (c) {
    if (c.local !== localId || !c.fecha) return;
    var f = String(c.fecha).substring(0, 10);
    if (f.substring(0, 7) !== mes || parseInt(f.substring(8, 10), 10) > hastaDia) return;
    total += p.ventasDeCierre ? p.ventasDeCierre(c) : (parseFloat(c.total_ventas) || 0);
  });
  return total;
}
function mesAnt(m) { var pr = m.split("-"); var y = parseInt(pr[0], 10), mm = parseInt(pr[1], 10) - 1; if (mm === 0) { mm = 12; y--; } return y + "-" + pad2(mm); }
// Un mes entero, o —si todavía no terminó— los mismos primeros días de este mes y del anterior, para no comparar medio mes con un mes entero.
function calcVentasMes(p, mes, ids) {
  var ayer = ayerStr();
  var pr = mes.split("-");
  var ultimo = new Date(parseInt(pr[0], 10), parseInt(pr[1], 10), 0).getDate();
  var hasta = ultimo;
  if (ayer.substring(0, 7) < mes) return null;                       // el mes ni empezó
  if (ayer.substring(0, 7) === mes) hasta = parseInt(ayer.substring(8, 10), 10);
  var ant = mesAnt(mes);
  var out = {};
  ids.forEach(function (id) {
    var act = sumaVentas(p, id, mes, hasta), prev = sumaVentas(p, id, ant, hasta);
    out[id] = { actual: act, previo: prev, crec: prev > 0 && act > 0 ? (act / prev - 1) * 100 : null, hasta: hasta, completo: hasta === ultimo };
  });
  var con = ids.filter(function (id) { return out[id].crec !== null; });
  var prom = con.length ? con.reduce(function (a, id) { return a + out[id].crec; }, 0) / con.length : null;
  // Dos comparaciones, una después de la otra: 1) el local contra su propio mes anterior y 2) contra el crecimiento de los demás.
  // El puntaje de la facturación es el promedio de las dos.
  var tope = function (v) { return Math.max(0, Math.min(100, v)); };
  ids.forEach(function (id) {
    out[id].promedio = prom;
    if (out[id].crec === null || prom === null) { out[id].puntosPropio = null; out[id].puntosRel = null; out[id].puntos = null; return; }
    out[id].puntosPropio = tope(50 + out[id].crec * PUNTOS_POR_PUNTO);
    out[id].puntosRel = tope(50 + (out[id].crec - prom) * PUNTOS_POR_PUNTO);
    out[id].puntos = (out[id].puntosPropio + out[id].puntosRel) / 2;
  });
  return out;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fechaStr(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function ayerStr() { var d = new Date(); d.setDate(d.getDate() - 1); return fechaStr(d); }
// Los días del período que ya terminaron (hasta ayer): lo de hoy todavía no se le puede reclamar a nadie.
function diasDelPeriodo(periodo) {
  var desde, hasta;
  if (periodo === "temporada") { desde = INICIO_TEMPORADA; hasta = FIN_TEMPORADA; }
  else {
    var pr = periodo.split("-");
    desde = periodo + "-01";
    hasta = periodo + "-" + pad2(new Date(parseInt(pr[0], 10), parseInt(pr[1], 10), 0).getDate());
  }
  var tope = ayerStr();
  if (hasta > tope) hasta = tope;
  var out = [];
  var d = new Date(parseInt(desde.substring(0, 4), 10), parseInt(desde.substring(5, 7), 10) - 1, parseInt(desde.substring(8, 10), 10));
  while (fechaStr(d) <= hasta) { out.push(fechaStr(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function horaMin(h) {
  var p = String(h || "").split(":");
  return parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
}
async function cargarEntradas() {
  var mapa = {}, justif = {};
  try {
    for (var pagina = 0; pagina < 20; pagina++) {
      var q = "fichajes?tipo=eq.entrada&fecha=gte." + INICIO_DATOS + "&select=empleado_id,fecha,hora,momento&order=momento.asc&limit=1000&offset=" + (pagina * 1000);
      var r = await fetch(SURL + "/rest/v1/" + q, { headers: SH });
      var d = await r.json();
      if (!Array.isArray(d)) break;
      d.forEach(function (f) {
        var k = f.empleado_id + "|" + String(f.fecha).substring(0, 10);
        if (!mapa[k]) mapa[k] = f.hora;      // la primera entrada del día
      });
      if (d.length < 1000) break;
    }
  } catch (e) { return null; }
  // Faltas con justificativo (aprobado o todavía en revisión): no cuentan contra la puntualidad.
  try {
    var rj = await fetch(SURL + "/rest/v1/pautas?ambito=eq.justif_falta&order=created_at.desc&limit=1000", { headers: SH });
    var dj = await rj.json();
    if (Array.isArray(dj)) dj.forEach(function (f) {
      var x = null; try { x = JSON.parse(f.texto); } catch (e) {}
      if (x && x.empleado_id && x.fecha) justif[x.empleado_id + "|" + x.fecha] = x.estado || "pendiente";
    });
  } catch (e) {}
  return { entradas: mapa, justif: justif };
}
function calcPuntualidad(localId, dias, p, datos) {
  var entradas = datos.entradas, justif = datos.justif || {};
  var res = { previstas: 0, aTiempo: 0, tarde: 0, faltas: 0, sinJornada: 0, puntaje: null, detalle: [] };
  var vacs = (p.vacaciones || []);
  var porEmp = {};   // quién generó los atrasos y las faltas
  function filaDe(e) { return porEmp[e.id] || (porEmp[e.id] = { nombre: e.nombre, tardes: [], faltas: [] }); }
  (p.empleados || []).filter(function (e) { return e.local === localId && e.activo !== false; }).forEach(function (e) {
    var tiene = false;
    dias.forEach(function (f) {
      var t = p.turnoDe(e, f);
      if (t === null || t === undefined) return;
      tiene = true;
      if (t.franco) return;
      if (e.fecha_alta && f < String(e.fecha_alta).substring(0, 10)) return;
      if (p.fichajeDesde && f < p.fichajeDesde) return;   // antes de usar el fichaje no hay faltas
      var devacaciones = vacs.some(function (v) { return v.empleado_id === e.id && f >= String(v.fecha_desde).substring(0, 10) && f <= String(v.fecha_hasta).substring(0, 10); });
      if (devacaciones) return;
      var h = entradas[e.id + "|" + f];
      var est = justif[e.id + "|" + f];
      if (!h && est && est !== "rechazado") return;   // falta justificada: no cuenta
      res.previstas++;
      if (!h) { res.faltas++; filaDe(e).faltas.push(f); return; }
      if (horaMin(h) <= horaMin(t.desde) + TOLERANCIA_MIN) res.aTiempo++; else { res.tarde++; filaDe(e).tardes.push({ f: f, min: horaMin(h) - horaMin(t.desde) }); }
    });
    if (!tiene) res.sinJornada++;
  });
  if (res.previstas > 0) res.puntaje = (res.aTiempo / res.previstas) * 100;
  res.detalle = Object.keys(porEmp).map(function (k) { return porEmp[k]; }).sort(function (a, b) { return (b.tardes.length + b.faltas.length) - (a.tardes.length + a.faltas.length); });
  return res;
}
function calcCaja(localId, dias, p) {
  var res = { esperados: 0, buenos: 0, conDiferencia: 0, sinCierre: 0, puntaje: null };
  var cierres = {}, avisos = {};
  (p.cierres || []).forEach(function (c) { if (c.local === localId) cierres[String(c.fecha).substring(0, 10)] = true; });
  (p.avisosCaja || []).forEach(function (a) { if (a.local === localId) avisos[String(a.fecha).substring(0, 10)] = true; });
  dias.forEach(function (f) {
    if (!p.abreEseDia(localId, f)) return;
    res.esperados++;
    if (!cierres[f]) { res.sinCierre++; return; }
    if (avisos[f]) res.conDiferencia++; else res.buenos++;
  });
  if (res.esperados > 0) res.puntaje = (res.buenos / res.esperados) * 100;
  return res;
}
function totalPuntos(partes) {
  var s = 0, w = 0;
  Object.keys(PESOS).forEach(function (k) {
    if (partes[k] !== null && partes[k] !== undefined) { s += PESOS[k] * partes[k]; w += PESOS[k]; }
  });
  return w > 0 ? s / w : null;
}
function fmtPts(n) { return n === null || n === undefined ? "—" : n.toFixed(1).replace(".", ","); }

function Estrellas(p) {
  var n = p.valor === null ? 0 : p.valor;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {[1, 2, 3, 4, 5].map(function (i) {
        return <span key={i} style={{ color: n >= i - 0.25 ? "#D4A017" : "#2E2E2E", fontSize: p.chico ? 11 : 14 }}>★</span>;
      })}
    </span>
  );
}

export function PanelCompetencia(props) {
  // Vista del cajero: solo lectura y solo lo de su local; sin WhatsApp, sin borrar y sin configuración.
  var vistaCajero = !!props.vistaCajero;
  var soloMiLocal = vistaCajero ? (props.cajeroLocal || "") : "";
  var [tab, setTab] = useState("ranking");
  var [entradas, setEntradas] = useState(null);
  var [opiniones, setOpiniones] = useState(null);
  var [periodo, setPeriodo] = useState(function () { var m = ayerStr().substring(0, 7); return PERIODOS.indexOf(m) !== -1 && TEMPORADA_MESES.indexOf(m) === -1 ? m : (TEMPORADA_MESES.indexOf(m) !== -1 ? "temporada" : MES_PRUEBA); });
  var [filtroLocal, setFiltroLocal] = useState("todos");
  var [vistaMes, setVistaMes] = useState(false);   // pantalla aparte: opiniones por mes, como Egresos del mes
  var [mesVista, setMesVista] = useState(function () { return new Date().toISOString().substring(0, 7); });
  var [localVista, setLocalVista] = useState("l1");
  var [cfgPanel, setCfgPanel] = useState({ google: {}, premio: "" });
  var [verCfg, setVerCfg] = useState(false);
  var [miembrosCom, setMiembrosCom] = useState([]);   // miembros de la comunidad: ponen nombre a las opiniones y participan del sorteo
  var [sorteos, setSorteos] = useState({});   // mes → ganador
  var [msgCfg, setMsgCfg] = useState("");

  useEffect(function () {
    cargarConfigOpiniones().then(setCfgPanel);
    fetch(SURL + "/rest/v1/pautas?ambito=eq.opinion_sorteo&limit=100", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      var m = {}; if (Array.isArray(d)) d.forEach(function (f) { try { var x = JSON.parse(f.texto); if (x && x.mes) m[x.mes] = x; } catch (e) {} });
      setSorteos(m);
    }).catch(function () {});
  }, []);
  useEffect(function () {
    fetch(SURL + "/rest/v1/pautas?ambito=eq.comunidad&order=created_at.desc&limit=2000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      setMiembrosCom(Array.isArray(d) ? d.map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).filter(Boolean) : []);
    }).catch(function () {});
  }, []);
  var porDisp = {}; miembrosCom.forEach(function (m) { if (m.disp) porDisp[m.disp] = m; });
  function nombreDe(o) { var m = o.disp ? porDisp[o.disp] : null; var propio = ((o.nombre || "") + (o.apellido ? " " + o.apellido : "")).trim(); return propio || (m ? nombreCompleto(m) : "") || "Anónimo"; }
  function wspDe(o) { var m = o.disp ? porDisp[o.disp] : null; return o.wsp || (m ? m.wsp : "") || ""; }
  function guardarCfg() {
    guardarFilaPauta("opinion_config", "opinion_config", cfgPanel).then(function (ok) { setMsgCfg(ok ? "✓ Guardado" : "No se pudo guardar"); setTimeout(function () { setMsgCfg(""); }, 2500); });
  }
  function sortear(mes, participantes) {
    if (participantes.length === 0) return;
    if (sorteos[mes] && !window.confirm("Ya hay un ganador de este mes (" + sorteos[mes].nombre + "). ¿Sortear de nuevo?")) return;
    var g = participantes[Math.floor(Math.random() * participantes.length)];
    var obj = { mes: mes, id: g.id, nombre: g.nombre, wsp: g.wsp, local: g.local, premio: cfgPanel.premio || "", fecha: new Date().toISOString(), participantes: participantes.length };
    guardarFilaPauta("opinion_sorteo_" + mes, "opinion_sorteo", obj).then(function (ok) { if (ok) setSorteos(function (p) { var n = { ...p }; n[mes] = obj; return n; }); else window.alert("No se pudo guardar el sorteo."); });
  }
  var [celusPersonal, setCelusPersonal] = useState({});   // ID de celular → nombres de quienes lo usan para fichar
  function recargar() { cargarOpiniones().then(setOpiniones); }
  useEffect(function () {
    recargar(); cargarEntradas().then(setEntradas);
    fetch(SURL + "/rest/v1/fichajes?select=empleado_nombre,notas&notas=ilike.*Disp:*&order=momento.desc&limit=5000", { headers: SH }).then(function (r) { return r.json(); }).then(function (d) {
      var m = {};
      if (Array.isArray(d)) d.forEach(function (f) {
        var x = /Disp:(\w+)/.exec(f.notas || "");
        if (x && x[1] !== "sinid" && f.empleado_nombre) { var a = m[x[1]] = m[x[1]] || []; if (a.indexOf(f.empleado_nombre) === -1) a.push(f.empleado_nombre); }
      });
      setCelusPersonal(m);
    }).catch(function () {});
  }, []);
  function delPersonal(o) { return o.disp ? (celusPersonal[o.disp] || null) : null; }

  var listaTodas = (opiniones || []).filter(function (o) {
    return periodo === "temporada" ? TEMPORADA_MESES.indexOf(String(o.fecha).substring(0, 7)) !== -1 : String(o.fecha).substring(0, 7) === periodo;
  });
  // Las opiniones que salen de un celular que ficha un empleado no cuentan en el ranking.
  var lista = listaTodas.filter(function (o) { return !delPersonal(o) && !o.prueba; });
  var delPersonalN = listaTodas.length - lista.length;
  // Varias opiniones del mismo celular al mismo local: se avisan para que decidas si se descartan.
  var repetidas = {};
  lista.forEach(function (o) { if (o.disp) { var k = o.disp + "|" + o.local; repetidas[k] = (repetidas[k] || 0) + 1; } });

  function resumen(localId, canal) {
    var delLocal = lista.filter(function (o) { return o.local === localId && o.canal === canal; });
    var porPregunta = PREGUNTAS[canal].map(function (q) {
      var vals = delLocal.map(function (o) { return o.notas[q[0]]; }).filter(function (v) { return v > 0; });
      return { id: q[0], nombre: q[1], prom: promedio(vals) };
    });
    var proms = porPregunta.map(function (q) { return q.prom; }).filter(function (v) { return v !== null; });
    return { cantidad: delLocal.length, general: promedio(proms), porPregunta: porPregunta };
  }

  function borrar(id) {
    if (!window.confirm("¿Borrar esta opinión? No se puede deshacer.")) return;
    fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: SH }).then(function () {
      setOpiniones(function (prev) { return (prev || []).filter(function (o) { return o.id !== id; }); });
    });
  }

  // En el mes de prueba se pueden borrar todas las opiniones juntas (las que tienen comentario se borran también de a una, abajo).
  function borrarPrueba() {
    var ids = lista.map(function (o) { return o.id; });
    if (ids.length === 0) return;
    if (!window.confirm("¿Borrar las " + ids.length + " opiniones de " + nombrePeriodo(MES_PRUEBA) + "?\n\nNo se puede deshacer. Las de diciembre, enero y febrero no se tocan.")) return;
    var trozos = [];
    for (var i = 0; i < ids.length; i += 40) trozos.push(ids.slice(i, i + 40));
    Promise.all(trozos.map(function (t) {
      return fetch(SURL + "/rest/v1/pautas?ambito=eq.opinion&id=in.(" + t.map(function (x) { return encodeURIComponent(x); }).join(",") + ")", { method: "DELETE", headers: SH });
    })).then(function () { recargar(); });
  }

  var salon = LOCALES_COMPETENCIA.map(function (id) { return { local: localDe(id), r: resumen(id, "salon") }; });
  var ranking = salon.slice().sort(function (a, b) { return (b.r.general === null ? -1 : b.r.general) - (a.r.general === null ? -1 : a.r.general); });

  var comentarios = listaTodas.filter(function (o) { return (filtroLocal === "todos" || o.local === filtroLocal) && (!soloMiLocal || o.local === soloMiLocal); }).slice(0, 80);

  var tarjeta = { background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px 16px", marginBottom: 12 };
  var sel = { padding: "7px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12 };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5 }}>Temporada dic 2026 – feb 2027 · noviembre es de prueba</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800 }}>🏆 Competencia entre locales</div>
        {props.soloLectura && <div style={{ fontSize: 11.5, color: "#9A9A9A", marginTop: 4, lineHeight: 1.5 }}>Así va la competencia. Abajo de cada local está el detalle de por qué tiene ese puntaje.</div>}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["ranking", "🏁 Ranking"], ["opiniones", "⭐ Opiniones de clientes"], ["qr", "🖨️ QR para imprimir"]].filter(function (t) { return !props.soloLectura || t[0] === "ranking" || (vistaCajero && t[0] === "opiniones"); }).map(function (t) {
          var act = tab === t[0];
          return <button key={t[0]} onClick={function () { setTab(t[0]); }} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid " + (act ? "#D4A017" : "#1A1A1A"), background: act ? "#D4A01722" : "none", color: act ? "#D4A017" : "#8C8C8C", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t[1]}</button>;
        })}
      </div>

      {tab !== "qr" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <select value={periodo} onChange={function (e) { setPeriodo(e.target.value); }} style={sel}>
            <option value="temporada">📅 Toda la temporada (dic – feb)</option>
            {PERIODOS.map(function (p) { return <option key={p} value={p}>{nombrePeriodo(p)}</option>; })}
          </select>
          <button onClick={function () { recargar(); cargarEntradas().then(setEntradas); }} style={{ ...sel, cursor: "pointer" }}>🔄 Actualizar</button>
          <div style={{ fontSize: 11, color: "#7E7E7E" }}>{opiniones === null ? "Cargando…" : lista.length + " opiniones en el período"}</div>
        </div>
      )}

      {tab === "ranking" && (function () {
        var dias = diasDelPeriodo(periodo);
        var filas = LOCALES_COMPETENCIA.map(function (id) {
          var op = resumen(id, "salon");
          var pu = entradas ? calcPuntualidad(id, dias, props, entradas) : null;
          var ca = calcCaja(id, dias, props);
          var meses = periodo === "temporada" ? TEMPORADA_MESES : [periodo];
          var vm = meses.map(function (m) { return { mes: m, d: calcVentasMes(props, m, LOCALES_COMPETENCIA) }; }).filter(function (x) { return x.d; });
          var ptsV = vm.map(function (x) { return x.d[id].puntos; }).filter(function (v) { return v !== null; });
          var ventas = { meses: vm.map(function (x) { return Object.assign({ mes: x.mes }, x.d[id]); }), puntaje: ptsV.length ? ptsV.reduce(function (a, v) { return a + v; }, 0) / ptsV.length : null };
          var partes = {
            ventas: ventas.puntaje,
            opiniones: op.general === null ? null : ((op.general - 1) / 4) * 100,
            puntualidad: pu ? pu.puntaje : null,
            caja: ca.puntaje,
          };
          return { local: localDe(id), op: op, pu: pu, ca: ca, ventas: ventas, partes: partes, total: totalPuntos(partes) };
        }).sort(function (a, b) { return (b.total === null ? -1 : b.total) - (a.total === null ? -1 : a.total); });
        var medallas = ["🥇", "🥈", "🥉"];
        function Barra(q) {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ width: 128, fontSize: 11.5, color: "#B8B8B8" }}>{q.nombre}</div>
              <div style={{ flex: 1, height: 6, background: "#1A1A1A", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: (q.valor === null ? 0 : Math.max(0, Math.min(100, q.valor))) + "%", height: "100%", background: q.color }} />
              </div>
              <div style={{ width: 44, textAlign: "right", fontSize: 12, fontWeight: 700 }}>{q.valor === null ? "—" : fmtPts(q.valor)}</div>
              {q.aporte !== undefined && <div style={{ width: "100%", fontSize: 10.5, color: "#7E7E7E", paddingLeft: 136 }}>{q.aporte === null ? "sin datos todavía: no suma ni resta" : "aporta " + fmtPts(q.aporte) + " de " + fmtPts(q.maximo) + " puntos"}</div>}
            </div>
          );
        }
        // Cuánto aporta cada indicador al total: su peso (repartido si falta alguno) por su puntaje.
        function aportes(partes) {
          var w = 0; Object.keys(PESOS).forEach(function (k) { if (partes[k] !== null && partes[k] !== undefined) w += PESOS[k]; });
          var out = {};
          Object.keys(PESOS).forEach(function (k) {
            var tiene = partes[k] !== null && partes[k] !== undefined && w > 0;
            out[k] = { aporte: tiene ? (PESOS[k] / w) * partes[k] : null, maximo: tiene ? (PESOS[k] / w) * 100 : PESOS[k] * 100 };
          });
          return out;
        }
        return (
          <div>
            {props.soloLectura && (
              <div style={{ ...tarjeta, fontSize: 12.5, color: "#C8C8C8", lineHeight: 1.6 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#F0EDE8", marginBottom: 6 }}>¿Cómo se calcula el puntaje?</div>
                <div style={{ marginBottom: 8 }}>Cada local suma de 0 a 100 puntos. Gana el local que más puntos junta en la temporada (diciembre, enero y febrero). <b style={{ color: "#E8E8E8" }}>Noviembre es de prueba</b>: se ve todo, pero no cuenta para ganar.</div>
                {[
                  ["ventas", "📈", "Cuánto creció la facturación del local contra su mes anterior, y cuánto creció comparado con los otros dos locales. Se mira en porcentajes. Crecer más suma más."],
                  ["opiniones", "⭐", "Lo que opinan los clientes en el código QR de la mesa. 5 estrellas = 100 puntos y 1 estrella = 0."],
                  ["puntualidad", "⏰", "Los turnos en que se marcó la entrada hasta 10 minutos después de la hora de entrada. Cada falta o atraso baja el puntaje."],
                  ["caja", "🧾", "Los días en que se cerró la caja y no hubo diferencias. Cerrar todos los días y sin diferencias da el máximo."]
                ].map(function (r) {
                  return (
                    <div key={r[0]} style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: "1px solid #1A1A1A" }}>
                      <div style={{ width: 22 }}>{r[1]}</div>
                      <div style={{ minWidth: 0 }}><b style={{ color: "#E8E8E8" }}>{NOMBRE_INDICADOR[r[0]]} · {Math.round(PESOS[r[0]] * 100)}% del puntaje.</b> {r[2]}</div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 6, fontSize: 11.5, color: "#8C8C8C" }}>Abajo, en cada local, ves cuántos puntos le aportó cada cosa y por qué.</div>
              </div>
            )}
            {!props.soloLectura && (
            <div style={{ ...tarjeta, fontSize: 11.5, color: "#9A9A9A", lineHeight: 1.6 }}>
              Cada local suma de 0 a 100 puntos. Hoy cuentan {["", "una cosa", "dos cosas", "tres cosas", "cuatro cosas"][Object.keys(PESOS).length]}:{" "}
              {Object.keys(PESOS).map(function (k) { return NOMBRE_INDICADOR[k] + " " + Math.round(PESOS[k] * 100) + "%"; }).join(" · ")}.
              {" "}Pronto se suman los checklists. Si un indicador todavía no tiene datos, el resto se reparte en proporción.
              <div style={{ marginTop: 6, color: "#6E6E6E" }}>
                Facturación, en dos pasos: ① cuánto creció el local contra su propio mes anterior (0% = 50 puntos, cada punto de crecimiento suma {PUNTOS_POR_PUNTO.toString().replace(".", ",")}) y ② cuánto creció comparado con el promedio de los tres locales (igual al promedio = 50 puntos). El puntaje es el promedio de los dos. Opiniones: 5 estrellas = 100, 1 estrella = 0. Puntualidad: turnos en que se marcó la entrada hasta {TOLERANCIA_MIN} minutos después de la hora. Caja: días con el cierre hecho y sin diferencias.
              </div>
            </div>)}

            {filas.map(function (x, i) {
              return (
                <div key={x.local.id} style={{ ...tarjeta, borderColor: x.local.color + "44" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: x.local.color }}>{x.total !== null && i < 3 ? medallas[i] + " " : ""}{x.local.emoji} {x.local.nombre}</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Playfair Display',serif", lineHeight: 1 }}>{fmtPts(x.total)}</div>
                      <div style={{ fontSize: 10, color: "#6E6E6E" }}>de 100 puntos</div>
                    </div>
                  </div>
                  {(function () {
                    var ap = aportes(x.partes);
                    return (
                      <div>
                        <Barra nombre="Facturación vs mes anterior" valor={x.partes.ventas} color={x.local.color} aporte={ap.ventas.aporte} maximo={ap.ventas.maximo} />
                        <Barra nombre="Opiniones de clientes" valor={x.partes.opiniones} color={x.local.color} aporte={ap.opiniones.aporte} maximo={ap.opiniones.maximo} />
                        <Barra nombre="Puntualidad" valor={x.partes.puntualidad} color={x.local.color} aporte={ap.puntualidad.aporte} maximo={ap.puntualidad.maximo} />
                        <Barra nombre="Caja prolija" valor={x.partes.caja} color={x.local.color} aporte={ap.caja.aporte} maximo={ap.caja.maximo} />
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, margin: "16px 0 6px" }}>Detalle</div>
            {filas.map(function (x) {
              var pu = x.pu, ca = x.ca;
              return (
                <div key={x.local.id} style={{ ...tarjeta, padding: "11px 14px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: x.local.color, marginBottom: 6 }}>{x.local.emoji} {x.local.nombre}</div>
                  <div style={{ fontSize: 11.5, color: "#B8B8B8", lineHeight: 1.7 }}>
                    <b style={{ color: "#E8E8E8" }}>Facturación:</b>{" "}
                    {x.ventas.meses.length === 0 ? "todavía no empezó el período" : x.ventas.meses.map(function (m, k) {
                      var fm = function (n) { return "$" + Math.round(n).toLocaleString("es-AR"); };
                      var pc = function (n) { return (n >= 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + "%"; };
                      var nom = nombrePeriodo(m.mes) + (m.completo ? "" : " (hasta el día " + m.hasta + " de cada mes)");
                      if (m.crec === null) return <div key={k} style={{ paddingLeft: 10 }}>{nom}: sin ventas para comparar con {nombrePeriodo(mesAnt(m.mes)).replace(" (prueba)", "")}</div>;
                      return (
                        <div key={k} style={{ paddingLeft: 10, marginTop: 2 }}>
                          <b style={{ color: "#D8D8D8" }}>{nom}</b>
                          <div>① Contra su propio mes anterior: {pc(m.crec)}{props.soloLectura ? "" : " (" + fm(m.actual) + " contra " + fm(m.previo) + ")"} → {fmtPts(m.puntosPropio)} de 100</div>
                          <div>② Contra los demás locales: el promedio fue {pc(m.promedio)}, este local quedó {Math.abs(m.crec - m.promedio).toFixed(1).replace(".", ",")} puntos {m.crec - m.promedio >= 0 ? "por encima" : "por debajo"} → {fmtPts(m.puntosRel)} de 100</div>
                          <div>Facturación del mes: promedio de ① y ② = <b style={{ color: "#E8E8E8" }}>{fmtPts(m.puntos)}</b></div>
                        </div>
                      );
                    })}
                    <br />
                    <b style={{ color: "#E8E8E8" }}>Opiniones:</b>{" "}
                    {x.op.general === null ? "todavía no hay opiniones de clientes en este período" : "promedio " + fmtNota(x.op.general) + " de 5 estrellas con " + x.op.cantidad + " opinion" + (x.op.cantidad === 1 ? "" : "es") + " = " + fmtPts(x.partes.opiniones) + " de 100" + (x.op.cantidad < MINIMO_OPINIONES ? " (todavía pocas: mínimo " + MINIMO_OPINIONES + ")" : "")}
                    <br />
                    <b style={{ color: "#E8E8E8" }}>Puntualidad:</b>{" "}
                    {entradas === null ? "cargando fichajes…" : (pu.previstas === 0
                      ? "sin turnos para comparar en este período" + (pu.sinJornada ? " (" + pu.sinJornada + " empleado" + (pu.sinJornada === 1 ? "" : "s") + " sin jornada cargada)" : "")
                      : pu.aTiempo + " de " + pu.previstas + " turnos a tiempo · " + pu.tarde + " con atraso · " + pu.faltas + " sin marca" + (pu.sinJornada ? " · " + pu.sinJornada + " sin jornada cargada (no cuentan)" : ""))}
                    {!props.soloLectura && pu && pu.detalle && pu.detalle.length > 0 && (
                      <div style={{ margin: "5px 0 2px", padding: "6px 9px", background: "#0A0A0A", border: "1px solid #1E1E1E", borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: "#7E7E7E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Quiénes bajaron la puntualidad (solo lo ves vos)</div>
                        {pu.detalle.map(function (d) {
                          var dd = function (f) { return String(f).substring(8, 10) + "/" + String(f).substring(5, 7); };
                          return (
                            <div key={d.nombre} style={{ fontSize: 11.5, lineHeight: 1.6, color: "#C8C8C8" }}>
                              <b style={{ color: "#F0EDE8" }}>{d.nombre}</b>
                              {d.tardes.length > 0 ? " · " + d.tardes.length + " atraso" + (d.tardes.length === 1 ? "" : "s") + " (" + d.tardes.map(function (t) { return dd(t.f) + " +" + t.min + " min"; }).join(", ") + ")" : ""}
                              {d.faltas.length > 0 ? " · " + d.faltas.length + " sin marca (" + d.faltas.map(dd).join(", ") + ")" : ""}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <br />
                    <b style={{ color: "#E8E8E8" }}>Caja:</b>{" "}
                    {ca.esperados === 0 ? "todavía no hay días para comparar" : ca.buenos + " de " + ca.esperados + " días con cierre y sin diferencias · " + ca.conDiferencia + " con diferencia · " + ca.sinCierre + " sin cierre"}
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 10.5, color: "#6E6E6E", lineHeight: 1.5 }}>
              Los días de vacaciones y los francos no cuentan. Se cuenta hasta ayer. La temporada va de diciembre 2026 a febrero 2027; noviembre es de prueba y no suma.
            </div>
          </div>
        );
      })()}

      {tab === "opiniones" && (
        <div>
          {!props.soloLectura && (
            <div style={{ background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 12, padding: "10px 13px", marginBottom: 12 }}>
              <div onClick={function () { setVerCfg(!verCfg); }} style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 800, color: "#D8D8D8" }}>{verCfg ? "▾" : "▸"} ⚙️ Reseñas de Google y sorteo</div>
              {verCfg && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "#8C8C8C", lineHeight: 1.5, marginBottom: 8 }}>Pegá el enlace de reseñas de Google de cada local. Se le ofrece al cliente que puso 4 o 5 estrellas. Si lo dejás vacío, no se muestra.</div>
                  {LOCALES_COMPETENCIA.map(function (id) {
                    var l = localDe(id);
                    return <input key={id} value={cfgPanel.google[id] || ""} onChange={function (e) { var v = e.target.value; setCfgPanel(function (c) { var g = { ...c.google }; g[id] = v.trim(); return { ...c, google: g }; }); }} placeholder={"Enlace de Google de " + l.nombre} style={{ ...sel, width: "100%", boxSizing: "border-box", marginBottom: 6 }} />;
                  })}
                  <div style={{ fontSize: 11, color: "#8C8C8C", lineHeight: 1.5, margin: "6px 0" }}>Premio del sorteo mensual entre los miembros de la comunidad (se muestra en la invitación). Vacío = sin sorteo.</div>
                  <input value={cfgPanel.premio || ""} onChange={function (e) { var v = e.target.value; setCfgPanel(function (c) { return { ...c, premio: v }; }); }} placeholder="Ej: una cena para dos" style={{ ...sel, width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
                  <button onClick={guardarCfg} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#1A6B8A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
                  {msgCfg && <span style={{ fontSize: 11.5, color: "#4C9A5A", marginLeft: 10 }}>{msgCfg}</span>}
                </div>
              )}
            </div>
          )}
          {!props.soloLectura && <button onClick={function () { setVistaMes(true); }} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid #D4A01755", background: "#D4A01711", color: "#D4A017", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>📊 Ver las opiniones mes por mes</button>}
          {!props.soloLectura && periodo === MES_PRUEBA && lista.length > 0 && (
            <div style={{ background: "#14100A", border: "1px solid #D4A01755", borderRadius: 12, padding: "10px 13px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#D8D8D8", lineHeight: 1.5 }}>Noviembre es el mes de prueba: estas {lista.length} opiniones no suman a la temporada.</div>
              <button onClick={borrarPrueba} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #C1440E66", background: "#C1440E22", color: "#E0714A", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑️ Borrar las {lista.length} de prueba</button>
            </div>
          )}

          <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>En el local · ranking por promedio</div>
          {ranking.filter(function (x) { return !soloMiLocal || x.local.id === soloMiLocal; }).map(function (x, i) {
            var pocas = x.r.cantidad < MINIMO_OPINIONES;
            return (
              <div key={x.local.id} style={{ ...tarjeta, borderColor: x.local.color + "44" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: x.local.color }}>{x.r.general !== null && i === 0 ? "🥇 " : ""}{x.local.emoji} {x.local.nombre}</div>
                    <div style={{ fontSize: 10.5, color: pocas ? "#E0914A" : "#7E7E7E", marginTop: 2 }}>
                      {x.r.cantidad} opinion{x.r.cantidad === 1 ? "" : "es"}{pocas ? " · todavía pocas (mínimo " + MINIMO_OPINIONES + ")" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Playfair Display',serif", color: "#F0EDE8" }}>{fmtNota(x.r.general)}</div>
                    <Estrellas valor={x.r.general} />
                  </div>
                </div>
                {x.r.porPregunta.map(function (q) {
                  return (
                    <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 118, fontSize: 11.5, color: "#B8B8B8" }}>{q.nombre}</div>
                      <div style={{ flex: 1, height: 6, background: "#1A1A1A", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: (q.prom === null ? 0 : (q.prom / 5) * 100) + "%", height: "100%", background: x.local.color }} />
                      </div>
                      <div style={{ width: 34, textAlign: "right", fontSize: 12, fontWeight: 700 }}>{fmtNota(q.prom)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, margin: "16px 0 6px" }}>🛵 Delivery (aparte)</div>
          {LOCALES_COMPETENCIA.filter(function (id) { return !soloMiLocal || id === soloMiLocal; }).map(function (id) {
            var l = localDe(id), d = resumen(id, "delivery");
            return (
              <div key={id} style={{ ...tarjeta, borderColor: l.color + "44" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: l.color }}>{l.emoji} {l.nombre}</div>
                    <div style={{ fontSize: 10.5, color: "#7E7E7E", marginTop: 2 }}>{d.cantidad} opinion{d.cantidad === 1 ? "" : "es"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Playfair Display',serif", marginRight: 8 }}>{fmtNota(d.general)}</span>
                    <Estrellas valor={d.general} />
                  </div>
                </div>
                {d.porPregunta.map(function (q) {
                  return (
                    <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 150, fontSize: 11.5, color: "#B8B8B8" }}>{q.nombre}</div>
                      <div style={{ flex: 1, height: 6, background: "#1A1A1A", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: (q.prom === null ? 0 : (q.prom / 5) * 100) + "%", height: "100%", background: l.color }} />
                      </div>
                      <div style={{ width: 34, textAlign: "right", fontSize: 12, fontWeight: 700 }}>{fmtNota(q.prom)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div style={{ fontSize: 10.5, color: "#6E6E6E", marginTop: -4 }}>Por ahora el delivery se ve aparte y no entra en el ranking de arriba.</div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 6px", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Quién opinó</div>
            {!soloMiLocal && <select value={filtroLocal} onChange={function (e) { setFiltroLocal(e.target.value); }} style={sel}>
              <option value="todos">Todos los locales</option>
              {LOCALES_COMPETENCIA.map(function (id) { return <option key={id} value={id}>{localDe(id).nombre}</option>; })}
            </select>}
          </div>
          {!props.soloLectura && delPersonalN > 0 && <div style={{ fontSize: 11, color: "#B07AE0", marginBottom: 6 }}>👤 {delPersonalN} opinion{delPersonalN === 1 ? "" : "es"} de celulares del personal no cuenta{delPersonalN === 1 ? "" : "n"} en el ranking.</div>}
          {comentarios.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "8px 0" }}>Todavía no hay opiniones en este período.</div>}
          {comentarios.map(function (o) {
            var l = localDe(o.local);
            var prom = promedio(Object.keys(o.notas).map(function (k) { return o.notas[k]; }).filter(function (v) { return v > 0; }));
            return (
              <div key={o.id} style={{ ...tarjeta, padding: "10px 13px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 11, color: l ? l.color : "#9A9A9A", fontWeight: 700 }}>
                    {l ? l.emoji + " " + l.nombre : o.local} · {o.canal === "delivery" ? "delivery" : (o.zona === "barra" ? "barra" : o.zona === "mesa" ? "mesa" : "salón")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Estrellas valor={prom} chico />
                    <span style={{ fontSize: 10, color: "#6E6E6E" }}>{new Date(o.fecha).toLocaleDateString("es-AR")}</span>
                    {!props.soloLectura && <button onClick={function () { borrar(o.id); }} title="Borrar" style={{ background: "none", border: "none", color: "#6E6E6E", cursor: "pointer", fontSize: 12 }}>🗑️</button>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <b style={{ fontSize: 13, color: "#F0EDE8" }}>{nombreDe(o)}</b>
                  {!props.soloLectura && wspDe(o) && <a href={"https://wa.me/" + (wspDe(o).replace(/\D/g, "").length <= 10 ? "54" + wspDe(o).replace(/\D/g, "") : wspDe(o).replace(/\D/g, ""))} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#4C9A5A", textDecoration: "none" }}>💬 {wspDe(o)}</a>}
                  {!props.soloLectura && o.prueba && <span style={{ fontSize: 10.5, color: "#E0914A", background: "#E0914A22", borderRadius: 6, padding: "1px 7px" }}>🧪 de prueba · no cuenta</span>}
                  {!props.soloLectura && delPersonal(o) && <span style={{ fontSize: 10.5, color: "#B07AE0", background: "#B07AE022", borderRadius: 6, padding: "1px 7px" }}>👤 celular del personal ({delPersonal(o).join(", ")}) · no cuenta</span>}
                  {!props.soloLectura && !delPersonal(o) && o.disp && repetidas[o.disp + "|" + o.local] >= 3 && <span style={{ fontSize: 10.5, color: "#E0914A", background: "#E0914A22", borderRadius: 6, padding: "1px 7px" }}>⚠️ {repetidas[o.disp + "|" + o.local]} opiniones del mismo celular</span>}
                </div>
                <DetalleVotos o={o} />
                {o.comentario && <div style={{ fontSize: 13, color: "#E8E8E8", lineHeight: 1.45, marginTop: 5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{o.comentario}</div>}
              </div>
            );
          })}
        </div>
      )}

      {vistaMes && (function () {
        // Meses con opiniones (más el actual), del más nuevo al más viejo.
        var meses = {}; meses[new Date().toISOString().substring(0, 7)] = true;
        (opiniones || []).forEach(function (o) { meses[String(o.fecha).substring(0, 7)] = true; });
        var listaMeses = Object.keys(meses).sort().reverse();
        var delMes = (opiniones || []).filter(function (o) { return String(o.fecha).substring(0, 7) === mesVista; });
        var validas = delMes.filter(function (o) { return !delPersonal(o) && !o.prueba; });
        function prom(l) { return promedio(l.map(function (o) { return promedio(Object.keys(o.notas).map(function (k) { return o.notas[k]; }).filter(function (v) { return v > 0; })); }).filter(function (v) { return v !== null; })); }
        var nomMes = function (m) { var q = m.split("-"); return MESES[parseInt(q[1], 10) - 1] + " " + q[0]; };
        var delLocalV = delMes.filter(function (o) { return o.local === localVista; }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
        var lv = localDe(localVista) || {};
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#0A0A0A", zIndex: 999, overflowY: "auto", padding: 16, fontFamily: "'Inter',sans-serif", color: "#F0EDE8" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>⭐ Opiniones del mes</div>
                <select value={mesVista} onChange={function (e) { setMesVista(e.target.value); }} style={sel}>
                  {listaMeses.map(function (m) { return <option key={m} value={m}>{nomMes(m)}</option>; })}
                </select>
              </div>
              <button onClick={function () { setVistaMes(false); }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#F0EDE8", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>✕ Cerrar</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 12 }}>
              {LOCALES_COMPETENCIA.map(function (id) {
                var l = localDe(id), v = validas.filter(function (o) { return o.local === id; });
                var sal = v.filter(function (o) { return o.canal === "salon"; }), del = v.filter(function (o) { return o.canal === "delivery"; });
                var activo = localVista === id, pr = prom(v);
                return (
                  <div key={id} onClick={function () { setLocalVista(id); }} style={{ background: activo ? l.color + "22" : "#111", border: "2px solid " + (activo ? l.color : l.color + "55"), borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                    <div style={{ fontSize: 12, color: l.color, fontWeight: 700, marginBottom: 3 }}>{l.emoji} {l.nombre}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: l.color, fontFamily: "'Playfair Display',serif" }}>{fmtNota(pr)}</div>
                    <Estrellas valor={pr} chico />
                    <div style={{ fontSize: 9.5, color: "#7E7E7E", marginTop: 4, lineHeight: 1.5 }}>{v.length} opinion{v.length === 1 ? "" : "es"} · salón {sal.length}{del.length > 0 ? " · delivery " + del.length : ""}</div>
                  </div>
                );
              })}
            </div>
            {(function () {
              var vistos = {};
              var finMes = mesVista + "-31T23:59:59";
              var part = miembrosCom.filter(function (m) { var w = String(m.wsp || "").replace(/\D/g, ""); if (m.prueba || !m.nombre || w.length < 8 || vistos[w] || (m.fecha && m.fecha > finMes)) return false; vistos[w] = true; return true; })
                .map(function (m) { return { id: "com_" + m.wsp, nombre: nombreCompleto(m), wsp: m.wsp, local: m.fav || "" }; });
              var gan = sorteos[mesVista];
              return (
                <div style={{ maxWidth: 640, margin: "0 auto 12px", background: "#14100A", border: "1px solid #D4A01755", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#D4A017" }}>🎁 Sorteo de {nomMes(mesVista)}{cfgPanel.premio ? " · " + cfgPanel.premio : ""}</div>
                  <div style={{ fontSize: 11, color: "#9A9A9A", margin: "3px 0 8px", lineHeight: 1.5 }}>Participan los miembros de la comunidad que se sumaron hasta fin de mes (uno por WhatsApp). Hay {part.length} participante{part.length === 1 ? "" : "s"}.</div>
                  {gan && <div style={{ fontSize: 13, marginBottom: 8 }}>🏆 Ganó <b>{gan.nombre}</b> · <a href={linkWsp(gan.wsp)} target="_blank" rel="noreferrer" style={{ color: "#4C9A5A", textDecoration: "none" }}>💬 {gan.wsp}</a> <span style={{ color: "#6E6E6E", fontSize: 10.5 }}>({(localDe(gan.local) || {}).nombre} · sorteado el {new Date(gan.fecha).toLocaleDateString("es-AR")})</span></div>}
                  {!props.soloLectura && <button onClick={function () { sortear(mesVista, part); }} disabled={part.length === 0} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: part.length ? "#C1440E" : "#2A2A2A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: part.length ? "pointer" : "default" }}>{gan ? "🎲 Sortear de nuevo" : "🎲 Sortear ahora"}</button>}
                </div>
              );
            })()}
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <div style={{ background: "#0F0F0F", border: "1px solid " + (lv.color || "#333") + "33", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: lv.color, marginBottom: 8, borderBottom: "1px solid " + (lv.color || "#333") + "22", paddingBottom: 5 }}>{lv.emoji} {lv.nombre} · {nomMes(mesVista)} · {delLocalV.length} opinion{delLocalV.length === 1 ? "" : "es"}</div>
                {PREGUNTAS.salon.map(function (q) {
                  var vals = validas.filter(function (o) { return o.local === localVista && o.canal === "salon"; }).map(function (o) { return o.notas[q[0]]; }).filter(function (x) { return x > 0; });
                  var pq = promedio(vals);
                  return (
                    <div key={q[0]} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 118, fontSize: 11.5, color: "#B8B8B8" }}>{q[1]}</div>
                      <div style={{ flex: 1, height: 6, background: "#1A1A1A", borderRadius: 3, overflow: "hidden" }}><div style={{ width: (pq === null ? 0 : (pq / 5) * 100) + "%", height: "100%", background: lv.color }} /></div>
                      <div style={{ width: 34, textAlign: "right", fontSize: 12, fontWeight: 700 }}>{fmtNota(pq)}</div>
                    </div>
                  );
                })}
                <div style={{ height: 8 }} />
                {delLocalV.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "8px 0" }}>No hay opiniones de este local en el mes.</div>}
                {delLocalV.map(function (o) {
                  var pm = promedio(Object.keys(o.notas).map(function (k) { return o.notas[k]; }).filter(function (v) { return v > 0; }));
                  var per = delPersonal(o);
                  return (
                    <div key={o.id} style={{ padding: "7px 0", borderTop: "1px solid #161616" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <b style={{ fontSize: 12.5 }}>{nombreDe(o)}</b>
                          {wspDe(o) && <a href={"https://wa.me/" + (wspDe(o).replace(/\D/g, "").length <= 10 ? "54" + wspDe(o).replace(/\D/g, "") : wspDe(o).replace(/\D/g, ""))} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#4C9A5A", textDecoration: "none" }}>💬 {wspDe(o)}</a>}
                          <span style={{ fontSize: 10, color: "#6E6E6E" }}>{o.canal === "delivery" ? "delivery" : (o.zona === "barra" ? "barra" : o.zona === "mesa" ? "mesa" : "salón")}</span>
                          {per && <span style={{ fontSize: 10, color: "#B07AE0" }}>👤 personal · no cuenta</span>}
                          {o.prueba && <span style={{ fontSize: 10, color: "#E0914A" }}>🧪 de prueba · no cuenta</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                          <Estrellas valor={pm} chico />
                          <span style={{ fontSize: 10, color: "#6E6E6E" }}>{new Date(o.fecha).toLocaleDateString("es-AR")}</span>
                        </div>
                      </div>
                      <DetalleVotos o={o} />
                      {o.comentario && <div style={{ fontSize: 12.5, color: "#E0E0E0", lineHeight: 1.45, marginTop: 5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{o.comentario}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "qr" && <QRParaImprimir />}
    </div>
  );
}

function QRParaImprimir() {
  var items = [];
  LOCALES_COMPETENCIA.forEach(function (id) {
    items.push({ local: id, canal: "salon", zona: "mesa", titulo: "Mesas" });
    items.push({ local: id, canal: "salon", zona: "barra", titulo: "Barra" });
    items.push({ local: id, canal: "delivery", zona: "", titulo: "Delivery" });
  });

  var [imgs, setImgs] = useState({});
  var [copiado, setCopiado] = useState("");
  useEffect(function () {
    items.forEach(function (it) {
      var url = urlOpinion(it.local, it.canal, it.zona);
      QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M" }).then(function (d) {
        setImgs(function (p) { var n = { ...p }; n[url] = d; return n; });
      });
    });
  }, []);

  function copiar(url) {
    try { navigator.clipboard.writeText(url); setCopiado(url); setTimeout(function () { setCopiado(""); }, 2000); } catch (e) {}
  }

  return (
    <div>
      <style>{"@media print { body * { visibility: hidden; } .qr-imprimir, .qr-imprimir * { visibility: visible; } .qr-imprimir { position: absolute; left: 0; top: 0; width: 100%; } .qr-no-imprimir { display: none !important; } }"}</style>
      <div className="qr-no-imprimir" style={{ fontSize: 12, color: "#9A9A9A", lineHeight: 1.6, marginBottom: 12 }}>
        Un QR por zona de cada local, para pegar en las mesas y en la barra. El de <b style={{ color: "#C8C8C8" }}>delivery</b> imprimilo para la bolsa o el ticket, o copiá el enlace y mandalo por WhatsApp junto al pedido.
        <div style={{ marginTop: 8 }}>
          <button onClick={function () { window.print(); }} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "#C1440E", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🖨️ Imprimir</button>
        </div>
      </div>
      <div className="qr-imprimir" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }}>
        {items.map(function (it) {
          var l = localDe(it.local);
          var url = urlOpinion(it.local, it.canal, it.zona);
          return (
            <div key={url} style={{ background: "#fff", color: "#111", borderRadius: 14, padding: "14px 12px", textAlign: "center", breakInside: "avoid", border: "3px solid " + l.color }}>
              {LOGOS[it.local]
                ? <div style={{ marginBottom: 6 }}><LogoLocal id={it.local} alto={it.local === "l1" ? 22 : 42} chico /></div>
                : <div style={{ fontSize: 15, fontWeight: 800, color: l.color }}>{l.emoji} {l.nombre}</div>}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 6 }}>{LOGOS[it.local] ? l.nombre + " · " : ""}{it.titulo}</div>
              {imgs[url] ? <img src={imgs[url]} alt={"QR " + l.nombre + " " + it.titulo} style={{ width: "100%", maxWidth: 180, display: "block", margin: "0 auto" }} /> : <div style={{ height: 150, color: "#888", fontSize: 12 }}>Generando…</div>}
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}>¿Cómo te atendimos?</div>
              <div style={{ fontSize: 11, color: "#555" }}>Escaneá y opiná en 20 segundos</div>
              <button className="qr-no-imprimir" onClick={function () { copiar(url); }} style={{ marginTop: 8, padding: "5px 10px", borderRadius: 7, border: "1px solid #CCC", background: "#F4F4F4", color: "#333", fontSize: 11, cursor: "pointer" }}>
                {copiado === url ? "✓ Copiado" : "Copiar enlace"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
