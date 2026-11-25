import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// La página pública de Grupo Nkt vive en /grupo/: se arma como un archivo real (copia del index.html) para que ande
// en cualquier servidor, sin depender de reglas de redirección. Los archivos de la app se piden con ruta absoluta, así que sirven igual.
// Cada copia lleva su propio título y su vista previa (la que se ve al compartir el link por WhatsApp, que no ejecuta la app):
// si no, todas decían «Gestión Grupo NKT», que es el nombre de la app interna.
function conTitulo(html, titulo, descripcion) {
  var esc = function (t) { return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); };
  var host = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  var imagen = host ? '\n    <meta property="og:image" content="https://' + host + '/icon-512.png" />' : "";
  var meta = '\n    <meta name="description" content="' + esc(descripcion) + '" />' +
    '\n    <meta property="og:type" content="website" />' +
    '\n    <meta property="og:title" content="' + esc(titulo) + '" />' +
    '\n    <meta property="og:description" content="' + esc(descripcion) + '" />' + imagen;
  return html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(titulo) + "</title>" + meta);
}
function paginaGrupo() {
  return {
    name: "pagina-grupo",
    apply: "build",
    closeBundle() {
      var dist = path.resolve("dist");
      var origen = path.join(dist, "index.html");
      if (!fs.existsSync(origen)) return;
      var html = fs.readFileSync(origen, "utf8");
      fs.mkdirSync(path.join(dist, "grupo"), { recursive: true });
      fs.writeFileSync(path.join(dist, "grupo", "index.html"),
        conTitulo(html, "Comunidad Grupo Nkt · tus lugares en Punta Alta", "Tu cupón de beneficios, las novedades y los lugares de la comunidad: El Bodegón, Kusama, Colantonio's y comercios amigos."));
      // El portal de los comercios amigos vive en /comercio/, igual que /grupo/.
      fs.mkdirSync(path.join(dist, "comercio"), { recursive: true });
      fs.writeFileSync(path.join(dist, "comercio", "index.html"),
        conTitulo(html, "Portal de comercios · Comunidad Grupo Nkt", "Sumá tu comercio a la comunidad de Grupo Nkt o administrá tu tarjeta, tus promos y tus novedades."));
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
