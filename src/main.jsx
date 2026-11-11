import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Opinar } from "./opiniones.jsx";
import { GrupoNkt } from "./grupo.jsx";

// El QR de las mesas abre una pantalla pública (sin usuario ni clave) para dejar una opinión.
var esOpinion = new URLSearchParams(window.location.search).has("opinar");
// La página pública de Grupo Nkt (locales, pedidos por WhatsApp y comunidad) también se abre sin usuario ni clave.
var esGrupo = /^\/grupo(\/|$)/.test(window.location.pathname) || new URLSearchParams(window.location.search).has("grupo");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esOpinion ? <Opinar /> : esGrupo ? <GrupoNkt /> : <App />}
  </React.StrictMode>
);
