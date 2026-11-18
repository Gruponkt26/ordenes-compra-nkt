// Pedido de delivery desde Comunidad: el cliente (ya identificado con su WhatsApp) arma el carrito de UN local y lo envía.
// El pedido llega al cajero como «pedido nuevo» (comanda de delivery sin marchar + un aviso en pautas, ámbito "delivery_web");
// recién cuando el cajero lo acepta pasa a la cocina. Cada local es un pedido aparte (cada uno tiene su caja y su cuenta bancaria).
import React, { useState, useEffect } from "react";
import { SURL, SH } from "./comun.js";

var NIV = " › ";
function pesos(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR"); }
function hhmm(iso) { try { var d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); } catch (e) { return ""; } }

// El aviso de un pedido de Comunidad: {comanda_id, local, estado: nuevo | aceptado | rechazado, medio, abona_con, nota, cliente, wsp, total, creado_at, ...}
export async function leerPedidoWeb(cid) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq.cweb_" + encodeURIComponent(cid) + "&limit=1", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
  } catch (e) { return null; }
}
// El despacho del pedido (en camino / entregado), que escribe el cajero o el cadete.
async function leerDespachoWeb(cid) {
  try {
    var r = await fetch(SURL + "/rest/v1/pautas?id=eq.cdeliv_" + encodeURIComponent(cid) + "&limit=1", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return Array.isArray(d) && d[0] ? JSON.parse(d[0].texto) : null;
  } catch (e) { return null; }
}
var CLAVE_PEDIDO = "nkt_pedido_delivery";
function pedidoGuardado() { try { var p = JSON.parse(localStorage.getItem(CLAVE_PEDIDO) || "null"); return p && p.id && Date.now() - (p.at || 0) < 10 * 3600000 ? p : null; } catch (e) { return null; } }
// Cómo va el pedido, en palabras para el cliente.
function textoEstado(aviso, desp, localNombre, demora) {
  var a = aviso || {}, d = desp || {};
  var hora = a.prometida_at ? hhmm(a.prometida_at) : "";
  if (a.estado === "rechazado") return { fin: true, emoji: "😕", color: "#E0714A", titulo: "No pudimos tomar tu pedido", detalle: a.motivo || "", hora: "" };
  if (d.estado === "entregado") return { fin: true, emoji: "✅", color: "#4C9A5A", titulo: "¡Tu pedido llegó! Que lo disfrutes", detalle: "", hora: "" };
  if (d.estado === "en_camino") return { fin: false, emoji: "🛵", color: "#3A9BC1", titulo: "Tu pedido ya salió", detalle: hora ? "Llega aproximadamente a las " + hora : "Está en camino", hora: hora };
  if (a.estado === "aceptado") return { fin: false, emoji: "👨‍🍳", color: "#4C9A5A", titulo: localNombre + " confirmó tu pedido", detalle: (hora ? "Llega aproximadamente a las " + hora : "") + (a.medio === "transferencia" && !a.transf_ok ? (hora ? ". " : "") + "El local te escribe por WhatsApp con los datos para transferir." : ""), hora: hora };
  return { fin: false, emoji: "⏳", color: "#D4A017", titulo: "Esperando que " + localNombre + " confirme tu pedido", detalle: demora ? "Demora aproximada: " + demora : "Apenas lo confirme, te avisamos acá cuánto demora.", hora: "" };
}
// El pedido en curso, a la vista en la portada de Comunidad: se actualiza solo aunque el cliente haya cerrado y vuelto a abrir la app.
export function SeguimientoPedido(props) {
  var [p, setP] = useState(pedidoGuardado);
  var [est, setEst] = useState({ aviso: null, desp: null });
  useEffect(function () {
    if (!p) return;
    var vivo = true;
    function mirar() { Promise.all([leerPedidoWeb(p.id), leerDespachoWeb(p.id)]).then(function (r) { if (vivo) setEst({ aviso: r[0], desp: r[1] }); }); }
    mirar(); var t = setInterval(mirar, 15000);
    return function () { vivo = false; clearInterval(t); };
  }, [p && p.id]);
  if (!p) return null;
  var loc = (props.locales || []).find(function (l) { return l.id === p.local; }) || { nombre: "el local", color: "#C1440E", emoji: "🛵" };
  var info = ((props.cfgLocales || {})[p.local]) || {};
  var e = textoEstado(est.aviso, est.desp, loc.nombre, info.demora);
  function cerrar() { try { localStorage.removeItem(CLAVE_PEDIDO); } catch (x) {} setP(null); }
  return (
    <div style={{ background: "#111", border: "2px solid " + e.color, borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "#8C8C8C" }}>Tu pedido de delivery · {loc.emoji} {loc.nombre}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
        <div style={{ fontSize: 38 }}>{e.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#F0EDE8", lineHeight: 1.25 }}>{e.titulo}</div>
          {e.detalle && <div style={{ fontSize: 13, color: "#C8C8C8", marginTop: 3, lineHeight: 1.45 }}>{e.detalle}</div>}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: "#666", marginTop: 7 }}>Se actualiza sola.{e.fin ? "" : " No hace falta que dejes abierta esta pantalla."}</div>
      {e.fin && <button onClick={cerrar} style={{ marginTop: 8, background: "#161616", border: "1px solid #2A2A2A", color: "#F0EDE8", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cerrar</button>}
    </div>
  );
}
// ¿Ya tiene este cliente un pedido esperando respuesta? (uno solo a la vez por WhatsApp, para evitar pedidos repetidos)
async function pedidoPendienteDe(wsp) {
  try {
    var patron = encodeURIComponent('*"wsp":"' + wsp + '"*');
    var r = await fetch(SURL + "/rest/v1/pautas?ambito=eq.delivery_web&texto=like." + patron + "&created_at=gte." + new Date(Date.now() - 6 * 3600000).toISOString() + "&limit=20", { headers: { ...SH, "Cache-Control": "no-cache" } });
    var d = await r.json();
    return (Array.isArray(d) ? d : []).map(function (f) { try { return JSON.parse(f.texto); } catch (e) { return null; } }).find(function (x) { return x && x.estado === "nuevo" && x.local; }) || null;
  } catch (e) { return null; }
}

export function PedirDelivery(props) {
  var local = props.local, miembro = props.miembro || {}, color = local.color, prueba = !!props.prueba;
  var claveCarrito = "nkt_carrito_" + local.id;
  var [carta, setCarta] = useState(null);
  var [carrito, setCarrito] = useState(function () { try { return JSON.parse(localStorage.getItem(claveCarrito) || "{}") || {}; } catch (e) { return {}; } });
  var [paso, setPaso] = useState("carta");   // carta | pedido | listo
  var [nombre, setNombre] = useState(miembro.nombre || "");
  var [telefono, setTelefono] = useState(miembro.wsp || "");
  var [direccion, setDireccion] = useState(function () { try { return localStorage.getItem("nkt_dir_delivery") || ""; } catch (e) { return ""; } });
  var [referencia, setReferencia] = useState("");
  var [medio, setMedio] = useState("efectivo");
  var [abonaCon, setAbonaCon] = useState("");
  var [nota, setNota] = useState("");
  var [enviando, setEnviando] = useState(false);
  var [error, setError] = useState("");
  var [pedidoId, setPedidoId] = useState("");
  var [estado, setEstado] = useState(null);
  var [despacho, setDespacho] = useState(null);
  var info = props.info || {};

  useEffect(function () {
    var vivo = true;
    fetch(SURL + "/rest/v1/carta?local=eq." + local.id + "&order=categoria,orden", { headers: { ...SH, "Cache-Control": "no-cache" } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (vivo) setCarta((Array.isArray(d) ? d : []).filter(function (x) { return x.activo !== false && Number(x.precio) > 0; })); })
      .catch(function () { if (vivo) setCarta([]); });
    return function () { vivo = false; };
  }, [local.id]);
  useEffect(function () { try { localStorage.setItem(claveCarrito, JSON.stringify(carrito)); } catch (e) {} }, [carrito]);
  // Ya enviado: se mira cada tanto qué respondió el local.
  useEffect(function () {
    if (!pedidoId) return;
    var vivo = true;
    function mirar() { Promise.all([leerPedidoWeb(pedidoId), leerDespachoWeb(pedidoId)]).then(function (r) { if (vivo) { if (r[0]) setEstado(r[0]); setDespacho(r[1]); } }); }
    mirar(); var t = setInterval(mirar, 15000);
    return function () { vivo = false; clearInterval(t); };
  }, [pedidoId]);

  // El carrito solo guarda productos que siguen en la carta (y con el precio de hoy).
  var lineas = [];
  (carta || []).forEach(function (x) { var c = carrito[x.id]; if (c && c > 0) lineas.push({ id: x.id, nombre: x.nombre, precio: Number(x.precio) || 0, cant: c }); });
  var total = lineas.reduce(function (a, l) { return a + l.precio * l.cant; }, 0);
  var cantidad = lineas.reduce(function (a, l) { return a + l.cant; }, 0);
  function cambiar(id, d) { setCarrito(function (prev) { var n = Math.max(0, (prev[id] || 0) + d), nuevo = { ...prev }; if (n) nuevo[id] = n; else delete nuevo[id]; return nuevo; }); }

  // Categorías de primer nivel, con sus productos (los de subcategorías van dentro, con su ruta chica).
  var grupos = [];
  (carta || []).forEach(function (x) {
    var ruta = String(x.categoria || "Otros").split(NIV), top = ruta[0], sub = ruta.slice(1).join(NIV);
    var g = grupos.find(function (z) { return z.top === top; });
    if (!g) { g = { top: top, items: [] }; grupos.push(g); }
    g.items.push({ x: x, sub: sub });
  });

  async function enviar() {
    setError("");
    if (!lineas.length) { setError("Tu pedido está vacío."); return; }
    if (!nombre.trim()) { setError("Escribí tu nombre."); return; }
    if (String(telefono).replace(/\D/g, "").length < 8) { setError("Escribí un teléfono para que el local pueda avisarte."); return; }
    if (!direccion.trim()) { setError("Escribí la dirección de entrega."); return; }
    setEnviando(true);
    try {
      var pend = await pedidoPendienteDe(String(miembro.wsp || telefono));
      if (pend) { setEnviando(false); setError("Ya tenés un pedido esperando que el local lo confirme. Esperá su respuesta antes de hacer otro."); return; }
      var ahora = new Date().toISOString();
      var cid = (prueba ? "cmdp_" : "cmd_") + "web" + Date.now() + Math.random().toString(36).slice(2, 5);
      var h = { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" };
      var com = { id: cid, local: local.id, tipo: "delivery", numero: 0, estado: "abierta", mozo: "Comunidad", cliente: nombre.trim(), direccion: direccion.trim() + (referencia.trim() ? " (" + referencia.trim() + ")" : ""), telefono: String(telefono).trim(), abierta_at: ahora, usuario: "Comunidad" };
      var r1 = await fetch(SURL + "/rest/v1/comandas", { method: "POST", headers: h, body: JSON.stringify(com) });
      if (!r1.ok) throw new Error("comanda");
      var its = lineas.map(function (l, k) { return { id: cid + "_i" + k, comanda_id: cid, nombre: l.nombre, cant: l.cant, precio: l.precio, nota: null, estado: "pendiente", usuario: "Comunidad" }; });
      var r2 = await fetch(SURL + "/rest/v1/comanda_items", { method: "POST", headers: h, body: JSON.stringify(its) });
      if (!r2.ok) throw new Error("items");
      var aviso = { comanda_id: cid, local: local.id, estado: "nuevo", medio: medio, abona_con: medio === "efectivo" ? String(abonaCon).replace(/[^\d]/g, "") : "", nota: nota.trim(), cliente: nombre.trim(), wsp: String(miembro.wsp || telefono), total: total, creado_at: ahora };
      var r3 = await fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: h, body: JSON.stringify({ id: "cweb_" + cid, ambito: "delivery_web", texto: JSON.stringify(aviso), usuario: "Comunidad", created_at: ahora, updated_at: ahora }) });
      if (!r3.ok) throw new Error("aviso");
      try { localStorage.setItem("nkt_dir_delivery", direccion.trim()); localStorage.removeItem(claveCarrito); localStorage.setItem(CLAVE_PEDIDO, JSON.stringify({ id: cid, local: local.id, at: Date.now() })); } catch (e) {}
      setCarrito({}); setEstado(aviso); setPedidoId(cid); setPaso("listo");
    } catch (e) {
      setError("No se pudo enviar el pedido. Revisá tu conexión y probá de nuevo.");
    }
    setEnviando(false);
  }

  var campo = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 9, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 14, marginBottom: 8 };
  var etiqueta = { display: "block", fontSize: 11, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1, margin: "6px 0 4px" };
  var cerrar = function () { props.onCerrar(); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#0A0A0A", overflowY: "auto", fontFamily: "'Inter',sans-serif", color: "#F0EDE8" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "14px 14px 110px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {paso !== "listo" && <button onClick={function () { if (paso === "pedido") setPaso("carta"); else cerrar(); }} style={{ background: "#161616", border: "1px solid #2A2A2A", color: "#F0EDE8", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← {paso === "pedido" ? "Mi carrito" : "Volver"}</button>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5 }}>Pedir delivery</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 800, color: color }}>{local.emoji} {local.nombre}</div>
          </div>
        </div>
        {info.demora && paso !== "listo" && <div style={{ fontSize: 12.5, color: "#D4A017", background: "#1A1408", border: "1px solid #D4A01744", borderRadius: 9, padding: "7px 11px", marginBottom: 10 }}>🕒 Demora aproximada del delivery: <b>{info.demora}</b></div>}
        {prueba && <div style={{ background: "#2A1A00", border: "1px solid #E0914A", color: "#E0914A", borderRadius: 10, padding: "7px 11px", fontSize: 12, marginBottom: 10 }}>🧪 Modo prueba: el pedido queda marcado como prueba.</div>}

        {paso === "carta" && (
          carta === null ? <div style={{ textAlign: "center", padding: "50px 0", color: "#666" }}>Cargando la carta…</div>
          : !grupos.length ? <div style={{ textAlign: "center", padding: "50px 0", color: "#888" }}>Por ahora no hay productos disponibles para pedir.</div>
          : (
            <div>
              {grupos.map(function (g) {
                return (
                  <div key={g.top} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: color, margin: "0 0 6px", borderBottom: "1px solid " + color + "44", paddingBottom: 4 }}>{g.top}</div>
                    {g.items.map(function (e) {
                      var n = carrito[e.x.id] || 0;
                      return (
                        <div key={e.x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #1A1A1A" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{e.x.nombre}</div>
                            {e.sub && <div style={{ fontSize: 10.5, color: "#777" }}>{e.sub}</div>}
                            <div style={{ fontSize: 13, color: "#B8B8B8", marginTop: 1 }}>{pesos(e.x.precio)}</div>
                          </div>
                          {n === 0
                            ? <button onClick={function () { cambiar(e.x.id, 1); }} style={{ background: color, border: "none", color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Agregar</button>
                            : <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <button onClick={function () { cambiar(e.x.id, -1); }} style={{ width: 36, height: 36, borderRadius: 18, border: "1px solid " + color, background: "transparent", color: color, fontSize: 20, fontWeight: 800, cursor: "pointer" }}>−</button>
                                <span style={{ minWidth: 22, textAlign: "center", fontWeight: 900, fontSize: 16 }}>{n}</span>
                                <button onClick={function () { cambiar(e.x.id, 1); }} style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: color, color: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer" }}>+</button>
                              </div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )
        )}

        {paso === "pedido" && (
          <div>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
              {lineas.map(function (l) {
                return <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, padding: "4px 0" }}><span><b>{l.cant}×</b> {l.nombre}</span><span style={{ color: "#B8B8B8" }}>{pesos(l.precio * l.cant)}</span></div>;
              })}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #222", marginTop: 6, paddingTop: 7, fontSize: 16, fontWeight: 900 }}><span>Total productos</span><span style={{ color: color }}>{pesos(total)}</span></div>
              <div style={{ fontSize: 11, color: "#8C8C8C", marginTop: 4 }}>El costo de envío, si corresponde, te lo confirma el local.</div>
            </div>
            <label style={etiqueta}>Tu nombre</label>
            <input value={nombre} onChange={function (e) { setNombre(e.target.value); }} style={campo} />
            <label style={etiqueta}>Teléfono / WhatsApp</label>
            <input value={telefono} onChange={function (e) { setTelefono(e.target.value); }} inputMode="tel" style={campo} />
            <label style={etiqueta}>Dirección de entrega</label>
            <input value={direccion} onChange={function (e) { setDireccion(e.target.value); }} placeholder="Calle y número" style={campo} />
            <input value={referencia} onChange={function (e) { setReferencia(e.target.value); }} placeholder="Referencia (piso, timbre, entre calles…)" style={campo} />
            <label style={etiqueta}>¿Cómo pagás?</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[["efectivo", "💵 Efectivo al recibir"], ["transferencia", "📲 Transferencia"]].map(function (m) {
                var act = medio === m[0];
                return <button key={m[0]} onClick={function () { setMedio(m[0]); }} style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: "2px solid " + (act ? color : "#2A2A2A"), background: act ? color + "26" : "#111", color: act ? "#fff" : "#9A9A9A", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{m[1]}</button>;
              })}
            </div>
            {medio === "efectivo"
              ? <input value={abonaCon} onChange={function (e) { setAbonaCon(e.target.value); }} inputMode="numeric" placeholder="¿Con cuánto abonás? (opcional, para llevar vuelto)" style={campo} />
              : <div style={{ fontSize: 12, color: "#B8B8B8", background: "#111", border: "1px solid #222", borderRadius: 9, padding: "8px 11px", marginBottom: 8, lineHeight: 1.5 }}>Cuando el local confirme tu pedido te pasa los datos para transferir. El pedido sale cuando se acredita.</div>}
            <label style={etiqueta}>Nota para el local (opcional)</label>
            <textarea value={nota} onChange={function (e) { setNota(e.target.value); }} rows={2} placeholder="Ej: sin cebolla, tocar timbre fuerte…" style={{ ...campo, resize: "vertical" }} />
            {error && <div style={{ background: "#1A0808", border: "1px solid #C1440E66", color: "#E0714A", borderRadius: 9, padding: "9px 12px", fontSize: 13, marginBottom: 8 }}>⚠️ {error}</div>}
          </div>
        )}

        {paso === "listo" && (
          <div style={{ textAlign: "center", paddingTop: 20 }}>
            {(function () {
              var e = textoEstado(estado, despacho, local.nombre, info.demora);
              return <div>
                <div style={{ fontSize: 54 }}>{e.emoji}</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, color: e.color, margin: "6px 0" }}>{estado && estado.estado === "nuevo" && !despacho ? "¡Pedido enviado!" : e.titulo}</div>
                {estado && estado.estado === "nuevo" && !despacho && <div style={{ fontSize: 14, color: "#C8C8C8", marginBottom: 6 }}>{e.titulo}</div>}
                {e.detalle && <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>{e.detalle}</div>}
                <div style={{ fontSize: 12, color: "#8C8C8C", marginTop: 10, lineHeight: 1.5 }}>Podés cerrar esta pantalla: en la portada de Grupo Nkt vas a ver cómo va tu pedido, y se actualiza sola.</div>
              </div>;
            })()}
            <div style={{ fontSize: 13, color: "#8C8C8C", margin: "14px 0 4px" }}>Total productos: <b style={{ color: "#F0EDE8" }}>{pesos((estado || {}).total || 0)}</b> · {((estado || {}).medio === "transferencia") ? "Transferencia" : "Efectivo al recibir"}</div>
            <button onClick={cerrar} style={{ marginTop: 16, background: "#161616", border: "1px solid #2A2A2A", color: "#F0EDE8", borderRadius: 10, padding: "12px 22px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Volver a Grupo Nkt</button>
          </div>
        )}
      </div>

      {paso === "carta" && cantidad > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 12, background: "linear-gradient(transparent, #0A0A0A 40%)", display: "flex", justifyContent: "center" }}>
          <button onClick={function () { setPaso("pedido"); setError(""); }} style={{ width: "100%", maxWidth: 496, background: color, border: "none", color: "#fff", borderRadius: 14, padding: "15px 18px", fontSize: 16, fontWeight: 900, cursor: "pointer", display: "flex", justifyContent: "space-between", boxShadow: "0 6px 22px rgba(0,0,0,0.5)" }}>
            <span>🛒 Ver mi pedido ({cantidad})</span><span>{pesos(total)}</span>
          </button>
        </div>
      )}
      {paso === "pedido" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 12, background: "linear-gradient(transparent, #0A0A0A 40%)", display: "flex", justifyContent: "center" }}>
          <button onClick={enviar} disabled={enviando} style={{ width: "100%", maxWidth: 496, background: enviando ? "#555" : "#3A7D44", border: "none", color: "#fff", borderRadius: 14, padding: "15px 18px", fontSize: 16, fontWeight: 900, cursor: enviando ? "default" : "pointer", boxShadow: "0 6px 22px rgba(0,0,0,0.5)" }}>
            {enviando ? "Enviando…" : "✅ Enviar pedido · " + pesos(total)}
          </button>
        </div>
      )}
    </div>
  );
}
