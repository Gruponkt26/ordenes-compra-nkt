// ─── LO COMPARTIDO ────────────────────────────────────────────────────────────
// La conexión a Supabase, los locales y los estilos base, en un archivo propio
// para que más de un módulo pueda usarlos sin que todo tenga que vivir dentro de
// App.jsx. Primer paso de partir el archivo, que ya pasó las 13.000 líneas.

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
export var SURL = "https://qcfwqnqtrqyjdfvakwxt.supabase.co";
export var SKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZndxbnF0cnF5amRmdmFrd3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYxODMsImV4cCI6MjA5NjE1MjE4M30.Zh5jN_oGXde0JGBJ_NTBn5Mkr2m6lI3VPjAsqrzd6Gc";
export var SH = { "Content-Type": "application/json", "apikey": SKEY, "Authorization": "Bearer " + SKEY, "Prefer": "return=representation" };

// ─── LOCALES ──────────────────────────────────────────────────────────────────
export var LOCALES = [
  { id: "l1", nombre: "El Bodegón Nkt", emoji: "🍷", color: "#C1440E" },
  { id: "l2", nombre: "Kusama",          emoji: "🌸", color: "#8B2FC9" },
  { id: "l3", nombre: "Colantonio's",    emoji: "🍝", color: "#1A6B8A" },
  { id: "l4", nombre: "Oficina",         emoji: "🏢", color: "#3A7D44" },
];
export function getLocal(id) { return LOCALES.find(function(l) { return l.id === id; }) || null; }

// ─── FECHAS ───────────────────────────────────────────────────────────────────
export function fmtDate(s) { if (!s) return "—"; var p = s.split("-"); return p[2]+"/"+p[1]+"/"+p[0]; }
export function fmtHora(s) {
  if (!s) return "";
  var d = new Date(s);
  if (isNaN(d.getTime())) return "";
  var pad = function(n) { return n < 10 ? "0"+n : n; };
  return pad(d.getHours())+":"+pad(d.getMinutes());
}

// ─── ESTILOS BASE ─────────────────────────────────────────────────────────────
export var INP = { padding:"9px 12px", borderRadius:8, border:"1px solid #2A2A2A", background:"#0F0F0F", color:"#F0EDE8", fontFamily:"'Inter',sans-serif", fontSize:13, boxSizing:"border-box", width:"100%" };
export function BS(bg,col) { return { padding:"10px 18px", borderRadius:8, border:"none", background:bg, color:col||"#fff", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }; }
export var GH = { padding:"10px 18px", borderRadius:8, border:"1px solid #2A2A2A", background:"none", color:"#888", fontFamily:"'Inter',sans-serif", fontSize:13, cursor:"pointer" };
