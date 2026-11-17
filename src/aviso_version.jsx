// Aviso de versión nueva. Las pestañas y las apps que ya estaban abiertas (la tablet de la cocina, por ejemplo) no se actualizan solas:
// cada tanto se mira /version.json y, si el identificador cambió respecto de esta versión, aparece un cartel para actualizar con un toque.
import React, { useState, useEffect } from "react";

var ACTUAL = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";

export default function AvisoVersion() {
  var [nueva, setNueva] = useState(false);
  useEffect(function () {
    if (!ACTUAL) return;
    var vivo = true, ocultoDesde = null;
    // Al volver a la app después de un rato (celular bloqueado, otra aplicación, tablet dormida) se actualiza sola: es un momento seguro, no hay nada a medio escribir.
    // Se intenta una sola vez por versión, para que nunca se quede recargando en bucle.
    function autoPermitido(id) {
      try { if (sessionStorage.getItem("nkt_auto_ver") === id) return false; sessionStorage.setItem("nkt_auto_ver", id); } catch (e) {}
      return true;
    }
    var minimo = typeof window.__NKT_AUTO_MS === "number" ? window.__NKT_AUTO_MS : 60000;
    function mirar(auto) {
      fetch("/version.json?t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!vivo || !d || !d.id || d.id === ACTUAL) return;
          if (auto === true && autoPermitido(d.id)) { window.location.reload(); return; }
          setNueva(true);
        })
        .catch(function () {});
    }
    mirar(false);
    var t = setInterval(function () { mirar(false); }, 60000);
    function alCambiar() {
      if (document.visibilityState === "hidden") { ocultoDesde = Date.now(); return; }
      var estuvo = ocultoDesde ? Date.now() - ocultoDesde : 0; ocultoDesde = null;
      mirar(estuvo >= minimo);
    }
    function alEnfocar() { mirar(false); }
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("focus", alEnfocar);
    return function () { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", alCambiar); window.removeEventListener("focus", alEnfocar); };
  }, []);
  if (!nueva) return null;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2000, display: "flex", justifyContent: "center", padding: 10, pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center", background: "#1A6B8A", color: "#fff", borderRadius: 12, padding: "10px 16px", boxShadow: "0 4px 18px rgba(0,0,0,0.5)", fontFamily: "'Inter',sans-serif" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🔄 Hay una versión nueva de la app</span>
        <button onClick={function () { window.location.reload(); }} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "#fff", color: "#1A6B8A", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>Actualizar</button>
      </div>
    </div>
  );
}
