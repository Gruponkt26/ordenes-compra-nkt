// Transcribe una foto de receta manuscrita a texto estructurado.
//
// Corre en el servidor (función serverless de Vercel) y no en el navegador, porque
// la clave de la API no puede viajar al cliente: cualquiera la vería en el inspector.
// Se configura como variable de entorno ANTHROPIC_API_KEY en el panel de Vercel.

const AnthropicPkg = require("@anthropic-ai/sdk");
const Anthropic = AnthropicPkg.default || AnthropicPkg;

// Las fotos de recetas manuscritas pueden tardar; el máximo del plan es 60s.
module.exports.config = { maxDuration: 60 };

var INSTRUCCIONES = [
  "Sos un asistente de cocina que transcribe recetas manuscritas de un restaurante argentino.",
  "Te paso la foto de una receta escrita a mano. Transcribila lo más fiel posible.",
  "",
  "Reglas:",
  "- Respetá las cantidades y unidades tal como están escritas (kg, gr, cc, tazas, cdas).",
  "- No inventes ingredientes ni pasos que no estén en la foto.",
  "- Si algo no se entiende, escribí [?] en ese lugar en vez de adivinar.",
  "- Mantené el vocabulario rioplatense de la receta (no lo traduzcas ni lo neutralices).",
  "",
  "Respondé SOLO con un objeto JSON, sin texto alrededor y sin backticks, con esta forma:",
  '{"nombre": "", "porciones": "", "ingredientes": "", "pasos": "", "notas": ""}',
  "",
  "- nombre: el título de la receta. Si no tiene, poné una descripción corta del plato.",
  "- porciones: cuántas porciones rinde, si figura. Si no figura, dejalo vacío.",
  "- ingredientes: uno por línea, separados con saltos de línea.",
  "- pasos: numerados 1., 2., 3., uno por línea.",
  "- notas: aclaraciones al margen, tiempos, temperaturas o lo que no entre en los otros campos.",
].join("\n");

// El modelo puede devolver el JSON envuelto en ```json ... ```; lo sacamos antes de parsear.
function parsearJSON(texto) {
  var limpio = String(texto || "").trim();
  var fence = limpio.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) limpio = fence[1].trim();
  var desde = limpio.indexOf("{");
  var hasta = limpio.lastIndexOf("}");
  if (desde === -1 || hasta === -1 || hasta <= desde) return null;
  try {
    return JSON.parse(limpio.slice(desde, hasta + 1));
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usá POST." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel.",
    });
  }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  var imagen = body && body.imagen;
  var mediaType = (body && body.media_type) || "image/jpeg";
  if (!imagen) {
    return res.status(400).json({ error: "No llegó ninguna foto." });
  }
  // ~5 MB de base64. La app ya achica la foto antes de mandarla; esto es el tope duro.
  if (imagen.length > 7000000) {
    return res.status(413).json({ error: "La foto es demasiado grande. Probá sacarla de nuevo." });
  }

  try {
    var client = new Anthropic();
    var response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imagen } },
            { type: "text", text: INSTRUCCIONES },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "El modelo no pudo procesar esta foto. Probá con otra." });
    }

    var texto = response.content
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("\n");

    var datos = parsearJSON(texto);
    if (!datos) {
      // No se pudo estructurar, pero la transcripción sirve igual: se devuelve
      // en "pasos" para que se pueda corregir a mano en vez de perder el trabajo.
      return res.status(200).json({
        nombre: "", porciones: "", ingredientes: "", pasos: texto, notas: "",
        parcial: true,
      });
    }

    return res.status(200).json({
      nombre: datos.nombre || "",
      porciones: datos.porciones || "",
      ingredientes: datos.ingredientes || "",
      pasos: datos.pasos || "",
      notas: datos.notas || "",
      parcial: false,
    });
  } catch (e) {
    console.error("leer-receta:", e);
    var status = (e && e.status) || 500;
    var msg = status === 401 ? "La clave de la API es inválida."
      : status === 429 ? "Demasiadas lecturas seguidas. Esperá unos segundos."
      : "No se pudo leer la receta. Probá de nuevo.";
    return res.status(status === 401 || status === 429 ? status : 500).json({ error: msg });
  }
};
