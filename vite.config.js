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

export default defineConfig({
  plugins: [react(), paginaGrupo()],
});
