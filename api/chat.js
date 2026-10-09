// Chat de IA de Gestión Grupo NKT (solo Sofía).
//
// Corre en el servidor porque la clave de la API no puede viajar al navegador.
// Usa la misma variable ANTHROPIC_API_KEY que leer-receta. La app manda el historial
// de la conversación y un resumen de los números del negocio; acá solo se arma el
// pedido y se devuelve la respuesta.

const AnthropicPkg = require("@anthropic-ai/sdk");
const Anthropic = AnthropicPkg.default || AnthropicPkg;

var SISTEMA = [
  "Sos el asistente de gestión del Grupo NKT, un grupo gastronómico argentino con cuatro unidades:",
  "Bodegón (El Bodegón Nkt), Kusama, Colantonio's y la Oficina (costos compartidos).",
  "Le hablás a Sofía, que administra el grupo. Respondé en español rioplatense, claro y directo, sin vueltas.",
  "",
  "Reglas:",
  "- Basate SOLO en los datos que te paso abajo. Si un dato no está, decilo; no inventes números.",
  "- Cuando hagas cuentas, mostrá los números que usaste para que ella pueda chequearlos.",
  "- Los montos son en pesos argentinos. Formateá con punto de miles (ej: $1.250.000).",
  "- Los costos de la Oficina se reparten 50% Bodegón, 30% Colantonio's, 20% Kusama.",
  "- Los retiros de socios restan de la disponibilidad pero no del resultado.",
  "- Si los datos del resumen no alcanzan para una conclusión firme, decí qué falta mirar en la app.",
  "- Respuestas cortas: lo importante primero, detalle solo si lo pide.",
].join("\n");

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
  var mensajes = body && body.mensajes;
  var resumen = (body && body.resumen) || "";
  if (!Array.isArray(mensajes) || !mensajes.length) {
    return res.status(400).json({ error: "No llegó ninguna pregunta." });
  }
  // Solo los últimos turnos, con texto plano: acota el costo y evita roles raros.
  var historial = mensajes.slice(-12).map(function (m) {
    return {
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: String((m && m.texto) || "").slice(0, 4000),
    };
  }).filter(function (m) { return m.content; });
  if (!historial.length || historial[0].role !== "user") {
    return res.status(400).json({ error: "La conversación tiene que empezar con una pregunta." });
  }
  if (String(resumen).length > 120000) {
    return res.status(413).json({ error: "El resumen de datos es demasiado grande." });
  }

  try {
    var client = new Anthropic();
    var response = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: [
        { type: "text", text: SISTEMA },
        // Bloque estable por conversación: queda en caché entre preguntas seguidas.
        { type: "text", text: "DATOS DEL NEGOCIO (resumen actual):\n" + resumen, cache_control: { type: "ephemeral" } },
      ],
      messages: historial,
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "No pude responder esa pregunta. Probá reformularla." });
    }
    var texto = response.content
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("\n")
      .trim();
    if (!texto) texto = "No pude armar una respuesta. Probá de nuevo.";
    return res.status(200).json({ respuesta: texto });
  } catch (e) {
    console.error("chat:", e);
    var status = (e && e.status) || 500;
    var apiMsg = (e && e.error && e.error.error && e.error.error.message) || "";
    var msg;
    if (status === 401) {
      msg = "La clave de la API es inválida. Revisá que esté completa y sin espacios en Vercel.";
    } else if (status === 429) {
      msg = "Demasiadas preguntas seguidas. Esperá unos segundos.";
    } else if (/credit balance/i.test(apiMsg)) {
      msg = "La cuenta de Anthropic no tiene crédito. Cargá saldo en console.anthropic.com → Billing.";
    } else if (apiMsg) {
      msg = "Anthropic respondió: " + apiMsg;
    } else {
      msg = "No se pudo responder. Probá de nuevo.";
    }
    return res.status(status === 401 || status === 429 ? status : 500).json({ error: msg });
  }
};

// Va después del handler: asignar module.exports pisaría la config.
module.exports.config = { maxDuration: 60 };
