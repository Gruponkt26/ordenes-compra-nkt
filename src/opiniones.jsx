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

  var [notas, setNotas] = useState({});
  var [comentario, setComentario] = useState("");
  var [enviando, setEnviando] = useState(false);
  var [error, setError] = useState("");
  var [hecho, setHecho] = useState(function () {
    try {
      var t = parseInt(localStorage.getItem(claveLS) || "0", 10);
      return t > 0 && Date.now() - t < HORAS_ENTRE_OPINIONES * 3600 * 1000 ? "ya" : "";
    } catch (e) { return ""; }
  });

  useEffect(function () {
    if (valido) document.title = "Tu opinión · " + local.nombre;
  }, []);

  var fondo = { minHeight: "100vh", background: "#0D0D0D", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", padding: "22px 16px 40px", boxSizing: "border-box" };
  var caja = { maxWidth: 440, margin: "0 auto" };

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
      texto: JSON.stringify({ local: localId, canal: canal, zona: zona, notas: notas, comentario: comentario.trim().slice(0, 600) }),
      usuario: "cliente", created_at: ahora, updated_at: ahora,
    };
    fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: { ...SH, "Prefer": "return=minimal" }, body: JSON.stringify(fila) })
      .then(function (r) {
        if (!r.ok) throw new Error("No se pudo enviar (" + r.status + ")");
        try { localStorage.setItem(claveLS, String(Date.now())); } catch (e) {}
        setHecho("ok");
      })
      .catch(function () { setError("No pudimos enviar tu opinión. Revisá tu conexión y probá de nuevo."); setEnviando(false); });
  }

  return (
    <div style={fondo}><div style={caja}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 34 }}>{local.emoji}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: local.color }}>{local.nombre}</div>
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
    return { id: f.id, fecha: f.created_at, local: x.local, canal: x.canal === "delivery" ? "delivery" : "salon", zona: x.zona || "", notas: x.notas, comentario: x.comentario || "" };
  }).filter(Boolean);
}

function promedio(lista) {
  if (!lista.length) return null;
  return lista.reduce(function (a, n) { return a + n; }, 0) / lista.length;
}
function fmtNota(n) { return n === null ? "—" : n.toFixed(2).replace(".", ","); }

var MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// La temporada va de octubre 2026 a marzo 2027.
var PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
function nombrePeriodo(p) { var s = p.split("-"); return MESES[parseInt(s[1], 10) - 1] + " " + s[0]; }

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

export function PanelCompetencia() {
  var [tab, setTab] = useState("opiniones");
  var [opiniones, setOpiniones] = useState(null);
  var [periodo, setPeriodo] = useState("temporada");
  var [filtroLocal, setFiltroLocal] = useState("todos");

  function recargar() { cargarOpiniones().then(setOpiniones); }
  useEffect(function () { recargar(); }, []);

  var lista = (opiniones || []).filter(function (o) {
    return periodo === "temporada" ? PERIODOS.indexOf(String(o.fecha).substring(0, 7)) !== -1 : String(o.fecha).substring(0, 7) === periodo;
  });

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

  var salon = LOCALES_COMPETENCIA.map(function (id) { return { local: localDe(id), r: resumen(id, "salon") }; });
  var ranking = salon.slice().sort(function (a, b) { return (b.r.general === null ? -1 : b.r.general) - (a.r.general === null ? -1 : a.r.general); });

  var comentarios = lista.filter(function (o) { return (o.comentario || "").trim() && (filtroLocal === "todos" || o.local === filtroLocal); }).slice(0, 40);

  var tarjeta = { background: "#0F0F0F", border: "1px solid #1E1E1E", borderRadius: 14, padding: "14px 16px", marginBottom: 12 };
  var sel = { padding: "7px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 12 };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5 }}>Temporada oct 2026 – mar 2027</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800 }}>🏆 Competencia entre locales</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["opiniones", "⭐ Opiniones de clientes"], ["qr", "🖨️ QR para imprimir"]].map(function (t) {
          var act = tab === t[0];
          return <button key={t[0]} onClick={function () { setTab(t[0]); }} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid " + (act ? "#D4A017" : "#1A1A1A"), background: act ? "#D4A01722" : "none", color: act ? "#D4A017" : "#8C8C8C", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t[1]}</button>;
        })}
      </div>

      {tab === "opiniones" && (
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <select value={periodo} onChange={function (e) { setPeriodo(e.target.value); }} style={sel}>
              <option value="temporada">📅 Toda la temporada</option>
              {PERIODOS.map(function (p) { return <option key={p} value={p}>{nombrePeriodo(p)}</option>; })}
            </select>
            <button onClick={recargar} style={{ ...sel, cursor: "pointer" }}>🔄 Actualizar</button>
            <div style={{ fontSize: 11, color: "#7E7E7E" }}>{opiniones === null ? "Cargando…" : lista.length + " opiniones en el período"}</div>
          </div>

          <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>En el local · ranking por promedio</div>
          {ranking.map(function (x, i) {
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
          {LOCALES_COMPETENCIA.map(function (id) {
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
            <div style={{ fontSize: 10, color: "#8C8C8C", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Comentarios</div>
            <select value={filtroLocal} onChange={function (e) { setFiltroLocal(e.target.value); }} style={sel}>
              <option value="todos">Todos los locales</option>
              {LOCALES_COMPETENCIA.map(function (id) { return <option key={id} value={id}>{localDe(id).nombre}</option>; })}
            </select>
          </div>
          {comentarios.length === 0 && <div style={{ fontSize: 12, color: "#6E6E6E", padding: "8px 0" }}>Todavía no hay comentarios en este período.</div>}
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
                    <button onClick={function () { borrar(o.id); }} title="Borrar" style={{ background: "none", border: "none", color: "#6E6E6E", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#E8E8E8", lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{o.comentario}</div>
              </div>
            );
          })}
        </div>
      )}

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
              <div style={{ fontSize: 15, fontWeight: 800, color: l.color }}>{l.emoji} {l.nombre}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 6 }}>{it.titulo}</div>
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
