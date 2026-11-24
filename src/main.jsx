import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Opinar } from "./opiniones.jsx";
import { GrupoNkt } from "./grupo.jsx";
import PortalComercio from "./portal_comercio.jsx";
import AvisoVersion from "./aviso_version.jsx";

// El QR de las mesas abre una pantalla pública (sin usuario ni clave) para dejar una opinión.
var esOpinion = new URLSearchParams(window.location.search).has("opinar");
// La página pública de Grupo Nkt (locales, pedidos por WhatsApp y comunidad) también se abre sin usuario ni clave.
var esGrupo = /^\/grupo(\/|$)/.test(window.location.pathname) || new URLSearchParams(window.location.search).has("grupo");

// El portal de los comercios amigos (/comercio/?c=...&k=...) también se abre sin usuario ni clave: entra con su link privado.
var esComercio = /^\/comercio(\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esOpinion ? <Opinar /> : esComercio ? <PortalComercio /> : esGrupo ? <GrupoNkt /> : <App />}
    <AvisoVersion />
  </React.StrictMode>
);
