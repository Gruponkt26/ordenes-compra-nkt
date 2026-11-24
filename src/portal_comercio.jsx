// Portal de los comercios amigos de la comunidad (/comercio/?c=ID&k=CODIGO).
// El comercio entra con su link privado, completa su información y sus promos, y manda los cambios a revisión:
// no se publican hasta que administración los aprueba (Administración → Comunidad → Comercios amigos).
import React, { useState, useEffect } from "react";
import { SURL, SH } from "./comun.js";
import { linkWsp, leerPauta, achicarLogo, subirLogoComercio, TarjetaComercio, cargarNovedadesComercios, semanaClave, achicarFotoNov, subirFotoNovedad, fechaCorta, promoVigente, normCodigo, estadoCupon, renovarCupon, cargarConfigGrupo, guardarFila, cargarCanjesComercios, resumenCanjes } from "./grupo.jsx";

var CAMPOS = ["nombre", "desc", "direccion", "horarios", "wsp", "carta", "instagram", "color", "logo", "beneficio", "promo_desde", "promo_hasta", "promo_cond"];
var PAUTAS = [
  "Respeto el beneficio que publico, en las condiciones que publico, a todo socio que muestre su cupón.",
  "Atiendo al socio igual que a cualquier otro cliente.",
  "No cobro de más ni pongo condiciones extra por usar el cupón.",
  "Mantengo mi información y mis promos al día (horarios, vigencia, condiciones).",
  "Respondo a administración dentro de las 48 horas ante un reclamo.",
  "Entiendo que administración puede pausar mi tarjeta si no se cumplen estas pautas.",
];
function hoyISO() { var h = new Date(); return h.getFullYear() + "-" + String(h.getMonth() + 1).padStart(2, "0") + "-" + String(h.getDate()).padStart(2, "0"); }

export default function PortalComercio() {
  var q = new URLSearchParams(window.location.search);
  var id = q.get("c") || "", clave = q.get("k") || "";
  var inv = q.get("i") || "";                       // invitación para un comercio NUEVO (formulario vacío): /comercio/?i=CODIGO
  var abierta = q.has("alta");                      // formulario abierto, sin invitación: /comercio/?alta=1 (el botón de la página de Comunidad)
  var modoAlta = (!!inv || abierta) && !id;
  var [altaKey, setAltaKey] = useState(inv);        // con qué clave se guarda la solicitud (la invitación, o una propia si el formulario es abierto)
  var [wspAdm, setWspAdm] = useState("");           // WhatsApp de administración, para avisar que se mandó la solicitud
  var [altaRow, setAltaRow] = useState(null);       // la solicitud de alta que ya mandó este comercio: {datos, comercio_id, estado, motivo}
  var [altaLink, setAltaLink] = useState("");       // su link permanente, cuando ya lo aprobaron
  var [idAlta] = useState(function () { return "com_" + Date.now(); });
  var [estado, setEstado] = useState("cargando");   // cargando | invalido | ok
  var [pub, setPub] = useState(null);                 // lo que está publicado
  var [cambio, setCambio] = useState(null);           // el último pedido de cambio: {datos, estado, enviado_at, motivo}
  var [form, setForm] = useState({});
  var [acepta, setAcepta] = useState(false);
  var [subiendo, setSubiendo] = useState(false);
  var [enviando, setEnviando] = useState(false);
  var [msg, setMsg] = useState("");
  var [error, setError] = useState("");
  var [novs, setNovs] = useState([]);                       // las novedades que mandó este comercio
  var [nov, setNov] = useState({ titulo: "", texto: "", foto_url: "", hasta: "" });
  var [subiendoFoto, setSubiendoFoto] = useState(false);
  var [enviandoNov, setEnviandoNov] = useState(false);
  var [msgNov, setMsgNov] = useState("");
  var [errorNov, setErrorNov] = useState("");
  var [vista, setVista] = useState("tarjeta");               // tarjeta | canje | numeros
  var [codigo, setCodigo] = useState("");
  var [cuponC, setCuponC] = useState(null);                   // el cupón que se está mirando para canjear
  var [msgC, setMsgC] = useState("");
  var [ocupadoC, setOcupadoC] = useState(false);
  var [montoC, setMontoC] = useState("");
  var [canjes, setCanjes] = useState([]);                     // los canjes de este comercio

  useEffect(function () {
    document.title = "Portal de comercios · Grupo Nkt";
    if (modoAlta) {
      (async function () {
        cargarConfigGrupo().then(function (cfg) { setWspAdm((cfg && cfg.wspAdmin) || ((cfg && cfg.locales && cfg.locales.l1) || {}).wsp || ""); });
        var clave2 = inv;
        if (inv) { var invi = await leerPauta("cominv_" + inv); if (!invi) { setEstado("invalido"); return; } }
        else { try { clave2 = localStorage.getItem("nkt_comercio_alta") || ""; } catch (e) { clave2 = ""; } setAltaKey(clave2); }
        var a = clave2 ? await leerPauta("comalta_" + clave2) : null;
        var vacio = {}; CAMPOS.forEach(function (x) { vacio[x] = (a && a.estado === "rechazada" && a.datos && a.datos[x] !== undefined) ? a.datos[x] : ""; });
        if (!vacio.color) vacio.color = "#1A6B8A";
        if (a && a.estado === "aprobada" && a.comercio_id) { var k2 = await leerPauta("comkey_" + a.comercio_id); if (k2 && k2.token) setAltaLink(window.location.origin + "/comercio/?c=" + encodeURIComponent(a.comercio_id) + "&k=" + k2.token); }
        setAltaRow(a); setForm(vacio); setAcepta(false); setEstado("ok");
      })();
      return;
    }
    if (!id || !clave) { setEstado("invalido"); return; }
    (async function () {
      var k = await leerPauta("comkey_" + id);
      if (!k || k.token !== clave) { setEstado("invalido"); return; }
      var p = await leerPauta(id);
      if (!p) { setEstado("invalido"); return; }
      var c = await leerPauta("comcambio_" + id);
      var base = {}; CAMPOS.forEach(function (x) { base[x] = (c && c.estado === "pendiente" && c.datos && c.datos[x] !== undefined) ? c.datos[x] : (p[x] === undefined ? "" : p[x]); });
      if (!base.color) base.color = "#1A6B8A";
      cargarNovedadesComercios().then(function (l) { setNovs(l.filter(function (n) { return n.comercio_id === id; })); });
      cargarCanjesComercios().then(function (l) { setCanjes(l.filter(function (x) { return x.comercio_id === id; })); });
      setPub(p); setCambio(c); setForm(base); setAcepta(!!p.pautas_ok_at || !!(c && c.datos && c.datos.pautas_ok)); setEstado("ok");
    })();
  }, []);

  function setF(k, v) { setForm(function (f) { var n = { ...f }; n[k] = v; return n; }); }
  function elegirLogo(e) {
    var file = e.target.files && e.target.files[0]; if (!file) return;
    setSubiendo(true); setError("");
    achicarLogo(file).then(function (blob) {
      if (!blob) { setSubiendo(false); setError("No se pudo leer esa imagen."); return; }
      subirLogoComercio(blob, (modoAlta ? idAlta : id) + "_" + Date.now()).then(function (r) { setSubiendo(false); if (r.ok) setF("logo", r.url); else setError("No se pudo subir el logo. Probá de nuevo."); });
    });
  }
  function enviar() {
    setError("");
    if (!String(form.nombre || "").trim()) { setError("Falta el nombre de tu comercio."); return; }
    if (String(form.beneficio || "").trim()) {
      if (!form.promo_hasta) { setError("Poné hasta qué fecha vale la promo."); return; }
      if (form.promo_hasta < hoyISO()) { setError("La fecha de fin de la promo ya pasó."); return; }
      if (form.promo_desde && form.promo_desde > form.promo_hasta) { setError("La promo termina antes de empezar. Revisá las fechas."); return; }
    }
    if (modoAlta && !String(form.wsp || "").trim()) { setError("Poné tu WhatsApp: lo necesitamos para avisarte cuando tu comercio esté publicado."); return; }
    if (!acepta) { setError("Para enviar tenés que aceptar las pautas de la comunidad."); return; }
    setEnviando(true);
    var ahora = new Date().toISOString();
    var datos = {}; CAMPOS.forEach(function (x) { datos[x] = typeof form[x] === "string" ? form[x].trim() : form[x]; });
    datos.pautas_ok = true;
    if (modoAlta) {
      var idCom = (altaRow && altaRow.comercio_id) || idAlta;
      var claveA = altaKey || ("abierta_" + idAlta);
      if (!altaKey) { setAltaKey(claveA); if (!inv) { try { localStorage.setItem("nkt_comercio_alta", claveA); } catch (e) {} } }
      var filaA = { id: "comalta_" + claveA, ambito: "grupo_comercio_alta", texto: JSON.stringify({ datos: datos, comercio_id: idCom, estado: "pendiente", enviado_at: ahora, nombre: datos.nombre }), usuario: "", created_at: ahora, updated_at: ahora };
      fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(filaA) })
        .then(function (r) { setEnviando(false); if (!r.ok) { setError("No se pudo enviar. Revisá tu conexión y probá de nuevo."); return; } setAltaRow({ datos: datos, comercio_id: idCom, estado: "pendiente", enviado_at: ahora }); window.scrollTo(0, 0); })
        .catch(function () { setEnviando(false); setError("No se pudo enviar. Revisá tu conexión y probá de nuevo."); });
      return;
    }
    // «base»: lo que estaba publicado cuando el comercio mandó sus cambios. Al aprobar solo se publica lo que de verdad cambió respecto de esto.
    var baseSnap = {}; CAMPOS.forEach(function (x) { baseSnap[x] = pub && pub[x] !== undefined ? pub[x] : ""; });
    var fila = { id: "comcambio_" + id, ambito: "grupo_comercio_cambio", texto: JSON.stringify({ datos: datos, base: baseSnap, estado: "pendiente", enviado_at: ahora, nombre: datos.nombre }), usuario: "", created_at: ahora, updated_at: ahora };
    fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(fila) })
      .then(function (r) {
        setEnviando(false);
        if (!r.ok) { setError("No se pudo enviar. Revisá tu conexión y probá de nuevo."); return; }
        setCambio({ datos: datos, estado: "pendiente", enviado_at: ahora }); setMsg("✓ Listo. Administración lo revisa y, cuando lo apruebe, se publica."); window.scrollTo(0, 0);
      }).catch(function () { setEnviando(false); setError("No se pudo enviar. Revisá tu conexión y probá de nuevo."); });
  }

  // Canje por código escrito, igual que en los locales de Grupo Nkt: el cupón se usa una sola vez y al socio le llega el siguiente.
  function buscarCupon() {
    var c = normCodigo(codigo); if (!c) return;
    setOcupadoC(true); setMsgC(""); setCuponC(null);
    leerPauta("cupon_" + c).then(function (x) { setOcupadoC(false); if (!x) setMsgC("No existe un cupón con el código " + c + "."); else setCuponC(x); });
  }
  function canjear() {
    if (!cuponC || estadoCupon(cuponC) !== "activo") return;
    var promo = promoVigente(pub);
    if (pub && pub.activo === false) { setMsgC("Tu tarjeta está pausada por administración: no se pueden registrar canjes."); return; }
    if (!promo) { setMsgC("Tu tarjeta no tiene una promo vigente. Cargala en «Mi tarjeta» para poder canjear."); return; }
    var nombrePila = String(cuponC.nombre || "").split(" ")[0] || "el socio";
    if (!window.confirm("¿Registrar el canje del cupón " + cuponC.codigo + " de " + nombrePila + "?\n\nLe das: " + promo + ".\nDespués no se puede volver a usar.")) return;
    setOcupadoC(true);
    leerPauta("cupon_" + cuponC.codigo).then(function (fresco) {
      if (fresco && fresco.estado === "usado") { setOcupadoC(false); setCuponC(fresco); setMsgC("Ese cupón ya fue canjeado."); return; }
      var ahora = new Date().toISOString();
      var nuevo = { ...cuponC, estado: "usado", usado_at: ahora, usado_local: (pub && pub.nombre) || "", usado_comercio: id, beneficio: promo };
      guardarFila("cupon_" + cuponC.codigo, "cupon", nuevo).then(function (ok) {
        if (!ok) { setOcupadoC(false); setMsgC("No se pudo guardar el canje. Probá de nuevo."); return; }
        var monto = parseFloat(String(montoC).replace(",", ".")) || 0;
        var reg = { comercio_id: id, comercio_nombre: (pub && pub.nombre) || "", codigo: cuponC.codigo, wsp: cuponC.wsp, nombre: nombrePila, beneficio: promo, monto: monto, at: ahora, prueba: cuponC.prueba ? 1 : 0 };
        guardarFila("comcanje_" + id + "_" + cuponC.codigo, "grupo_canje_comercio", reg).then(function () {
          setCanjes(function (l) { return [{ id: "comcanje_" + id + "_" + cuponC.codigo, ...reg }].concat(l); });
          cargarConfigGrupo().then(function (cfg) { return renovarCupon(cuponC.wsp, cfg); }).then(function () {
            setOcupadoC(false); setCuponC(nuevo); setMontoC(""); setCodigo(""); setMsgC("✅ Canjeado. Dale: " + promo + ".");
          });
        });
      });
    });
  }
  // Una novedad por semana; las extra las habilita administración (se cobran aparte).
  var semana = semanaClave();
  var usadas = novs.filter(function (n) { return n.semana === semana && n.estado !== "rechazada"; }).length;
  var extra = pub && pub.novedad_extra && pub.novedad_extra.sem === semana ? Number(pub.novedad_extra.n) || 0 : 0;
  var puedeNov = usadas < 1 + extra;
  function elegirFoto(e) {
    var file = e.target.files && e.target.files[0]; if (!file) return;
    setSubiendoFoto(true); setErrorNov("");
    achicarFotoNov(file, 1200).then(function (blob) {
      if (!blob) { setSubiendoFoto(false); setErrorNov("No se pudo leer esa imagen."); return; }
      subirFotoNovedad(blob, "c_" + id + "_" + Date.now()).then(function (r) { setSubiendoFoto(false); if (r.ok) setNov(function (n) { return { ...n, foto_url: r.url }; }); else setErrorNov("No se pudo subir la foto. Probá de nuevo."); });
    });
  }
  function enviarNov() {
    setErrorNov(""); setMsgNov("");
    if (!String(nov.titulo).trim()) { setErrorNov("Falta el título de la novedad."); return; }
    if (!String(nov.texto).trim()) { setErrorNov("Contá en pocas palabras de qué se trata."); return; }
    var hasta = nov.hasta || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    if (hasta < hoyISO()) { setErrorNov("La fecha de fin ya pasó."); return; }
    setEnviandoNov(true);
    var ahora = new Date().toISOString(), nid = "comnov_" + id + "_" + Date.now();
    var obj = { comercio_id: id, comercio_nombre: (pub && pub.nombre) || form.nombre || "", color: (pub && pub.color) || "", titulo: nov.titulo.trim(), texto: nov.texto.trim(), foto_url: nov.foto_url || "", hasta: hasta, estado: "pendiente", enviado_at: ahora, semana: semana, activa: true };
    fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: nid, ambito: "grupo_novedad_comercio", texto: JSON.stringify(obj), usuario: "", created_at: ahora, updated_at: ahora }) })
      .then(function (r) {
        setEnviandoNov(false);
        if (!r.ok) { setErrorNov("No se pudo enviar. Probá de nuevo."); return; }
        setNovs(function (l) { return [{ id: nid, comercio: true, ...obj }].concat(l); });
        setNov({ titulo: "", texto: "", foto_url: "", hasta: "" });
        setMsgNov("✓ Enviada. Administración la revisa y, cuando la apruebe, la ven los socios.");
      }).catch(function () { setEnviandoNov(false); setErrorNov("No se pudo enviar. Revisá tu conexión."); });
  }
  var fondo = { minHeight: "100vh", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',system-ui,sans-serif", padding: "22px 16px 60px", boxSizing: "border-box" };
  var caja = { maxWidth: 480, margin: "0 auto" };
  var inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "inherit", fontSize: 15, marginBottom: 8 };
  var lbl = { display: "block", fontSize: 11, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1, margin: "10px 2px 5px", fontWeight: 700 };
  var tarj = { background: "#111", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px", marginBottom: 14 };

  if (estado === "cargando") return <div style={fondo}><div style={{ ...caja, textAlign: "center", color: "#8C8C8C", paddingTop: 80 }}>Cargando…</div></div>;
  if (estado === "invalido") return (
    <div style={fondo}><div style={{ ...caja, textAlign: "center", paddingTop: 70 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 18, fontWeight: 800, margin: "10px 0 6px" }}>Este link no es válido</div>
      <div style={{ fontSize: 14, color: "#9A9A9A", lineHeight: 1.5 }}>Puede estar mal copiado o haberse reemplazado por uno nuevo. Pedile a administración de Grupo Nkt que te mande tu link de nuevo.</div>
    </div></div>
  );

  var pausado = pub && pub.activo === false;
  var pendiente = cambio && cambio.estado === "pendiente";
  return (
    <div style={fondo}><div style={caja}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#8C8C8C", textTransform: "uppercase" }}>Comunidad Grupo Nkt</div>
        <div style={{ fontSize: 21, fontWeight: 800, marginTop: 3 }}>{modoAlta ? "Sumá tu comercio" : "Portal de comercios"}</div>
        <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 3 }}>{modoAlta ? "Completá los datos de tu comercio y tu promo para los socios. Administración los revisa y te avisa por WhatsApp." : "Completá tu información y tus promos. Administración las revisa y las publica."}</div>
      </div>

      {modoAlta && altaRow && altaRow.estado === "pendiente" && <div style={{ ...tarj, borderColor: "#D4A01788", background: "#16120A", textAlign: "center" }}><div style={{ fontSize: 34 }}>✅</div><div style={{ fontSize: 16, fontWeight: 800, margin: "4px 0", color: "#E5C467" }}>Recibimos tu solicitud</div><div style={{ fontSize: 13.5, color: "#C8B27A", lineHeight: 1.5 }}>Administración de Grupo Nkt la está revisando. Cuando la aprueben te avisamos por WhatsApp con el link de tu portal.</div>{wspAdm && <a href={linkWsp(wspAdm, "Hola! Acabo de mandar la solicitud de mi comercio" + ((altaRow.datos || {}).nombre ? " «" + altaRow.datos.nombre + "»" : "") + " para sumarme a la comunidad de Grupo Nkt.")} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, padding: "12px", borderRadius: 10, background: "#25D366", color: "#08240F", fontWeight: 800, textDecoration: "none", fontSize: 14 }}>💬 Avisar a administración por WhatsApp</a>}</div>}
      {modoAlta && altaRow && altaRow.estado === "aprobada" && <div style={{ ...tarj, borderColor: "#3A7D4488", background: "#0F2415", textAlign: "center" }}><div style={{ fontSize: 34 }}>🎉</div><div style={{ fontSize: 16, fontWeight: 800, margin: "4px 0", color: "#9FE0AA" }}>¡Tu comercio ya está en la comunidad!</div><div style={{ fontSize: 13.5, color: "#B8D8BE", lineHeight: 1.5 }}>Este es tu portal: ahí editás tu tarjeta, cargás tus novedades y canjeás los cupones. Guardá el link.</div>{altaLink && <a href={altaLink} style={{ display: "block", marginTop: 10, padding: "12px", borderRadius: 10, background: "#3A7D44", color: "#fff", fontWeight: 800, textDecoration: "none" }}>Entrar a mi portal</a>}</div>}
      {modoAlta && altaRow && altaRow.estado === "rechazada" && <div style={{ ...tarj, borderColor: "#C1440E88", background: "#1F120C", fontSize: 13.5 }}><b style={{ color: "#E0714A" }}>✕ No pudimos aprobar tu solicitud.</b>{altaRow.motivo ? <div style={{ marginTop: 4 }}>Motivo: {altaRow.motivo}</div> : null}<div style={{ marginTop: 4, color: "#B8B8B8" }}>Corregí lo que haga falta y volvé a enviarla.</div></div>}

      {msg && <div style={{ ...tarj, borderColor: "#3A7D4488", background: "#0F2415", color: "#9FE0AA", fontSize: 13.5, fontWeight: 700 }}>{msg}</div>}
      {pausado && <div style={{ ...tarj, borderColor: "#C1440E88", background: "#1F120C", fontSize: 13.5, lineHeight: 1.5 }}><b style={{ color: "#E0714A" }}>⏸ Tu tarjeta está pausada por administración.</b>{pub.pausa_motivo ? <div style={{ marginTop: 4 }}>Motivo: {pub.pausa_motivo}</div> : null}<div style={{ marginTop: 4, color: "#B8B8B8" }}>Escribile a administración para resolverlo y volver a aparecer.</div></div>}
      {pendiente && !msg && <div style={{ ...tarj, borderColor: "#D4A01788", background: "#16120A", fontSize: 13.5, color: "#E5C467" }}>📝 Mandaste cambios{cambio.enviado_at ? " el " + new Date(cambio.enviado_at).toLocaleDateString("es-AR") : ""}. Están en revisión. Podés seguir editando y volver a enviar.</div>}
      {cambio && cambio.estado === "rechazado" && <div style={{ ...tarj, borderColor: "#C1440E88", background: "#1F120C", fontSize: 13.5 }}><b style={{ color: "#E0714A" }}>✕ Tu último pedido no se aprobó.</b>{cambio.motivo ? <div style={{ marginTop: 4 }}>Motivo: {cambio.motivo}</div> : null}<div style={{ marginTop: 4, color: "#B8B8B8" }}>Corregilo y volvelo a enviar.</div></div>}
      {cambio && cambio.estado === "aprobado" && !msg && <div style={{ ...tarj, borderColor: "#3A7D4488", fontSize: 13.5, color: "#9FE0AA" }}>✓ Tu último cambio fue aprobado y ya está publicado.</div>}

      {!modoAlta && <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["tarjeta", "🏪 Mi tarjeta"], ["canje", "🎟️ Canjear cupón"], ["numeros", "📊 Mis números"]].map(function (t) { var on = vista === t[0]; return <button key={t[0]} onClick={function () { setVista(t[0]); }} style={{ flex: 1, padding: "10px 4px", borderRadius: 10, border: "1px solid " + (on ? "#1A6B8A" : "#2A2A2A"), background: on ? "#1A6B8A33" : "#111", color: on ? "#F0EDE8" : "#9A9A9A", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t[1]}</button>; })}
      </div>}

      {vista === "canje" && !modoAlta && (
        <div style={tarj}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🎟️ Canjear cupón de la comunidad</div>
          <div style={{ fontSize: 12.5, color: "#9A9A9A", lineHeight: 1.45, marginTop: 3 }}>Pedile al cliente el código que le figura en su celular (por ejemplo NKT-4K7P) y escribilo acá.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={codigo} onChange={function (e) { setCodigo(e.target.value); }} placeholder="NKT-XXXX" style={{ ...inp, marginBottom: 0, flex: 1, letterSpacing: 2, textTransform: "uppercase", fontSize: 16 }} />
            <button onClick={buscarCupon} disabled={ocupadoC} style={{ padding: "0 18px", borderRadius: 10, border: "none", background: "#1A6B8A", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{ocupadoC ? "…" : "Buscar"}</button>
          </div>
          {msgC && <div style={{ fontSize: 13.5, color: msgC.indexOf("✅") === 0 ? "#8FD19A" : "#F0A090", marginTop: 10, lineHeight: 1.45, fontWeight: 700 }}>{msgC}</div>}
          {cuponC && (function () {
            var est = estadoCupon(cuponC), ok = est === "activo", col = ok ? "#4C9A5A" : "#E0714A", promo = promoVigente(pub);
            return (
              <div style={{ marginTop: 10, border: "1px solid " + col + "66", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{String(cuponC.nombre || "").split(" ")[0] || "Socio"} · <span style={{ color: col }}>{ok ? "✅ válido" : est === "usado" ? "❌ ya usado" : "❌ vencido"}</span></div>
                <div style={{ fontSize: 12.5, color: "#B8B8B8", marginTop: 4, lineHeight: 1.55 }}>
                  Código {cuponC.codigo} · vence el {new Date(cuponC.vence).toLocaleDateString("es-AR")}
                  {cuponC.usado_at && <div>Canjeado el {new Date(cuponC.usado_at).toLocaleString("es-AR")}{cuponC.usado_local ? " en " + cuponC.usado_local : ""}</div>}
                  {ok && (promo ? <div style={{ color: "#F0EDE8", fontWeight: 700, marginTop: 4 }}>🎁 Le corresponde: {promo}</div> : <div style={{ color: "#E5C467", marginTop: 4 }}>⚠️ Tu tarjeta no tiene una promo vigente.</div>)}
                </div>
                {ok && promo && (
                  <div>
                    <label style={lbl}>¿Cuánto gastó? (opcional, es para tus números)</label>
                    <input value={montoC} onChange={function (e) { setMontoC(e.target.value); }} inputMode="decimal" placeholder="Ej: 8500" style={inp} />
                    <button onClick={canjear} disabled={ocupadoC} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#3A7D44", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>✅ Registrar canje</button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {vista === "numeros" && !modoAlta && (function () {
        var r30 = resumenCanjes(canjes, id, 30), rt = resumenCanjes(canjes, id, 0);
        var caja = function (t, v, sub) { return <div style={{ flex: "1 1 120px", background: "#111", border: "1px solid #1E1E1E", borderRadius: 12, padding: "11px 12px" }}><div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 800, color: "#F0EDE8", lineHeight: 1.15 }}>{v}</div>{sub && <div style={{ fontSize: 11, color: "#7E7E7E" }}>{sub}</div>}</div>; };
        return (
          <div>
            <div style={{ fontSize: 13, color: "#9A9A9A", margin: "0 2px 8px", lineHeight: 1.45 }}>Lo que la comunidad de Grupo Nkt te trajo, en los últimos 30 días.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {caja("Canjes", String(r30.canjes), rt.canjes + " en total")}
              {caja("Socios distintos", String(r30.socios), rt.socios + " en total")}
              {caja("Volvieron", String(r30.volvieron), "usaron 2 veces o más")}
              {caja("Gasto anotado", r30.gasto > 0 ? "$" + Math.round(r30.gasto).toLocaleString("es-AR") : "—", r30.gasto > 0 ? "de los canjes con monto" : "anotalo al canjear")}
            </div>
            <div style={tarj}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Últimos canjes</div>
              {rt.lista.length === 0 && <div style={{ fontSize: 13, color: "#7E7E7E" }}>Todavía no registraste canjes.</div>}
              {rt.lista.slice(0, 15).map(function (x, i) { return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderTop: i === 0 ? "none" : "1px solid #1A1A1A", fontSize: 13 }}>
                  <span><b>{x.nombre}</b> <span style={{ color: "#8C8C8C" }}>· {x.beneficio}</span></span>
                  <span style={{ color: "#8C8C8C", whiteSpace: "nowrap" }}>{new Date(x.at).toLocaleDateString("es-AR")}{x.monto > 0 ? " · $" + Math.round(x.monto).toLocaleString("es-AR") : ""}</span>
                </div>); })}
            </div>
          </div>
        );
      })()}

      {vista === "tarjeta" && !(modoAlta && altaRow && (altaRow.estado === "pendiente" || altaRow.estado === "aprobada")) && (
      <div>
      <div style={tarj}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Tu comercio</div>
        <label style={lbl}>Nombre *</label>
        <input value={form.nombre || ""} onChange={function (e) { setF("nombre", e.target.value); }} placeholder="Ej: Café San Juan" style={inp} />
        <label style={lbl}>Descripción corta</label>
        <input value={form.desc || ""} onChange={function (e) { setF("desc", e.target.value); }} placeholder="Ej: Café de especialidad y pastelería" style={inp} />
        <label style={lbl}>Dirección</label>
        <input value={form.direccion || ""} onChange={function (e) { setF("direccion", e.target.value); }} placeholder="Calle y número" style={inp} />
        <label style={lbl}>Horarios</label>
        <textarea value={form.horarios || ""} onChange={function (e) { setF("horarios", e.target.value); }} rows={2} placeholder="Ej: Lun a Sáb de 8 a 20 h" style={{ ...inp, resize: "vertical" }} />
        <label style={lbl}>WhatsApp</label>
        <input value={form.wsp || ""} onChange={function (e) { setF("wsp", e.target.value); }} inputMode="tel" placeholder="Ej: 2914123456" style={inp} />
        <label style={lbl}>Enlace de tu carta (opcional)</label>
        <input value={form.carta || ""} onChange={function (e) { setF("carta", e.target.value); }} placeholder="Ej: tucomercio.com/carta" style={inp} />
        <label style={lbl}>Instagram (opcional)</label>
        <input value={form.instagram || ""} onChange={function (e) { setF("instagram", e.target.value); }} placeholder="Ej: @tucomercio" style={inp} />
        <label style={lbl}>Logo</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input type="file" accept="image/*" onChange={elegirLogo} style={{ fontSize: 12.5, color: "#C8C8C8", maxWidth: 220 }} />
          {subiendo && <span style={{ fontSize: 12, color: "#D4A017" }}>subiendo…</span>}
          {form.logo && !subiendo && <img src={form.logo} alt="logo" style={{ height: 36, background: "#fff", borderRadius: 6 }} />}
        </div>
        <label style={lbl}>Color de tu tarjeta</label>
        <input type="color" value={form.color || "#1A6B8A"} onChange={function (e) { setF("color", e.target.value); }} style={{ width: 54, height: 34, border: "none", background: "none", padding: 0 }} />
      </div>

      <div style={tarj}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>🎟️ Tu promo para los socios</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", lineHeight: 1.45, marginTop: 3 }}>Lo que le das a quien te muestre su cupón de la comunidad. Se muestra sola hasta la fecha de fin.</div>
        <label style={lbl}>¿Qué ofrecés?</label>
        <input value={form.beneficio || ""} onChange={function (e) { setF("beneficio", e.target.value); }} placeholder="Ej: 10% de descuento en cafetería" style={inp} />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Desde (opcional)</label><input type="date" value={form.promo_desde || ""} onChange={function (e) { setF("promo_desde", e.target.value); }} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Hasta *</label><input type="date" value={form.promo_hasta || ""} onChange={function (e) { setF("promo_hasta", e.target.value); }} style={inp} /></div>
        </div>
        <label style={lbl}>Condiciones (opcional)</label>
        <input value={form.promo_cond || ""} onChange={function (e) { setF("promo_cond", e.target.value); }} placeholder="Ej: una por mesa, no acumulable, de lunes a jueves" style={inp} />
      </div>

      <div style={{ fontSize: 11, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.4, margin: "4px 4px 8px", fontWeight: 700 }}>Así se va a ver</div>
      <TarjetaComercio c={{ ...form, nombre: form.nombre || "Tu comercio" }} />

      <div style={tarj}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Pautas de la comunidad</div>
        <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "#C8C8C8", lineHeight: 1.55 }}>{PAUTAS.map(function (t, i) { return <li key={i}>{t}</li>; })}</ul>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}><input type="checkbox" checked={acepta} onChange={function (e) { setAcepta(e.target.checked); }} style={{ marginTop: 3 }} />Leí las pautas y las acepto.</label>
      </div>

      {error && <div style={{ ...tarj, borderColor: "#C1440E88", color: "#F0A090", fontSize: 13.5 }}>{error}</div>}
      <button onClick={enviar} disabled={enviando || subiendo} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: enviando || subiendo ? "#2A2A2A" : "#1A6B8A", color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>{enviando ? "Enviando…" : (modoAlta ? "Enviar mi solicitud" : "Enviar para revisión")}</button>
      <div style={{ fontSize: 11.5, color: "#7E7E7E", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>Lo que envíes no se publica hasta que administración lo apruebe.</div>

      {!modoAlta && (<div>
      <div style={{ height: 22 }} />
      <div style={tarj}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>📣 Tu novedad para los socios</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", lineHeight: 1.45, marginTop: 3 }}>Un plato nuevo, un evento, algo para contarle a la comunidad. Tenés <b style={{ color: "#F0EDE8" }}>1 novedad por semana</b>. Si querés publicar más, hablá con administración (tiene un costo aparte).</div>
        {msgNov && <div style={{ marginTop: 8, fontSize: 13, color: "#9FE0AA", fontWeight: 700 }}>{msgNov}</div>}
        {puedeNov ? (
          <div>
            <label style={lbl}>Título *</label>
            <input value={nov.titulo} onChange={function (e) { var v = e.target.value; setNov(function (n) { return { ...n, titulo: v }; }); }} placeholder="Ej: Nueva torta de la casa" style={inp} />
            <label style={lbl}>Contalo en pocas palabras *</label>
            <textarea value={nov.texto} onChange={function (e) { var v = e.target.value; setNov(function (n) { return { ...n, texto: v }; }); }} rows={3} placeholder="Qué es, cuándo y cualquier condición. Sin precios que no puedas sostener." style={{ ...inp, resize: "vertical" }} />
            <label style={lbl}>Foto (opcional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input type="file" accept="image/*" onChange={elegirFoto} style={{ fontSize: 12.5, color: "#C8C8C8", maxWidth: 220 }} />
              {subiendoFoto && <span style={{ fontSize: 12, color: "#D4A017" }}>subiendo…</span>}
              {nov.foto_url && !subiendoFoto && <img src={nov.foto_url} alt="foto" style={{ height: 44, borderRadius: 6 }} />}
            </div>
            <label style={lbl}>Se muestra hasta (si lo dejás vacío, 7 días)</label>
            <input type="date" value={nov.hasta} onChange={function (e) { var v = e.target.value; setNov(function (n) { return { ...n, hasta: v }; }); }} style={inp} />
            {errorNov && <div style={{ fontSize: 13, color: "#F0A090", marginBottom: 8 }}>{errorNov}</div>}
            <button onClick={enviarNov} disabled={enviandoNov || subiendoFoto} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: enviandoNov || subiendoFoto ? "#2A2A2A" : "#8B6A1A", color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>{enviandoNov ? "Enviando…" : "Enviar novedad para revisión"}</button>
          </div>
        ) : (
          <div style={{ marginTop: 10, background: "#16120A", border: "1px solid #D4A01755", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#E5C467", lineHeight: 1.45 }}>Ya mandaste tu novedad de esta semana. La próxima podés cargarla desde el lunes. Si necesitás publicar otra antes, hablá con administración.</div>
        )}
        {novs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Tus novedades</div>
            {novs.slice(0, 5).map(function (n) { return (
              <div key={n.id} style={{ borderTop: "1px solid #1A1A1A", padding: "7px 0", fontSize: 13 }}>
                <b>{n.titulo}</b>
                <div style={{ fontSize: 11.5, color: n.estado === "aprobada" ? "#8FD19A" : n.estado === "rechazada" ? "#E0714A" : "#E5C467" }}>{n.estado === "aprobada" ? "✓ Publicada" + (n.hasta ? " hasta el " + fechaCorta(n.hasta) : "") : n.estado === "rechazada" ? "✕ No se aprobó" + (n.motivo ? ": " + n.motivo : "") : "📝 En revisión"}</div>
              </div>); })}
          </div>
        )}
      </div>

      </div>)}
      </div>
      )}
    </div></div>
  );
}

