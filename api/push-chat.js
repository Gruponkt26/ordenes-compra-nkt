// Avisos del chat con la app cerrada (Web Push).
//
// La app llama acá después de guardar un mensaje, mandando solo el id. El texto, el autor y el
// canal se leen de la base (no se confía en lo que manda el navegador), y solo se avisa de
// mensajes recientes y una única vez. Necesita las variables VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
// en Vercel. Los dispositivos suscriptos viven en la tabla pautas (ámbito "push_sub").

const webpush = require("web-push");

const SURL = "https://qcfwqnqtrqyjdfvakwxt.supabase.co";
const SKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZndxbnF0cnF5amRmdmFrd3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYxODMsImV4cCI6MjA5NjE1MjE4M30.Zh5jN_oGXde0JGBJ_NTBn5Mkr2m6lI3VPjAsqrzd6Gc";
const H = { "apikey": SKEY, "Authorization": "Bearer " + SKEY, "Content-Type": "application/json" };
const CANAL_TODOS = "chat_todos";
const CANAL_PRIV = "chat_priv_sofia_oficina";

async function pedir(ruta, opciones) {
  const r = await fetch(SURL + "/rest/v1/" + ruta, Object.assign({ headers: H }, opciones || {}));
  return r;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usá POST." });
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  if (!pub || !priv) {
    return res.status(500).json({ error: "Faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en las variables de entorno de Vercel." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const id = body && String(body.id || "");
  if (!id || !/^chat_[A-Za-z0-9_-]{1,60}$/.test(id)) return res.status(400).json({ error: "Mensaje inválido." });

  try {
    webpush.setVapidDetails("https://ordenes-compra-nkt.vercel.app", pub, priv);

    const rm = await pedir("pautas?id=eq." + encodeURIComponent(id) + "&select=id,ambito,texto,usuario,created_at");
    const filas = await rm.json();
    const msg = Array.isArray(filas) ? filas[0] : null;
    if (!msg || (msg.ambito !== CANAL_TODOS && msg.ambito !== CANAL_PRIV)) {
      return res.status(404).json({ error: "No encontré ese mensaje." });
    }
    if (Date.now() - new Date(msg.created_at).getTime() > 3 * 60 * 1000) {
      return res.status(200).json({ enviados: 0, motivo: "viejo" });
    }

    // Un mensaje avisa una sola vez, aunque se llame dos veces.
    const okId = "pushok_" + id;
    const rok = await pedir("pautas?id=eq." + encodeURIComponent(okId) + "&select=id");
    const yaHecho = await rok.json();
    if (Array.isArray(yaHecho) && yaHecho.length) return res.status(200).json({ enviados: 0, motivo: "ya avisado" });
    const ahora = new Date().toISOString();
    await pedir("pautas", {
      method: "POST",
      headers: Object.assign({}, H, { "Prefer": "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: okId, ambito: "chat_push_ok", texto: "", usuario: msg.usuario, created_at: ahora, updated_at: ahora }),
    });

    let nombre = msg.usuario;
    try {
      const ru = await pedir("usuarios?usuario=eq." + encodeURIComponent(msg.usuario) + "&select=nombre");
      const us = await ru.json();
      if (Array.isArray(us) && us[0] && us[0].nombre) nombre = us[0].nombre;
    } catch (e) {}

    const rs = await pedir("pautas?ambito=eq.push_sub&select=id,texto,usuario");
    const subs = await rs.json();
    const privado = msg.ambito === CANAL_PRIV;
    const aviso = JSON.stringify({
      title: "💬 " + nombre + (privado ? " · privado" : ""),
      body: String(msg.texto || "").slice(0, 140),
      tag: msg.ambito,
      url: "/",
    });

    let enviados = 0;
    for (const s of (Array.isArray(subs) ? subs : [])) {
      if (s.usuario === msg.usuario) continue;
      let dato = null;
      try { dato = JSON.parse(s.texto); } catch (e) {}
      if (!dato || !dato.sub || !dato.sub.endpoint) continue;
      if (privado && s.usuario !== "sofia" && s.usuario !== "belen" && dato.local !== "l4") continue;
      try {
        await webpush.sendNotification(dato.sub, aviso, { TTL: 60 * 60 * 24 });
        enviados++;
      } catch (e) {
        // El dispositivo ya no existe (desinstaló la app o quitó el permiso): se borra.
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await pedir("pautas?id=eq." + encodeURIComponent(s.id), { method: "DELETE" });
        } else {
          console.error("push-chat:", e && e.statusCode, e && e.body);
        }
      }
    }
    return res.status(200).json({ enviados });
  } catch (e) {
    console.error("push-chat:", e);
    return res.status(500).json({ error: "No se pudo avisar." });
  }
};

module.exports.config = { maxDuration: 30 };
