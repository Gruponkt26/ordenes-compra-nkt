import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Opinar } from "./opiniones.jsx";

// El QR de las mesas abre una pantalla pública (sin usuario ni clave) para dejar una opinión.
var esOpinion = new URLSearchParams(window.location.search).has("opinar");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esOpinion ? <Opinar /> : <App />}
  </React.StrictMode>
);
