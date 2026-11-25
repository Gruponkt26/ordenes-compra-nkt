// El juego de los tickets: después de dejar una opinión, el socio desliza, la barra frena (con sonido) y gana 1, 2 o 5 tickets para el sorteo del mes.
// Diseño y reglas: docs/boceto-tickets.html. Solo aparece si administración encendió los tickets (Comunidad → Datos → Tickets del sorteo).
// El resultado es AZAR (60 % / 30 % / 10 %); la barra solo se acomoda a lo que ya salió. Una jugada por socio, por local y por día.
import React, { useState, useEffect, useRef } from "react";
import { guardarFila, leerPauta, cargarTicketsSocio, mesClave, otorgarJugada } from "./grupo.jsx";

// ─── sonido de nave espacial (se genera en el momento, sin archivos) ───
var ac = null, bus = null, zum = null;
function audio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      bus = ac.createGain(); bus.gain.value = 0.9; bus.connect(ac.destination);
      var d = ac.createDelay(1); d.delayTime.value = 0.19;
      var fb = ac.createGain(); fb.gain.value = 0.38; var wet = ac.createGain(); wet.gain.value = 0.45;
      bus.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
  } catch (e) { ac = null; }
  return ac;
}
function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function barrido(f0, f1, dur, tipo, vol, delay, filtro0, filtro1) {
  var c = audio(); if (!c) return;
  var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain(), n = o;
  o.type = tipo || "sawtooth"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (filtro0) { var fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.Q.value = 6; fl.frequency.setValueAtTime(filtro0, t); fl.frequency.exponentialRampToValueAtTime(filtro1 || filtro0, t + dur); o.connect(fl); n = fl; }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + Math.min(0.05, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
}
function ping(f, dur, vol, delay) { barrido(f, f * 0.98, dur || 0.16, "sine", vol || 0.16, delay || 0); }
function zumbidoOn() {
  var c = audio(); if (!c || zum) return;
  var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
  o.type = "sawtooth"; o2.type = "square"; o.frequency.value = 80; o2.frequency.value = 40; fl.type = "lowpass"; fl.Q.value = 8; fl.frequency.value = 300;
  g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.1, c.currentTime + 0.08);
  o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(bus); o.start(); o2.start();
  zum = { o: o, o2: o2, g: g, fl: fl };
}
function zumbidoVa(p) {
  if (!zum || !ac) return; var t = ac.currentTime;
  zum.o.frequency.setTargetAtTime(80 + p * 520, t, 0.03); zum.o2.frequency.setTargetAtTime(40 + p * 260, t, 0.03);
  zum.fl.frequency.setTargetAtTime(300 + p * 3200, t, 0.03); zum.g.gain.setTargetAtTime(0.09 + p * 0.07, t, 0.03);
}
function zumbidoOff() {
  if (!zum || !ac) return; var z = zum; zum = null; var t = ac.currentTime;
  z.g.gain.cancelScheduledValues(t); z.g.gain.setTargetAtTime(0.0001, t, 0.05);
  setTimeout(function () { try { z.o.stop(); z.o2.stop(); } catch (e) {} }, 300);
}
function ignicion() { barrido(120, 1400, 0.5, "sawtooth", 0.14, 0, 400, 6000); barrido(900, 1800, 0.25, "square", 0.05, 0.25); ping(1760, 0.3, 0.1, 0.45); vibrar([30, 30, 90]); }
function sonar(e) { ping(520 + e * 980, 0.14, 0.15); barrido(90, 70, 0.1, "sine", 0.1, 0); vibrar(6); }
function bloqueo() { barrido(700, 70, 0.4, "sawtooth", 0.14, 0, 3000, 150); ping(220, 0.25, 0.14, 0.02); }
function melodia(n) {
  var C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5;
  if (n === 1) { barrido(300, 1100, 0.28, "triangle", 0.13, 0, 2000, 5000); ping(C6, 0.4, 0.13, 0.22); ping(E6, 0.4, 0.09, 0.3); }
  else if (n === 2) { barrido(250, 1300, 0.34, "sawtooth", 0.11, 0, 1500, 6000); [C5, E5, G5, C6].forEach(function (f, i) { ping(f, 0.3, 0.13, 0.16 + i * 0.09); }); }
  else {
    barrido(60, 1900, 1.1, "sawtooth", 0.16, 0, 250, 9000); barrido(120, 2600, 1.1, "square", 0.05, 0, 400, 9000);
    [C5, E5, G5, C6, E6].forEach(function (f, i) { barrido(f, f * 1.003, 1.3, "sine", 0.1, 1.0 + i * 0.05); });
    for (var i = 0; i < 7; i++) ping(1800 + Math.random() * 2200, 0.18, 0.08, 1.1 + i * 0.1);
  }
}

// 60 % → 1 ticket · 30 % → 2 · 10 % → 5
function sortear() { var r = Math.random(); return r < 0.6 ? 1 : r < 0.9 ? 2 : 5; }
function diaClave() { var d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); }

var CREMA = { fondo: "#F4ECDC", tinta: "#1D1A16", suave: "#6B6256", linea: "#E3DCCD", naranja: "#E8602A", naranjaOsc: "#C1440E" };

export default function JuegoTickets(props) {
  var wsp = props.wsp, localId = props.localId, prueba = !!props.prueba;
  // Regalo de bienvenida: una sola vez por WhatsApp (y por celular), siempre 1 ticket. Se muestra con la misma animación, pero NO es azar.
  var bienvenida = !!props.bienvenida;
  // Cada juego sale de una «jugada»: al opinar se crea en el momento (una por local y por día); las de canje (o las que quedaron sin jugar) se reclaman desde la pantalla.
  var jugadaId = bienvenida ? null : (props.jugada ? props.jugada.id : "jug_" + wsp + "_opinion_" + localId + "_" + diaClave());
  var idTicket = bienvenida ? "tk_" + wsp + "_bienvenida" : "tk_" + jugadaId.slice(4);
  var [fase, setFase] = useState("cargando");   // cargando | ya | slide | barra | guardando | error | resultado
  var [n, setN] = useState(0);
  var [total, setTotal] = useState(null);
  var [silencio, setSilencio] = useState(false);
  var silRef = useRef(false);
  var mangoRef = useRef(null), slideRef = useRef(null), relRef = useRef(null), ptRef = useRef(null), rafRef = useRef(0);
  var guardadoRef = useRef(null);
  var jugadaRef = useRef(null);

  useEffect(function () {
    if (prueba) { setFase("slide"); return; }
    // En este celular ya se entregó un regalo de bienvenida a otro WhatsApp: no se entrega otro.
    if (bienvenida) { try { var w0 = localStorage.getItem("nkt_bienvenida"); if (w0 && w0 !== wsp) { setFase("ya"); return; } } catch (e) {} }
    if (bienvenida) { leerPauta(idTicket).then(function (f) { setFase(f ? "ya" : "slide"); cargarTicketsSocio(wsp).then(setTotal); }); return; }
    leerPauta(jugadaId).then(function (j) {
      if (j && j.usada) { setFase("ya"); cargarTicketsSocio(wsp).then(setTotal); return; }
      jugadaRef.current = j || { wsp: wsp, origen: "opinion", ref: localId + "_" + diaClave(), local: localId };
      if (!j) otorgarJugada(wsp, "opinion", localId + "_" + diaClave(), { local: localId }).then(function () { setFase("slide"); }); else setFase("slide");
      cargarTicketsSocio(wsp).then(setTotal);
    });
    return function () { cancelAnimationFrame(rafRef.current); zumbidoOff(); };
  }, []);

  // El sonido respeta el botón «sin sonido»: se apaga cortando el contexto de audio del juego.
  function sonido(fn) { if (!silRef.current) { try { fn(); } catch (e) {} } }
  function alternarSonido() { silRef.current = !silRef.current; setSilencio(silRef.current); if (silRef.current) zumbidoOff(); else sonido(function () { ping(880, 0.2, 0.12); }); }

  function guardar(cant) {
    if (prueba) return Promise.resolve(true);
    var fila = { wsp: wsp, n: cant, mes: mesClave(), local: localId || (props.jugada && props.jugada.local) || "", fecha: new Date().toISOString(), origen: bienvenida ? "bienvenida" : (props.jugada ? props.jugada.origen : "opinion"), opinion_id: props.opinionId || "" };
    if (bienvenida) { try { fila.disp = localStorage.getItem("nkt_dispositivo") || ""; } catch (e) {} }
    return guardarFila(idTicket, "grupo_ticket", fila).then(function (ok) {
      if (ok && bienvenida) { try { localStorage.setItem("nkt_bienvenida", wsp); } catch (e) {} }
      // La jugada queda usada solo cuando el ticket ya está guardado.
      if (ok && jugadaId) { var j = { ...(jugadaRef.current || {}), wsp: wsp }; delete j.id; return guardarFila(jugadaId, "grupo_jugada", { ...j, usada: true, n: cant, usada_at: new Date().toISOString() }).then(function () { return true; }); }
      return ok;
    });
  }

  // ─── deslizar para jugar ───
  function bajar(e) {
    var slide = slideRef.current, m = mangoRef.current; if (!slide || !m) return;
    var max = slide.clientWidth - 58 - 6, x0 = e.clientX, ultimo = 0, activo = true;
    try { m.setPointerCapture(e.pointerId); } catch (er) {}
    m.style.transition = "none"; if (relRef.current) relRef.current.style.transition = "none";
    sonido(function () { audio(); zumbidoOn(); });
    function mover(x) { m.style.left = (3 + x) + "px"; if (relRef.current) relRef.current.style.width = (x + 55) + "px"; }
    function pm(ev) {
      if (!activo) return;
      var x = Math.max(0, Math.min(max, ev.clientX - x0)), p = x / max;
      mover(x); sonido(function () { zumbidoVa(p); });
      if (p - ultimo > 0.12) { ultimo = p; sonido(function () { vibrar(8); }); }
      if (p >= 0.97) { activo = false; fin(); jugar(); }
    }
    function soltar() { if (!activo) { return; } activo = false; fin(); m.style.transition = "left .25s"; if (relRef.current) relRef.current.style.transition = "width .25s"; mover(0); }
    function fin() { m.removeEventListener("pointermove", pm); m.removeEventListener("pointerup", soltar); m.removeEventListener("pointercancel", soltar); zumbidoOff(); }
    m.addEventListener("pointermove", pm); m.addEventListener("pointerup", soltar); m.addEventListener("pointercancel", soltar);
  }
  function jugar() {
    var cant = bienvenida ? 1 : sortear(); setN(cant);
    sonido(ignicion);
    guardadoRef.current = guardar(cant);   // se guarda ya: cerrar la página no sirve para volver a tirar
    setTimeout(function () { setFase("barra"); }, 250);
  }

  // ─── la barra frena con ping cada vez más espaciado ───
  useEffect(function () {
    if (fase !== "barra") return;
    var pt = ptRef.current; if (!pt) return;
    var destino = n === 1 ? (8 + Math.random() * 48) : n === 2 ? (64 + Math.random() * 22) : (93 + Math.random() * 4);
    var inicio = performance.now(), dur = 4200, vueltas = 2.5, ult = -1;
    function f(ahora) {
      var t = Math.min(1, (ahora - inicio) / dur), e = 1 - Math.pow(1 - t, 3);
      var recorrido = e * (vueltas * 2 * 100 + destino), ciclo = recorrido % 200, p = ciclo <= 100 ? ciclo : 200 - ciclo;
      pt.style.left = "calc(" + p + "% - " + (p / 100 * 8) + "px)";
      var paso = Math.floor(recorrido / 9);
      if (paso !== ult) { ult = paso; sonido(function () { sonar(e); }); }
      if (t < 1) rafRef.current = requestAnimationFrame(f);
      else { sonido(bloqueo); setTimeout(terminar, 800); }
    }
    rafRef.current = requestAnimationFrame(f);
    return function () { cancelAnimationFrame(rafRef.current); };
  }, [fase]);

  function terminar() {
    setFase("guardando");
    (guardadoRef.current || Promise.resolve(true)).then(function (ok) {
      if (!ok) { setFase("error"); return; }
      mostrar();
    });
  }
  function reintentar() { setFase("guardando"); guardar(n).then(function (ok) { if (!ok) setFase("error"); else mostrar(); }); }
  function mostrar() {
    setFase("resultado");
    sonido(function () { melodia(n); vibrar(n >= 5 ? [80, 40, 80, 40, 200] : n === 2 ? [60, 40, 120] : [80]); });
    if (!prueba) cargarTicketsSocio(wsp).then(setTotal);
  }

  var tarj = { marginTop: 22, background: CREMA.fondo, color: CREMA.tinta, borderRadius: 18, padding: "18px 16px 16px", textAlign: "center", border: "1px solid " + CREMA.linea, position: "relative" };
  var btnSon = <button onClick={alternarSonido} style={{ position: "absolute", top: 8, left: 10, background: "#fff", border: "1px solid #D8CDB6", color: "#4A4339", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{silencio ? "🔇 sin sonido" : "🔊 sonido"}</button>;

  if (fase === "cargando") return null;
  if (fase === "ya" && bienvenida) return null;
  if (fase === "ya") return (
    <div style={tarj}>
      <div style={{ fontSize: 34 }}>🎟️</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>Hoy ya jugaste en este local</div>
      <div style={{ fontSize: 13, color: CREMA.suave, marginTop: 4, lineHeight: 1.45 }}>Volvé mañana, o opiná en otro de nuestros locales, y seguí sumando tickets.{total != null ? " Este mes llevás " + total.mes + "." : ""}</div>
    </div>
  );
  if (fase === "slide") return (
    <div style={tarj}>
      {btnSon}
      {prueba && <div style={{ fontSize: 11, color: "#B2420D", fontWeight: 700 }}>🧪 Modo prueba: no se guarda nada</div>}
      <div style={{ fontSize: 40, marginTop: 14 }}>{bienvenida ? "🎁" : "🎟️"}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{bienvenida ? "¡Bienvenido/a a la comunidad!" : "¡Ganaste una jugada!"}</div>
      <div style={{ fontSize: 13.5, color: CREMA.suave, marginTop: 4, lineHeight: 1.4 }}>{bienvenida ? "Tenés un regalo de bienvenida: deslizá y descubrí tu ticket para el sorteo del mes." : "Deslizá y descubrí cuántos tickets sumás para el sorteo del mes."}</div>
      <div ref={slideRef} style={{ position: "relative", height: 62, borderRadius: 31, background: "linear-gradient(90deg,#FBE6D6,#F6CFB2)", border: "2px solid #E8A07A", marginTop: 18, overflow: "hidden", touchAction: "none" }}>
        <div ref={relRef} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, background: "linear-gradient(90deg,#E8602A55,#E8602AAA)" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#B2420D", paddingLeft: 52, pointerEvents: "none" }}>Deslizá para jugar</div>
        <div ref={mangoRef} onPointerDown={bajar} style={{ position: "absolute", top: 3, left: 3, width: 52, height: 52, borderRadius: "50%", background: CREMA.naranja, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 2px 14px #E8602A99", cursor: "grab", touchAction: "none", userSelect: "none" }}>➜</div>
      </div>
    </div>
  );
  if (fase === "barra" || fase === "guardando") return (
    <div style={tarj}>
      {btnSon}
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 20 }}>{fase === "guardando" ? "Guardando tus tickets…" : bienvenida ? "Tu regalo de bienvenida…" : "¿Cuántos te tocan?"}</div>
      <div style={{ fontSize: 13.5, color: CREMA.suave }}>{fase === "guardando" ? "Un segundo…" : "Mirá dónde frena…"}</div>
      <div style={{ position: "relative", height: 50, borderRadius: 25, background: "#ECE3D1", border: "2px solid #D8CDB6", margin: "18px 0 6px", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "60%", background: "#E3D8C2" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "60%", width: "30%", background: "#F2C4A0" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "90%", width: "10%", background: CREMA.naranjaOsc }} />
        <div ref={ptRef} style={{ position: "absolute", top: -2, bottom: -2, width: 8, borderRadius: 4, background: CREMA.tinta, boxShadow: "0 0 12px #1D1A1688" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: CREMA.suave, padding: "0 4px" }}><span>1 ticket</span><span>2 tickets</span><span>5 tickets</span></div>
    </div>
  );
  if (fase === "error") return (
    <div style={tarj}>
      <div style={{ fontSize: 34 }}>⚠️</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>Ganaste {n} ticket{n > 1 ? "s" : ""}, pero no se pudieron guardar</div>
      <div style={{ fontSize: 13, color: CREMA.suave, marginTop: 4, lineHeight: 1.45 }}>Revisá tu conexión y tocá el botón. Es el mismo resultado, no vuelve a tirar.</div>
      <button onClick={reintentar} style={{ marginTop: 12, width: "100%", padding: 14, borderRadius: 14, border: "none", background: CREMA.naranja, color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Guardar mis tickets</button>
    </div>
  );
  // resultado
  var tks = []; for (var i = 0; i < n; i++) tks.push(i);
  return (
    <div style={tarj}>
      {btnSon}
      <div style={{ fontSize: 27, fontWeight: 800, marginTop: 28 }}>{bienvenida ? "¡Te regalamos un ticket!" : n >= 5 ? "¡PREMIO MAYOR!" : n === 2 ? "¡Muy bien!" : "¡Sumaste!"}</div>
      <div style={{ fontSize: 64, fontWeight: 900, color: CREMA.naranja, lineHeight: 1, margin: "6px 0" }}>+{n}</div>
      <div style={{ fontSize: 14, color: CREMA.suave }}>ticket{n > 1 ? "s" : ""} para el sorteo</div>
      <div style={{ display: "flex", gap: 7, justifyContent: "center", margin: "12px 0", flexWrap: "wrap" }}>
        {tks.map(function (k) { return <div key={k} style={{ width: 54, height: 38, borderRadius: 8, background: "linear-gradient(135deg,#E8602A,#C1440E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🎟️</div>; })}
      </div>
      {!prueba && <div style={{ background: "#E6F3E8", border: "1px solid #3A7D4466", borderRadius: 14, padding: 11, color: "#2A6A36", fontWeight: 800 }}>Tus tickets este mes: {total ? total.mes : "…"}</div>}
      {(bienvenida || props.onListo)
        ? <button onClick={function () { if (props.onListo) props.onListo(); }} style={{ display: "block", width: "100%", marginTop: 12, padding: 14, borderRadius: 14, border: "none", background: CREMA.naranja, color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>{bienvenida ? "¡Listo! Ver mi cupón" : "¡Listo!"}</button>
        : <a href={"/grupo/" + (prueba ? "?prueba" : "")} style={{ display: "block", marginTop: 12, padding: 14, borderRadius: 14, background: CREMA.naranja, color: "#fff", fontWeight: 800, fontSize: 16, textDecoration: "none" }}>Ver mi pantalla de la comunidad</a>}
    </div>
  );
}
