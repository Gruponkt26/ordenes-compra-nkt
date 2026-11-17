// Aviso de versión nueva. Las pestañas y las apps que ya estaban abiertas (la tablet de la cocina, por ejemplo) no se actualizan solas:
// cada tanto se mira /version.json y, si el identificador cambió respecto de esta versión, aparece un cartel para actualizar con un toque.
import React, { useState, useEffect } from "react";

var ACTUAL = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";

export default function AvisoVersion() {
  var [nueva, setNueva] = useState(false);
  useEffect(function () {
    if (!ACTUAL) return;
    var vivo = true;
    function mirar() {
      fetch("/version.json?t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (vivo && d && d.id && d.id !== ACTUAL) setNueva(true); })
        .catch(function () {});
    }
    mirar();
    var t = setInterval(mirar, 60000);
    function alVolver() { if (document.visibilityState === "visible") mirar(); }
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", mirar);
    return function () { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", alVolver); window.removeEventListener("focus", mirar); };
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
