// Portal de los comercios amigos de la comunidad (/comercio/?c=ID&k=CODIGO).
// El comercio entra con su link privado, completa su información y sus promos, y manda los cambios a revisión:
// no se publican hasta que administración los aprueba (Administración → Comunidad → Comercios amigos).
import React, { useState, useEffect } from "react";
import { SURL, SH } from "./comun.js";
import { leerPauta, achicarLogo, subirLogoComercio, TarjetaComercio } from "./grupo.jsx";

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
  var [estado, setEstado] = useState("cargando");   // cargando | invalido | ok
  var [pub, setPub] = useState(null);                 // lo que está publicado
  var [cambio, setCambio] = useState(null);           // el último pedido de cambio: {datos, estado, enviado_at, motivo}
  var [form, setForm] = useState({});
  var [acepta, setAcepta] = useState(false);
  var [subiendo, setSubiendo] = useState(false);
  var [enviando, setEnviando] = useState(false);
  var [msg, setMsg] = useState("");
  var [error, setError] = useState("");

  useEffect(function () {
    document.title = "Portal de comercios · Grupo Nkt";
    if (!id || !clave) { setEstado("invalido"); return; }
    (async function () {
      var k = await leerPauta("comkey_" + id);
      if (!k || k.token !== clave) { setEstado("invalido"); return; }
      var p = await leerPauta(id);
      if (!p) { setEstado("invalido"); return; }
      var c = await leerPauta("comcambio_" + id);
      var base = {}; CAMPOS.forEach(function (x) { base[x] = (c && c.estado === "pendiente" && c.datos && c.datos[x] !== undefined) ? c.datos[x] : (p[x] === undefined ? "" : p[x]); });
      if (!base.color) base.color = "#1A6B8A";
      setPub(p); setCambio(c); setForm(base); setAcepta(!!p.pautas_ok_at || !!(c && c.datos && c.datos.pautas_ok)); setEstado("ok");
    })();
  }, []);

  function setF(k, v) { setForm(function (f) { var n = { ...f }; n[k] = v; return n; }); }
  function elegirLogo(e) {
    var file = e.target.files && e.target.files[0]; if (!file) return;
    setSubiendo(true); setError("");
    achicarLogo(file).then(function (blob) {
      if (!blob) { setSubiendo(false); setError("No se pudo leer esa imagen."); return; }
      subirLogoComercio(blob, id + "_" + Date.now()).then(function (r) { setSubiendo(false); if (r.ok) setF("logo", r.url); else setError("No se pudo subir el logo. Probá de nuevo."); });
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
    if (!acepta) { setError("Para enviar tenés que aceptar las pautas de la comunidad."); return; }
    setEnviando(true);
    var ahora = new Date().toISOString();
    var datos = {}; CAMPOS.forEach(function (x) { datos[x] = typeof form[x] === "string" ? form[x].trim() : form[x]; });
    datos.pautas_ok = true;
    var fila = { id: "comcambio_" + id, ambito: "grupo_comercio_cambio", texto: JSON.stringify({ datos: datos, estado: "pendiente", enviado_at: ahora, nombre: datos.nombre }), usuario: "", created_at: ahora, updated_at: ahora };
    fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(fila) })
      .then(function (r) {
        setEnviando(false);
        if (!r.ok) { setError("No se pudo enviar. Revisá tu conexión y probá de nuevo."); return; }
        setCambio({ datos: datos, estado: "pendiente", enviado_at: ahora }); setMsg("✓ Listo. Administración lo revisa y, cuando lo apruebe, se publica."); window.scrollTo(0, 0);
      }).catch(function () { setEnviando(false); setError("No se pudo enviar. Revisá tu conexión y probá de nuevo."); });
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
        <div style={{ fontSize: 21, fontWeight: 800, marginTop: 3 }}>Portal de comercios</div>
        <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 3 }}>Completá tu información y tus promos. Administración las revisa y las publica.</div>
      </div>

      {msg && <div style={{ ...tarj, borderColor: "#3A7D4488", background: "#0F2415", color: "#9FE0AA", fontSize: 13.5, fontWeight: 700 }}>{msg}</div>}
      {pausado && <div style={{ ...tarj, borderColor: "#C1440E88", background: "#1F120C", fontSize: 13.5, lineHeight: 1.5 }}><b style={{ color: "#E0714A" }}>⏸ Tu tarjeta está pausada por administración.</b>{pub.pausa_motivo ? <div style={{ marginTop: 4 }}>Motivo: {pub.pausa_motivo}</div> : null}<div style={{ marginTop: 4, color: "#B8B8B8" }}>Escribile a administración para resolverlo y volver a aparecer.</div></div>}
      {pendiente && !msg && <div style={{ ...tarj, borderColor: "#D4A01788", background: "#16120A", fontSize: 13.5, color: "#E5C467" }}>📝 Mandaste cambios{cambio.enviado_at ? " el " + new Date(cambio.enviado_at).toLocaleDateString("es-AR") : ""}. Están en revisión. Podés seguir editando y volver a enviar.</div>}
      {cambio && cambio.estado === "rechazado" && <div style={{ ...tarj, borderColor: "#C1440E88", background: "#1F120C", fontSize: 13.5 }}><b style={{ color: "#E0714A" }}>✕ Tu último pedido no se aprobó.</b>{cambio.motivo ? <div style={{ marginTop: 4 }}>Motivo: {cambio.motivo}</div> : null}<div style={{ marginTop: 4, color: "#B8B8B8" }}>Corregilo y volvelo a enviar.</div></div>}
      {cambio && cambio.estado === "aprobado" && !msg && <div style={{ ...tarj, borderColor: "#3A7D4488", fontSize: 13.5, color: "#9FE0AA" }}>✓ Tu último cambio fue aprobado y ya está publicado.</div>}

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
      <button onClick={enviar} disabled={enviando || subiendo} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: enviando || subiendo ? "#2A2A2A" : "#1A6B8A", color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>{enviando ? "Enviando…" : "Enviar para revisión"}</button>
      <div style={{ fontSize: 11.5, color: "#7E7E7E", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>Lo que envíes no se publica hasta que administración lo apruebe.</div>
    </div></div>
  );
}
