// Chat del equipo: un chat para todos los usuarios de la app y un chat privado entre Sofía y la Oficina.
// Los mensajes viven en la tabla "pautas" que ya existe (no hace falta crear nada en Supabase):
//   ámbito "chat_todos"            → el chat de todos
//   ámbito "chat_priv_sofia_oficina" → el privado Sofía ↔ Oficina
//   ámbito "chat_visto"            → hasta qué mensaje leyó cada usuario en cada chat (para el aviso)
// La pantalla de Pautas sólo lista sus propios ámbitos, así que estos mensajes no aparecen ahí.
import { useState, useEffect, useRef } from "react";
import { SURL, SH } from "./comun.js";

var CANAL_TODOS = "chat_todos";
var CANAL_PRIV = "chat_priv_sofia_oficina";
var CADA_MS = 8000;
// Clave pública de los avisos (la privada está en Vercel). Es pública a propósito.
var VAPID_PUBLICA = "BJplpIAFxpkF2Of7hqMt53MWS6mH1K2dTgrzYNoRmuifHfNmOa6UGOloe6KXSeDEebxEGJD6NYZWESOg_o8VlRY";

function clavePush(b64) {
  var pad = "=".repeat((4 - (b64.length % 4)) % 4);
  var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function hashCorto(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
async function borrarFila(id) {
  try { await fetch(SURL + "/rest/v1/pautas?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: SH }); } catch (e) {}
}
function estadoInicialAvisos() {
  if (typeof window === "undefined") return "no-soportado";
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var instalada = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !instalada ? "ios-instalar" : "no-soportado";
  }
  if (Notification.permission === "denied") return "denegado";
  return "inactivo";
}

async function cargarChat() {
  try {
    var q = "ambito=in.(" + CANAL_TODOS + "," + CANAL_PRIV + ",chat_visto)&order=created_at.desc&limit=400";
    var r = await fetch(SURL + "/rest/v1/pautas?" + q, { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d : null;
  } catch (e) { return null; }
}
async function guardarFila(fila) {
  try {
    var h = { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" };
    var r = await fetch(SURL + "/rest/v1/pautas", { method: "POST", headers: h, body: JSON.stringify(fila) });
    if (!r.ok) { var t = await r.text(); return t || ("Error " + r.status); }
    return null;
  } catch (e) { return String((e && e.message) || e); }
}

function horaCorta(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var hoy = new Date();
  var hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (d.toDateString() === hoy.toDateString()) return hm;
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + " " + hm;
}

export default function ChatEquipo(p) {
  var cu = p.cu, users = p.users || [];
  var esSofia = cu.usuario === "sofia";
  var esOficina = cu.local === "l4";
  var veePrivado = esSofia || esOficina;

  var [abierto, setAbierto] = useState(false);
  var [canal, setCanal] = useState(CANAL_TODOS);
  var [msgs, setMsgs] = useState([]);
  var [vistos, setVistos] = useState({});
  var [texto, setTexto] = useState("");
  var [aviso, setAviso] = useState(null);
  var [avisosApp, setAvisosApp] = useState(estadoInicialAvisos());
  var [avisosMsg, setAvisosMsg] = useState("");
  // Al cajero se le insiste con activar los avisos: el cartel vuelve en cada ingreso hasta que los active.
  var [cartelOculto, setCartelOculto] = useState(function () {
    try { return sessionStorage.getItem("chat_cartel_oculto") === cu.usuario; } catch (e) { return false; }
  });
  function ocultarCartel() {
    setCartelOculto(true);
    try { sessionStorage.setItem("chat_cartel_oculto", cu.usuario); } catch (e) {}
  }
  var esCajero = cu.rol === "cajero";
  var faltanAvisos = esCajero && (avisosApp === "inactivo" || avisosApp === "denegado" || avisosApp === "ios-instalar");
  var conocidos = useRef(null);
  var abiertoRef = useRef(false);
  var canalRef = useRef(CANAL_TODOS);
  var finRef = useRef(null);
  var usersRef = useRef(users);
  usersRef.current = users;
  var tituloBase = useRef(typeof document !== "undefined" ? document.title : "");

  abiertoRef.current = abierto;
  canalRef.current = canal;

  function nombreDe(usuario) {
    var u = usersRef.current.find(function (x) { return x.usuario === usuario; });
    return u ? u.nombre : usuario;
  }
  var canalesVisibles = veePrivado ? [CANAL_TODOS, CANAL_PRIV] : [CANAL_TODOS];
  function tituloCanal(c) { return c === CANAL_TODOS ? "👥 Todos" : (esSofia ? "🔒 Oficina" : "🔒 Sofía"); }

  function procesar(filas) {
    var mensajes = filas.filter(function (f) {
      if (f.ambito === CANAL_TODOS) return true;
      return f.ambito === CANAL_PRIV && veePrivado;
    }).sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
    var vs = {};
    filas.forEach(function (f) {
      if (f.ambito === "chat_visto" && f.usuario === cu.usuario) {
        var c = String(f.id).replace("chatvisto_" + cu.usuario + "_", "");
        vs[c] = f.texto || "";
      }
    });
    // Mensajes nuevos de otros desde la última vez: se avisa con un cartelito si no lo está mirando.
    if (conocidos.current) {
      var nuevos = mensajes.filter(function (m) { return !conocidos.current[m.id] && m.usuario !== cu.usuario; });
      if (nuevos.length) {
        var ult = nuevos[nuevos.length - 1];
        var mirando = abiertoRef.current && canalRef.current === ult.ambito;
        if (!mirando) setAviso({ id: ult.id, de: nombreDe(ult.usuario), texto: ult.texto, canal: ult.ambito });
      }
    }
    var mapa = {};
    mensajes.forEach(function (m) { mapa[m.id] = true; });
    conocidos.current = mapa;
    setMsgs(mensajes);
    setVistos(function (prev) {
      // Lo que ya marqué como leído acá no se pisa con una lectura vieja del servidor.
      var n = { ...vs };
      Object.keys(prev).forEach(function (k) { if (String(prev[k]) > String(n[k] || "")) n[k] = prev[k]; });
      return n;
    });
  }

  function recargar() {
    cargarChat().then(function (f) { if (f) procesar(f); });
  }

  useEffect(function () {
    recargar();
    var t = setInterval(recargar, CADA_MS);
    return function () { clearInterval(t); };
  }, [cu.usuario]);

  function sinLeer(c) {
    var desde = String(vistos[c] || "");
    return msgs.filter(function (m) { return m.ambito === c && m.usuario !== cu.usuario && String(m.created_at) > desde; }).length;
  }
  var totalSinLeer = canalesVisibles.reduce(function (a, c) { return a + sinLeer(c); }, 0);

  // Marcar como leído lo que se está mirando.
  useEffect(function () {
    if (!abierto) return;
    var delCanal = msgs.filter(function (m) { return m.ambito === canal; });
    if (!delCanal.length) return;
    var ultimo = String(delCanal[delCanal.length - 1].created_at);
    if (ultimo > String(vistos[canal] || "")) {
      var nv = { ...vistos }; nv[canal] = ultimo; setVistos(nv);
      var ahora = new Date().toISOString();
      guardarFila({ id: "chatvisto_" + cu.usuario + "_" + canal, ambito: "chat_visto", texto: ultimo, usuario: cu.usuario, created_at: ahora, updated_at: ahora });
    }
  }, [abierto, canal, msgs]);

  useEffect(function () {
    if (abierto && finRef.current) finRef.current.scrollIntoView({ block: "end" });
  }, [abierto, canal, msgs.length]);

  // El aviso desaparece solo.
  useEffect(function () {
    if (!aviso) return;
    var t = setTimeout(function () { setAviso(null); }, 7000);
    return function () { clearTimeout(t); };
  }, [aviso]);

  // El título de la pestaña muestra cuántos mensajes sin leer hay.
  useEffect(function () {
    if (typeof document === "undefined") return;
    document.title = totalSinLeer > 0 ? "(" + totalSinLeer + ") " + tituloBase.current : tituloBase.current;
  }, [totalSinLeer]);

  function filaSuscripcion(sub) {
    var ahora = new Date().toISOString();
    return { id: "pushsub_" + cu.usuario + "_" + hashCorto(sub.endpoint), ambito: "push_sub", texto: JSON.stringify({ sub: sub, local: cu.local || "" }), usuario: cu.usuario, created_at: ahora, updated_at: ahora };
  }
  // Si ya activó los avisos en este dispositivo, se vuelve a guardar la suscripción (puede cambiar).
  useEffect(function () {
    if (avisosApp !== "inactivo" || Notification.permission !== "granted") return;
    navigator.serviceWorker.getRegistration("/sw.js").then(function (reg) {
      if (!reg) return null;
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (!sub) return;
      guardarFila(filaSuscripcion(sub.toJSON()));
      setAvisosApp("activo");
    }).catch(function () {});
  }, [cu.usuario]);

  async function activarAvisos() {
    setAvisosMsg("");
    try {
      var permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setAvisosApp("denegado"); return; }
      var reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clavePush(VAPID_PUBLICA) });
      var err = await guardarFila(filaSuscripcion(sub.toJSON()));
      if (err) { setAvisosMsg("No se pudo guardar: " + err); return; }
      setAvisosApp("activo");
    } catch (e) {
      setAvisosMsg("No se pudieron activar los avisos: " + ((e && e.message) || e));
    }
  }
  async function desactivarAvisos() {
    try {
      var reg = await navigator.serviceWorker.getRegistration("/sw.js");
      var sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await borrarFila("pushsub_" + cu.usuario + "_" + hashCorto(sub.endpoint));
        await sub.unsubscribe();
      }
    } catch (e) {}
    setAvisosApp("inactivo");
  }

  function enviar() {
    var t = texto.trim().slice(0, 2000);
    if (!t) return;
    var ahora = new Date().toISOString();
    var m = { id: "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), ambito: canal, texto: t, usuario: cu.usuario, created_at: ahora, updated_at: ahora };
    setMsgs(function (prev) { return prev.concat([m]); });
    if (conocidos.current) conocidos.current[m.id] = true;
    setTexto("");
    guardarFila(m).then(function (err) {
      if (err) { alert("No se pudo enviar el mensaje:\n\n" + err); return; }
      // Avisa a los demás aunque tengan la app cerrada.
      fetch("/api/push-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) }).catch(function () {});
    });
  }

  function abrir(c) {
    setCanal(c || canal);
    setAbierto(true);
    setAviso(null);
    recargar();
  }

  var delCanal = msgs.filter(function (m) { return m.ambito === canal; });

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {faltanAvisos && !cartelOculto && !abierto && (
        <div style={{ position: "fixed", left: "50%", top: 14, transform: "translateX(-50%)", zIndex: 1001, width: "min(420px, calc(100vw - 24px))", background: "#1A1408", border: "2px solid #D4A017", borderRadius: 14, padding: "13px 15px", boxShadow: "0 10px 34px #000C" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#D4A017", marginBottom: 5 }}>🔔 Activá los avisos del chat</div>
          {avisosApp === "inactivo" && (<div style={{ fontSize: 12, color: "#E8E8E8", lineHeight: 1.5, marginBottom: 10 }}>Así te llegan los mensajes del equipo aunque la app esté cerrada. Tocá el botón y aceptá el permiso.</div>)}
          {avisosApp === "denegado" && (<div style={{ fontSize: 12, color: "#E8E8E8", lineHeight: 1.5, marginBottom: 10 }}>Las notificaciones de este sitio están bloqueadas. Habilitalas en la configuración del navegador (candado o ícono junto a la dirección → Notificaciones → Permitir) y recargá la app.</div>)}
          {avisosApp === "ios-instalar" && (<div style={{ fontSize: 12, color: "#E8E8E8", lineHeight: 1.5, marginBottom: 10 }}>En el iPhone hay que agregar la app a la pantalla de inicio: tocá Compartir → "Agregar a pantalla de inicio" y abrila desde ahí.</div>)}
          {avisosMsg && <div style={{ fontSize: 11, color: "#E0714A", marginBottom: 8 }}>{avisosMsg}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            {avisosApp === "inactivo" && (<button onClick={activarAvisos} style={{ flex: 2, padding: "10px", borderRadius: 9, border: "none", background: "#D4A017", color: "#000", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Activar avisos</button>)}
            <button onClick={ocultarCartel} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid #3A3A3A", background: "none", color: "#9A9A9A", fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: "pointer" }}>Más tarde</button>
          </div>
        </div>
      )}

      {aviso && !abierto && (
        <div onClick={function () { abrir(aviso.canal); }}
          style={{ position: "fixed", right: 18, bottom: 84, zIndex: 1000, maxWidth: 300, background: "#1A1A1A", border: "1px solid #D4A01766", borderRadius: 12, padding: "10px 13px", cursor: "pointer", boxShadow: "0 8px 28px #000A" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#D4A017" }}>💬 {aviso.de}{aviso.canal === CANAL_PRIV ? " · privado" : ""}</div>
          <div style={{ fontSize: 12, color: "#E8E8E8", marginTop: 3, wordBreak: "break-word" }}>{String(aviso.texto).slice(0, 90)}{String(aviso.texto).length > 90 ? "…" : ""}</div>
        </div>
      )}

      {abierto && (
        <div style={{ position: "fixed", right: 14, bottom: 84, zIndex: 1000, width: "min(380px, calc(100vw - 28px))", height: "min(520px, 72vh)", background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 14, display: "flex", flexDirection: "column", boxShadow: "0 12px 40px #000C", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px", borderBottom: "1px solid #1E1E1E" }}>
            {canalesVisibles.map(function (c) {
              var act = canal === c, n = sinLeer(c);
              return (
                <button key={c} onClick={function () { setCanal(c); }}
                  style={{ padding: "6px 11px", borderRadius: 8, border: "none", background: act ? "#D4A017" : "#1A1A1A", color: act ? "#000" : "#9A9A9A", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {tituloCanal(c)}{n > 0 && !act ? " · " + n : ""}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <button onClick={function () { setAbierto(false); }} style={{ background: "none", border: "none", color: "#8C8C8C", fontSize: 16, cursor: "pointer" }} title="Cerrar">✕</button>
          </div>

          <div style={{ padding: "6px 12px", borderBottom: "1px solid #161616", fontSize: 11, color: "#8C8C8C", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {avisosApp === "activo" && (<><span style={{ color: "#4C9A5A" }}>🔔 Avisos con la app cerrada: activados</span><button onClick={desactivarAvisos} style={{ background: "none", border: "none", color: "#7E7E7E", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Desactivar</button></>)}
            {avisosApp === "inactivo" && (<><span>🔕 Sin avisos con la app cerrada</span><button onClick={activarAvisos} style={{ background: "#D4A017", border: "none", color: "#000", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 6, padding: "3px 9px" }}>Activar avisos</button></>)}
            {avisosApp === "denegado" && <span>🔕 Los avisos están bloqueados: habilitá las notificaciones de este sitio en el navegador.</span>}
            {avisosApp === "ios-instalar" && <span>📱 Para recibir avisos en el iPhone: tocá Compartir → "Agregar a pantalla de inicio" y abrí la app desde ahí.</span>}
            {avisosApp === "no-soportado" && <span>Este navegador no permite avisos con la app cerrada.</span>}
            {avisosMsg && <span style={{ color: "#E0714A" }}>{avisosMsg}</span>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
            {delCanal.length === 0 && (
              <div style={{ margin: "auto", fontSize: 12, color: "#6E6E6E", textAlign: "center" }}>
                {canal === CANAL_PRIV ? "Chat privado entre Sofía y la Oficina. Nadie más lo ve." : "Todavía no hay mensajes. Escribí el primero."}
              </div>
            )}
            {delCanal.map(function (m) {
              var mio = m.usuario === cu.usuario;
              return (
                <div key={m.id} style={{ alignSelf: mio ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                  <div style={{ background: mio ? "#C1440E" : "#1C1C1C", color: "#F0EDE8", borderRadius: 12, padding: "7px 11px", fontSize: 13, lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {!mio && <div style={{ fontSize: 10, fontWeight: 800, color: "#D4A017", marginBottom: 2 }}>{nombreDe(m.usuario)}</div>}
                    {m.texto}
                  </div>
                  <div style={{ fontSize: 9, color: "#6E6E6E", marginTop: 2, textAlign: mio ? "right" : "left" }}>{horaCorta(m.created_at)}</div>
                </div>
              );
            })}
            <div ref={finRef} />
          </div>

          <div style={{ display: "flex", gap: 7, padding: "9px 10px", borderTop: "1px solid #1E1E1E" }}>
            <input value={texto} onChange={function (e) { setTexto(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Escribí un mensaje…" maxLength={2000}
              style={{ flex: 1, padding: "9px 11px", borderRadius: 9, border: "1px solid #2A2A2A", background: "#111", color: "#F0EDE8", fontFamily: "'Inter',sans-serif", fontSize: 13, outline: "none" }} />
            <button onClick={enviar} disabled={!texto.trim()}
              style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: texto.trim() ? "#C1440E" : "#2A2A2A", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, cursor: texto.trim() ? "pointer" : "default" }}>Enviar</button>
          </div>
        </div>
      )}

      <button onClick={function () { if (abierto) setAbierto(false); else abrir(); }} title="Chat del equipo"
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1000, width: 56, height: 56, borderRadius: 28, border: "none", background: abierto ? "#2A2A2A" : "#C1440E", color: "#fff", fontSize: 24, cursor: "pointer", boxShadow: "0 6px 22px #000A" }}>
        💬
        {faltanAvisos && totalSinLeer === 0 && (
          <span title="Avisos desactivados" style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, background: "#D4A017", border: "2px solid #0D0D0D" }} />
        )}
        {totalSinLeer > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, padding: "0 5px", boxSizing: "border-box", borderRadius: 10, background: "#E5231B", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0D0D0D" }}>{totalSinLeer > 99 ? "99+" : totalSinLeer}</span>
        )}
      </button>
    </div>
  );
}
