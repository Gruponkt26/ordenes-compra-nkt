// ─── COMANDAS ─────────────────────────────────────────────────────────────────
// La pantalla de servicio: el plano de mesas, los deliverys y los mostradores.
//
// Vive en su propio archivo a propósito. App.jsx ya pasó las 13.000 líneas y esto
// va a crecer: la carta con precios, la carga de ítems, la cuenta, la impresión.
//
// Dos tablas en Supabase (el SQL está en el README):
//  · comanda_mesas → las mesas de cada local, por sector
//  · comandas      → una fila por mesa abierta, delivery o pedido de mostrador
//
// Los ítems de cada comanda van a ser una tabla aparte, con una fila por ítem y no
// un JSON adentro de la comanda. No es un detalle: si dos mozos tocan la misma mesa
// y cada uno guarda la comanda entera, el último pisa lo que agregó el otro.

import { useState, useEffect } from "react";
import { SURL, SH, LOCALES, getLocal, INP, GH } from "./comun.js";

// ─── DATOS ────────────────────────────────────────────────────────────────────
async function sbComandasDisponible() {
  try {
    var r = await fetch(SURL + "/rest/v1/comandas?select=id&limit=1", { headers: SH });
    if (r.ok) return null;
    var txt = await r.text();
    return txt || ("Error " + r.status);
  } catch(e) { return String((e && e.message) || e); }
}
async function sbLoadMesas() {
  try {
    var r = await fetch(SURL + "/rest/v1/comanda_mesas?order=orden", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbSaveMesa(m) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await fetch(SURL + "/rest/v1/comanda_mesas", { method:"POST", headers:h, body:JSON.stringify(m) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveMesa:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
async function sbDeleteMesa(id) {
  try { await fetch(SURL + "/rest/v1/comanda_mesas?id=eq." + id, { method:"DELETE", headers:SH }); } catch(e) {}
}
async function sbLoadComandas() {
  try {
    var r = await fetch(SURL + "/rest/v1/comandas?estado=eq.abierta&order=abierta_at", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbSaveComanda(c) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await fetch(SURL + "/rest/v1/comandas", { method:"POST", headers:h, body:JSON.stringify(c) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveComanda:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}

async function sbLoadCarta() {
  try {
    var r = await fetch(SURL + "/rest/v1/carta?order=categoria,orden", { headers: {...SH, "Cache-Control":"no-cache"} });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbSaveCarta(x) {
  try {
    var h = {...SH, "Prefer":"resolution=merge-duplicates,return=minimal"};
    var r = await fetch(SURL + "/rest/v1/carta", { method:"POST", headers:h, body:JSON.stringify(x) });
    if (!r.ok) { var e = await r.text(); console.error("sbSaveCarta:", r.status, e); return e || ("Error " + r.status); }
    return null;
  } catch(e) { return String((e && e.message) || e); }
}
async function sbDeleteCarta(id) {
  try { await fetch(SURL + "/rest/v1/carta?id=eq." + id, { method:"DELETE", headers:SH }); } catch(e) {}
}

// ─── SECTORES ─────────────────────────────────────────────────────────────────
// Los mismos que usa el checklist para las áreas de un local, que son los que la
// gente nombra: "las del patio", "la de la vereda".
export var CMD_SECTORES = [
  { id:"salon",  emoji:"🍽️", nombre:"Salón"  },
  { id:"patio",  emoji:"🌳", nombre:"Patio"  },
  { id:"vereda", emoji:"☂️", nombre:"Vereda" },
  { id:"barra",  emoji:"🍸", nombre:"Barra"  },
];

var CMD_VISTAS = [
  { id:"mesas",     emoji:"🪑", nombre:"Mesas",     tipo:"mesa"      },
  { id:"delivery",  emoji:"🛵", nombre:"Delivery",  tipo:"delivery"  },
  { id:"mostrador", emoji:"🥡", nombre:"Mostrador", tipo:"mostrador" },
  { id:"carta",     emoji:"📖", nombre:"Carta"                       },
];

function pesos(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR"); }

// Cuánto hace que está abierta. Es el dato que mira un encargado para saber qué
// mesa se está demorando, así que va en la tarjeta y no escondido adentro.
function hace(iso) {
  if (!iso) return "";
  var min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (isNaN(min) || min < 0) return "";
  if (min < 60) return min + " min";
  var h = Math.floor(min / 60);
  return h + "h " + String(min % 60).padStart(2, "0");
}

export default function PanelComandas(p) {
  var usuario = p.usuario || "";
  // Un mozo ve su local y nada más; administración elige.
  var localFijo = p.localFijo || null;
  var [localId, setLocalId] = useState(localFijo || "l1");
  var [vista, setVista] = useState("mesas");
  var [mesas, setMesas] = useState([]);
  var [comandas, setComandas] = useState([]);
  var [cargando, setCargando] = useState(true);
  var [problemaTabla, setProblemaTabla] = useState(null);
  var [config, setConfig] = useState(false);
  var [carta, setCarta] = useState([]);
  var [ahora, setAhora] = useState(Date.now());

  function cargar() {
    return Promise.all([sbLoadMesas(), sbLoadComandas()]).then(function(r) {
      setMesas(r[0]); setComandas(r[1]); setCargando(false);
    }).catch(function() { setCargando(false); });
  }
  function cargarCarta() { return sbLoadCarta().then(setCarta).catch(function() {}); }

  useEffect(function() {
    var vivo = true;
    sbComandasDisponible().then(function(err) { if (vivo) setProblemaTabla(err); });
    cargar();
    cargarCarta();
    // Durante el servicio la pantalla la miran varios a la vez: el mozo abre la
    // mesa y el encargado tiene que verla sin apretar nada. Refrescar solo cada 20
    // segundos es lo mínimo para que no sea una foto vieja. Lo correcto sería
    // Supabase Realtime, que además necesita abrir el CSP a wss://.
    var t = setInterval(function() { if (vivo) { cargar(); setAhora(Date.now()); } }, 20000);
    // El reloj de "hace cuánto" corre aparte, más seguido y sin pegarle a la base.
    var reloj = setInterval(function() { if (vivo) setAhora(Date.now()); }, 30000);
    return function() { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, []);

  var local = getLocal(localId);
  var color = (local && local.color) || "#C1440E";
  var vistaActual = CMD_VISTAS.find(function(v) { return v.id === vista; }) || CMD_VISTAS[0];

  var mesasLocal = mesas.filter(function(m) { return m.local === localId && m.activa !== false; });
  var abiertas = comandas.filter(function(c) { return c.local === localId; });
  function comandaDeMesa(mesaId) { return abiertas.find(function(c) { return c.tipo === "mesa" && c.mesa_id === mesaId; }); }
  var delTipo = abiertas.filter(function(c) { return c.tipo === vistaActual.tipo; });

  function proximoNumero() {
    var hoy = new Date().toISOString().slice(0, 10);
    var nums = comandas.filter(function(c) { return c.local === localId && String(c.abierta_at || "").slice(0, 10) === hoy; })
      .map(function(c) { return parseInt(c.numero, 10) || 0; });
    return (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  }

  // Se pinta primero y se guarda después, porque durante el servicio esperar a la
  // base para que la mesa cambie de color es insoportable. Pero si la base rechaza,
  // se vuelve atrás: una mesa pintada de ocupada que en realidad no se guardó es
  // peor que una que no se pintó, porque nadie se entera hasta que es tarde.
  function guardar(c) {
    var antes = comandas;
    setComandas(function(prev) {
      var f = prev.filter(function(x) { return x.id !== c.id; });
      return c.estado === "abierta" ? [c].concat(f) : f;
    });
    return sbSaveComanda(c).then(function(err) {
      if (err) {
        setComandas(antes);
        alert("No se pudo guardar la comanda:\n\n" + err + "\n\nSi el error menciona la tabla comandas, hay que crearla en Supabase (el SQL está en el README).");
        return err;
      }
      cargar();
      return null;
    });
  }

  function abrirMesa(mesa) {
    var ya = comandaDeMesa(mesa.id);
    if (ya) return;
    guardar({
      id: "cmd_" + Date.now(),
      local: localId, tipo: "mesa", mesa_id: mesa.id,
      numero: proximoNumero(), estado: "abierta",
      mozo: usuario, abierta_at: new Date().toISOString(), usuario: usuario,
    });
  }
  function cerrar(c) {
    guardar({ ...c, estado: "cerrada", cerrada_at: new Date().toISOString() });
  }

  // ─── CONFIGURACIÓN DE MESAS ────────────────────────────────────────────────
  function ConfigMesas() {
    var [sector, setSector] = useState("salon");
    var [desde, setDesde] = useState("");
    var [hasta, setHasta] = useState("");
    var [nombre, setNombre] = useState("");

    function agregarRango() {
      var a = parseInt(desde, 10), b = parseInt(hasta, 10);
      if (isNaN(a)) return;
      if (isNaN(b) || b < a) b = a;
      var nuevas = [];
      for (var n = a; n <= b && n - a < 60; n++) {
        nuevas.push({ id: "mesa_" + localId + "_" + sector + "_" + n + "_" + Date.now(), local: localId, sector: sector, nombre: String(n), orden: n, activa: true });
      }
      setMesas(function(prev) { return prev.concat(nuevas); });
      nuevas.forEach(function(m, i) {
        sbSaveMesa(m).then(function(err) {
          if (err && i === 0) alert("No se pudieron guardar las mesas:\n\n" + err + "\n\nSi el error menciona la tabla comanda_mesas, hay que crearla en Supabase.");
        });
      });
      setDesde(""); setHasta("");
    }
    function agregarUna() {
      if (!nombre.trim()) return;
      var m = { id: "mesa_" + localId + "_" + Date.now(), local: localId, sector: sector, nombre: nombre.trim(), orden: 900, activa: true };
      setMesas(function(prev) { return prev.concat([m]); });
      sbSaveMesa(m);
      setNombre("");
    }
    function borrar(m) {
      if (comandaDeMesa(m.id)) { alert("Esa mesa tiene una comanda abierta. Cerrala antes de sacarla del plano."); return; }
      if (!window.confirm("¿Sacar la mesa " + m.nombre + " del plano?")) return;
      setMesas(function(prev) { return prev.filter(function(x) { return x.id !== m.id; }); });
      sbDeleteMesa(m.id);
    }

    return (
      <div>
        <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"14px", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:800, color:color, marginBottom:11 }}>Agregar mesas a {local && local.nombre}</div>
          <label style={{ display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Sector</label>
          <div style={{ display:"flex", gap:5, marginBottom:11, flexWrap:"wrap" }}>
            {CMD_SECTORES.map(function(s) {
              var act = sector === s.id;
              return (
                <button key={s.id} onClick={function() { setSector(s.id); }}
                  style={{ padding:"7px 13px", borderRadius:8, border:"1px solid "+(act?color:"#1E1E1E"), background:act?color+"22":"#111", color:act?color:"#555", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {s.emoji} {s.nombre}
                </button>
              );
            })}
          </div>
          <label style={{ display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Por número, de una vez</label>
          <div style={{ display:"flex", gap:7, marginBottom:11, alignItems:"center" }}>
            <input value={desde} onChange={function(e) { setDesde(e.target.value); }} placeholder="de la 1" inputMode="numeric" style={{ ...INP, fontSize:12 }} />
            <span style={{ color:"#444", fontSize:12 }}>a la</span>
            <input value={hasta} onChange={function(e) { setHasta(e.target.value); }} placeholder="10" inputMode="numeric" style={{ ...INP, fontSize:12 }} />
            <button onClick={agregarRango} disabled={!String(desde).trim()}
              style={{ padding:"9px 15px", borderRadius:8, border:"none", background:String(desde).trim()?color:"#1A1A1A", color:String(desde).trim()?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:String(desde).trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
              + Agregar
            </button>
          </div>
          <label style={{ display:"block", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>O una con nombre propio</label>
          <div style={{ display:"flex", gap:7 }}>
            <input value={nombre} onChange={function(e) { setNombre(e.target.value); }} placeholder="Ej: Barra 1, Reservado" style={{ ...INP, fontSize:12 }} />
            <button onClick={agregarUna} disabled={!nombre.trim()}
              style={{ padding:"9px 15px", borderRadius:8, border:"none", background:nombre.trim()?color:"#1A1A1A", color:nombre.trim()?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:nombre.trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
              + Agregar
            </button>
          </div>
        </div>

        {CMD_SECTORES.map(function(s) {
          var delSector = mesasLocal.filter(function(m) { return m.sector === s.id; });
          if (!delSector.length) return null;
          return (
            <div key={s.id} style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:7 }}>{s.emoji} {s.nombre} ({delSector.length})</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {delSector.map(function(m) {
                  return (
                    <button key={m.id} onClick={function() { borrar(m); }} title="Sacar del plano"
                      style={{ padding:"7px 12px", borderRadius:8, border:"1px solid #1E1E1E", background:"#111", color:"#666", fontFamily:"'Inter',sans-serif", fontSize:12, cursor:"pointer" }}>
                      {m.nombre} <span style={{ color:"#C1440E", marginLeft:3 }}>×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {mesasLocal.length === 0 && (
          <div style={{ textAlign:"center", padding:"20px 0", color:"#333", fontSize:12 }}>Todavía no hay mesas en este local.</div>
        )}
      </div>
    );
  }

  // ─── CARTA ─────────────────────────────────────────────────────────────────
  // Los platos con su precio de venta, por local. Los nombres ya existen en el menú
  // de stock, así que se traen de ahí y sólo hay que ponerles precio: tipear cien
  // platos a mano, habiendo estado ya cargados, no lo hace nadie.
  function Carta() {
    var [nuevoPlato, setNuevoPlato] = useState({});
    var [nuevaCat, setNuevaCat] = useState("");
    var [trayendo, setTrayendo] = useState(false);

    var delLocal = carta.filter(function(x) { return x.local === localId; });
    // Las categorías van en el orden de la carta —entradas, pizzas, principales—, que
    // es el del menú de stock. Alfabético pondría las ensaladas antes que las entradas,
    // y una carta no se lee así. Lo que no esté en el menú va al final.
    var ordenMenu = Object.keys((p.menuStock || {})[localId] || {});
    var categorias = [];
    delLocal.forEach(function(x) { if (categorias.indexOf(x.categoria) === -1) categorias.push(x.categoria); });
    categorias.sort(function(a, b) {
      var ia = ordenMenu.indexOf(a), ib = ordenMenu.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    var sinPrecio = delLocal.filter(function(x) { return x.precio === null || x.precio === undefined || x.precio === ""; }).length;

    function guardarPlato(x) {
      setCarta(function(prev) {
        var f = prev.filter(function(y) { return y.id !== x.id; });
        return f.concat([x]);
      });
      sbSaveCarta(x).then(function(err) {
        if (err) alert("No se pudo guardar el plato:\n\n" + err + "\n\nSi el error menciona la tabla carta, hay que crearla en Supabase (el SQL está en el README).");
      });
    }
    function borrarPlato(x) {
      if (!window.confirm("¿Sacar \"" + x.nombre + "\" de la carta?")) return;
      setCarta(function(prev) { return prev.filter(function(y) { return y.id !== x.id; }); });
      sbDeleteCarta(x.id);
    }
    // Trae los platos del menú de stock de este local. No pisa lo que ya está: si un
    // plato ya figura en la carta, se saltea, así se puede volver a apretar cuando se
    // agrega algo al menú sin perder los precios cargados.
    function traerDelMenu() {
      var menu = (p.menuStock || {})[localId] || {};
      var existentes = {};
      delLocal.forEach(function(x) { existentes[String(x.nombre).toLowerCase()] = true; });
      var nuevos = [];
      Object.keys(menu).forEach(function(cat) {
        (menu[cat] || []).forEach(function(nombre, i) {
          if (existentes[String(nombre).toLowerCase()]) return;
          nuevos.push({ id:"carta_"+localId+"_"+Date.now()+"_"+nuevos.length, local:localId, categoria:cat, nombre:nombre, precio:null, activo:true, orden:i });
        });
      });
      if (!nuevos.length) { alert("No hay platos nuevos para traer: la carta ya tiene todos los del menú de stock."); return; }
      setTrayendo(true);
      setCarta(function(prev) { return prev.concat(nuevos); });
      Promise.all(nuevos.map(function(x) { return sbSaveCarta(x); })).then(function(res) {
        var err = res.find(Boolean);
        if (err) alert("No se pudieron guardar los platos:\n\n" + err);
        setTrayendo(false);
        cargarCarta();
      });
    }

    return (
      <div>
        <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"13px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:9 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:color }}>Carta de {local && local.nombre}</div>
              <div style={{ fontSize:11, color:"#555", marginTop:3 }}>
                {delLocal.length} plato{delLocal.length === 1 ? "" : "s"}
                {sinPrecio > 0 ? " · " + sinPrecio + " sin precio" : delLocal.length ? " · todos con precio" : ""}
              </div>
            </div>
            <button onClick={traerDelMenu} disabled={trayendo}
              style={{ padding:"9px 14px", borderRadius:8, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:trayendo?"wait":"pointer" }}>
              {trayendo ? "Trayendo…" : "↓ Traer los platos del stock"}
            </button>
          </div>
          {sinPrecio > 0 && (
            <div style={{ fontSize:11, color:"#8A6055", marginTop:9, lineHeight:1.5 }}>
              Un plato sin precio no se puede cobrar. Se puede mandar igual a la cocina, así que
              sirve para empezar, pero conviene completarlos antes de usar la cuenta.
            </div>
          )}
        </div>

        {/* Categoría nueva */}
        <div style={{ display:"flex", gap:7, marginBottom:14 }}>
          <input value={nuevaCat} onChange={function(e) { setNuevaCat(e.target.value); }}
            placeholder="Categoría nueva (Bebidas, Postres...)" style={{ ...INP, fontSize:12 }} />
          <button onClick={function() {
              var cat = nuevaCat.trim();
              if (!cat || categorias.indexOf(cat) !== -1) return;
              guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:"Nuevo plato", precio:null, activo:true, orden:0 });
              setNuevaCat("");
            }} disabled={!nuevaCat.trim()}
            style={{ padding:"9px 15px", borderRadius:8, border:"none", background:nuevaCat.trim()?color:"#1A1A1A", color:nuevaCat.trim()?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:nuevaCat.trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
            + Categoría
          </button>
        </div>

        {delLocal.length === 0 ? (
          <div style={{ textAlign:"center", padding:"30px 0" }}>
            <div style={{ fontSize:30, marginBottom:8 }}>📖</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#2E2E2E", marginBottom:6 }}>La carta está vacía</div>
            <div style={{ fontSize:11, color:"#444", maxWidth:360, margin:"0 auto", lineHeight:1.6 }}>
              Los platos de este local ya están cargados en el menú de stock. Traelos con el botón de
              arriba y completá los precios: es mucho menos trabajo que escribirlos de nuevo.
            </div>
          </div>
        ) : categorias.map(function(cat) {
          // Dentro de cada categoría, el orden del menú; lo agregado a mano al final.
          var platos = delLocal.filter(function(x) { return x.categoria === cat; })
            .sort(function(a, b) {
              var oa = a.orden === null || a.orden === undefined ? 999 : a.orden;
              var ob = b.orden === null || b.orden === undefined ? 999 : b.orden;
              return oa !== ob ? oa - ob : String(a.nombre).localeCompare(String(b.nombre));
            });
          return (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:7 }}>{cat} ({platos.length})</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {platos.map(function(x) {
                  var faltaPrecio = x.precio === null || x.precio === undefined || x.precio === "";
                  return (
                    <div key={x.id} style={{ display:"flex", gap:7, alignItems:"center", background:"#111", border:"1px solid "+(faltaPrecio?"#D4A01733":"#1A1A1A"), borderRadius:8, padding:"7px 10px", opacity:x.activo===false?0.45:1 }}>
                      <input defaultValue={x.nombre}
                        onBlur={function(e) { var v = e.target.value.trim(); if (v && v !== x.nombre) guardarPlato({ ...x, nombre:v }); }}
                        style={{ ...INP, border:"none", background:"none", padding:"3px 0", fontSize:13, flex:1 }} />
                      <span style={{ color:"#444", fontSize:12 }}>$</span>
                      <input defaultValue={x.precio === null || x.precio === undefined ? "" : x.precio}
                        onBlur={function(e) {
                          var v = e.target.value.trim();
                          var n = v === "" ? null : parseFloat(v);
                          if (v !== "" && isNaN(n)) { e.target.value = x.precio === null || x.precio === undefined ? "" : x.precio; return; }
                          if (n !== x.precio) guardarPlato({ ...x, precio:n });
                        }}
                        placeholder="0" inputMode="decimal"
                        style={{ ...INP, width:88, flex:"none", textAlign:"right", fontSize:13, padding:"5px 8px", border:"1px solid "+(faltaPrecio?"#D4A01744":"#2A2A2A") }} />
                      <button onClick={function() { guardarPlato({ ...x, activo:x.activo===false }); }}
                        title={x.activo===false ? "Está fuera de la carta — tocar para volver a ofrecerlo" : "Sacar de la carta por un tiempo"}
                        style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:x.activo===false?"#555":"#3A7D44", fontSize:11, cursor:"pointer" }}>
                        {x.activo===false ? "✖️" : "✓"}
                      </button>
                      <button onClick={function() { borrarPlato(x); }}
                        style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:6, padding:"3px 8px", color:"#555", fontSize:11, cursor:"pointer" }}>🗑️</button>
                    </div>
                  );
                })}
                <button onClick={function() {
                    var nombre = (nuevoPlato[cat] || "").trim();
                    if (!nombre) return;
                    guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:nombre, precio:null, activo:true, orden:500 });
                    setNuevoPlato(function(prev) { var n = {...prev}; n[cat] = ""; return n; });
                  }} style={{ display:"none" }} />
                <div style={{ display:"flex", gap:6, marginTop:2 }}>
                  <input value={nuevoPlato[cat] || ""} onChange={function(e) { var v = e.target.value; setNuevoPlato(function(prev) { var n = {...prev}; n[cat] = v; return n; }); }}
                    placeholder={"Agregar a " + cat + "..."} style={{ ...INP, fontSize:12, padding:"7px 10px" }} />
                  <button onClick={function() {
                      var nombre = (nuevoPlato[cat] || "").trim();
                      if (!nombre) return;
                      guardarPlato({ id:"carta_"+localId+"_"+Date.now(), local:localId, categoria:cat, nombre:nombre, precio:null, activo:true, orden:500 });
                      setNuevoPlato(function(prev) { var n = {...prev}; n[cat] = ""; return n; });
                    }} disabled={!(nuevoPlato[cat] || "").trim()}
                    style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #1E1E1E", background:"#111", color:(nuevoPlato[cat]||"").trim()?color:"#444", fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:700, cursor:(nuevoPlato[cat]||"").trim()?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── TARJETA DE MESA ───────────────────────────────────────────────────────
  function Mesa(props) {
    var m = props.mesa;
    var c = comandaDeMesa(m.id);
    var ocupada = !!c;
    var nom = String(m.nombre || "");
    return (
      <button onClick={function() { ocupada ? cerrar(c) : abrirMesa(m); }}
        title={ocupada ? "Abierta hace " + hace(c.abierta_at) + " · tocar para cerrar" : "Tocar para abrir"}
        style={{
          width:82, height:82, borderRadius:12, cursor:"pointer",
          border:"1px solid " + (ocupada ? color : "#1E1E1E"),
          background: ocupada ? color + "22" : "#0F0F0F",
          color: ocupada ? color : "#555",
          fontFamily:"'Inter',sans-serif", display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:2, padding:4,
        }}>
        {/* Una mesa se llama "12", pero también "Reservado": el número entra grande
            y el nombre largo se achica para no desbordar la tarjeta. */}
        <div style={{ fontSize: nom.length <= 3 ? 22 : nom.length <= 7 ? 14 : 11, fontWeight:800, lineHeight:1.1, maxWidth:74, textAlign:"center", wordBreak:"break-word" }}>{nom}</div>
        {ocupada ? (
          <>
            <div style={{ fontSize:9, opacity:0.85 }}>⏱ {hace(c.abierta_at)}</div>
            {c.mozo && <div style={{ fontSize:8, opacity:0.6, maxWidth:74, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.mozo}</div>}
          </>
        ) : (
          <div style={{ fontSize:9, color:"#333" }}>libre</div>
        )}
      </button>
    );
  }

  // ─── ALTA DE DELIVERY Y MOSTRADOR ──────────────────────────────────────────
  function NuevaComanda(props) {
    var esDelivery = props.tipo === "delivery";
    var [abierto, setAbierto] = useState(false);
    var [cliente, setCliente] = useState("");
    var [direccion, setDireccion] = useState("");
    var [telefono, setTelefono] = useState("");

    function crear() {
      if (esDelivery && !direccion.trim()) return;
      guardar({
        id: "cmd_" + Date.now(),
        local: localId, tipo: props.tipo, numero: proximoNumero(), estado: "abierta",
        mozo: usuario, cliente: cliente.trim() || null,
        direccion: esDelivery ? direccion.trim() : null,
        telefono: telefono.trim() || null,
        abierta_at: new Date().toISOString(), usuario: usuario,
      });
      setCliente(""); setDireccion(""); setTelefono(""); setAbierto(false);
    }

    if (!abierto) return (
      <button onClick={function() { setAbierto(true); }}
        style={{ width:"100%", padding:"12px", borderRadius:10, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer", marginBottom:14 }}>
        + Nuevo {esDelivery ? "delivery" : "pedido de mostrador"}
      </button>
    );
    return (
      <div style={{ background:"#0F0F0F", border:"1px solid "+color+"33", borderRadius:12, padding:"14px", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:800, color:color, marginBottom:11 }}>{esDelivery ? "🛵 Nuevo delivery" : "🥡 Nuevo pedido de mostrador"}</div>
        <input value={cliente} onChange={function(e) { setCliente(e.target.value); }} placeholder="Cliente (opcional)" style={{ ...INP, marginBottom:8 }} />
        {esDelivery && <input value={direccion} onChange={function(e) { setDireccion(e.target.value); }} placeholder="Dirección *" style={{ ...INP, marginBottom:8 }} />}
        <input value={telefono} onChange={function(e) { setTelefono(e.target.value); }} placeholder="Teléfono (opcional)" inputMode="tel" style={{ ...INP, marginBottom:10 }} />
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={crear} disabled={esDelivery && !direccion.trim()}
            style={{ flex:1, padding:"11px", borderRadius:8, border:"none", background:(!esDelivery || direccion.trim())?color:"#1A1A1A", color:(!esDelivery || direccion.trim())?"#fff":"#444", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:(!esDelivery || direccion.trim())?"pointer":"not-allowed" }}>
            + Abrir
          </button>
          <button onClick={function() { setAbierto(false); }} style={{ ...GH, padding:"11px 16px", fontSize:13 }}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ─── PANTALLA ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Inter',sans-serif" }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5 }}>Módulo</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:800 }}>🍽️ Comandas</div>
      </div>

      {problemaTabla && (
        <div style={{ background:"#2A0A0A", border:"1px solid #C1440E", borderRadius:10, padding:"11px 13px", marginBottom:12, display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:15 }}>⚠️</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#C1440E", marginBottom:3 }}>Comandas no está guardando</div>
            <div style={{ fontSize:11, color:"#E8B9A8", lineHeight:1.5 }}>Podés mirar la pantalla, pero nada de lo que abras se guarda. Lo que contesta la base:</div>
            <div style={{ fontSize:10, color:"#E8B9A8", background:"#1A0505", border:"1px solid #C1440E33", borderRadius:6, padding:"6px 8px", marginTop:6, whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"monospace" }}>
              {String(problemaTabla).slice(0, 400)}
            </div>
            <div style={{ fontSize:10, color:"#8A6055", marginTop:6 }}>Supabase → SQL Editor → el bloque `comandas` del README.</div>
          </div>
        </div>
      )}

      {/* Local */}
      {!localFijo && (
        <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
          {LOCALES.filter(function(l) { return l.id !== "l4"; }).map(function(l) {
            var act = localId === l.id;
            var cuenta = comandas.filter(function(c) { return c.local === l.id; }).length;
            return (
              <button key={l.id} onClick={function() { setLocalId(l.id); setConfig(false); }}
                style={{ padding:"9px 15px", borderRadius:9, border:"1px solid "+(act?l.color:"#1E1E1E"), background:act?l.color+"22":"#111", color:act?l.color:"#666", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {l.emoji} {l.nombre}{cuenta > 0 ? " (" + cuenta + ")" : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* Mesas / Delivery / Mostrador */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {CMD_VISTAS.map(function(v) {
          var act = vista === v.id && !config;
          var cuenta = v.tipo ? abiertas.filter(function(c) { return c.tipo === v.tipo; }).length : 0;
          return (
            <button key={v.id} onClick={function() { setVista(v.id); setConfig(false); }}
              style={{ flex:1, minWidth:110, padding:"11px 12px", borderRadius:9, border:"1px solid "+(act?color:"#1E1E1E"), background:act?color+"22":"#111", color:act?color:"#666", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {v.emoji} {v.nombre}{cuenta > 0 ? " (" + cuenta + ")" : ""}
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#333" }}>Cargando…</div>
      ) : config ? (
        <>
          <button onClick={function() { setConfig(false); }} style={{ ...GH, padding:"7px 13px", fontSize:12, marginBottom:12 }}>← Volver al plano</button>
          <ConfigMesas />
        </>
      ) : vista === "carta" ? (
        <Carta />
      ) : vista === "mesas" ? (
        mesasLocal.length === 0 ? (
          <div style={{ textAlign:"center", padding:"30px 0" }}>
            <div style={{ fontSize:30, marginBottom:8 }}>🪑</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#2E2E2E", marginBottom:14 }}>
              {local && local.nombre} todavía no tiene mesas cargadas
            </div>
            <button onClick={function() { setConfig(true); }}
              style={{ padding:"11px 20px", borderRadius:9, border:"1px solid "+color+"44", background:color+"11", color:color, fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, cursor:"pointer" }}>
              Cargar las mesas
            </button>
          </div>
        ) : (
          <>
            {CMD_SECTORES.map(function(s) {
              var delSector = mesasLocal.filter(function(m) { return m.sector === s.id; });
              if (!delSector.length) return null;
              var ocupadasSector = delSector.filter(function(m) { return !!comandaDeMesa(m.id); }).length;
              return (
                <div key={s.id} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>
                    {s.emoji} {s.nombre} · {ocupadasSector}/{delSector.length} ocupadas
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {delSector.map(function(m) { return <Mesa key={m.id} mesa={m} />; })}
                  </div>
                </div>
              );
            })}
            <button onClick={function() { setConfig(true); }} style={{ ...GH, padding:"8px 14px", fontSize:11, marginTop:4 }}>⚙️ Editar el plano</button>
          </>
        )
      ) : (
        <>
          <NuevaComanda tipo={vistaActual.tipo} />
          {delTipo.length === 0 ? (
            <div style={{ textAlign:"center", padding:"30px 0", color:"#333" }}>
              <div style={{ fontSize:30, marginBottom:8 }}>{vistaActual.emoji}</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#2E2E2E" }}>
                Sin {vistaActual.nombre.toLowerCase()} abiertos
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {delTipo.map(function(c) {
                return (
                  <div key={c.id} style={{ background:"#111", border:"1px solid "+color+"33", borderRadius:10, padding:"12px 13px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:9 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:10, color:"#555", marginBottom:2 }}>{vistaActual.emoji} #{c.numero}</div>
                        <div style={{ fontSize:14, fontWeight:800, color:"#F0EDE8" }}>{c.cliente || "Sin nombre"}</div>
                        {c.direccion && <div style={{ fontSize:11, color:"#888", marginTop:3 }}>📍 {c.direccion}</div>}
                        {c.telefono && <div style={{ fontSize:11, color:"#666" }}>📞 {c.telefono}</div>}
                      </div>
                      <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                        <div style={{ fontSize:11, color:color, fontWeight:700 }}>⏱ {hace(c.abierta_at)}</div>
                        {c.mozo && <div style={{ fontSize:9, color:"#3A3A3A", marginTop:2 }}>{c.mozo}</div>}
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"flex-end", marginTop:9 }}>
                      <button onClick={function() { cerrar(c); }}
                        style={{ padding:"6px 14px", borderRadius:7, border:"1px solid #2A2A2A", background:"none", color:"#888", fontFamily:"'Inter',sans-serif", fontSize:11, cursor:"pointer" }}>
                        Cerrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Lo que falta, dicho en la pantalla y no sólo en el README: una mesa que se
          abre y se cierra sin poder cargar nada todavía es una pantalla a medias, y
          conviene que quede claro que es un paso y no un olvido. */}
      {!cargando && !config && vista !== "carta" && (
        <div style={{ marginTop:18, padding:"10px 12px", background:"#0D0D0D", border:"1px dashed #1E1E1E", borderRadius:10, fontSize:11, color:"#444", lineHeight:1.6 }}>
          <b style={{ color:"#666" }}>Esto es la estructura.</b> Por ahora una mesa se abre y se cierra: falta cargarle
          los platos. El paso siguiente es la carta —los platos con su precio de venta, que hoy no existen en ningún
          lado— y de ahí la comanda a la cocina.
        </div>
      )}
    </div>
  );
}
