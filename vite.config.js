import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// La página pública de Grupo Nkt vive en /grupo/: se arma como un archivo real (copia del index.html) para que ande
// en cualquier servidor, sin depender de reglas de redirección. Los archivos de la app se piden con ruta absoluta, así que sirven igual.
function paginaGrupo() {
  return {
    name: "pagina-grupo",
    apply: "build",
    closeBundle() {
      var dist = path.resolve("dist");
      var origen = path.join(dist, "index.html");
      if (!fs.existsSync(origen)) return;
      fs.mkdirSync(path.join(dist, "grupo"), { recursive: true });
      fs.copyFileSync(origen, path.join(dist, "grupo", "index.html"));
    },
  };
}

// Cada publicación lleva un identificador (el commit de Vercel, o la hora del armado). Va adentro de la app y en /version.json:
// si no coinciden, la app abierta sabe que hay una versión nueva y se lo avisa a quien la está usando.
var BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());
function versionJson() {
  return {
    name: "version-json",
    apply: "build",
    closeBundle() {
      var dist = path.resolve("dist");
      if (!fs.existsSync(dist)) return;
      fs.writeFileSync(path.join(dist, "version.json"), JSON.stringify({ id: BUILD_ID }));
    },
  };
}

export default defineConfig({
  plugins: [react(), paginaGrupo(), versionJson()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
});
