// v5.0 - Gestión Grupo NKT - Módulos Compras/Admin + Gastos + Stock
import { useState, useEffect } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
var SURL = "https://qcfwqnqtrqyjdfvakwxt.supabase.co";
var SKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZndxbnF0cnF5amRmdmFrd3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYxODMsImV4cCI6MjA5NjE1MjE4M30.Zh5jN_oGXde0JGBJ_NTBn5Mkr2m6lI3VPjAsqrzd6Gc";
var SH = { "Content-Type": "application/json", "apikey": SKEY, "Authorization": "Bearer " + SKEY, "Prefer": "return=representation" };

async function sbLoad() {
  try {
    var r = await fetch(SURL + "/rest/v1/ordenes?order=created_at.desc", { headers: SH });
    var d = await r.json();
    if (!Array.isArray(d)) return [];
    return d.map(function(o) { return { id: o.id, local: o.local, fecha: o.fecha, fechaEntrega: o.fecha_entrega || "", notas: o.notas || "", facturacion: o.facturacion || "", status: o.status, provSections: o.prov_sections || [], createdAt: o.created_at }; });
  } catch(e) { return []; }
}

async function sbSave(orden) {
  try {
    var headers = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    var body = {
      id: orden.id,
      local: orden.local,
      fecha: orden.fecha,
      fecha_entrega: orden.fechaEntrega || null,
      notas: orden.notas || null,
      facturacion: orden.facturacion || null,
      status: orden.status,
      prov_sections: orden.provSections,
      emisor: orden.emisor || null,
      seccion: orden.seccion || null,
      created_at: orden.createdAt || new Date().toISOString()
    };
    var r = await fetch(SURL + "/rest/v1/ordenes", { method: "POST", headers: headers, body: JSON.stringify(body) });
    if (!r.ok) {
      var errText = await r.text();
      console.error("Supabase save error:", r.status, errText);
      alert("Error guardando orden: " + r.status + " - " + errText);
    }
  } catch(e) { console.error("sbSave error:", e); alert("Error de conexión: " + e.message); }
}

async function sbPatch(id, changes) {
  try {
    await fetch(SURL + "/rest/v1/ordenes?id=eq." + id, { method: "PATCH", headers: SH, body: JSON.stringify(changes) });
  } catch(e) {}
}

async function sbDelete(id) {
  try {
    await fetch(SURL + "/rest/v1/ordenes?id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

async function sbGetFaltantes() {
  try {
    var r = await fetch(SURL + "/rest/v1/faltantes?order=created_at.desc", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function sbSaveFaltante(f) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/faltantes", { method: "POST", headers: h, body: JSON.stringify(f) });
  } catch(e) {}
}

async function sbDeleteFaltante(id) {
  try {
    await fetch(SURL + "/rest/v1/faltantes?id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

// Proveedores
async function sbLoadProveedores() {
  try {
    var r = await fetch(SURL + "/rest/v1/proveedores?order=nombre", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) && d.length > 0 ? d : null;
  } catch(e) { return null; }
}
async function sbSaveProveedor(prov) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/proveedores", { method: "POST", headers: h, body: JSON.stringify(prov) });
  } catch(e) {}
}
async function sbDeleteProveedor(id) {
  try {
    await fetch(SURL + "/rest/v1/proveedores?id=eq." + id, { method: "DELETE", headers: SH });
    await fetch(SURL + "/rest/v1/productos?prov_id=eq." + id, { method: "DELETE", headers: SH });
    await fetch(SURL + "/rest/v1/precios?prov_id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

// Productos
async function sbLoadProductos() {
  try {
    var r = await fetch(SURL + "/rest/v1/productos?order=nombre", { headers: SH });
    var d = await r.json();
    if (!Array.isArray(d) || d.length === 0) return null;
    var result = {};
    d.forEach(function(p){ if(!result[p.prov_id]) result[p.prov_id]=[]; result[p.prov_id].push(p.nombre); });
    return result;
  } catch(e) { return null; }
}
async function sbSaveProducto(provId, nombre) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/productos", { method: "POST", headers: h, body: JSON.stringify({ id: provId+"_"+nombre.replace(/\s+/g,"_"), prov_id: provId, nombre: nombre }) });
  } catch(e) {}
}
async function sbDeleteProducto(provId, nombre) {
  try {
    await fetch(SURL + "/rest/v1/productos?id=eq." + provId+"_"+nombre.replace(/\s+/g,"_"), { method: "DELETE", headers: SH });
  } catch(e) {}
}

// Precios
async function sbLoadPrecios() {
  try {
    var r = await fetch(SURL + "/rest/v1/precios", { headers: SH });
    var d = await r.json();
    if (!Array.isArray(d) || d.length === 0) return null;
    var result = {};
    d.forEach(function(p){ result[p.prov_id+"_"+p.producto] = String(p.precio); });
    return result;
  } catch(e) { return null; }
}
async function sbSavePrecio(provId, producto, precio) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/precios", { method: "POST", headers: h, body: JSON.stringify({ id: provId+"_"+producto.replace(/\s+/g,"_"), prov_id: provId, producto: producto, precio: parseFloat(precio)||0 }) });
  } catch(e) {}
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
var LOCALES = [
  { id: "l1", nombre: "El Bodegón Nkt", emoji: "🍷", color: "#C1440E" },
  { id: "l2", nombre: "Kusama",          emoji: "🌸", color: "#8B2FC9" },
  { id: "l3", nombre: "Colantonio's",    emoji: "🍝", color: "#1A6B8A" },
  { id: "l4", nombre: "Oficina",         emoji: "🏢", color: "#3A7D44" },
];

var FACTURACION = [
  { id: "f1", razonSocial: "Calzon Gitano SRL",         cuit: "30-71844629-1", condicion: "Resp. Inscripto", domicilio: "Humberto 376, Punta Alta" },
  { id: "f2", razonSocial: "Colantonio Carlos Nicolas", cuit: "20-26958479-4", condicion: "Resp. Inscripto", domicilio: "Villanueva 35, Punta Alta" },
];

var INIT_USERS = [
  { id: "u1", nombre: "Sofia",   usuario: "sofia",   password: "Sofia0422",   local: null, rol: "admin",   seccion: "" },
  { id: "u2", nombre: "Araceli", usuario: "araceli", password: "Araceli123",  local: null, rol: "admin",   seccion: "" },
  { id: "u3", nombre: "Belen",   usuario: "belen",   password: "Belen1509",   local: "l4", rol: "usuario", seccion: "" },
  { id: "u4", nombre: "Ariana",  usuario: "ariana",  password: "Ariana123",   local: "l2", rol: "usuario", seccion: "" },
  { id: "u5", nombre: "Galo",    usuario: "galo",    password: "Galo123",     local: "l1", rol: "usuario", seccion: "Salón" },
  { id: "u6", nombre: "Sol",     usuario: "sol",     password: "Sol123",      local: "l1", rol: "usuario", seccion: "Cocina" },
  { id: "u7", nombre: "Alejo",   usuario: "alejo",   password: "Alejo123",    local: "l3", rol: "usuario", seccion: "Salón" },
  { id: "u8", nombre: "Magali",  usuario: "magali",  password: "Magali123",   local: "l3", rol: "usuario", seccion: "Cocina" },
  { id: "u9",  nombre: "Cajero Bodegón",      usuario: "cajero_bodegon",     password: "CajeroBod1",  local: "l1", seccion: "Caja", rol: "cajero" },
  { id: "u10", nombre: "Cajero Kusama",       usuario: "cajero_kusama",      password: "CajeroKus1",  local: "l2", seccion: "Caja", rol: "cajero" },
  { id: "u11", nombre: "Cajero Colantonio's", usuario: "cajero_colantonios", password: "CajeroCol1",  local: "l3", seccion: "Caja", rol: "cajero" },
];

var INIT_PROVEEDORES = [
  { id: "p1",  nombre: "Carnicería",    categoria: "Carnes & Aves",           compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p2",  nombre: "Fiambrería",    categoria: "Lácteos & Fiambres",      compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p3",  nombre: "Pescadería",    categoria: "Mariscos & Pescados",     compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p4",  nombre: "Verdulería",    categoria: "Frutas & Verduras",       compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p5",  nombre: "Distribuidora", categoria: "Secos & Limpieza",        compartido: true, whatsapp: "", locales: ["l1","l2","l3","l4"] },
  { id: "p6",  nombre: "Papelera",      categoria: "Descartables",            compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p7",  nombre: "Especias",      categoria: "Especias & Frutos secos", compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p8",  nombre: "Insumos",       categoria: "Insumos & Salsas",        compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p9",  nombre: "Bebidas",       categoria: "Bebidas",                 compartido: true, whatsapp: "", locales: ["l1","l2","l3"] },
  { id: "p10", nombre: "Librería",      categoria: "Librería",                compartido: true, whatsapp: "", locales: ["l1","l2","l3","l4"] },
  { id: "p11", nombre: "Imprenta",      categoria: "Imprenta",                compartido: true, whatsapp: "", locales: ["l1","l2","l3","l4"] },
];

// Precios por producto: { "provId_producto": precio }
var INIT_PRECIOS = {};

var INIT_PRODUCTOS = {
  p1: ["Bondiola","Carne picada","Carre de cerdo","Morcilla","Osobuco","Pata y muslo","Pechuga de pollo","Riñones","Roast beef","Vacio","Panceta","Pastron","Pepperoni"],
  p2: ["Brie","Cebolla encurtida","Cheddar","Crudo","Dulce de batata","Jamon cocido","Mascarpone","Mortadela","Mozzarella","Mozzarella en barra","Provoleta","Queso cremoso","Queso de maquina","Queso para rallar","Ricota","Roquefort"],
  p3: ["Calamaretes","Cornalitos","Langostinos","Mejillones media valva","Mejillones sin valva","Merluza molida","Navajuelas","Penca de salmon","Rabas","Salmon ahumado","Salsa de pescado","Salsa de ostras","Salsa de soja","Salsa teriyaki"],
  p4: ["Acelga","Ajo","Albahaca","Apio","Berenjena","Brocoli","Cebolla blanca","Cebolla morada","Cebolla comun","Champiñones","Ciboulette","Coliflor","Espinaca","Huevos","Lechuga crespa","Lechuga morada","Lechuga repollada","Limones","Manzana verde","Menta","Morrones","Palta","Papas","Pepino","Puerro","Rabanito","Repollo colorado","Rucula","Tomates cherry","Tomates redondo","Verdeo","Zanahoria","Zucchini"],
  p5: ["Aceitunas negras","Aceitunas verdes","Aceto balsamico","Azucar","Barbacoa","Bolsas de residuos","Esponja","Esponja de acero","Fosforos","Hamburguesas","Harina 000","Harina 0000","Ketchup","Leche","Levadura seca","Limon artificial","Mayonesa","Mostaza","Pan rallado","Polenta","Salchichas","Sal fina","Sal entrefina","Sal gruesa","Salsas para postre","Tomate concentrado","Tomate triturado","Vinagre alc man y vino","Vino blanco","Vino tinto","Bicarbonato de sodio","Hielo","Prepizzas","Cheesecake"],
  p6: ["Bandejas de aluminio chicas","Bandejas de aluminio grandes","Bandejas para ensaladas","Bobina de papel","Bolsas blancas grandes y chicas","Bolsas de carton","Bolsas para porcionar 15x20","Bolsas para porcionar 20x30","Cajas de media pizza","Cajas de pizzas","Cajas de pizza masa madre","Dips","Film","Papel aluminio","Pinchos","Tridentes para pizzas"],
  p7: ["Aji molido","Ajo deshidratado","Ajo en polvo","Albahaca deshidratada","Almendras","Anis","Azucar mascabo","Azucar negra","Canela","Castañas de caju","Cebolla deshidratada","Cebolla en polvo","Cereales de maiz","Clavo de olor","Comino","Curcuma","Curry","Eneldo","Estragón","Hongos de pino","Humo en polvo","Jenjibre","Laurel","Lentejas","Miel","Mix de semillas","Nueces","Nueces de pecan","Nuez moscada","Oregano","Panko","Paprika","Perejil","Pimenton ahumado","Pimenton picante","Pimienta blanca","Pimienta de cayena","Pimienta en granos","Pimienta negra","Polvo de hornear","Provenzal","Romero","Semillas de amapola","Semillas de coriandro","Semillas de fenogreco","Semillas de hinojo","Semillas de mostaza","Semillas de sesamo","Semillas eneldo","Tofu","Tomates secos"],
  p8: ["Cajas de sushi","Wasabi","Mirin","Alga kombu","Aceite de sesamo","Salsa de soja","Salsa de ostras","Arroz koyi","Alga nori","Caviar","Finlandia","Ajinomoto","Crema de leche","Flores decoracion","Palitos chinos"],
  p9: ["Gin","Vinos","Coca","Coca zero","Sprite","Fanta","Pomelo","Pera","Manzana","Naranja","Cerveza","Heineken lata","Imperial IPA","Grolsh lata"],
  p10: [],
  p11: [],
};

var UNIDADES = ["kg","gr","lt","ml","unid","caja","docena","bolsa"];
var CATEGORIAS = ["Carnes & Aves","Frutas & Verduras","Lácteos & Fiambres","Bebidas","Mariscos & Pescados","Limpieza","Secos & Almacén","Descartables","Especias & Frutos secos","Insumos & Salsas","Otro"];

var _oc = 1, _pc = 10, _uc = 10;
var _contadores = { l1: 0, l2: 0, l3: 0, l4: 0 };
var _prefijos = { l1: "BOD", l2: "KUS", l3: "COL", l4: "OFI" };

function genOC(localId) {
  _contadores[localId] = (_contadores[localId]||0) + 1;
  return (_prefijos[localId]||"ORD") + "-" + String(_contadores[localId]).padStart(4,"0");
}

function initContadores(ordenes) {
  var conteos = { l1: 0, l2: 0, l3: 0, l4: 0 };
  ordenes.forEach(function(o) {
    if (!o.local || !o.id) return;
    var prefijo = _prefijos[o.local];
    if (!prefijo) return;
    if (o.id.startsWith(prefijo + "-")) {
      var num = parseInt(o.id.split("-")[1]) || 0;
      if (num > conteos[o.local]) conteos[o.local] = num;
    }
  });
  _contadores = conteos;
}
function genProv() { return "p" + String(Date.now()).slice(-8); }
function genUser() { return "u" + _uc++; }
function getLocal(id) { return LOCALES.find(function(l) { return l.id === id; }) || null; }
function getFact(id) { return FACTURACION.find(function(f) { return f.id === id; }) || null; }
function fmtDate(s) { if (!s) return "—"; var p = s.split("-"); return p[2]+"/"+p[1]+"/"+p[0]; }
function fmtDateTime(s) {
  if (!s) return "—";
  var d = new Date(s);
  var pad = function(n) { return n < 10 ? "0"+n : n; };
  return pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear()+" "+pad(d.getHours())+":"+pad(d.getMinutes());
}
function cleanPhone(s) { return s.replace(/\D/g,""); }

var INP = { padding:"9px 12px", borderRadius:8, border:"1px solid #2A2A2A", background:"#0F0F0F", color:"#F0EDE8", fontFamily:"'Lora',serif", fontSize:13, boxSizing:"border-box", width:"100%" };
function BS(bg,col) { return { padding:"10px 18px", borderRadius:8, border:"none", background:bg, color:col||"#fff", fontFamily:"'Lora',serif", fontSize:13, fontWeight:700, cursor:"pointer" }; }
var GH = { padding:"10px 18px", borderRadius:8, border:"1px solid #2A2A2A", background:"none", color:"#888", fontFamily:"'Lora',serif", fontSize:13, cursor:"pointer" };

function Badge(p) { return <span style={{ background:p.color+"22", color:p.color, border:"1px solid "+p.color+"44", borderRadius:4, padding:"2px 10px", fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>{p.children}</span>; }
function SBadge(p) {
  var M = { borrador:["Borrador","#888"], pendiente:["Pendiente","#D4A017"], enviada:["Enviada","#1A6B8A"], confirmada:["Confirmada","#3A7D44"], cancelada:["Cancelada","#C1440E"] };
  var e = M[p.status]||M.borrador; return <Badge color={e[1]}>{e[0]}</Badge>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login(p) {
  var [u,setU]=useState(""), [pw,setPw]=useState(""), [err,setErr]=useState(""), [show,setShow]=useState(false);
  function go() { var x=p.users.find(function(x){return x.usuario===u.trim()&&x.password===pw;}); if(x)p.onLogin(x); else setErr("Usuario o contraseña incorrectos."); }
  return (
    <div style={{minHeight:"100vh",background:"#0A0A0A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Lora',serif"}}>
      <div style={{width:"min(380px,92vw)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:10}}>🍽️</div>
          <div style={{fontSize:10,color:"#444",letterSpacing:4,textTransform:"uppercase",marginBottom:6}}>Grupo NKT</div>
          <h1 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:800,color:"#F0EDE8"}}>Gestión Grupo NKT</h1>
          <div style={{width:36,height:2,background:"#C1440E",margin:"12px auto 0"}}/>
        </div>
        <div style={{background:"#141414",border:"1px solid #222",borderRadius:16,padding:"24px 24px 20px"}}>
          <div style={{fontSize:10,color:"#555",letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Iniciar sesión</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Usuario</label>
              <input value={u} onChange={function(e){setU(e.target.value);setErr("");}} onKeyDown={function(e){if(e.key==="Enter")go();}} placeholder="tu usuario" style={INP}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Contraseña</label>
              <div style={{position:"relative"}}>
                <input type={show?"text":"password"} value={pw} onChange={function(e){setPw(e.target.value);setErr("");}} onKeyDown={function(e){if(e.key==="Enter")go();}} placeholder="••••••••" style={{...INP,paddingRight:42}}/>
                <button onClick={function(){setShow(function(v){return !v;});}} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14}}>{show?"🙈":"👁️"}</button>
              </div>
            </div>
            {err&&<div style={{background:"#1A0808",border:"1px solid #C1440E44",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#C1440E"}}>⚠️ {err}</div>}
            <button onClick={go} style={{...BS("#C1440E"),padding:"12px",fontSize:14,marginTop:4,boxShadow:"0 4px 18px #C1440E33"}}>Ingresar →</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function loadJsPDF() {
  if (!window.jspdf) {
    await new Promise(function(res,rej){
      var urls = [
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
      ];
      var idx = 0;
      function tryNext() {
        if (idx >= urls.length) { rej(new Error("No se pudo cargar jsPDF")); return; }
        var s = document.createElement("script");
        s.src = urls[idx++];
        s.onload = res;
        s.onerror = function() { tryNext(); };
        document.head.appendChild(s);
      }
      tryNext();
    });
  }
}

async function makePDF(orden, local, prov, items, fact) {
  await loadJsPDF();
  var doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"});
  var W=210,m=18,cW=W-m*2;
  doc.setFillColor(193,68,14);doc.rect(0,0,W,38,"F");
  doc.setTextColor(255,255,255);doc.setFontSize(20);doc.setFont("helvetica","bold");doc.text("ORDEN DE COMPRA",m,18);
  doc.setFontSize(11);doc.setFont("helvetica","normal");doc.text(orden.id,m,27);
  doc.setFontSize(9);doc.text("Emitida: "+fmtDate(orden.fecha),W-m,18,{align:"right"});
  if(orden.fechaEntrega)doc.text("Entrega: "+fmtDate(orden.fechaEntrega),W-m,26,{align:"right"});
  var y=50;
  doc.setFillColor(20,20,20);doc.roundedRect(m,y,cW,30,3,3,"F");
  doc.setTextColor(140,140,140);doc.setFontSize(7);doc.setFont("helvetica","bold");
  doc.text("LOCAL",m+8,y+8);doc.text("PROVEEDOR",m+cW/2+4,y+8);
  doc.setTextColor(240,237,232);doc.setFontSize(12);doc.setFont("helvetica","bold");
  doc.text(local?local.nombre:"",m+8,y+17);
  doc.setFontSize(11);doc.text(prov?prov.nombre:"",m+cW/2+4,y+17);
  doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(100,100,100);
  doc.text(prov?prov.categoria:"",m+cW/2+4,y+24);
  if(fact){y+=36;doc.setFillColor(30,20,5);doc.roundedRect(m,y,cW,22,3,3,"F");doc.setTextColor(212,160,23);doc.setFontSize(7);doc.setFont("helvetica","bold");doc.text("FACTURAR A",m+8,y+7);doc.setTextColor(240,237,232);doc.setFontSize(11);doc.setFont("helvetica","bold");doc.text(fact.razonSocial,m+8,y+14);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(160,160,160);doc.text("CUIT "+fact.cuit+" · "+fact.condicion+" · "+fact.domicilio,m+8,y+20);y+=26;}else{y+=36;}
  doc.setDrawColor(40,40,40);doc.line(m,y,W-m,y);y+=8;
  doc.setFillColor(30,30,30);doc.rect(m,y-5,cW,10,"F");
  doc.setTextColor(120,120,120);doc.setFontSize(7);doc.setFont("helvetica","bold");
  var Cp=m+3,Cq=m+cW*0.52,Cu=m+cW*0.64,Cpu=m+cW*0.76,Cs=m+cW-3;
  doc.text("PRODUCTO",Cp,y+1);doc.text("CANT.",Cq,y+1);doc.text("UD.",Cu,y+1);doc.text("P.UNIT.",Cpu,y+1);doc.text("SUBTOTAL",Cs,y+1,{align:"right"});
  y+=8;
  var tot=items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
  items.forEach(function(item,idx){
    if(idx%2===0){doc.setFillColor(18,18,18);doc.rect(m,y-4,cW,9,"F");}
    var sub=parseFloat(item.cantidad||0)*parseFloat(item.precio||0);
    doc.setTextColor(200,200,200);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text(item.nombre,Cp,y+1);
    doc.setTextColor(212,160,23);doc.text(String(item.cantidad),Cq,y+1);
    doc.setTextColor(100,100,100);doc.text(item.unidad,Cu,y+1);
    doc.setTextColor(160,160,160);doc.text("$"+parseFloat(item.precio||0).toFixed(2),Cpu,y+1);
    doc.setTextColor(220,220,220);doc.setFont("helvetica","bold");doc.text("$"+sub.toFixed(2),Cs,y+1,{align:"right"});
    y+=9;
  });
  y+=3;doc.setDrawColor(50,50,50);doc.line(m,y,W-m,y);y+=7;
  doc.setFillColor(40,15,10);doc.rect(m,y-5,cW,12,"F");
  doc.setTextColor(140,140,140);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("TOTAL ESTIMADO",Cp,y+2);
  doc.setTextColor(193,68,14);doc.setFontSize(14);doc.setFont("helvetica","bold");doc.text("$"+tot.toFixed(2),Cs,y+3,{align:"right"});
  if(orden.notas){y+=20;doc.setFillColor(15,15,15);doc.roundedRect(m,y,cW,16,2,2,"F");doc.setTextColor(100,100,100);doc.setFontSize(7);doc.setFont("helvetica","bold");doc.text("NOTAS",m+5,y+6);doc.setFont("helvetica","normal");doc.setTextColor(160,160,160);doc.setFontSize(9);doc.text(orden.notas,m+5,y+12);}
  doc.setFillColor(15,15,15);doc.rect(0,282,W,15,"F");doc.setTextColor(60,60,60);doc.setFontSize(7);doc.setFont("helvetica","normal");doc.text("Generado "+new Date().toLocaleString("es-AR"),W/2,291,{align:"center"});
  return doc;
}


// PDF COMPLETO - todos los proveedores en uno
async function makePDFCompleto(orden, local, proveedores, fact) {
  await loadJsPDF();
  var doc = new window.jspdf.jsPDF({unit:"mm",format:"a4"});
  var W=210, m=18, cW=W-m*2;

  // Header
  doc.setFillColor(193,68,14); doc.rect(0,0,W,38,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont("helvetica","bold");
  doc.text("ORDEN DE COMPRA", m, 18);
  doc.setFontSize(11); doc.setFont("helvetica","normal");
  doc.text(orden.id, m, 27);
  doc.setFontSize(9);
  doc.text("Emitida: "+fmtDate(orden.fecha), W-m, 18, {align:"right"});
  if(orden.fechaEntrega) doc.text("Entrega: "+fmtDate(orden.fechaEntrega), W-m, 26, {align:"right"});

  // Local
  var y = 46;
  doc.setFillColor(20,20,20); doc.roundedRect(m,y,cW,18,3,3,"F");
  doc.setTextColor(140,140,140); doc.setFontSize(7); doc.setFont("helvetica","bold");
  doc.text("LOCAL", m+8, y+7);
  doc.setTextColor(240,237,232); doc.setFontSize(13); doc.setFont("helvetica","bold");
  doc.text(local?local.nombre:"", m+8, y+14);

  // Facturacion
  if(fact){
    y+=24;
    doc.setFillColor(30,20,5); doc.roundedRect(m,y,cW,18,3,3,"F");
    doc.setTextColor(212,160,23); doc.setFontSize(7); doc.setFont("helvetica","bold");
    doc.text("FACTURAR A", m+8, y+6);
    doc.setTextColor(240,237,232); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text(fact.razonSocial, m+8, y+12);
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(160,160,160);
    doc.text("CUIT "+fact.cuit+" · "+fact.condicion+" · "+fact.domicilio, m+8, y+17);
    y+=22;
  } else { y+=22; }

  var totalGeneral = 0;

  // Sections by proveedor
  (orden.provSections||[]).forEach(function(sec){
    var pv = proveedores.find(function(x){return x.id===sec.provId;});
    var items = sec.items||[];
    if(items.length===0) return;
    var secTotal = items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
    totalGeneral += secTotal;

    // Check page space
    if(y > 240) { doc.addPage(); y=20; }

    // Proveedor header
    y+=6;
    doc.setFillColor(40,20,10); doc.rect(m,y,cW,10,"F");
    doc.setTextColor(193,68,14); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text(pv?pv.nombre:"Proveedor", m+4, y+7);
    doc.setTextColor(160,160,160); doc.setFontSize(8);
    doc.text("$"+secTotal.toFixed(2), W-m-3, y+7, {align:"right"});
    y+=14;

    // Column headers
    doc.setFillColor(30,30,30); doc.rect(m,y-4,cW,8,"F");
    doc.setTextColor(120,120,120); doc.setFontSize(6); doc.setFont("helvetica","bold");
    doc.text("PRODUCTO", m+3, y+1);
    doc.text("CANT.", m+cW*0.55, y+1);
    doc.text("UD.", m+cW*0.67, y+1);
    doc.text("P.UNIT.", m+cW*0.78, y+1);
    doc.text("SUBTOTAL", m+cW-3, y+1, {align:"right"});
    y+=7;

    // Items
    items.forEach(function(item,idx){
      if(y>270){doc.addPage();y=20;}
      if(idx%2===0){doc.setFillColor(18,18,18);doc.rect(m,y-3,cW,8,"F");}
      var sub=parseFloat(item.cantidad||0)*parseFloat(item.precio||0);
      doc.setTextColor(200,200,200); doc.setFontSize(8); doc.setFont("helvetica","normal");
      doc.text(item.nombre,m+3,y+2);
      doc.setTextColor(212,160,23); doc.text(String(item.cantidad),m+cW*0.55,y+2);
      doc.setTextColor(100,100,100); doc.text(item.unidad,m+cW*0.67,y+2);
      doc.setTextColor(160,160,160); doc.text("$"+parseFloat(item.precio||0).toFixed(2),m+cW*0.78,y+2);
      doc.setTextColor(220,220,220); doc.setFont("helvetica","bold");
      doc.text("$"+sub.toFixed(2),m+cW-3,y+2,{align:"right"});
      y+=8;
    });
  });

  // Total general
  y+=4;
  if(y>270){doc.addPage();y=20;}
  doc.setDrawColor(50,50,50); doc.line(m,y,W-m,y); y+=6;
  doc.setFillColor(40,15,10); doc.rect(m,y-4,cW,12,"F");
  doc.setTextColor(140,140,140); doc.setFontSize(8); doc.setFont("helvetica","normal");
  doc.text("TOTAL GENERAL", m+3, y+3);
  doc.setTextColor(193,68,14); doc.setFontSize(14); doc.setFont("helvetica","bold");
  doc.text("$"+totalGeneral.toFixed(2), m+cW-3, y+4, {align:"right"});

  if(orden.notas){
    y+=18;
    doc.setFillColor(15,15,15); doc.roundedRect(m,y,cW,14,2,2,"F");
    doc.setTextColor(100,100,100); doc.setFontSize(7); doc.setFont("helvetica","bold");
    doc.text("NOTAS", m+5, y+6);
    doc.setFont("helvetica","normal"); doc.setTextColor(160,160,160); doc.setFontSize(8);
    doc.text(orden.notas, m+5, y+11);
  }

  doc.setFillColor(15,15,15); doc.rect(0,282,W,15,"F");
  doc.setTextColor(60,60,60); doc.setFontSize(6); doc.setFont("helvetica","normal");
  doc.text("Generado "+new Date().toLocaleString("es-AR"), W/2, 291, {align:"center"});

  return doc;
}

// ─── MODAL WSP ────────────────────────────────────────────────────────────────
function WspModal(p) {
  var orden=p.orden, local=p.local, prov=p.provEntry.prov, items=p.provEntry.items, fact=p.fact;
  var [step,setStep]=useState("preview"), [phone,setPhone]=useState(prov.whatsapp||"542932595986"), [gen,setGen]=useState(false), [fname,setFname]=useState("");
  var tot=items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
  var itext=items.map(function(i){return "• "+i.nombre+": "+i.cantidad+" "+i.unidad;}).join("\n");
  var ftxt=fact?("\n\n🧾 *Facturar a:* "+fact.razonSocial+"\nCUIT: "+fact.cuit+" · "+fact.condicion+"\n"+fact.domicilio):"";
  var ahora = fmtDateTime(new Date().toISOString());
  var msg="📋 *Orden "+orden.id+"*\n\n🏪 *"+(local?local.nombre:"")+"*\n📅 "+fmtDate(orden.fecha)+"\n⏱ Enviada: "+ahora+(orden.fechaEntrega?"\n🚚 Entrega: "+fmtDate(orden.fechaEntrega):"")+"\n\n🏬 *"+prov.nombre+"*\n"+itext+"\n\n💰 *Total: $"+tot.toFixed(2)+"*"+(orden.notas?"\n\n📝 "+orden.notas:"")+ftxt+"\n\n_(Adjunto PDF)_";
  async function dl(){setGen(true);try{var doc=await makePDF(orden,local,prov,items,fact);var n=orden.id+"_"+prov.nombre.replace(/\s+/g,"-")+".pdf";doc.save(n);setFname(n);setStep("abrir");}catch(e){alert("Error: "+e.message);}setGen(false);}
  function wa(){var num=cleanPhone(phone);if(!num){alert("Ingresá el número.");return;}window.open("https://wa.me/"+num+"?text="+encodeURIComponent(msg),"_blank");setStep("done");}
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.92)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(500px,95vw)",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"15px 20px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:2}}>Enviando a</div><h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:17}}>📲 {prov.nombre}</h2></div>
          <button onClick={p.onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"15px 20px"}}>
          <div style={{background:"#0F0F0F",borderRadius:10,padding:"9px 12px",marginBottom:13}}>
            <div style={{fontSize:12,color:"#666",marginBottom:5}}>{items.length} productos · <span style={{color:"#C1440E",fontWeight:700}}>${tot.toFixed(2)}</span></div>
            {items.map(function(it,i){return <div key={i} style={{fontSize:11,color:"#888",padding:"2px 0"}}>• {it.nombre} — {it.cantidad} {it.unidad}</div>;})}
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>WhatsApp del proveedor</label>
            <input placeholder="5491123456789" value={phone} onChange={function(e){setPhone(e.target.value);}} style={INP}/>
            <div style={{fontSize:10,color:"#444",marginTop:3}}>Ej: 5491123456789</div>
          </div>
          {step==="preview"&&<div><div style={{background:"#0F0F0F",border:"1px solid #1E1E1E",borderRadius:10,padding:"9px 12px",fontSize:11,color:"#666",lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:120,overflowY:"auto",marginBottom:12}}>{msg}</div><button onClick={dl} disabled={gen} style={{...BS("#25D366"),width:"100%",padding:"11px",fontSize:13}}>{gen?"⏳ Generando...":"📥 Descargar PDF"}</button></div>}
          {step==="abrir"&&<div><div style={{background:"#0A1A0A",border:"1px solid #1A3A1A",borderRadius:10,padding:"10px 13px",marginBottom:12}}><div style={{fontSize:12,color:"#3A7D44",fontWeight:700,marginBottom:3}}>✅ {fname}</div><div style={{fontSize:11,color:"#555"}}>Adjuntá el PDF en WhatsApp con 📎</div></div><button onClick={wa} style={{...BS("#25D366"),width:"100%",padding:"11px",fontSize:13}}>💬 Abrir WhatsApp</button></div>}
          {step==="done"&&<div><div style={{background:"#0A0F1A",border:"1px solid #1A2A3A",borderRadius:10,padding:"10px 13px",marginBottom:12}}><div style={{fontSize:12,color:"#1A6B8A",fontWeight:700}}>🚀 WhatsApp abierto — adjuntá el PDF antes de enviar.</div></div><button onClick={function(){p.onMarkSent();p.onClose();}} style={{...BS("#1A6B8A"),width:"100%",padding:"11px",fontSize:13}}>✓ Marcar enviado</button></div>}
        </div>
      </div>
    </div>
  );
}

// ─── PANEL DESPACHO ───────────────────────────────────────────────────────────
function PanelDespacho(p) {
  var ordenes=p.ordenes, proveedores=p.proveedores, onUpdate=p.onUpdate;
  var [modal,setModal]=useState(null);
  var [sent,setSent]=useState([]);

  var pendientes=ordenes.filter(function(o){return o.status==="pendiente"||o.status==="borrador";});

  // Agrupar por proveedor
  var byProv={};
  pendientes.forEach(function(orden){
    var local=getLocal(orden.local);
    var fact=orden.facturacion?getFact(orden.facturacion):null;
    (orden.provSections||[]).forEach(function(sec){
      var prov=proveedores.find(function(pr){return pr.id===sec.provId;});
      if(!prov||sec.items.length===0)return;
      if(!byProv[sec.provId])byProv[sec.provId]={prov:prov,entries:[]};
      byProv[sec.provId].entries.push({orden:orden,local:local,fact:fact,items:sec.items});
    });
  });

  var provKeys=Object.keys(byProv);

  if(pendientes.length===0){
    return (
      <div style={{textAlign:"center",padding:"50px 20px"}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#3A7D44",marginBottom:6}}>Todo despachado</div>
        <div style={{fontSize:13,color:"#444"}}>No hay órdenes pendientes de envío</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{fontSize:11,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>
        {pendientes.length} orden{pendientes.length!==1?"es":""} pendiente{pendientes.length!==1?"s":""} · {provKeys.length} proveedor{provKeys.length!==1?"es":""}
      </div>

      {provKeys.map(function(pid){
        var group=byProv[pid];
        var prov=group.prov;
        var entries=group.entries;
        var totProv=entries.reduce(function(a,e){return a+e.items.reduce(function(b,i){return b+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);
        return (
          <div key={pid} style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
            {/* Header proveedor */}
            <div style={{padding:"12px 16px",background:"#151515",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700}}>{prov.nombre}</div>
                <div style={{fontSize:11,color:"#555",marginTop:2}}>{prov.categoria} · {entries.length} local{entries.length!==1?"es":""} · <span style={{color:"#C1440E",fontWeight:700}}>${totProv.toFixed(2)}</span></div>
              </div>
              {prov.whatsapp&&<div style={{fontSize:11,color:"#25D366"}}>📱 WSP</div>}
            </div>

            {/* Entradas por local */}
            {entries.map(function(entry,idx){
              var key=entry.orden.id+"_"+pid;
              var isSent=sent.includes(key);
              var secTot=entry.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
              return (
                <div key={idx} style={{padding:"11px 16px",borderTop:"1px solid #1A1A1A",display:"flex",alignItems:"flex-start",gap:12,background:isSent?"#0A140A":"transparent"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,fontWeight:700,color:entry.local?entry.local.color:"#888"}}>{entry.local?entry.local.emoji:""} {entry.local?entry.local.nombre:""}</span>
                      <span style={{fontSize:10,color:"#555"}}>· {entry.orden.id}</span>
                      {entry.orden.emisor&&<span style={{fontSize:11,color:"#D4A017",fontWeight:700}}>· 👤 {entry.orden.emisor}{entry.orden.seccion?" · "+entry.orden.seccion:""}</span>}
                      {entry.orden.createdAt&&<span style={{fontSize:10,color:"#444"}}>· ⏱ {fmtDateTime(entry.orden.createdAt)}</span>}
                      <SBadge status={entry.orden.status}/>
                      {isSent&&<span style={{fontSize:11,color:"#3A7D44",fontWeight:700}}>✓ Enviado</span>}
                    </div>
                    {entry.fact&&<div style={{fontSize:10,color:"#D4A017",marginBottom:4}}>🧾 {entry.fact.razonSocial}</div>}
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {entry.items.map(function(item,i){return <span key={i} style={{fontSize:10,color:"#777",background:"#0F0F0F",padding:"2px 7px",borderRadius:10,border:"1px solid #1E1E1E"}}>{item.nombre} {item.cantidad}{item.unidad}</span>;})}
                    </div>
                    {secTot>0&&<div style={{fontSize:11,color:"#666",marginTop:5}}>Subtotal: <span style={{color:"#F0EDE8",fontWeight:600}}>${secTot.toFixed(2)}</span></div>}
                  </div>
                  <button onClick={function(){setModal({orden:entry.orden,provEntry:{prov:prov,items:entry.items},local:entry.local,fact:entry.fact,key:key});}}
                    style={{...BS(isSent?"#1A2E1A":"#25D366"),padding:"7px 12px",fontSize:11,flexShrink:0}}>
                    {isSent?"✓ Reenviado":"📲 Enviar"}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {modal&&(
        <WspModal
          orden={modal.orden} local={modal.local} provEntry={modal.provEntry} fact={modal.fact}
          onClose={function(){setModal(null);}}
          onMarkSent={function(){setSent(function(s){return [...s,modal.key];});onUpdate(modal.orden.id,{status:"enviada"});}}
        />
      )}
    </div>
  );
}

// ─── NUEVA ORDEN ──────────────────────────────────────────────────────────────
function NuevaOrden(p) {
  var hoy=new Date().toISOString().split("T")[0];
  var [orden,setOrden]=useState({local:p.localFijo||"",fecha:hoy,fechaEntrega:"",notas:"",facturacion:"",provSections:[]});
  var [step,setStep]=useState(1);
  var [actProv,setActProv]=useState(null);
  var [ni,setNi]=useState({producto:"",cantidad:"",unidad:"kg",precio:""});
  var [cp,setCp]=useState("");
  var local=getLocal(orden.local);
  var lc=local?local.color:"#C1440E";
  var precios=p.precios||{};
  var provsDisponibles = orden.local ? p.proveedores.filter(function(pv){ return !pv.locales || pv.locales.includes(orden.local); }) : p.proveedores;
  function getPrecio(provId, prod){ return precios[provId+"_"+prod]||""; }
  var tot=orden.provSections.reduce(function(a,s){return a+s.items.reduce(function(b,i){return b+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);
  var has=orden.provSections.some(function(s){return s.items.length>0;});

  function togProv(pid){
    var ex=orden.provSections.find(function(s){return s.provId===pid;});
    if(ex){
      // Solo deseleccionar si no tiene items, sino confirmar
      if(ex.items.length>0){
        if(!window.confirm("Este proveedor tiene productos cargados. ¿Quitarlo de la orden?"))return;
      }
      setOrden(function(o){return{...o,provSections:o.provSections.filter(function(s){return s.provId!==pid;})};});
      if(actProv===pid)setActProv(null);
    } else {
      setOrden(function(o){return{...o,provSections:[...o.provSections,{provId:pid,items:[]}]};});
      setActProv(pid);
      setNi({producto:"",cantidad:"",unidad:"kg",precio:""});
      setCp("");
    }
  }
  function selectProv(pid){
    setActProv(pid);
    setNi({producto:"",cantidad:"",unidad:"kg",precio:""});
    setCp("");
  }
  function addItem(){
    var nombre=ni.producto==="__custom__"?cp:ni.producto;
    if(!nombre||!ni.cantidad||!actProv)return;
    var it={id:Date.now(),nombre:nombre,cantidad:ni.cantidad,unidad:ni.unidad,precio:ni.precio};
    setOrden(function(o){return{...o,provSections:o.provSections.map(function(s){return s.provId===actProv?{...s,items:[...s.items,it]}:s;})};});
    setNi({producto:"",cantidad:"",unidad:"kg",precio:""});setCp("");
  }
  function remItem(pid,id){setOrden(function(o){return{...o,provSections:o.provSections.map(function(s){return s.provId===pid?{...s,items:s.items.filter(function(i){return i.id!==id;})}:s;})};});}
  function doSave(status){
    var vs=orden.provSections.filter(function(s){return s.items.length>0;});
    if(!orden.local||vs.length===0)return;
    p.onSave({...orden,provSections:vs,id:genOC(orden.local),status:status,createdAt:new Date().toISOString()});
    p.onClose();
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(10,10,10,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
      <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:16,width:"min(760px,97vw)",maxHeight:"94vh",overflowY:"auto",padding:24,color:"#F0EDE8",fontFamily:"'Lora',serif"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div><div style={{fontSize:10,color:"#444",letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Nueva Orden</div><h2 style={{margin:0,fontSize:18,fontFamily:"'Playfair Display',serif"}}>{step===1?"Configuración":"Proveedores y Productos"}</h2></div>
          <button onClick={p.onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:18}}>{[1,2].map(function(s){return <div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?"#C1440E":"#1E1E1E"}}/>;})}</div>

        {step===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>Local</label>
              {p.localFijo?(
                <div style={{padding:"12px 15px",borderRadius:10,border:"2px solid "+lc,background:lc+"22",color:lc,fontSize:14,fontWeight:700}}>{local?local.emoji:""} {local?local.nombre:""}</div>
              ):(
                <div style={{display:"flex",gap:6}}>
                  {LOCALES.map(function(l){return(
                    <button key={l.id} onClick={function(){setOrden(function(o){return{...o,local:l.id};});}} style={{flex:1,padding:"10px 5px",borderRadius:10,border:"2px solid "+(orden.local===l.id?l.color:"#1E1E1E"),background:orden.local===l.id?l.color+"22":"#0F0F0F",color:orden.local===l.id?l.color:"#555",cursor:"pointer",fontFamily:"'Lora',serif",fontSize:11,fontWeight:600}}>
                      <div style={{fontSize:17}}>{l.emoji}</div><div style={{marginTop:3}}>{l.nombre}</div>
                    </button>
                  );})}
                </div>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Fecha Orden</label><input type="date" value={orden.fecha} onChange={function(e){setOrden(function(o){return{...o,fecha:e.target.value};});}} style={INP}/></div>
              <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Fecha Entrega</label><input type="date" value={orden.fechaEntrega} onChange={function(e){setOrden(function(o){return{...o,fechaEntrega:e.target.value};});}} style={INP}/></div>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>Facturar a <span style={{color:"#444"}}>(opcional)</span></label>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {FACTURACION.map(function(f){return(
                  <button key={f.id} onClick={function(){setOrden(function(o){return{...o,facturacion:o.facturacion===f.id?"":f.id};});}} style={{padding:"10px 13px",borderRadius:8,border:"2px solid "+(orden.facturacion===f.id?"#D4A017":"#1E1E1E"),background:orden.facturacion===f.id?"#D4A01711":"#0F0F0F",color:orden.facturacion===f.id?"#F0EDE8":"#666",cursor:"pointer",fontFamily:"'Lora',serif",textAlign:"left"}}>
                    <div style={{fontSize:13,fontWeight:700,color:orden.facturacion===f.id?"#D4A017":"#999"}}>{f.razonSocial}</div>
                    <div style={{fontSize:11,color:"#555",marginTop:2}}>CUIT {f.cuit} · {f.condicion}</div>
                    <div style={{fontSize:10,color:"#444",marginTop:1}}>{f.domicilio}</div>
                  </button>
                );})}
              </div>
            </div>
            <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Notas</label><textarea value={orden.notas} onChange={function(e){setOrden(function(o){return{...o,notas:e.target.value};});}} rows={2} placeholder="Indicaciones..." style={{...INP,resize:"vertical"}}/></div>
            <button onClick={function(){setStep(2);}} disabled={!orden.local} style={{...BS(!orden.local?"#1A1A1A":"#C1440E",!orden.local?"#333":"#fff"),padding:"11px",fontSize:13,cursor:!orden.local?"not-allowed":"pointer"}}>Siguiente → Proveedores y Productos</button>
          </div>
        )}

        {step===2&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#0F0F0F",borderRadius:9,padding:"8px 12px",fontSize:12,color:"#555",display:"flex",gap:12,flexWrap:"wrap"}}>
              <span>{local?local.emoji:""} <strong style={{color:"#F0EDE8"}}>{local?local.nombre:""}</strong></span>
              <span>📅 {fmtDate(orden.fecha)}</span>
              {orden.facturacion&&<span style={{color:"#D4A017"}}>🧾 {getFact(orden.facturacion)?getFact(orden.facturacion).razonSocial:""}</span>}
            </div>

            <div>
              <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>
                Tocá un proveedor para cargar productos
              </label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {provsDisponibles.map(function(pv){
                  var sec=orden.provSections.find(function(s){return s.provId===pv.id;});
                  var cnt=sec?sec.items.length:0;
                  var st=sec?sec.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0):0;
                  return(
                    <button key={pv.id} onClick={function(){setActProv(pv.id);setNi({producto:"",cantidad:"",unidad:"kg",precio:""});setCp("");}}
                      style={{padding:"11px 10px",borderRadius:10,border:"2px solid "+(cnt>0?"#C1440E":"#1E1E1E"),background:cnt>0?"#C1440E11":"#0F0F0F",color:cnt>0?"#F0EDE8":"#777",cursor:"pointer",fontFamily:"'Lora',serif",textAlign:"left",position:"relative",transition:"all 0.2s"}}>
                      <div style={{fontSize:13,fontWeight:700}}>{pv.nombre}</div>
                      <div style={{fontSize:10,color:"#555",marginTop:2}}>{pv.categoria}</div>
                      {cnt>0&&(
                        <div style={{marginTop:5,fontSize:11,color:"#C1440E",fontWeight:600}}>{cnt} productos · ${st.toFixed(2)}</div>
                      )}
                      {cnt>0&&<div style={{position:"absolute",top:6,right:8,background:"#C1440E",color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px"}}>{cnt}</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MODAL PROVEEDOR */}
            {actProv&&(function(){
              var pv=p.proveedores.find(function(x){return x.id===actProv;});
              var prods=p.productos[actProv]||[];
              var sec=orden.provSections.find(function(s){return s.provId===actProv;})||{items:[]};
              var st=sec.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
              return(
                <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
                  <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(640px,96vw)",maxHeight:"90vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
                    {/* Header */}
                    <div style={{padding:"16px 20px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,background:"#151515"}}>
                      <div>
                        <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:2,marginBottom:3}}>Cargando productos para</div>
                        <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:20}}>{pv?pv.nombre:""}</h2>
                        <div style={{fontSize:11,color:"#555",marginTop:2}}>{pv?pv.categoria:""}</div>
                      </div>
                      <button onClick={function(){
                        // Remove section if empty, keep if has items
                        var hasSec=orden.provSections.find(function(s){return s.provId===actProv;});
                        if(hasSec&&hasSec.items.length===0){
                          setOrden(function(o){return{...o,provSections:o.provSections.filter(function(s){return s.provId!==actProv;})};});
                        }
                        setActProv(null);
                      }} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:15}}>✕</button>
                    </div>

                    {/* Add item */}
                    <div style={{padding:"14px 20px",borderBottom:"1px solid #1E1E1E",background:"#0F0F0F",flexShrink:0}}>
                      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:7,alignItems:"end"}}>
                        <div>
                          <label style={{fontSize:10,color:"#444",display:"block",marginBottom:4}}>Producto</label>
                          <select value={ni.producto} onChange={function(e){var prod=e.target.value;var precio=getPrecio(actProv,prod);setNi(function(n){return{...n,producto:prod,precio:precio};});}} style={INP}>
                            <option value="">Seleccionar...</option>
                            {prods.map(function(pr){return <option key={pr} value={pr}>{pr}</option>;})}
                            <option value="__custom__">+ Otro</option>
                          </select>
                          {ni.producto==="__custom__"&&<input placeholder="Escribir producto..." value={cp} onChange={function(e){setCp(e.target.value);}} style={{...INP,marginTop:5}}/>}
                        </div>
                        <div><label style={{fontSize:10,color:"#444",display:"block",marginBottom:4}}>Cant.</label><input type="number" placeholder="0" value={ni.cantidad} onChange={function(e){setNi(function(n){return{...n,cantidad:e.target.value};});}} style={INP}/></div>
                        <div><label style={{fontSize:10,color:"#444",display:"block",marginBottom:4}}>Unidad</label><select value={ni.unidad} onChange={function(e){setNi(function(n){return{...n,unidad:e.target.value};});}} style={INP}>{UNIDADES.map(function(u){return <option key={u}>{u}</option>;})}</select></div>
                        <div><label style={{fontSize:10,color:"#444",display:"block",marginBottom:4}}>$ Unit.</label><input type="number" placeholder="0.00" value={ni.precio} onChange={function(e){setNi(function(n){return{...n,precio:e.target.value};});}} style={INP}/></div>
                        <button onClick={function(){
                          var nombre=ni.producto==="__custom__"?cp:ni.producto;
                          if(!nombre||!ni.cantidad)return;
                          var it={id:Date.now(),nombre:nombre,cantidad:ni.cantidad,unidad:ni.unidad,precio:ni.precio};
                          var hasSec=orden.provSections.find(function(s){return s.provId===actProv;});
                          if(hasSec){
                            setOrden(function(o){return{...o,provSections:o.provSections.map(function(s){return s.provId===actProv?{...s,items:[...s.items,it]}:s;})};});
                          } else {
                            setOrden(function(o){return{...o,provSections:[...o.provSections,{provId:actProv,items:[it]}]};});
                          }
                          setNi({producto:"",cantidad:"",unidad:"kg",precio:""});setCp("");
                        }} style={{...BS("#C1440E"),padding:"9px 12px",height:37,flexShrink:0}}>+</button>
                      </div>
                    </div>

                    {/* Items list */}
                    <div style={{overflowY:"auto",flex:1,padding:"12px 20px"}}>
                      {sec.items.length===0?(
                        <div style={{textAlign:"center",padding:"30px 0",color:"#333"}}>
                          <div style={{fontSize:28,marginBottom:8}}>📦</div>
                          <div style={{fontSize:13}}>Agregá productos arriba</div>
                        </div>
                      ):(
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                          <thead>
                            <tr style={{color:"#444",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>
                              <th style={{textAlign:"left",padding:"5px 4px"}}>Producto</th>
                              <th style={{textAlign:"right",padding:"5px 4px"}}>Cant.</th>
                              <th style={{textAlign:"left",padding:"5px 4px"}}>Ud.</th>
                              <th style={{textAlign:"right",padding:"5px 4px"}}>Subtotal</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sec.items.map(function(item){return(
                              <tr key={item.id} style={{borderTop:"1px solid #1A1A1A"}}>
                                <td style={{padding:"9px 4px",color:"#F0EDE8",fontWeight:500}}>{item.nombre}</td>
                                <td style={{padding:"9px 4px",textAlign:"right",color:"#D4A017",fontWeight:600}}>{item.cantidad}</td>
                                <td style={{padding:"9px 4px",color:"#555"}}>{item.unidad}</td>
                                <td style={{padding:"9px 4px",textAlign:"right",color:"#888"}}>${(parseFloat(item.cantidad)*parseFloat(item.precio||0)).toFixed(2)}</td>
                                <td style={{padding:"9px 4px"}}><button onClick={function(){remItem(actProv,item.id);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:15}}>✕</button></td>
                              </tr>
                            );})}
                            <tr style={{borderTop:"2px solid #222"}}>
                              <td colSpan={3} style={{padding:"10px 4px",textAlign:"right",color:"#555",fontSize:11,textTransform:"uppercase"}}>Total proveedor</td>
                              <td style={{padding:"10px 4px",textAlign:"right",color:"#C1440E",fontWeight:800,fontSize:15}}>${st.toFixed(2)}</td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Footer */}
                    <div style={{padding:"13px 20px",borderTop:"1px solid #1E1E1E",flexShrink:0}}>
                      <button onClick={function(){
                        var hasSec=orden.provSections.find(function(s){return s.provId===actProv;});
                        if(hasSec&&hasSec.items.length===0){
                          setOrden(function(o){return{...o,provSections:o.provSections.filter(function(s){return s.provId!==actProv;})};});
                        }
                        setActProv(null);
                      }} style={{...BS("#C1440E"),width:"100%",padding:"12px",fontSize:14}}>
                        ✓ Listo — volver a proveedores
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* RESUMEN FINAL */}
            {has&&(
              <div style={{background:"#0F0F0F",borderRadius:12,border:"1px solid #C1440E33",overflow:"hidden"}}>
                <div style={{padding:"10px 14px",background:"#150A0A",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:11,color:"#C1440E",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>📋 Resumen de la orden</div>
                  <div style={{fontSize:16,fontWeight:800,color:"#C1440E",fontFamily:"'Playfair Display',serif"}}>${tot.toFixed(2)}</div>
                </div>
                {orden.provSections.filter(function(s){return s.items.length>0;}).map(function(sec){
                  var pv=p.proveedores.find(function(x){return x.id===sec.provId;});
                  var st=sec.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
                  return(
                    <div key={sec.provId} style={{padding:"9px 14px",borderTop:"1px solid #1A1A1A"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontSize:12,fontWeight:700,color:"#F0EDE8"}}>{pv?pv.nombre:""}</div>
                        <div style={{fontSize:12,color:"#C1440E",fontWeight:600}}>${st.toFixed(2)}</div>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                        {sec.items.map(function(item,i){return <span key={i} style={{fontSize:10,color:"#888",background:"#141414",padding:"2px 7px",borderRadius:10,border:"1px solid #1E1E1E"}}>{item.nombre} {item.cantidad}{item.unidad}</span>;})}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{display:"flex",gap:6}}>
              <button onClick={function(){setStep(1);}} style={GH}>← Atrás</button>
              <button onClick={function(){doSave("borrador");}} disabled={!has} style={{...BS(!has?"#1A1A1A":"#1E1E1E",!has?"#444":"#CCC"),flex:1,cursor:!has?"not-allowed":"pointer",border:"1px solid #333"}}>Borrador</button>
              <button onClick={function(){doSave("pendiente");}} disabled={!has} style={{...BS(!has?"#1A1A1A":"#C1440E",!has?"#444":"#fff"),flex:2,cursor:!has?"not-allowed":"pointer"}}>✓ Emitir Orden</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ORDEN CARD ───────────────────────────────────────────────────────────────


// CONFIRMAR ENTREGA MODAL
function ConfirmarEntregaModal(p) {
  var orden=p.orden, proveedores=p.proveedores, onClose=p.onClose, onConfirm=p.onConfirm;
  // Build list of all items across all provSections
  var todosItems = [];
  (orden.provSections||[]).forEach(function(sec){
    var pv = proveedores.find(function(x){return x.id===sec.provId;});
    sec.items.forEach(function(item){
      todosItems.push({...item, provNombre: pv?pv.nombre:"", provId: sec.provId});
    });
  });
  var [faltantes, setFaltantes] = useState([]);

  function toggleFaltante(itemId) {
    setFaltantes(function(prev){
      return prev.includes(itemId) ? prev.filter(function(x){return x!==itemId;}) : [...prev, itemId];
    });
  }

  function doConfirm() {
    var itemsFaltantes = todosItems.filter(function(i){return faltantes.includes(i.id);});
    onConfirm(itemsFaltantes);
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.9)",zIndex:350,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(520px,95vw)",maxHeight:"90vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:2}}>Confirmar entrega</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:17}}>📦 {orden.id}</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"14px 20px",background:"#0F0F0F",flexShrink:0}}>
          <div style={{fontSize:12,color:"#888"}}>Marcá los productos que <strong style={{color:"#C1440E"}}>NO llegaron</strong> para agregarlos como faltantes pendientes.</div>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"12px 20px"}}>
          {todosItems.map(function(item){
            var isFaltante = faltantes.includes(item.id);
            return(
              <div key={item.id} onClick={function(){toggleFaltante(item.id);}}
                style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",marginBottom:6,borderRadius:10,border:"1px solid "+(isFaltante?"#C1440E44":"#1E1E1E"),background:isFaltante?"#1A0808":"#0F0F0F",cursor:"pointer",transition:"all 0.2s"}}>
                <div style={{width:20,height:20,borderRadius:5,border:"2px solid "+(isFaltante?"#C1440E":"#444"),background:isFaltante?"#C1440E":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12}}>
                  {isFaltante?"✕":""}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:isFaltante?"#C1440E":"#F0EDE8",fontWeight:isFaltante?700:400}}>{item.nombre}</div>
                  <div style={{fontSize:10,color:"#555"}}>{item.provNombre} · {item.cantidad} {item.unidad}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{padding:"13px 20px",borderTop:"1px solid #1E1E1E",flexShrink:0}}>
          {faltantes.length>0&&<div style={{fontSize:12,color:"#C1440E",marginBottom:10,textAlign:"center"}}>⚠️ {faltantes.length} producto{faltantes.length!==1?"s":""} marcado{faltantes.length!==1?"s":""} como faltante{faltantes.length!==1?"s":""}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{...GH,flex:1}}>Cancelar</button>
            <button onClick={doConfirm} style={{...BS("#3A7D44"),flex:2}}>✓ Confirmar entrega</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// EDIT ORDEN MODAL
function EditOrdenModal(p) {
  var orden=p.orden, proveedores=p.proveedores, onClose=p.onClose, onSave=p.onSave;
  var [notas,setNotas]=useState(orden.notas||"");
  var [facturacion,setFacturacion]=useState(orden.facturacion||"");
  var [fechaEntrega,setFechaEntrega]=useState(orden.fechaEntrega||"");
  var [status,setStatus]=useState(orden.status);

  function doSave(){
    onSave({...orden, notas:notas, facturacion:facturacion, fechaEntrega:fechaEntrega, status:status});
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.9)",zIndex:350,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(500px,95vw)",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:2}}>Editando</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:17}}>✏️ {orden.id}</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:13}}>
          <div>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Estado</label>
            <select value={status} onChange={function(e){setStatus(e.target.value);}} style={INP}>
              <option value="borrador">Borrador</option>
              <option value="pendiente">Pendiente</option>
              <option value="enviada">Enviada</option>
              <option value="confirmada">Confirmada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Fecha de Entrega</label>
            <input type="date" value={fechaEntrega} onChange={function(e){setFechaEntrega(e.target.value);}} style={INP}/>
          </div>
          <div>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Facturar a</label>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <button onClick={function(){setFacturacion(facturacion==="f1"?"":"f1");}} style={{padding:"9px 12px",borderRadius:8,border:"2px solid "+(facturacion==="f1"?"#D4A017":"#1E1E1E"),background:facturacion==="f1"?"#D4A01711":"#0F0F0F",color:facturacion==="f1"?"#D4A017":"#666",cursor:"pointer",fontFamily:"'Lora',serif",textAlign:"left"}}>
                <div style={{fontSize:12,fontWeight:700}}>Calzon Gitano SRL</div>
                <div style={{fontSize:10,color:"#555"}}>CUIT 30-71844629-1</div>
              </button>
              <button onClick={function(){setFacturacion(facturacion==="f2"?"":"f2");}} style={{padding:"9px 12px",borderRadius:8,border:"2px solid "+(facturacion==="f2"?"#D4A017":"#1E1E1E"),background:facturacion==="f2"?"#D4A01711":"#0F0F0F",color:facturacion==="f2"?"#D4A017":"#666",cursor:"pointer",fontFamily:"'Lora',serif",textAlign:"left"}}>
                <div style={{fontSize:12,fontWeight:700}}>Colantonio Carlos Nicolas</div>
                <div style={{fontSize:10,color:"#555"}}>CUIT 20-26958479-4</div>
              </button>
            </div>
          </div>
          <div>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Notas</label>
            <textarea value={notas} onChange={function(e){setNotas(e.target.value);}} rows={3} placeholder="Notas adicionales..." style={{...INP,resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{...GH,flex:1}}>Cancelar</button>
            <button onClick={doSave} style={{...BS("#3A7D44"),flex:2}}>✓ Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// WSP COMPLETO - un solo PDF con todos los proveedores
function WspCompletoModal(p) {
  var orden=p.orden, local=p.local, proveedores=p.proveedores, fact=p.fact;
  var [step,setStep]=useState("preview");
  var [phone,setPhone]=useState("542932595986");
  var [gen,setGen]=useState(false);
  var [fname,setFname]=useState("");

  var totalOrden=(orden.provSections||[]).reduce(function(a,s){return a+s.items.reduce(function(b,i){return b+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);
  var ahora=fmtDateTime(new Date().toISOString());

  // Build message with all providers
  var detalle=(orden.provSections||[]).map(function(sec){
    var pv=proveedores.find(function(x){return x.id===sec.provId;});
    var itemsTxt=sec.items.map(function(i){return "  • "+i.nombre+": "+i.cantidad+" "+i.unidad;}).join("\n");
    return "🏬 *"+(pv?pv.nombre:"?")+":*\n"+itemsTxt;
  }).join("\n\n");

  var factText=fact?"\n\n🧾 *Facturar a:* "+fact.razonSocial+"\nCUIT: "+fact.cuit+" · "+fact.condicion:"";
  var msg="📋 *Orden "+orden.id+"*\n\n🏪 *"+(local?local.nombre:"")+"*\n📅 "+fmtDate(orden.fecha)+"\n⏱ "+ahora+(orden.fechaEntrega?"\n🚚 Entrega: "+fmtDate(orden.fechaEntrega):"")+
    "\n\n"+detalle+
    "\n\n💰 *Total: $"+totalOrden.toFixed(2)+"*"+
    (orden.notas?"\n\n📝 "+orden.notas:"")+factText+
    "\n\n_(Adjunto PDF completo)_";

  async function doDescargar(){
    setGen(true);
    try{
      var doc=await makePDFCompleto(orden,local,proveedores,fact);
      var n=orden.id+"_completo.pdf";
      doc.save(n);setFname(n);setStep("abrir");
    }catch(e){alert("Error: "+e.message);}
    setGen(false);
  }
  function doAbrir(){
    var num=phone.replace(/\D/g,"");
    if(!num){alert("Ingresá el número.");return;}
    window.open("https://wa.me/"+num+"?text="+encodeURIComponent(msg),"_blank");
    setStep("done");
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.92)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(500px,95vw)",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"15px 20px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:2}}>Orden completa</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:17}}>📲 Enviar por WhatsApp</h2>
          </div>
          <button onClick={p.onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"15px 20px"}}>
          <div style={{background:"#0F0F0F",borderRadius:10,padding:"10px 13px",marginBottom:13}}>
            <div style={{fontSize:12,color:"#666",marginBottom:5}}>{(orden.provSections||[]).length} proveedores · <span style={{color:"#C1440E",fontWeight:700}}>${totalOrden.toFixed(2)}</span></div>
            {(orden.provSections||[]).map(function(sec){
              var pv=proveedores.find(function(x){return x.id===sec.provId;});
              var st=sec.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
              return <div key={sec.provId} style={{fontSize:11,color:"#888",padding:"2px 0"}}>• {pv?pv.nombre:"?"} — {sec.items.length} productos · ${st.toFixed(2)}</div>;
            })}
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Número WhatsApp</label>
            <input placeholder="542932595986" value={phone} onChange={function(e){setPhone(e.target.value);}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
          </div>
          {step==="preview"&&<button onClick={doDescargar} disabled={gen} style={{background:"#25D366",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%",padding:"12px"}}>{gen?"⏳ Generando PDF...":"📥 Descargar PDF completo"}</button>}
          {step==="abrir"&&(
            <div>
              <div style={{background:"#0A1A0A",border:"1px solid #1A3A1A",borderRadius:10,padding:"10px 13px",marginBottom:12}}>
                <div style={{fontSize:12,color:"#3A7D44",fontWeight:700,marginBottom:3}}>✅ {fname}</div>
                <div style={{fontSize:11,color:"#555"}}>Adjuntá el PDF en WhatsApp con 📎</div>
              </div>
              <button onClick={doAbrir} style={{background:"#25D366",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%",padding:"12px"}}>💬 Abrir WhatsApp</button>
            </div>
          )}
          {step==="done"&&(
            <div>
              <div style={{background:"#0A0F1A",border:"1px solid #1A2A3A",borderRadius:10,padding:"10px 13px",marginBottom:12}}>
                <div style={{fontSize:12,color:"#1A6B8A",fontWeight:700}}>🚀 WhatsApp abierto — adjuntá el PDF antes de enviar.</div>
              </div>
              <button onClick={function(){p.onMarkSent();p.onClose();}} style={{background:"#1A6B8A",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%",padding:"12px"}}>✓ Marcar como Enviada</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrdenCard(p) {
  var orden=p.orden, proveedores=p.proveedores, onUpdate=p.onUpdate, onDelete=p.onDelete, esAdmin=p.esAdmin;
  var local=getLocal(orden.local), bc=local?local.color:"#444";
  var [open,setOpen]=useState(false), [wsp,setWsp]=useState(null), [wspCompleto,setWspCompleto]=useState(false), [sent,setSent]=useState([]), [editMode,setEditMode]=useState(false), [confirmarModal,setConfirmarModal]=useState(false);
  var tot=(orden.provSections||[]).reduce(function(a,s){return a+s.items.reduce(function(b,i){return b+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);
  var fact=orden.facturacion?getFact(orden.facturacion):null;
  var NS={borrador:"pendiente",pendiente:"enviada",enviada:"confirmada"};
  var NL={borrador:"Emitir",pendiente:"Marcar Enviada",enviada:"Confirmar Recepción"};
  return(
    <div>
      {editMode&&<EditOrdenModal orden={orden} proveedores={proveedores} onClose={function(){setEditMode(false);}} onSave={function(o){sbPatch(o.id,{notas:o.notas,facturacion:o.facturacion,fecha_entrega:o.fechaEntrega,status:o.status});onUpdate(o.id,o);setEditMode(false);}}/>}
      {confirmarModal&&<ConfirmarEntregaModal orden={orden} proveedores={proveedores} onClose={function(){setConfirmarModal(false);}} onConfirm={function(itemsFaltantes){
        onUpdate(orden.id,{status:"confirmada"});
        sbPatch(orden.id,{status:"confirmada"});
        if(itemsFaltantes.length>0){
          itemsFaltantes.forEach(function(item){
            var f = {id: String(Date.now())+"_"+item.id, producto: item.nombre, proveedor: item.provNombre, prov_id: item.provId, cantidad: item.cantidad, unidad: item.unidad, orden_id: orden.id, local: orden.local, created_at: new Date().toISOString()};
            sbSaveFaltante(f);
          });
        }
        setConfirmarModal(false);
        if(itemsFaltantes.length>0) alert("✓ Entrega confirmada. Se guardaron "+itemsFaltantes.length+" faltante(s) para el próximo pedido.");
        else alert("✓ Entrega confirmada. Todo llegó correctamente.");
      }}/>}
      <div style={{background:"#111",border:"1px solid "+(open?bc+"44":"#1A1A1A"),borderRadius:12,overflow:"hidden",transition:"border-color 0.3s"}}>
        <div onClick={function(){setOpen(function(o){return !o;});}} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:4,height:36,background:bc,borderRadius:2,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700}}>{orden.id}</span>
              <SBadge status={orden.status}/>
              {fact&&<span style={{fontSize:10,color:"#D4A017",border:"1px solid #D4A01744",borderRadius:4,padding:"1px 6px"}}>🧾</span>}
            </div>
            <div style={{fontSize:11,color:"#444"}}>
              <span style={{color:bc,fontWeight:600}}>{local?local.emoji:""} {local?local.nombre:""}</span>
              {orden.seccion&&<span style={{margin:"0 4px",color:"#666"}}>· {orden.seccion}</span>}
              <span style={{margin:"0 4px"}}>·</span>
              <span>{(orden.provSections||[]).length} proveedores</span>
            </div>
            {orden.emisor&&<div style={{fontSize:10,color:"#555"}}>por {orden.emisor}</div>}
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:14,fontWeight:800,fontFamily:"'Playfair Display',serif"}}>${tot.toFixed(2)}</div>
            <div style={{fontSize:10,color:"#333"}}>{fmtDate(orden.fecha)}</div>
            {orden.createdAt&&<div style={{fontSize:10,color:"#444"}}>⏱ {fmtDateTime(orden.createdAt)}</div>}
          </div>
          <div style={{color:"#333",fontSize:11}}>{open?"▴":"▾"}</div>
        </div>
        {open&&(
          <div style={{borderTop:"1px solid #181818",padding:"11px 14px"}}>
            {(orden.provSections||[]).map(function(sec){
              var pv=proveedores.find(function(pr){return pr.id===sec.provId;});
              var st=sec.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
              var isSent=sent.includes(sec.provId);
              return(
                <div key={sec.provId} style={{marginBottom:9,background:"#0A0A0A",borderRadius:10,padding:"9px 12px",border:"1px solid "+(isSent?"#3A7D4444":"#1A1A1A")}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div><div style={{fontSize:12,fontWeight:700,color:isSent?"#3A7D44":"#F0EDE8"}}>{pv?pv.nombre:"?"} {isSent?"✓":""}</div><div style={{fontSize:10,color:"#555"}}>{sec.items.length} productos · ${st.toFixed(2)}</div></div>
                    <button onClick={function(){setWsp({prov:pv,items:sec.items});}} style={{...BS("#25D366"),padding:"5px 10px",fontSize:11}}>📲 Enviar</button>
                  </div>
                  {sec.items.map(function(item){return <div key={item.id} style={{fontSize:11,color:"#777",padding:"2px 0",borderBottom:"1px solid #141414"}}>{item.nombre} — <span style={{color:"#D4A017"}}>{item.cantidad} {item.unidad}</span></div>;})}
                </div>
              );
            })}
            {orden.notas&&<div style={{fontSize:11,color:"#444",fontStyle:"italic",marginBottom:9}}>📝 {orden.notas}</div>}
            {fact&&<div style={{fontSize:11,color:"#D4A017",marginBottom:9}}>🧾 {fact.razonSocial} · CUIT {fact.cuit}</div>}
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <button onClick={function(){setWspCompleto(true);}} style={{background:"#25D366",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:11,fontWeight:700,cursor:"pointer",padding:"6px 11px"}}>📲 Enviar por WhatsApp</button>
              {NS[orden.status]&&<button onClick={function(){
  if(orden.status==="enviada" && esAdmin){
    setConfirmarModal(true);
  } else {
    onUpdate(orden.id,{status:NS[orden.status]});
  }
}} style={{...BS("#C1440E"),padding:"6px 10px",fontSize:11}}>{NL[orden.status]}</button>}
              {!["cancelada","confirmada"].includes(orden.status)&&<button onClick={function(){onUpdate(orden.id,{status:"cancelada"});}} style={{...GH,padding:"6px 10px",fontSize:11}}>Cancelar</button>}
              {esAdmin&&<button onClick={function(){setEditMode(true);setOpen(false);}} style={{...GH,padding:"6px 10px",fontSize:11,color:"#D4A017",borderColor:"#D4A01744"}}>✏️ Editar</button>}
              {esAdmin&&<button onClick={function(){onDelete(orden.id);}} style={{...GH,padding:"6px 10px",fontSize:11,color:"#C1440E",borderColor:"#C1440E44"}}>🗑️ Eliminar</button>}

            </div>
          </div>
        )}
      </div>
      {wsp&&<WspModal orden={orden} local={local} provEntry={wsp} fact={fact} onClose={function(){setWsp(null);}} onMarkSent={function(){setSent(function(s){return [...s,wsp.prov.id];});onUpdate(orden.id,{status:"enviada"});}}/>}
      {wspCompleto&&<WspCompletoModal orden={orden} local={local} proveedores={p.proveedores} fact={fact} onClose={function(){setWspCompleto(false);}} onMarkSent={function(){onUpdate(orden.id,{status:"enviada"});}}/>}
    </div>
  );
}

// ─── GESTIÓN USUARIOS ─────────────────────────────────────────────────────────
function GestUsuarios(p) {
  var [lista,setLista]=useState(p.users), [nuevo,setNuevo]=useState({nombre:"",usuario:"",password:"",local:"l1",rol:"usuario"}), [showAdd,setShowAdd]=useState(false), [editando,setEditando]=useState(null), [err,setErr]=useState("");
  function doAdd(){if(!nuevo.nombre.trim()||!nuevo.usuario.trim()||!nuevo.password.trim()){setErr("Completá todos los campos.");return;}if(lista.find(function(u){return u.usuario===nuevo.usuario.trim();})){setErr("Ese usuario ya existe.");return;}setLista(function(l){return[...l,{id:genUser(),...nuevo}];});setNuevo({nombre:"",usuario:"",password:"",local:"l1",rol:"usuario"});setShowAdd(false);setErr("");}
  function doDel(id){var t=lista.find(function(u){return u.id===id;});if(t&&t.rol==="admin"&&lista.filter(function(u){return u.rol==="admin";}).length===1){alert("Debe haber al menos un administrador.");return;}setLista(function(l){return l.filter(function(u){return u.id!==id;});});}
  function doEdit(){setLista(function(l){return l.map(function(u){return u.id===editando.id?editando:u;});});setEditando(null);}
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.9)",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(600px,96vw)",maxHeight:"90vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"17px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19}}>👥 Usuarios</h2>
          <div style={{display:"flex",gap:8}}><button onClick={function(){p.onSave(lista);}} style={{...BS("#3A7D44"),fontSize:12}}>✓ Guardar</button><button onClick={p.onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button></div>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"14px 22px"}}>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:11}}><button onClick={function(){setShowAdd(function(v){return !v;});}} style={{...BS("#C1440E"),padding:"7px 13px",fontSize:12}}>+ Nuevo</button></div>
          {showAdd&&(
            <div style={{background:"#0F0F0F",border:"1px solid #222",borderRadius:12,padding:14,marginBottom:13}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
                <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Nombre</label><input value={nuevo.nombre} onChange={function(e){setNuevo(function(n){return{...n,nombre:e.target.value};});}} style={INP}/></div>
                <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Usuario</label><input value={nuevo.usuario} onChange={function(e){setNuevo(function(n){return{...n,usuario:e.target.value.toLowerCase()};});}} style={INP}/></div>
                <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Contraseña</label><input value={nuevo.password} onChange={function(e){setNuevo(function(n){return{...n,password:e.target.value};});}} style={INP}/></div>
                <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Rol</label><select value={nuevo.rol} onChange={function(e){setNuevo(function(n){return{...n,rol:e.target.value,local:e.target.value==="admin"?null:(n.local||"l1")};});}} style={INP}><option value="usuario">Usuario</option><option value="admin">Admin</option></select></div>
              </div>
              {nuevo.rol!=="admin"&&<div style={{marginBottom:9}}><label style={{fontSize:10,color:"#555",display:"block",marginBottom:6}}>Local</label><div style={{display:"flex",gap:5}}>{LOCALES.map(function(l){return <button key={l.id} onClick={function(){setNuevo(function(n){return{...n,local:l.id};});}} style={{flex:1,padding:"7px 3px",borderRadius:8,border:"2px solid "+(nuevo.local===l.id?l.color:"#222"),background:nuevo.local===l.id?l.color+"22":"#111",color:nuevo.local===l.id?l.color:"#555",cursor:"pointer",fontFamily:"'Lora',serif",fontSize:10,fontWeight:600}}>{l.emoji} {l.nombre}</button>;})}</div></div>}
              {err&&<div style={{fontSize:12,color:"#C1440E",marginBottom:7}}>⚠️ {err}</div>}
              <div style={{display:"flex",gap:7}}><button onClick={doAdd} style={{...BS("#C1440E"),flex:1}}>Crear</button><button onClick={function(){setShowAdd(false);setErr("");}} style={{...GH,flex:1}}>Cancelar</button></div>
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {lista.map(function(u){
              var loc=getLocal(u.local), lc=loc?loc.color:"#C1440E", ll=loc?(loc.emoji+" "+loc.nombre):"Admin global";
              if(editando&&editando.id===u.id)return(
                <div key={u.id} style={{background:"#0F0F0F",border:"1px solid #333",borderRadius:12,padding:13}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
                    <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Nombre</label><input value={editando.nombre} onChange={function(e){setEditando(function(n){return{...n,nombre:e.target.value};});}} style={INP}/></div>
                    <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Usuario</label><input value={editando.usuario} onChange={function(e){setEditando(function(n){return{...n,usuario:e.target.value};});}} style={INP}/></div>
                    <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Contraseña</label><input value={editando.password} onChange={function(e){setEditando(function(n){return{...n,password:e.target.value};});}} style={INP}/></div>
                    <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Rol</label><select value={editando.rol} onChange={function(e){setEditando(function(n){return{...n,rol:e.target.value,local:e.target.value==="admin"?null:(n.local||"l1")};});}} style={INP}><option value="usuario">Usuario</option><option value="admin">Admin</option></select></div>
                  </div>
                  {editando.rol!=="admin"&&<div style={{marginBottom:9}}><label style={{fontSize:10,color:"#555",display:"block",marginBottom:6}}>Local</label><div style={{display:"flex",gap:5}}>{LOCALES.map(function(l){return <button key={l.id} onClick={function(){setEditando(function(n){return{...n,local:l.id};});}} style={{flex:1,padding:"6px 3px",borderRadius:8,border:"2px solid "+(editando.local===l.id?l.color:"#222"),background:editando.local===l.id?l.color+"22":"#111",color:editando.local===l.id?l.color:"#555",cursor:"pointer",fontFamily:"'Lora',serif",fontSize:10,fontWeight:600}}>{l.emoji} {l.nombre}</button>;})}</div></div>}
                  <div style={{display:"flex",gap:7}}><button onClick={doEdit} style={{...BS("#3A7D44"),flex:1,padding:"8px"}}>Guardar</button><button onClick={function(){setEditando(null);}} style={{...GH,flex:1,padding:"8px"}}>Cancelar</button></div>
                </div>
              );
              return(
                <div key={u.id} style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:9}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:(u.rol==="admin"?"#C1440E":lc)+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{u.rol==="admin"?"👑":"👤"}</div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{u.nombre}</div><div style={{fontSize:11,color:"#555",marginTop:2}}>@{u.usuario} <span style={{marginLeft:5,color:lc}}>· {ll}</span></div></div>
                  <div style={{display:"flex",gap:5}}><button onClick={function(){setEditando({...u});}} style={{...GH,padding:"5px 8px",fontSize:12}}>✏️</button><button onClick={function(){doDel(u.id);}} style={{...GH,padding:"5px 8px",fontSize:12,color:"#C1440E",borderColor:"#C1440E33"}}>🗑️</button></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}



// GESTIÓN DE PRECIOS - solo admins
function GestPreciosModal(p) {
  var proveedores=p.proveedores, productos=p.productos, precios=p.precios, onClose=p.onClose, onSave=p.onSave;
  var [prs,setPrs]=useState(precios);
  var [sel,setSel]=useState(null);

  function setPrice(provId, prod, val) {
    var key = provId + "_" + prod;
    setPrs(function(prev){ var n={...prev}; n[key]=val; return n; });
  }
  function getPrice(provId, prod) {
    var key = provId + "_" + prod;
    return prs[key]||"";
  }

  var selProv = proveedores.find(function(x){return x.id===sel;})||null;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(820px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"17px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:10,color:"#444",letterSpacing:3,textTransform:"uppercase"}}>Administración</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19}}>💲 Lista de Precios</h2>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){onSave(prs);}} style={{...BS("#3A7D44"),fontSize:12}}>✓ Guardar</button>
            <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          <div style={{width:250,borderRight:"1px solid #1A1A1A",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"9px 11px",borderBottom:"1px solid #1A1A1A"}}><span style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase"}}>Proveedor</span></div>
            <div style={{overflowY:"auto",flex:1}}>
              {proveedores.map(function(pv){
                var cnt = (productos[pv.id]||[]).filter(function(prod){ return getPrice(pv.id,prod)!==""; }).length;
                return(
                  <div key={pv.id} onClick={function(){setSel(pv.id);}} style={{padding:"10px 12px",borderBottom:"1px solid #161616",cursor:"pointer",background:sel===pv.id?"#1C1C1C":"transparent",borderLeft:"3px solid "+(sel===pv.id?"#D4A017":"transparent")}}>
                    <div style={{fontSize:12,fontWeight:600,color:sel===pv.id?"#F0EDE8":"#999"}}>{pv.nombre}</div>
                    <div style={{fontSize:10,color:cnt>0?"#D4A017":"#444"}}>{cnt>0?cnt+" precios cargados":"Sin precios"}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            {!sel?(
              <div style={{textAlign:"center",paddingTop:60,color:"#2A2A2A"}}>
                <div style={{fontSize:32,marginBottom:10}}>👈</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:"#333"}}>Seleccioná un proveedor</div>
              </div>
            ):(
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:5}}>{selProv?selProv.nombre:""}</div>
                <div style={{fontSize:11,color:"#555",marginBottom:14}}>Cargá el precio unitario de cada producto</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {(productos[sel]||[]).length===0?(
                    <div style={{fontSize:12,color:"#333",fontStyle:"italic"}}>Sin productos cargados.</div>
                  ):(productos[sel]||[]).map(function(prod,idx){
                    return(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 11px",background:"#0F0F0F",borderRadius:8,border:"1px solid #1A1A1A"}}>
                        <div style={{flex:1,fontSize:12,color:"#CCC"}}>{prod}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                          <span style={{fontSize:12,color:"#555"}}>$</span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={getPrice(sel,prod)}
                            onChange={function(e){setPrice(sel,prod,e.target.value);}}
                            style={{width:90,padding:"5px 8px",borderRadius:6,border:"1px solid "+(getPrice(sel,prod)?"#D4A017":"#2A2A2A"),background:"#141414",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,textAlign:"right"}}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// MIS PRODUCTOS - para usuarios normales
function MisProductosModal(p) {
  var proveedores=p.proveedores, productos=p.productos, onClose=p.onClose, onSave=p.onSave;
  var [prods,setProds]=useState(productos);
  var [sel,setSel]=useState(null);
  var [newProd,setNewProd]=useState("");

  function addProd(){if(!newProd.trim()||!sel)return;setProds(function(a){var n={...a};n[sel]=[...(n[sel]||[]),newProd.trim()];return n;});setNewProd("");}
  function delProd(pid,prod){setProds(function(a){var n={...a};n[pid]=n[pid].filter(function(x){return x!==prod;});return n;});}
  var selProv=proveedores.find(function(x){return x.id===sel;})||null;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(820px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"17px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19}}>📦 Mis Productos</h2>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){onSave(prods);}} style={{...BS("#3A7D44"),fontSize:12}}>✓ Guardar</button>
            <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          <div style={{width:250,borderRight:"1px solid #1A1A1A",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"9px 11px",borderBottom:"1px solid #1A1A1A"}}><span style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase"}}>Seleccioná un proveedor</span></div>
            <div style={{overflowY:"auto",flex:1}}>
              {proveedores.map(function(pv){return(
                <div key={pv.id} onClick={function(){setSel(pv.id);}} style={{padding:"10px 12px",borderBottom:"1px solid #161616",cursor:"pointer",background:sel===pv.id?"#1C1C1C":"transparent",borderLeft:"3px solid "+(sel===pv.id?"#C1440E":"transparent")}}>
                  <div style={{fontSize:12,fontWeight:600,color:sel===pv.id?"#F0EDE8":"#999"}}>{pv.nombre}</div>
                  <div style={{fontSize:10,color:"#444"}}>{pv.categoria}</div>
                  <div style={{fontSize:10,color:"#333"}}>{(prods[pv.id]||[]).length} productos</div>
                </div>
              );})}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            {!sel?(
              <div style={{textAlign:"center",paddingTop:60,color:"#2A2A2A"}}>
                <div style={{fontSize:32,marginBottom:10}}>👈</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:"#333"}}>Seleccioná un proveedor</div>
              </div>
            ):(
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:14}}>{selProv?selProv.nombre:""}</div>
                <div style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:9}}>Productos ({(prods[sel]||[]).length})</div>
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  <input placeholder="Nuevo producto... (Enter)" value={newProd} onChange={function(e){setNewProd(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addProd();}} style={{...INP,flex:1}}/>
                  <button onClick={addProd} style={{...BS("#C1440E"),padding:"9px 12px",flexShrink:0}}>+</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(prods[sel]||[]).length===0
                    ?<div style={{fontSize:12,color:"#333",fontStyle:"italic",padding:"12px 0"}}>Sin productos.</div>
                    :(prods[sel]||[]).map(function(prod,idx){return(
                      <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 11px",background:"#0F0F0F",borderRadius:8,border:"1px solid #1A1A1A"}}>
                        <span style={{fontSize:12,color:"#BBB"}}>📦 {prod}</span>
                        <button onClick={function(){delProd(sel,prod);}} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:13}}>✕</button>
                      </div>
                    )})
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── GESTIÓN PROVEEDORES ──────────────────────────────────────────────────────
function GestProveedores(p) {
  var [provs,setProvs]=useState(p.proveedores), [prods,setProds]=useState(p.productos), [sel,setSel]=useState(null), [newP,setNewP]=useState({nombre:"",categoria:"Otro",compartido:true,whatsapp:""}), [newProd,setNewProd]=useState(""), [showAdd,setShowAdd]=useState(false), [ed,setEd]=useState(null);
  function addProv(){if(!newP.nombre.trim())return;var id=genProv();setProvs(function(a){return[...a,{id,...newP}];});setProds(function(a){var n={...a};n[id]=[];return n;});setNewP({nombre:"",categoria:"Otro",compartido:true,whatsapp:""});setShowAdd(false);setSel(id);}
  function delProv(id){setProvs(function(a){return a.filter(function(x){return x.id!==id;});});setProds(function(a){var n={...a};delete n[id];return n;});if(sel===id)setSel(null);}
  function addProd(){if(!newProd.trim()||!sel)return;setProds(function(a){var n={...a};n[sel]=[...(n[sel]||[]),newProd.trim()];return n;});setNewProd("");}
  function delProd(pid,prod){setProds(function(a){var n={...a};n[pid]=n[pid].filter(function(x){return x!==prod;});return n;});}
  function saveEd(){setProvs(function(a){return a.map(function(x){return x.id===ed.id?ed:x;});});setEd(null);}
  var sp=provs.find(function(x){return x.id===sel;})||null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(820px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"17px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19}}>Proveedores & Productos</h2>
          <div style={{display:"flex",gap:8}}><button onClick={function(){p.onSave(provs,prods);}} style={{...BS("#3A7D44"),fontSize:12}}>✓ Guardar</button><button onClick={p.onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button></div>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          <div style={{width:250,borderRight:"1px solid #1A1A1A",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"9px 11px",borderBottom:"1px solid #1A1A1A",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase"}}>Proveedores ({provs.length})</span>
              <button onClick={function(){setShowAdd(function(v){return !v;});}} style={{...BS("#C1440E"),padding:"4px 9px",fontSize:11}}>+ Nuevo</button>
            </div>
            {showAdd&&(
              <div style={{padding:"10px 11px",borderBottom:"1px solid #1A1A1A",background:"#0A0A0A"}}>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <input placeholder="Nombre" value={newP.nombre} onChange={function(e){setNewP(function(n){return{...n,nombre:e.target.value};});}} onKeyDown={function(e){if(e.key==="Enter")addProv();}} style={INP}/>
                  <select value={newP.categoria} onChange={function(e){setNewP(function(n){return{...n,categoria:e.target.value};});}} style={INP}>{CATEGORIAS.map(function(c){return <option key={c}>{c}</option>;})}</select>
                  <input placeholder="WhatsApp" value={newP.whatsapp} onChange={function(e){setNewP(function(n){return{...n,whatsapp:e.target.value};});}} style={INP}/>
                  <label style={{fontSize:11,color:"#666",display:"flex",gap:5,cursor:"pointer"}}><input type="checkbox" checked={newP.compartido} onChange={function(e){setNewP(function(n){return{...n,compartido:e.target.checked};});}}/> Compartido</label>
                  <div style={{display:"flex",gap:5}}><button onClick={addProv} style={{...BS("#C1440E"),flex:1,padding:"6px"}}>Agregar</button><button onClick={function(){setShowAdd(false);}} style={{...GH,flex:1,padding:"6px"}}>✕</button></div>
                </div>
              </div>
            )}
            <div style={{overflowY:"auto",flex:1}}>
              {provs.map(function(pv){return(
                <div key={pv.id} onClick={function(){setSel(pv.id);setEd(null);}} style={{padding:"9px 11px",borderBottom:"1px solid #161616",cursor:"pointer",background:sel===pv.id?"#1C1C1C":"transparent",borderLeft:"3px solid "+(sel===pv.id?"#C1440E":"transparent")}}>
                  <div style={{fontSize:12,fontWeight:600,color:sel===pv.id?"#F0EDE8":"#999"}}>{pv.nombre}</div>
                  <div style={{fontSize:10,color:"#444"}}>{pv.categoria}{pv.whatsapp?" · 📱":""}</div>
                  <div style={{fontSize:10,color:"#333"}}>{(prods[pv.id]||[]).length} productos</div>
                </div>
              );})}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            {!sel?(<div style={{textAlign:"center",paddingTop:60,color:"#2A2A2A"}}><div style={{fontSize:32,marginBottom:10}}>👈</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:"#333"}}>Seleccioná un proveedor</div></div>):(
              <div>
                <div style={{background:"#0F0F0F",borderRadius:12,padding:13,marginBottom:15,border:"1px solid #1E1E1E"}}>
                  {ed?(
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      <input value={ed.nombre} onChange={function(e){setEd(function(n){return{...n,nombre:e.target.value};});}} style={INP}/>
                      <select value={ed.categoria} onChange={function(e){setEd(function(n){return{...n,categoria:e.target.value};});}} style={INP}>{CATEGORIAS.map(function(c){return <option key={c}>{c}</option>;})}</select>
                      <input placeholder="WhatsApp" value={ed.whatsapp||""} onChange={function(e){setEd(function(n){return{...n,whatsapp:e.target.value};});}} style={INP}/>
                      <label style={{fontSize:11,color:"#666",display:"flex",gap:5,cursor:"pointer"}}><input type="checkbox" checked={ed.compartido} onChange={function(e){setEd(function(n){return{...n,compartido:e.target.checked};});}}/> Compartido</label>
                      <div style={{display:"flex",gap:7}}><button onClick={saveEd} style={{...BS("#3A7D44"),flex:1}}>Guardar</button><button onClick={function(){setEd(null);}} style={{...GH,flex:1}}>Cancelar</button></div>
                    </div>
                  ):(
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700}}>{sp?sp.nombre:""}</div><div style={{fontSize:12,color:"#555",marginTop:3}}>{sp?sp.categoria:""}{sp&&sp.compartido?" · Compartido":""}</div>{sp&&sp.whatsapp&&<div style={{fontSize:11,color:"#25D366",marginTop:3}}>📱 {sp.whatsapp}</div>}</div>
                      <div style={{display:"flex",gap:5}}><button onClick={function(){setEd(sp);}} style={{...GH,padding:"5px 9px",fontSize:11}}>✏️</button><button onClick={function(){delProv(sel);}} style={{...GH,padding:"5px 9px",fontSize:11,color:"#C1440E",borderColor:"#C1440E33"}}>🗑️</button></div>
                    </div>
                  )}
                </div>
                <div style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:9}}>Productos ({(prods[sel]||[]).length})</div>
                <div style={{display:"flex",gap:6,marginBottom:10}}><input placeholder="Nombre del producto... (Enter)" value={newProd} onChange={function(e){setNewProd(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addProd();}} style={{...INP,flex:1}}/><button onClick={addProd} style={{...BS("#C1440E"),padding:"9px 12px",flexShrink:0}}>+</button></div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(prods[sel]||[]).length===0?<div style={{fontSize:12,color:"#333",fontStyle:"italic",padding:"12px 0"}}>Sin productos.</div>:(prods[sel]||[]).map(function(prod,idx){return(
                    <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:"#0F0F0F",borderRadius:8,border:"1px solid #1A1A1A"}}>
                      <span style={{fontSize:12,color:"#BBB"}}>📦 {prod}</span>
                      <button onClick={function(){delProd(sel,prod);}} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:13}}>✕</button>
                    </div>
                  );})}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



// ─── EXPORTAR GASTOS ──────────────────────────────────────────────────────────
var WSP_ADMIN = [
  { nombre: "Administración 1", numero: "542932595986" },
  { nombre: "Administración 2", numero: "542915730836" },
  { nombre: "Administración 3", numero: "5492932497380" },
];

function ExportarGastosModal(p) {
  var gastos=p.gastos, onClose=p.onClose;
  var hoy=new Date().toISOString().split("T")[0];
  var primerDiaMes=hoy.slice(0,8)+"01";
  var [filtroTipo,setFiltroTipo]=useState("todos");
  var [filtroLocal,setFiltroLocal]=useState("todos");
  var [fechaDesde,setFechaDesde]=useState(primerDiaMes);
  var [fechaHasta,setFechaHasta]=useState(hoy);
  var [wspSel,setWspSel]=useState(null);
  var [gen,setGen]=useState(false);
  var [excelBlob,setExcelBlob]=useState(null);
  var [excelNombre,setExcelNombre]=useState("");

  var TIPOS=["todos","Proveedores","Personal","Servicios","Impuestos","Mantenimiento","Marketing","Limpieza","Otro"];

  var filtered=gastos.filter(function(g){
    var matchFecha=(!fechaDesde||g.fecha>=fechaDesde)&&(!fechaHasta||g.fecha<=fechaHasta);
    var matchTipo=filtroTipo==="todos"||g.categoria.startsWith(filtroTipo);
    var matchLocal=filtroLocal==="todos"||g.local===filtroLocal;
    return matchFecha&&matchTipo&&matchLocal;
  });

  var totalFiltered=filtered.reduce(function(a,g){return a+parseFloat(g.monto||0);},0);

  async function generarExcel(){
    setGen(true);
    try {
      // Load SheetJS
      if(!window.XLSX){
        await new Promise(function(res,rej){
          var s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          s.onload=res;s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      var XLSX=window.XLSX;
      var wb=XLSX.utils.book_new();
      var rows=[["Fecha","Local","Concepto","Categoría","Forma de Pago","Monto","Facturado","Facturación","Notas","Usuario"]];
      filtered.forEach(function(g){
        var loc=LOCALES.find(function(l){return l.id===g.local;});
        var fact=g.facturado&&g.facturacion?FACTURACION.find(function(f){return f.id===g.facturacion;}):null;
        rows.push([
          g.fecha||"",
          loc?loc.nombre:"",
          g.concepto||"",
          g.categoria||"",
          g.forma_pago||"",
          parseFloat(g.monto||0),
          g.facturado?"Sí":"No",
          fact?fact.razonSocial+" - CUIT "+fact.cuit:"",
          g.notas||"",
          g.usuario||""
        ]);
      });
      // Total row
      rows.push(["","","","","TOTAL",totalFiltered,"","","",""]);
      var ws=XLSX.utils.aoa_to_sheet(rows);
      // Column widths
      ws["!cols"]=[{wch:12},{wch:18},{wch:25},{wch:25},{wch:18},{wch:14},{wch:10},{wch:35},{wch:25},{wch:12}];
      XLSX.utils.book_append_sheet(wb,ws,"Gastos");
      var nombre="Gastos_NKT_"+fechaDesde+"_"+fechaHasta+".xlsx";
      XLSX.writeFile(wb,nombre);
      setExcelNombre(nombre);
      setExcelBlob(true);
    } catch(e){ alert("Error: "+e.message); }
    setGen(false);
  }

  function abrirWsp(wsp){
    var loc=filtroLocal==="todos"?"Todos los locales":(LOCALES.find(function(l){return l.id===filtroLocal;})||{nombre:filtroLocal}).nombre;
    var msg="📊 *Reporte de Gastos - Gestión Grupo NKT*\n\n📅 Período: "+fmtDate(fechaDesde)+" al "+fmtDate(fechaHasta)+"\n🏪 Local: "+loc+"\n🏷️ Tipo: "+filtroTipo+"\n📋 "+filtered.length+" gastos\n💰 *Total: $"+totalFiltered.toLocaleString("es-AR")+"*\n\n_(Adjunto el Excel con el detalle completo)_";
    window.open("https://wa.me/"+wsp.numero+"?text="+encodeURIComponent(msg),"_blank");
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.92)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(560px,95vw)",maxHeight:"90vh",overflowY:"auto",color:"#F0EDE8",fontFamily:"'Lora',serif"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:2}}>Exportar</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:17}}>📊 Gastos a Excel</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:13}}>
          {/* Fechas */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Desde</label><input type="date" value={fechaDesde} onChange={function(e){setFechaDesde(e.target.value);}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/></div>
            <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Hasta</label><input type="date" value={fechaHasta} onChange={function(e){setFechaHasta(e.target.value);}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/></div>
          </div>
          {/* Tipo */}
          <div>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:7}}>Tipo de gasto</label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {TIPOS.map(function(t){return(
                <button key={t} onClick={function(){setFiltroTipo(t);}}
                  style={{padding:"5px 11px",borderRadius:20,border:"1px solid "+(filtroTipo===t?"#1A6B8A":"#1E1E1E"),background:filtroTipo===t?"#1A6B8A22":"none",color:filtroTipo===t?"#1A6B8A":"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
                  {t==="todos"?"Todos":t}
                </button>
              );})}
            </div>
          </div>
          {/* Local */}
          <div>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:7}}>Local</label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <button onClick={function(){setFiltroLocal("todos");}} style={{padding:"5px 11px",borderRadius:20,border:"1px solid "+(filtroLocal==="todos"?"#555":"#1E1E1E"),background:filtroLocal==="todos"?"#222":"none",color:filtroLocal==="todos"?"#F0EDE8":"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>Todos</button>
              {LOCALES.map(function(l){return(
                <button key={l.id} onClick={function(){setFiltroLocal(l.id);}}
                  style={{padding:"5px 11px",borderRadius:20,border:"1px solid "+(filtroLocal===l.id?l.color:"#1E1E1E"),background:filtroLocal===l.id?l.color+"22":"none",color:filtroLocal===l.id?l.color:"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
                  {l.emoji} {l.nombre}
                </button>
              );})}
            </div>
          </div>
          {/* Resumen */}
          <div style={{background:"#0F0F0F",borderRadius:10,padding:"10px 13px",border:"1px solid #1A6B8A33"}}>
            <div style={{fontSize:12,color:"#555",marginBottom:4}}>{filtered.length} gastos seleccionados</div>
            <div style={{fontSize:18,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#1A6B8A"}}>${totalFiltered.toLocaleString("es-AR")}</div>
          </div>
          {/* Generar Excel */}
          <button onClick={generarExcel} disabled={gen||filtered.length===0} style={{background:filtered.length===0?"#1A1A1A":"#3A7D44",border:"none",borderRadius:8,color:filtered.length===0?"#444":"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:filtered.length===0?"not-allowed":"pointer",padding:"12px"}}>
            {gen?"⏳ Generando...":"📥 Descargar Excel"}
          </button>
          {/* Enviar por WSP */}
          {excelBlob&&(
            <div>
              <div style={{background:"#0A1A0A",border:"1px solid #1A3A1A",borderRadius:10,padding:"10px 13px",marginBottom:10}}>
                <div style={{fontSize:12,color:"#3A7D44",fontWeight:700,marginBottom:3}}>✅ {excelNombre}</div>
                <div style={{fontSize:11,color:"#555"}}>Adjuntá el Excel en WhatsApp con 📎 antes de enviar.</div>
              </div>
              <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5,marginBottom:7}}>Enviar a:</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {WSP_ADMIN.map(function(wsp){return(
                  <button key={wsp.numero} onClick={function(){abrirWsp(wsp);}}
                    style={{background:"#25D366",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",padding:"10px",textAlign:"left"}}>
                    📲 {wsp.nombre} — +{wsp.numero}
                  </button>
                );})}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EDITOR CATEGORÍAS GASTOS ─────────────────────────────────────────────────
var GRUPOS_DEFAULT = ["Proveedores","Personal","Servicios","Impuestos","Mantenimiento","Marketing","Otros"];

function EditorCategoriasGastos(p) {
  var onClose=p.onClose, onSave=p.onSave;
  var [cats,setCats]=useState(p.categorias||[]);
  var [grupoSel,setGrupoSel]=useState(GRUPOS_DEFAULT[0]);
  var [nuevoNombre,setNuevoNombre]=useState("");
  var [nuevoGrupo,setNuevoGrupo]=useState("");
  var [showNuevoGrupo,setShowNuevoGrupo]=useState(false);

  var grupos=[...new Set([...GRUPOS_DEFAULT,...cats.map(function(c){return c.grupo;})])];
  var catsDelGrupo=cats.filter(function(c){return c.grupo===grupoSel;});

  function addCat(){
    if(!nuevoNombre.trim())return;
    var id=grupoSel+"_"+nuevoNombre.trim().replace(/\s+/g,"_")+"_"+Date.now();
    var newCat={id:id,grupo:grupoSel,nombre:nuevoNombre.trim()};
    setCats(function(p){return[...p,newCat];});
    sbSaveCategoriaGasto(id,grupoSel,nuevoNombre.trim());
    setNuevoNombre("");
  }

  function delCat(id){
    setCats(function(p){return p.filter(function(c){return c.id!==id;});});
    sbDeleteCategoriaGasto(id);
  }

  function addGrupo(){
    if(!nuevoGrupo.trim())return;
    setGrupoSel(nuevoGrupo.trim());
    setShowNuevoGrupo(false);
    setNuevoGrupo("");
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(760px,96vw)",maxHeight:"90vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        <div style={{padding:"17px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:10,color:"#444",letterSpacing:3,textTransform:"uppercase"}}>Administración</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19}}>🏷️ Editor de Categorías</h2>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){onSave(cats);onClose();}} style={{background:"#3A7D44",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer",padding:"8px 14px"}}>✓ Guardar</button>
            <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Grupos */}
          <div style={{width:220,borderRight:"1px solid #1A1A1A",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"10px 12px",borderBottom:"1px solid #1A1A1A",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase"}}>Grupos</span>
              <button onClick={function(){setShowNuevoGrupo(function(v){return !v;});}} style={{background:"#C1440E",border:"none",borderRadius:6,color:"#fff",fontFamily:"'Lora',serif",fontSize:11,fontWeight:700,cursor:"pointer",padding:"4px 9px"}}>+ Grupo</button>
            </div>
            {showNuevoGrupo&&(
              <div style={{padding:"8px 12px",borderBottom:"1px solid #1A1A1A",background:"#0A0A0A"}}>
                <input placeholder="Nombre del grupo..." value={nuevoGrupo} onChange={function(e){setNuevoGrupo(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addGrupo();}} style={{...{padding:"6px 9px",borderRadius:6,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,width:"100%",boxSizing:"border-box"},marginBottom:6}}/>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={addGrupo} style={{background:"#C1440E",border:"none",borderRadius:6,color:"#fff",fontFamily:"'Lora',serif",fontSize:11,fontWeight:700,cursor:"pointer",flex:1,padding:"5px"}}>Agregar</button>
                  <button onClick={function(){setShowNuevoGrupo(false);}} style={{background:"none",border:"1px solid #333",borderRadius:6,color:"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer",flex:1,padding:"5px"}}>✕</button>
                </div>
              </div>
            )}
            <div style={{overflowY:"auto",flex:1}}>
              {grupos.map(function(g){
                var cnt=cats.filter(function(c){return c.grupo===g;}).length;
                return(
                  <div key={g} onClick={function(){setGrupoSel(g);}}
                    style={{padding:"10px 12px",borderBottom:"1px solid #161616",cursor:"pointer",background:grupoSel===g?"#1C1C1C":"transparent",borderLeft:"3px solid "+(grupoSel===g?"#1A6B8A":"transparent")}}>
                    <div style={{fontSize:12,fontWeight:600,color:grupoSel===g?"#F0EDE8":"#999"}}>{g}</div>
                    <div style={{fontSize:10,color:"#444"}}>{cnt} subcategorías personalizadas</div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Categorías del grupo */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:14}}>{grupoSel}</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              <input placeholder="Nueva subcategoría... (Enter)" value={nuevoNombre} onChange={function(e){setNuevoNombre(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addCat();}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,flex:1}}/>
              <button onClick={addCat} style={{background:"#1A6B8A",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",padding:"9px 14px",flexShrink:0}}>+</button>
            </div>
            {catsDelGrupo.length===0?(
              <div style={{fontSize:12,color:"#333",fontStyle:"italic",padding:"14px 0"}}>Sin subcategorías personalizadas. Agregá la primera arriba.</div>
            ):catsDelGrupo.map(function(cat){
              return(
                <div key={cat.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 11px",background:"#0F0F0F",borderRadius:8,border:"1px solid #1A1A1A",marginBottom:5}}>
                  <span style={{fontSize:12,color:"#BBB"}}>🏷️ {cat.nombre}</span>
                  <button onClick={function(){delCat(cat.id);}} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:14}}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PANEL GASTOS ─────────────────────────────────────────────────────────────
function PanelGastos(p) {
  var gastos=p.gastos, onSave=p.onSave, onDelete=p.onDelete, usuario=p.usuario, categoriasCustom=p.categoriasCustom||[];
  var hoy=new Date().toISOString().split("T")[0];
  var [showForm,setShowForm]=useState(false);
  var [showExportar,setShowExportar]=useState(false);
  var [filtroLocal,setFiltroLocal]=useState("all");
  var [filtroFecha,setFiltroFecha]=useState("mes");
  var [mesFiltro,setMesFiltro]=useState(hoy.slice(0,7));
  var [vistaGrid,setVistaGrid]=useState(false);
  var [expandidoGrid,setExpandidoGrid]=useState(null);
  var mesesDisp=[...new Set(gastos.map(function(g){return g.fecha?g.fecha.substring(0,7):null;}).filter(Boolean))].sort().reverse();
  if(mesesDisp.indexOf(hoy.slice(0,7))===-1)mesesDisp.unshift(hoy.slice(0,7));
  var [form,setForm]=useState({local:"l1",concepto:"",monto:"",forma_pago:"Efectivo",subforma:"",facturado:false,facturacion:"",categoria:"Proveedores",notas:"",fecha:hoy});
  var FORMAS_PAGO=["Efectivo","Transferencia","Tarjeta de débito","Tarjeta de crédito","Cheque"];
  var SUBFORMAS={
    "Efectivo":["Efectivo El Bodegón Nkt","Efectivo Kusama","Efectivo Colantonio's"],
    "Transferencia":["Patagonia Personas","Patagonia Empresas","Galicia Empresas","Provincia Personas","Mercado Pago Nicolás","Mercado Pago Calzon Gitano"],
    "Tarjeta de débito":["Mastercard ML Calzon Gitano","Mastercard ML Nicolás","Visa Provincia Personas","Visa Patagonia Empresas","Visa Patagonia Personas"],
    "Tarjeta de crédito":["Mastercard Patagonia Personas","Visa Patagonia Personas"]
  };
  var CATS_DEFAULT=[
    "Proveedores - Carnicería","Proveedores - Verdulería","Proveedores - Pescadería",
    "Proveedores - Distribuidora","Proveedores - Papelera","Proveedores - Bebidas",
    "Proveedores - Especias","Proveedores - Insumos","Proveedores - Fiambrería",
    "Proveedores - Librería","Proveedores - Imprenta","Proveedores - Otro",
    "Personal - Sueldos","Personal - Jornales","Personal - Propinas",
    "Servicios - Luz","Servicios - Gas","Servicios - Internet","Servicios - Teléfono","Servicios - Otro",
    "Impuestos - AFIP","Impuestos - IIBB","Impuestos - Municipal","Impuestos - Otro",
    "Mantenimiento - Reparaciones","Mantenimiento - Equipamiento","Mantenimiento - Otro",
    "Marketing - Redes sociales","Marketing - Diseño","Marketing - Publicidad","Marketing - Otro",
    "Limpieza","Otro"
  ];
  var CATS_CUSTOM=categoriasCustom.map(function(c){return c.grupo+" - "+c.nombre;});
  var CATEGORIAS=[...CATS_DEFAULT,...CATS_CUSTOM.filter(function(c){return !CATS_DEFAULT.includes(c);})];
  var filtered=gastos.filter(function(g){
    var matchLocal=filtroLocal==="all"||g.local===filtroLocal;
    var matchFecha=true;
    if(filtroFecha==="hoy") matchFecha=g.fecha===hoy;
    if(filtroFecha==="semana"){var diff=(new Date()-new Date(g.fecha))/(1000*60*60*24);matchFecha=diff<=7;}
    if(filtroFecha==="mes") matchFecha=g.fecha&&g.fecha.slice(0,7)===mesFiltro;
    if(filtroFecha==="all") matchFecha=true;
    return matchLocal&&matchFecha;
  });
  var totalFiltered=filtered.reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
  var totalEfectivo=filtered.filter(function(g){return g.forma_pago==="Efectivo";}).reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
  var totalTransf=filtered.filter(function(g){return g.forma_pago==="Transferencia";}).reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
  var totalFact=filtered.filter(function(g){return g.facturado;}).reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
  var totalNoFact=filtered.filter(function(g){return !g.facturado;}).reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
  function doSave(){
    if(!form.concepto.trim()||!form.monto)return;
    var gasto={id:String(Date.now()),local:form.local,concepto:form.concepto.trim(),monto:parseFloat(form.monto),forma_pago:form.forma_pago+(form.subforma?" - "+form.subforma:""),facturado:form.facturado,facturacion:form.facturado?form.facturacion:"",categoria:form.categoria,notas:form.notas,fecha:form.fecha,usuario:usuario,created_at:new Date().toISOString()};
    onSave(gasto);
    setForm({local:"l1",concepto:"",monto:"",forma_pago:"Efectivo",subforma:"",facturado:false,facturacion:"",categoria:"Proveedores",notas:"",fecha:hoy});
    setShowForm(false);
  }
  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Módulo Administración</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>💰 Gastos Diarios</div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button onClick={function(){setShowExportar(true);}} style={{background:"#3A7D44",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",padding:"8px 14px"}}>📊 Excel</button>
          <button onClick={function(){setShowForm(function(v){return !v;});}} style={{background:"#1A6B8A",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",padding:"8px 16px"}}>+ Cargar</button>
        </div>
      </div>
      {showExportar&&<ExportarGastosModal gastos={gastos} onClose={function(){setShowExportar(false);}}/>}
      {showForm&&(
        <div style={{background:"#0F0F0F",border:"1px solid #1A6B8A44",borderRadius:14,padding:"18px",marginBottom:18}}>
          <div style={{fontSize:11,color:"#1A6B8A",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Nuevo gasto</div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>Local</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {LOCALES.map(function(l){return(<button key={l.id} onClick={function(){setForm(function(f){return{...f,local:l.id};});}} style={{padding:"7px 12px",borderRadius:8,border:"2px solid "+(form.local===l.id?l.color:"#1E1E1E"),background:form.local===l.id?l.color+"22":"#111",color:form.local===l.id?l.color:"#555",fontFamily:"'Lora',serif",fontSize:11,fontWeight:600,cursor:"pointer"}}>{l.emoji} {l.nombre}</button>);})}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:9,marginBottom:12}}>
            <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Concepto</label><input value={form.concepto} onChange={function(e){setForm(function(f){return{...f,concepto:e.target.value};});}} placeholder="Ej: Verdulería, Carnicería..." style={INP}/></div>
            <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Monto $</label><input type="number" value={form.monto} onChange={function(e){setForm(function(f){return{...f,monto:e.target.value};});}} placeholder="0.00" style={INP}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9,marginBottom:12}}>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Forma de pago</label>
              <select value={form.forma_pago} onChange={function(e){setForm(function(f){return{...f,forma_pago:e.target.value,subforma:""};});}} style={INP}>
                {FORMAS_PAGO.map(function(fp){return <option key={fp}>{fp}</option>;})}
              </select>
              {SUBFORMAS[form.forma_pago]&&(
                <select value={form.subforma} onChange={function(e){setForm(function(f){return{...f,subforma:e.target.value};});}} style={{...INP,marginTop:5,color:form.subforma?"#F0EDE8":"#555"}}>
                  <option value="">-- Seleccioná cuenta --</option>
                  {SUBFORMAS[form.forma_pago].map(function(sf){return <option key={sf}>{sf}</option>;})}
                </select>
              )}
            </div>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Categoría</label>
              <select value={CATEGORIAS.includes(form.categoria)?form.categoria:"__otro__"} onChange={function(e){if(e.target.value==="__otro__"){setForm(function(f){return{...f,categoria:""};});}else{setForm(function(f){return{...f,categoria:e.target.value};});}}} style={INP}>
                {CATEGORIAS.map(function(c){return <option key={c} value={c}>{c}</option>;})}
                <option value="__otro__">+ Escribir otra...</option>
              </select>
              {!CATEGORIAS.includes(form.categoria)&&<input value={form.categoria} onChange={function(e){setForm(function(f){return{...f,categoria:e.target.value};});}} placeholder="Escribí la categoría..." style={{...INP,marginTop:5}}/>}
            </div>
            <div><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Fecha</label><input type="date" value={form.fecha} onChange={function(e){setForm(function(f){return{...f,fecha:e.target.value};});}} style={INP}/></div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:"#555",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
              <input type="checkbox" checked={form.facturado} onChange={function(e){setForm(function(f){return{...f,facturado:e.target.checked};});}}/>
              <span style={{color:form.facturado?"#D4A017":"#555",fontWeight:form.facturado?700:400}}>Gasto facturado</span>
            </label>
          </div>
          {form.facturado&&(
            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:7}}>Facturar a</label>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {FACTURACION.map(function(f){return(<button key={f.id} onClick={function(){setForm(function(fm){return{...fm,facturacion:f.id};});}} style={{padding:"9px 13px",borderRadius:8,border:"2px solid "+(form.facturacion===f.id?"#D4A017":"#1E1E1E"),background:form.facturacion===f.id?"#D4A01711":"#0F0F0F",color:form.facturacion===f.id?"#D4A017":"#666",cursor:"pointer",fontFamily:"'Lora',serif",textAlign:"left"}}><div style={{fontSize:12,fontWeight:700}}>{f.razonSocial}</div><div style={{fontSize:10,color:"#555"}}>CUIT {f.cuit} · {f.condicion}</div></button>);})}
              </div>
            </div>
          )}
          <div style={{marginBottom:14}}><label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Notas</label><input value={form.notas} onChange={function(e){setForm(function(f){return{...f,notas:e.target.value};});}} placeholder="Observaciones..." style={INP}/></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={doSave} style={{background:"#1A6B8A",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",flex:2,padding:"11px"}}>✓ Guardar gasto</button>
            <button onClick={function(){setShowForm(false);}} style={{padding:"11px",borderRadius:8,border:"1px solid #2A2A2A",background:"none",color:"#888",fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",flex:1}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7,marginBottom:16}}>
        <div style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"11px 14px"}}><div style={{fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:4}}>Total período</div><div style={{fontSize:20,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#1A6B8A"}}>${totalFiltered.toLocaleString("es-AR")}</div><div style={{fontSize:10,color:"#444",marginTop:3}}>{filtered.length} gastos</div></div>
        <div style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"11px 14px"}}><div style={{fontSize:10,color:"#3A7D44",textTransform:"uppercase",marginBottom:4}}>Facturado</div><div style={{fontSize:16,fontWeight:800,color:"#3A7D44"}}>${totalFact.toLocaleString("es-AR")}</div><div style={{fontSize:10,color:"#C1440E",marginTop:3}}>Sin factura: ${totalNoFact.toLocaleString("es-AR")}</div></div>
        <div style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"11px 14px"}}><div style={{fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:4}}>Efectivo</div><div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>${totalEfectivo.toLocaleString("es-AR")}</div></div>
        <div style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"11px 14px"}}><div style={{fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:4}}>Transferencia</div><div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>${totalTransf.toLocaleString("es-AR")}</div></div>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:13,flexWrap:"wrap",alignItems:"center"}}>
        {[["hoy","Hoy"],["semana","7 días"],["mes","Mes"],["all","Todo"]].map(function(opt){return <button key={opt[0]} onClick={function(){setFiltroFecha(opt[0]);}} style={{padding:"4px 11px",borderRadius:20,border:"1px solid "+(filtroFecha===opt[0]?"#1A6B8A":"#1A1A1A"),background:filtroFecha===opt[0]?"#1A6B8A22":"none",color:filtroFecha===opt[0]?"#1A6B8A":"#444",fontSize:11,cursor:"pointer"}}>{opt[1]}</button>;})}
        {filtroFecha==="mes"&&(
          <select value={mesFiltro} onChange={function(e){setMesFiltro(e.target.value);}} style={{padding:"3px 8px",borderRadius:8,border:"1px solid #1A6B8A44",background:"#111",color:"#1A6B8A",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
            {mesesDisp.map(function(m){return <option key={m} value={m}>{m}</option>;})}
          </select>
        )}
        <div style={{width:1,height:16,background:"#222",margin:"0 4px"}}/>
        {LOCALES.map(function(l){return(<button key={l.id} onClick={function(){setFiltroLocal(filtroLocal===l.id?"all":l.id);}} style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(filtroLocal===l.id?l.color:"#1A1A1A"),background:filtroLocal===l.id?l.color+"22":"none",color:filtroLocal===l.id?l.color:"#444",fontSize:11,cursor:"pointer"}}>{l.emoji} {l.nombre}</button>);})}
        <button onClick={function(){setVistaGrid(true);}} style={{marginLeft:"auto",padding:"4px 12px",borderRadius:20,border:"1px solid #D4A01744",background:"#D4A01711",color:"#D4A017",fontSize:11,cursor:"pointer"}}>📊 Vista mensual</button>
      </div>
      {vistaGrid&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#0A0A0A",zIndex:999,overflowY:"auto",padding:"16px",fontFamily:"'Lora',serif"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>📊 Gastos por local · {filtroFecha==="hoy"?"Hoy":filtroFecha==="semana"?"7 días":filtroFecha==="mes"?"Este mes":"Todo"}</div>
            <button onClick={function(){setVistaGrid(false);}} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #333",background:"#111",color:"#F0EDE8",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif"}}>✕ Cerrar</button>
          </div>
          {/* Totales por local */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
            {LOCALES.filter(function(l){return l.id!=="l4";}).map(function(l){
              var gl=filtered.filter(function(g){return g.local===l.id;});
              var tot=gl.reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
              return(
                <div key={l.id} style={{background:"#111",border:"1px solid "+l.color+"55",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:13,color:l.color,fontWeight:700,marginBottom:4}}>{l.emoji} {l.nombre}</div>
                  <div style={{fontSize:20,fontWeight:800,color:l.color,fontFamily:"'Playfair Display',serif"}}>${tot.toLocaleString("es-AR")}</div>
                  <div style={{fontSize:10,color:"#444",marginTop:2}}>{gl.length} gasto{gl.length!==1?"s":""}</div>
                </div>
              );
            })}
          </div>
          {/* Grid 3 columnas */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,alignItems:"start"}}>
            {LOCALES.filter(function(l){return l.id!=="l4";}).map(function(l){
              var gl=filtered.filter(function(g){return g.local===l.id;}).sort(function(a,b){return (b.fecha||"").localeCompare(a.fecha||"");});
              var fact=gl.filter(function(g){return g.facturado;});
              var noFact=gl.filter(function(g){return !g.facturado;});
              // totales por forma de pago
              var medios={};
              gl.forEach(function(g){
                var fp=(g.forma_pago||"Otro").split(" - ")[0];
                medios[fp]=(medios[fp]||0)+parseFloat(g.monto||0);
              });
              // totales por categoría (grupo)
              var cats={};
              gl.forEach(function(g){
                var cat=(g.categoria||"Otro").split(" - ")[0];
                cats[cat]=(cats[cat]||0)+parseFloat(g.monto||0);
              });
              return(
                <div key={l.id} style={{background:"#0F0F0F",border:"1px solid "+l.color+"33",borderRadius:10,padding:"10px 12px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:l.color,marginBottom:8,borderBottom:"1px solid "+l.color+"22",paddingBottom:6}}>{l.emoji} {l.nombre}</div>
                  {gl.length===0?(
                    <div style={{fontSize:10,color:"#333",textAlign:"center",padding:"12px 0"}}>Sin gastos</div>
                  ):(
                    <div>
                      {/* Lista de gastos */}
                      <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:10}}>
                        {gl.map(function(g){
                          var gkey=l.id+"_gg_"+g.id;
                          var abierto=expandidoGrid===gkey;
                          var factObj=g.facturado&&g.facturacion?getFact(g.facturacion):null;
                          return(
                            <div key={g.id}>
                              <div onClick={function(){setExpandidoGrid(function(prev){return prev===gkey?null:gkey;});}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 4px",borderBottom:"1px solid #141414",cursor:"pointer"}}>
                                <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:0}}>
                                  <span style={{fontSize:9,color:"#444",flexShrink:0,transform:abierto?"rotate(90deg)":"none",display:"inline-block",transition:"transform 0.15s"}}>▶</span>
                                  <span style={{fontSize:10,color:"#F0EDE8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.concepto}</span>
                                </div>
                                <span style={{fontSize:11,fontWeight:700,color:l.color,fontFamily:"'Playfair Display',serif",flexShrink:0,marginLeft:4}}>${parseFloat(g.monto||0).toLocaleString("es-AR")}</span>
                              </div>
                              {abierto&&(
                                <div style={{background:"#080808",borderRadius:6,padding:"7px 10px",margin:"2px 0 3px 0"}}>
                                  <div style={{fontSize:10,color:"#555"}}>{fmtDate(g.fecha)} · {g.forma_pago}</div>
                                  <div style={{fontSize:10,color:"#444",marginTop:2}}>{g.categoria}</div>
                                  {factObj&&<div style={{fontSize:10,color:"#D4A017",marginTop:2}}>🧾 {factObj.razonSocial}</div>}
                                  {g.notas&&<div style={{fontSize:9,color:"#333",fontStyle:"italic",marginTop:3}}>📝 {g.notas}</div>}
                                  <div style={{fontSize:9,color:"#222",marginTop:3}}>{g.usuario}</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Totales por forma de pago */}
                      <div style={{borderTop:"1px solid "+l.color+"22",paddingTop:8,marginBottom:8}}>
                        <div style={{fontSize:9,color:"#444",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Por medio de pago</div>
                        {Object.keys(medios).map(function(mp){
                          return(
                            <div key={mp} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555",marginBottom:3}}>
                              <span>{mp}</span>
                              <span style={{color:"#F0EDE8",fontWeight:600}}>${medios[mp].toLocaleString("es-AR")}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Totales por categoría */}
                      <div style={{borderTop:"1px solid "+l.color+"22",paddingTop:8,marginBottom:8}}>
                        <div style={{fontSize:9,color:"#444",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Por categoría</div>
                        {Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];}).map(function(cat){
                          return(
                            <div key={cat} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555",marginBottom:3}}>
                              <span>{cat}</span>
                              <span style={{color:"#F0EDE8",fontWeight:600}}>${cats[cat].toLocaleString("es-AR")}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Facturado vs sin factura */}
                      <div style={{borderTop:"1px solid "+l.color+"22",paddingTop:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                          <span style={{color:"#3A7D44"}}>✅ Facturado</span>
                          <span style={{color:"#3A7D44",fontWeight:700}}>${fact.reduce(function(a,g){return a+parseFloat(g.monto||0);},0).toLocaleString("es-AR")}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
                          <span style={{color:"#C1440E"}}>⚠️ Sin factura</span>
                          <span style={{color:"#C1440E",fontWeight:700}}>${noFact.reduce(function(a,g){return a+parseFloat(g.monto||0);},0).toLocaleString("es-AR")}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:32,marginBottom:10}}>💰</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"#2E2E2E"}}>Sin gastos en este período</div></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(function(g){
            var loc=getLocal(g.local);
            var fact=g.facturado&&g.facturacion?getFact(g.facturacion):null;
            return(
              <div key={g.id} style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:12,padding:"12px 15px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#F0EDE8"}}>{g.concepto}</span>
                    <span style={{fontSize:10,background:g.facturado?"#3A7D4422":"#C1440E22",color:g.facturado?"#3A7D44":"#C1440E",border:"1px solid "+(g.facturado?"#3A7D4444":"#C1440E44"),borderRadius:4,padding:"1px 7px"}}>{g.facturado?"Facturado":"Sin factura"}</span>
                    {loc&&<span style={{fontSize:10,color:loc.color}}>{loc.emoji} {loc.nombre}</span>}
                  </div>
                  <div style={{fontSize:11,color:"#555"}}>{g.forma_pago} · {g.categoria} · {fmtDate(g.fecha)}{fact&&<span style={{color:"#D4A017"}}> · 🧾 {fact.razonSocial}</span>}</div>
                  {g.notas&&<div style={{fontSize:11,color:"#444",fontStyle:"italic",marginTop:3}}>📝 {g.notas}</div>}
                  <div style={{fontSize:10,color:"#333",marginTop:2}}>por {g.usuario} · {fmtDateTime(g.created_at)}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:16,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#F0EDE8"}}>${parseFloat(g.monto).toLocaleString("es-AR")}</div>
                  <button onClick={function(){if(window.confirm("¿Eliminar este gasto?"))onDelete(g.id);}} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:12,marginTop:4}}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── PANEL CIERRE DE CAJA ─────────────────────────────────────────────────────
var MEDIOS_POR_LOCAL={
  "l1":[
    "Efectivo","Efectivo - Bodegón","Efectivo - El Bodegón",
    "Transferencia - Provincia Personas","Transferencia - Mercado Pago Nicolás",
    "Tarjeta de débito - Visa Provincia Personas",
    "Tarjeta de crédito - Mastercard Patagonia Personas","Tarjeta de crédito - Visa Patagonia Personas",
    "Tarjeta de débito - Visa Patagonia Personas"
  ],
  "l2":[
    "Efectivo","Efectivo - Kusama",
    "Transferencia - Galicia Empresas"
  ],
  "l3":[
    "Efectivo","Efectivo - Colantonio's","Efectivo - Colantonios",
    "Transferencia - Patagonia Empresas","Transferencia - Mercado Pago Calzon Gitano"
  ]
};

function esMedioCorrecto(gasto){
  var localMedios=MEDIOS_POR_LOCAL[gasto.local];
  if(!localMedios)return true; // l4 no se controla
  var fp=(gasto.forma_pago||"").trim();
  // Efectivo sin subforma siempre OK
  if(fp==="Efectivo")return true;
  return localMedios.some(function(m){return fp===m||fp.startsWith(m);});
}

function PanelCruzados(p){
  var gastos=p.gastos;
  var [mesFiltro,setMesFiltro]=useState(new Date().toISOString().slice(0,7));
  var [soloProblemas,setSoloProblemas]=useState(true);

  var mesesDisp=[...new Set(gastos.map(function(g){return g.fecha?g.fecha.substring(0,7):null;}).filter(Boolean))].sort().reverse();

  var gastosFiltrados=gastos.filter(function(g){
    if(!g.fecha||g.fecha.substring(0,7)!==mesFiltro)return false;
    if(g.local==="l4")return false;
    if(soloProblemas)return !esMedioCorrecto(g);
    return true;
  }).sort(function(a,b){return b.fecha.localeCompare(a.fecha);});

  var cruzadosPorLocal={l1:[],l2:[],l3:[]};
  gastosFiltrados.forEach(function(g){if(cruzadosPorLocal[g.local])cruzadosPorLocal[g.local].push(g);});

  var totalCruzado=gastosFiltrados.reduce(function(a,g){return a+parseFloat(g.monto||0);},0);

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Pagos cruzados</div>
          <div style={{fontSize:11,color:"#444",marginTop:3}}>Gastos pagados con un medio que no corresponde al local</div>
        </div>
        <select value={mesFiltro} onChange={function(e){setMesFiltro(e.target.value);}} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #2A2A2A",background:"#111",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>
          {mesesDisp.map(function(m){return <option key={m} value={m}>{m}</option>;})}
        </select>
      </div>

      {/* Toggle */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <button onClick={function(){setSoloProblemas(true);}} style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+(soloProblemas?"#E07B00":"#1A1A1A"),background:soloProblemas?"#E07B0022":"none",color:soloProblemas?"#E07B00":"#444",fontSize:11,cursor:"pointer",fontFamily:"'Lora',serif",fontWeight:700}}>⚠️ Solo cruzados</button>
        <button onClick={function(){setSoloProblemas(false);}} style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+(!soloProblemas?"#555":"#1A1A1A"),background:!soloProblemas?"#22222288":"none",color:!soloProblemas?"#F0EDE8":"#444",fontSize:11,cursor:"pointer",fontFamily:"'Lora',serif"}}>Todos los gastos</button>
      </div>

      {/* Mapa de medios correctos */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
        {[["l1","#C1440E","🍷","El Bodegón"],["l2","#8B2FC9","🌸","Kusama"],["l3","#1A6B8A","🍝","Colantonio's"]].map(function(ldef){
          return(
            <div key={ldef[0]} style={{background:"#0F0F0F",border:"1px solid "+ldef[1]+"33",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:ldef[1],marginBottom:6}}>{ldef[2]} {ldef[3]}</div>
              {MEDIOS_POR_LOCAL[ldef[0]].filter(function(m){return m!=="Efectivo";}).map(function(m){
                return <div key={m} style={{fontSize:10,color:"#555",marginBottom:2}}>· {m.replace("Transferencia - ","").replace("Tarjeta de débito - ","").replace("Tarjeta de crédito - "," ")}</div>;
              })}
              <div style={{fontSize:10,color:"#555",marginBottom:2}}>· Efectivo</div>
            </div>
          );
        })}
      </div>

      {/* Resultado */}
      {gastosFiltrados.length===0?(
        <div style={{background:"#0A1A0A",border:"1px solid #3A7D4433",borderRadius:12,padding:"20px",textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:6}}>✅</div>
          <div style={{fontSize:13,color:"#3A7D44",fontWeight:700}}>Sin pagos cruzados en {mesFiltro}</div>
          <div style={{fontSize:11,color:"#444",marginTop:4}}>Todos los gastos están pagados con el medio correcto</div>
        </div>
      ):(
        <div>
          {soloProblemas&&(
            <div style={{background:"#1A0A00",border:"1px solid #E07B0044",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:"#E07B00",fontWeight:700}}>⚠️ {gastosFiltrados.length} gasto{gastosFiltrados.length!==1?"s":""} cruzado{gastosFiltrados.length!==1?"s":""}</div>
              <div style={{fontSize:14,fontWeight:800,color:"#E07B00",fontFamily:"'Playfair Display',serif"}}>${totalCruzado.toLocaleString("es-AR")}</div>
            </div>
          )}
          {["l1","l2","l3"].map(function(lid){
            var lista=cruzadosPorLocal[lid]||[];
            if(lista.length===0)return null;
            var l=getLocal(lid);
            return(
              <div key={lid} style={{background:"#111",border:"1px solid "+(l?l.color+"33":"#1A1A1A"),borderRadius:12,padding:"12px 14px",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:700,color:l?l.color:"#F0EDE8",marginBottom:8}}>{l?l.emoji:""} {l?l.nombre:lid} <span style={{fontSize:11,fontWeight:400,color:"#555"}}>· {lista.length} gasto{lista.length!==1?"s":""}</span></div>
                {lista.map(function(g){
                  var localCorrecto=Object.keys(MEDIOS_POR_LOCAL).find(function(lid2){
                    return MEDIOS_POR_LOCAL[lid2].some(function(m){return (g.forma_pago||"").startsWith(m)&&m!=="Efectivo";});
                  });
                  var lc=localCorrecto?getLocal(localCorrecto):null;
                  return(
                    <div key={g.id} style={{borderBottom:"1px solid #1A1A1A",padding:"8px 0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:"#F0EDE8",fontWeight:600}}>{g.concepto}</div>
                          <div style={{fontSize:10,color:"#E07B00",marginTop:2}}>💳 {g.forma_pago}</div>
                          {lc&&<div style={{fontSize:10,color:"#555",marginTop:2}}>→ Este medio corresponde a <span style={{color:lc.color}}>{lc.emoji} {lc.nombre}</span></div>}
                          <div style={{fontSize:10,color:"#444",marginTop:2}}>{fmtDate(g.fecha)} · {g.categoria}</div>
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:"#E07B00",fontFamily:"'Playfair Display',serif",marginLeft:10}}>${parseFloat(g.monto||0).toLocaleString("es-AR")}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{fontSize:12,fontWeight:700,color:l?l.color:"#F0EDE8",textAlign:"right",marginTop:8}}>
                  Total: ${lista.reduce(function(a,g){return a+parseFloat(g.monto||0);},0).toLocaleString("es-AR")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelCierresSofia(p) {
  var cierres=p.cierres;
  var hoy=new Date().toISOString().split("T")[0];
  var mesCurrent=new Date().toISOString().slice(0,7);
  var [expandido,setExpandido]=useState(null);
  var [localActivo,setLocalActivo]=useState("all");
  var [mesFiltro,setMesFiltro]=useState(mesCurrent);
  var [vistaGrid,setVistaGrid]=useState(false);
  var [expandidoGrid,setExpandidoGrid]=useState(null);

  var localesFiltro=LOCALES.filter(function(l){return l.id!=="l4";});

  var mesesDisp=[...new Set(cierres.map(function(c){return c.fecha?c.fecha.substring(0,7):null;}).filter(Boolean))].sort().reverse();
  if(mesesDisp.indexOf(mesCurrent)===-1)mesesDisp.unshift(mesCurrent);

  function toggleExpandido(key){
    setExpandido(function(prev){return prev===key?null:key;});
  }
  function toggleExpandidoGrid(key){
    setExpandidoGrid(function(prev){return prev===key?null:key;});
  }

  // ── VISTA GRID (3 columnas full screen) ──
  if(vistaGrid){
    return(
      <div style={{fontFamily:"'Lora',serif",position:"fixed",top:0,left:0,right:0,bottom:0,background:"#0A0A0A",zIndex:999,overflowY:"auto",padding:"16px"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>📊 Cierres del mes</div>
            <select value={mesFiltro} onChange={function(e){setMesFiltro(e.target.value);}} style={{padding:"5px 9px",borderRadius:7,border:"1px solid #2A2A2A",background:"#111",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
              {mesesDisp.map(function(m){return <option key={m} value={m}>{m}</option>;})}
            </select>
          </div>
          <button onClick={function(){setVistaGrid(false);}} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #333",background:"#111",color:"#F0EDE8",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif"}}>✕ Cerrar</button>
        </div>

        {/* Totales por local */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
          {localesFiltro.map(function(l){
            var cl=cierres.filter(function(c){return c.local===l.id&&c.fecha&&c.fecha.substring(0,7)===mesFiltro;});
            var tot=cl.reduce(function(a,c){return a+parseFloat(c.total_ventas||0);},0);
            return(
              <div key={l.id} style={{background:"#111",border:"1px solid "+l.color+"55",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:13,color:l.color,fontWeight:700,marginBottom:4}}>{l.emoji} {l.nombre}</div>
                <div style={{fontSize:20,fontWeight:800,color:l.color,fontFamily:"'Playfair Display',serif"}}>${tot.toLocaleString("es-AR")}</div>
                <div style={{fontSize:10,color:"#444",marginTop:2}}>{cl.length} cierre{cl.length!==1?"s":""}</div>
              </div>
            );
          })}
        </div>

        {/* Grid 3 columnas con días */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,alignItems:"start"}}>
          {localesFiltro.map(function(l){
            var cl=cierres.filter(function(c){return c.local===l.id&&c.fecha&&c.fecha.substring(0,7)===mesFiltro;}).sort(function(a,b){return b.fecha.localeCompare(a.fecha);});
            var cierreHoy=cl.find(function(c){return c.fecha===hoy;});
            return(
              <div key={l.id} style={{background:"#0F0F0F",border:"1px solid "+l.color+"33",borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:12,fontWeight:700,color:l.color,marginBottom:8,borderBottom:"1px solid "+l.color+"22",paddingBottom:6}}>
                  {l.emoji} {l.nombre}
                  {mesFiltro===mesCurrent&&(
                    <span style={{marginLeft:6,fontSize:9,fontWeight:400,color:cierreHoy?"#3A7D44":"#C1440E"}}>
                      {cierreHoy?"✅ hoy":"⚠️ falta hoy"}
                    </span>
                  )}
                </div>
                {cl.length===0?(
                  <div style={{fontSize:10,color:"#333",textAlign:"center",padding:"12px 0"}}>Sin cierres</div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {cl.map(function(c){
                      var gkey=l.id+"_g_"+c.fecha;
                      var abierto=expandidoGrid===gkey;
                      var esHoy=c.fecha===hoy;
                      return(
                        <div key={c.id}>
                          <div onClick={function(){toggleExpandidoGrid(gkey);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 4px",borderBottom:"1px solid #141414",cursor:"pointer",borderRadius:4}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <span style={{fontSize:9,color:"#444",display:"inline-block",transform:abierto?"rotate(90deg)":"none",transition:"transform 0.15s"}}>▶</span>
                              <span style={{fontSize:11,color:esHoy?"#3A7D44":"#888",fontWeight:esHoy?700:400}}>{fmtDate(c.fecha)}</span>
                            </div>
                            <span style={{fontSize:12,fontWeight:700,color:l.color,fontFamily:"'Playfair Display',serif"}}>${parseFloat(c.total_ventas||0).toLocaleString("es-AR")}</span>
                          </div>
                          {abierto&&(
                            <div style={{background:"#080808",borderRadius:6,padding:"8px 10px",margin:"3px 0 4px 0"}}>
                              {[["efectivo","💵"],["transferencia","📲"],["tarjeta_debito","💳db"],["tarjeta_credito","💳cr"],["otros","📦"]].map(function(f){
                                var v=parseFloat(c[f[0]]||0);
                                if(v===0)return null;
                                return(
                                  <div key={f[0]} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555",marginBottom:3}}>
                                    <span>{f[1]} {f[0].replace("_"," ")}</span>
                                    <span style={{color:"#F0EDE8",fontWeight:600}}>${v.toLocaleString("es-AR")}</span>
                                  </div>
                                );
                              })}
                              {c.notas&&<div style={{fontSize:9,color:"#333",fontStyle:"italic",marginTop:4}}>📝 {c.notas}</div>}
                              <div style={{fontSize:10,color:"#333",marginTop:4}}>{c.usuario}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Totales por medio de pago al final de la columna */}
                    <div style={{marginTop:8,borderTop:"1px solid "+l.color+"33",paddingTop:8}}>
                      <div style={{fontSize:9,color:"#444",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Total del mes</div>
                      {[["efectivo","💵","Efectivo"],["transferencia","📲","Transfer."],["tarjeta_debito","💳","Débito"],["tarjeta_credito","💳","Crédito"],["otros","📦","Otros"]].map(function(f){
                        var tot=cl.reduce(function(a,c){return a+parseFloat(c[f[0]]||0);},0);
                        if(tot===0)return null;
                        return(
                          <div key={f[0]} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid #0F0F0F"}}>
                            <span style={{fontSize:10,color:"#555"}}>{f[1]} {f[2]}</span>
                            <span style={{fontSize:11,fontWeight:700,color:"#F0EDE8"}}>${tot.toLocaleString("es-AR")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5,marginBottom:14}}>Cierres de caja</div>

      {/* Filtros */}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <select value={mesFiltro} onChange={function(e){setMesFiltro(e.target.value);}} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #2A2A2A",background:"#111",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>
          {mesesDisp.map(function(m){return <option key={m} value={m}>{m}</option>;})}
        </select>
        <button onClick={function(){setLocalActivo("all");}} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(localActivo==="all"?"#555":"#1A1A1A"),background:localActivo==="all"?"#222":"none",color:localActivo==="all"?"#F0EDE8":"#444",fontSize:11,cursor:"pointer",fontFamily:"'Lora',serif"}}>Todos</button>
        {localesFiltro.map(function(l){return(
          <button key={l.id} onClick={function(){setLocalActivo(l.id);}} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(localActivo===l.id?l.color:"#1A1A1A"),background:localActivo===l.id?l.color+"22":"none",color:localActivo===l.id?l.color:"#444",fontSize:11,cursor:"pointer",fontFamily:"'Lora',serif"}}>{l.emoji}</button>
        );})}
        <button onClick={function(){setVistaGrid(true);}} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:8,border:"1px solid #D4A01744",background:"#D4A01711",color:"#D4A017",fontSize:11,cursor:"pointer",fontFamily:"'Lora',serif"}}>📊 Vista mensual</button>
      </div>

      {/* Por local */}
      {localesFiltro.filter(function(l){return localActivo==="all"||localActivo===l.id;}).map(function(l){
        var cl=cierres.filter(function(c){return c.local===l.id&&c.fecha&&c.fecha.substring(0,7)===mesFiltro;}).sort(function(a,b){return b.fecha.localeCompare(a.fecha);});
        var totalMes=cl.reduce(function(a,c){return a+parseFloat(c.total_ventas||0);},0);
        var cierreHoy=cl.find(function(c){return c.fecha===hoy;});
        if(cl.length===0&&!cierreHoy&&mesFiltro===mesCurrent){
          // igual mostrar cabecera con alerta
        }
        return(
          <div key={l.id} style={{background:"#111",border:"1px solid "+l.color+"33",borderRadius:12,padding:"14px 16px",marginBottom:12}}>
            {/* Cabecera local */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:l.color}}>{l.emoji} {l.nombre}</div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:"#555"}}>{mesFiltro}</div>
                <div style={{fontSize:18,fontWeight:800,color:l.color,fontFamily:"'Playfair Display',serif"}}>${totalMes.toLocaleString("es-AR")}</div>
              </div>
            </div>

            {/* Alerta hoy (solo si mes actual) */}
            {mesFiltro===mesCurrent&&(
              <div style={{background:cierreHoy?"#0A1A0A":"#1A0808",borderRadius:8,padding:"7px 10px",marginBottom:10}}>
                <div style={{fontSize:10,color:cierreHoy?"#3A7D44":"#C1440E",fontWeight:700}}>
                  {cierreHoy?"✅ Hoy: $"+parseFloat(cierreHoy.total_ventas).toLocaleString("es-AR"):"⚠️ Sin cierre de hoy"}
                </div>
              </div>
            )}

            {/* Totales por medio de pago del mes */}
            {cl.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                {[["efectivo","💵"],["transferencia","📲"],["tarjeta_debito","💳db"],["tarjeta_credito","💳cr"],["otros","📦"]].map(function(f){
                  var tot=cl.reduce(function(a,c){return a+parseFloat(c[f[0]]||0);},0);
                  if(tot===0)return null;
                  return(
                    <div key={f[0]} style={{background:"#0F0F0F",borderRadius:7,padding:"6px 9px"}}>
                      <div style={{fontSize:9,color:"#444",marginBottom:2}}>{f[1]} {f[0].replace("_"," ")}</div>
                      <div style={{fontSize:12,fontWeight:700,color:"#F0EDE8"}}>${tot.toLocaleString("es-AR")}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Listado de días */}
            {cl.length===0?(
              <div style={{fontSize:11,color:"#444",textAlign:"center",padding:"8px 0"}}>Sin cierres en este período</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {cl.map(function(c){
                  var key=l.id+"_"+c.fecha;
                  var abierto=expandido===key;
                  var esHoy=c.fecha===hoy;
                  return(
                    <div key={c.id}>
                      <div onClick={function(){toggleExpandido(key);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 4px",borderBottom:"1px solid #1A1A1A",cursor:"pointer"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:"#888",transition:"transform 0.15s",display:"inline-block",transform:abierto?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                          <span style={{fontSize:12,color:esHoy?"#3A7D44":"#F0EDE8",fontWeight:esHoy?700:400}}>{fmtDate(c.fecha)}{esHoy&&" ● hoy"}</span>
                          <span style={{fontSize:10,color:"#444"}}>· {c.usuario}</span>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:l.color,fontFamily:"'Playfair Display',serif"}}>${parseFloat(c.total_ventas).toLocaleString("es-AR")}</span>
                      </div>
                      {abierto&&(
                        <div style={{background:"#0A0A0A",borderRadius:8,padding:"10px 12px",margin:"4px 0 6px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                          {[["efectivo","💵 Efectivo"],["transferencia","📲 Transferencia"],["tarjeta_debito","💳 Débito"],["tarjeta_credito","💳 Crédito"],["otros","📦 Otros"]].map(function(f){
                            var v=parseFloat(c[f[0]]||0);
                            if(v===0)return null;
                            return(
                              <div key={f[0]} style={{fontSize:11,color:"#555"}}>
                                {f[1]}: <span style={{color:"#F0EDE8",fontWeight:600}}>${v.toLocaleString("es-AR")}</span>
                              </div>
                            );
                          })}
                          {c.notas&&<div style={{gridColumn:"1/-1",fontSize:10,color:"#444",fontStyle:"italic",marginTop:4}}>📝 {c.notas}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PanelCierre(p) {
  var localId=p.localId, localNombre=p.localNombre, usuario=p.usuario, cierres=p.cierres, onSave=p.onSave;
  var hoy=new Date().toISOString().split("T")[0];
  var formVacio={fecha:hoy,efectivo:"",transferencia:"",tarjeta_debito:"",tarjeta_credito:"",otros:"",retiro_socio:"",egresos_diarios:"",egresos_nota:"",notas:""};
  var [form,setForm]=useState(formVacio);
  var [showForm,setShowForm]=useState(false);
  var [editId,setEditId]=useState(null); // id del cierre que estamos editando

  var cierresLocal=cierres.filter(function(c){return c.local===localId;}).sort(function(a,b){return b.fecha.localeCompare(a.fecha);});
  var hoyData=cierresLocal.find(function(c){return c.fecha===hoy;});

  function calcTotal(f){
    var efectivoNeto=(parseFloat(f.efectivo)||0)-(parseFloat(f.retiro_socio)||0)-(parseFloat(f.egresos_diarios)||0);
    return efectivoNeto+(parseFloat(f.transferencia)||0)+(parseFloat(f.tarjeta_debito)||0)+(parseFloat(f.tarjeta_credito)||0)+(parseFloat(f.otros)||0);
  }
  function calcEfectivoNeto(f){
    return (parseFloat(f.efectivo)||0)-(parseFloat(f.retiro_socio)||0)-(parseFloat(f.egresos_diarios)||0);
  }

  function abrirNuevo(){
    setForm(formVacio);
    setEditId(null);
    setShowForm(true);
  }

  function abrirEditar(c){
    setForm({fecha:c.fecha,efectivo:c.efectivo||"",transferencia:c.transferencia||"",tarjeta_debito:c.tarjeta_debito||"",tarjeta_credito:c.tarjeta_credito||"",otros:c.otros||"",retiro_socio:c.retiro_socio||"",egresos_diarios:c.egresos_diarios||"",egresos_nota:c.egresos_nota||"",notas:c.notas||""});
    setEditId(c.id);
    setShowForm(true);
  }

  function doSave(){
    var total=calcTotal(form);
    if(total===0)return;
    var cierre={
      id: editId || (localId+"_"+form.fecha+"_"+String(Date.now())),
      local:localId,
      fecha:form.fecha,
      total_ventas:total,
      efectivo:parseFloat(form.efectivo)||0,
      transferencia:parseFloat(form.transferencia)||0,
      tarjeta_debito:parseFloat(form.tarjeta_debito)||0,
      tarjeta_credito:parseFloat(form.tarjeta_credito)||0,
      otros:parseFloat(form.otros)||0,
      retiro_socio:parseFloat(form.retiro_socio)||0,
      egresos_diarios:parseFloat(form.egresos_diarios)||0,
      egresos_nota:form.egresos_nota||"",
      notas:form.notas,
      usuario:usuario,
      created_at:new Date().toISOString()
    };
    onSave(cierre);
    setShowForm(false);
    setEditId(null);
  }

  var local=getLocal(localId);

  return(
    <div style={{fontFamily:"'Lora',serif",maxWidth:600,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Cierre de Caja</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:800,color:local?local.color:"#F0EDE8"}}>{local?local.emoji:""} {localNombre}</div>
        </div>
        {!showForm&&(
          <button onClick={abrirNuevo} style={{background:local?local.color:"#C1440E",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer",padding:"8px 14px"}}>+ Nuevo cierre</button>
        )}
      </div>

      {/* Cierre de hoy */}
      <div style={{background:hoyData?"#0A1A0A":"#111",border:"1px solid "+(hoyData?"#3A7D4444":"#1A1A1A"),borderRadius:14,padding:"16px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:hoyData?8:0}}>
          <div style={{fontSize:11,color:hoyData?"#3A7D44":"#555",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5}}>
            {hoyData?"✅ Cierre de hoy cargado":"📋 Hoy aún no hay cierre"}
          </div>
          {hoyData&&(
            <button onClick={function(){abrirEditar(hoyData);}} style={{background:"none",border:"1px solid #2A2A2A",borderRadius:6,color:"#888",fontSize:11,cursor:"pointer",padding:"4px 10px",fontFamily:"'Lora',serif"}}>✏️ Editar</button>
          )}
        </div>
        {hoyData?(
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:800,color:"#3A7D44",marginBottom:10}}>${parseFloat(hoyData.total_ventas).toLocaleString("es-AR")}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11,color:"#555"}}>
              {hoyData.efectivo>0&&<div>💵 Efectivo: <span style={{color:"#F0EDE8"}}>${parseFloat(hoyData.efectivo).toLocaleString("es-AR")}</span></div>}
              {hoyData.transferencia>0&&<div>📲 Transf.: <span style={{color:"#F0EDE8"}}>${parseFloat(hoyData.transferencia).toLocaleString("es-AR")}</span></div>}
              {hoyData.tarjeta_debito>0&&<div>💳 Débito: <span style={{color:"#F0EDE8"}}>${parseFloat(hoyData.tarjeta_debito).toLocaleString("es-AR")}</span></div>}
              {hoyData.tarjeta_credito>0&&<div>💳 Crédito: <span style={{color:"#F0EDE8"}}>${parseFloat(hoyData.tarjeta_credito).toLocaleString("es-AR")}</span></div>}
              {hoyData.otros>0&&<div>📦 Otros: <span style={{color:"#F0EDE8"}}>${parseFloat(hoyData.otros).toLocaleString("es-AR")}</span></div>}
            </div>
            {(hoyData.retiro_socio>0||hoyData.egresos_diarios>0)&&(
              <div style={{marginTop:6,fontSize:11,color:"#C1440E"}}>
                {hoyData.retiro_socio>0&&<span>👤 Retiro: ${parseFloat(hoyData.retiro_socio).toLocaleString("es-AR")} · </span>}
                {hoyData.egresos_diarios>0&&<span>📤 Egresos: ${parseFloat(hoyData.egresos_diarios).toLocaleString("es-AR")}{hoyData.egresos_nota?" ("+hoyData.egresos_nota+")":""}</span>}
              </div>
            )}
            {hoyData.notas&&<div style={{fontSize:11,color:"#555",marginTop:8,fontStyle:"italic"}}>📝 {hoyData.notas}</div>}
          </div>
        ):(
          <button onClick={abrirNuevo} style={{background:local?local.color:"#C1440E",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",padding:"10px 20px",width:"100%",marginTop:4}}>
            + Cargar cierre de hoy
          </button>
        )}
      </div>

      {/* Formulario nuevo/editar */}
      {showForm&&(
        <div style={{background:"#0F0F0F",border:"1px solid "+(local?local.color+"44":"#2A2A2A"),borderRadius:14,padding:"18px",marginBottom:18}}>
          <div style={{fontSize:11,color:local?local.color:"#555",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>
            {editId?"✏️ Editando cierre":"+ Nuevo cierre"}
          </div>
          <div style={{marginBottom:10}}>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Fecha</label>
            <input type="date" value={form.fecha} onChange={function(e){setForm(function(f){return{...f,fecha:e.target.value};});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
            {[["efectivo","💵 Efectivo"],["transferencia","📲 Transferencia"],["tarjeta_debito","💳 Tarjeta débito"],["tarjeta_credito","💳 Tarjeta crédito"],["otros","📦 Otros"]].map(function(field){
              return(
                <div key={field[0]}>
                  <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>{field[1]}</label>
                  <input type="number" placeholder="0" value={form[field[0]]} onChange={function(e){var v=e.target.value;setForm(function(f){var n={...f};n[field[0]]=v;return n;});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
                </div>
              );
            })}
          </div>
          {/* Retiro de socio y egresos diarios */}
          <div style={{background:"#1A0A0A",border:"1px solid #C1440E22",borderRadius:10,padding:"12px",marginBottom:12}}>
            <div style={{fontSize:10,color:"#C1440E",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Egresos del día</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:8}}>
              <div>
                <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>👤 Retiro de socio</label>
                <input type="number" placeholder="0" value={form.retiro_socio} onChange={function(e){setForm(function(f){return{...f,retiro_socio:e.target.value};});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>📤 Egresos diarios</label>
                <input type="number" placeholder="0" value={form.egresos_diarios} onChange={function(e){setForm(function(f){return{...f,egresos_diarios:e.target.value};});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
              </div>
            </div>
            {(parseFloat(form.egresos_diarios)||0)>0&&(
              <div>
                <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Concepto de egresos</label>
                <input value={form.egresos_nota} onChange={function(e){setForm(function(f){return{...f,egresos_nota:e.target.value};});}} placeholder="Ej: repuesto, limpieza..." style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
              </div>
            )}
            {((parseFloat(form.retiro_socio)||0)+(parseFloat(form.egresos_diarios)||0))>0&&(
              <div style={{marginTop:8,fontSize:11,color:"#C1440E"}}>
                Efectivo bruto: ${(parseFloat(form.efectivo)||0).toLocaleString("es-AR")} − Egresos: ${((parseFloat(form.retiro_socio)||0)+(parseFloat(form.egresos_diarios)||0)).toLocaleString("es-AR")} = <strong>${calcEfectivoNeto(form).toLocaleString("es-AR")}</strong>
              </div>
            )}
          </div>

          <div style={{background:"#1A1A1A",borderRadius:10,padding:"10px 13px",marginBottom:12}}>
            <div style={{fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:3}}>Total calculado</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:"'Playfair Display',serif",color:local?local.color:"#F0EDE8"}}>${calcTotal(form).toLocaleString("es-AR")}</div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Notas</label>
            <input value={form.notas} onChange={function(e){setForm(function(f){return{...f,notas:e.target.value};});}} placeholder="Observaciones..." style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={doSave} style={{background:local?local.color:"#C1440E",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",flex:2,padding:"11px"}}>✓ Guardar cierre</button>
            <button onClick={function(){setShowForm(false);setEditId(null);}} style={{padding:"11px",borderRadius:8,border:"1px solid #2A2A2A",background:"none",color:"#888",fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",flex:1}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Historial */}
      {cierresLocal.length>0&&(
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>Historial de cierres</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {cierresLocal.map(function(c){
              var esHoy=c.fecha===hoy;
              return(
                <div key={c.id} style={{background:"#111",border:"1px solid "+(esHoy?"#3A7D4422":"#1A1A1A"),borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#F0EDE8"}}>{fmtDate(c.fecha)}{esHoy&&<span style={{marginLeft:6,fontSize:10,color:"#3A7D44"}}>● hoy</span>}</div>
                    <div style={{fontSize:10,color:"#555",marginTop:2}}>por {c.usuario}</div>
                    <div style={{fontSize:10,color:"#444",marginTop:2}}>
                      {c.efectivo>0&&"💵 "+parseFloat(c.efectivo).toLocaleString("es-AR")+" "}
                      {c.transferencia>0&&"📲 "+parseFloat(c.transferencia).toLocaleString("es-AR")+" "}
                      {c.tarjeta_debito>0&&"💳db "+parseFloat(c.tarjeta_debito).toLocaleString("es-AR")+" "}
                      {c.tarjeta_credito>0&&"💳cr "+parseFloat(c.tarjeta_credito).toLocaleString("es-AR")+" "}
                      {c.otros>0&&"📦 "+parseFloat(c.otros).toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <div style={{fontSize:16,fontWeight:800,fontFamily:"'Playfair Display',serif",color:local?local.color:"#F0EDE8"}}>${parseFloat(c.total_ventas).toLocaleString("es-AR")}</div>
                    <button onClick={function(){abrirEditar(c);}} style={{background:"none",border:"1px solid #2A2A2A",borderRadius:6,color:"#666",fontSize:10,cursor:"pointer",padding:"3px 8px",fontFamily:"'Lora',serif"}}>✏️ Editar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PANEL RETIROS ────────────────────────────────────────────────────────────
function PanelRetiros(p) {
  var retiros=p.retiros, onSave=p.onSave, onDelete=p.onDelete, usuario=p.usuario;
  var hoy=new Date().toISOString().split("T")[0];
  var [showForm,setShowForm]=useState(false);
  var [filtroFecha,setFiltroFecha]=useState("mes");
  var [filtroLocal,setFiltroLocal]=useState("all");
  var [form,setForm]=useState({socio:"",local:"l1",monto:"",tipo_retiro:"Efectivo",subtipo:"",notas:"",fecha:hoy});

  var TIPOS_RETIRO=["Efectivo","Transferencia","Tarjeta de débito","Tarjeta de crédito","Cheque"];
  var SUBTIPOS={
    "Efectivo":["Efectivo El Bodegón Nkt","Efectivo Kusama","Efectivo Colantonio's"],
    "Transferencia":["Patagonia Personas","Patagonia Empresas","Galicia Empresas","Provincia Personas","Mercado Pago Nicolás","Mercado Pago Calzon Gitano"],
    "Tarjeta de débito":["Mastercard ML Calzon Gitano","Mastercard ML Nicolás","Visa Provincia Personas","Visa Patagonia Empresas","Visa Patagonia Personas"],
    "Tarjeta de crédito":["Mastercard Patagonia Personas","Visa Patagonia Personas"]
  };

  var filtered=retiros.filter(function(r){
    var matchLocal=filtroLocal==="all"||r.local===filtroLocal;
    var matchFecha=true;
    if(filtroFecha==="hoy") matchFecha=r.fecha===hoy;
    if(filtroFecha==="semana"){var diff=(new Date()-new Date(r.fecha))/(1000*60*60*24);matchFecha=diff<=7;}
    if(filtroFecha==="mes") matchFecha=r.fecha&&r.fecha.slice(0,7)===hoy.slice(0,7);
    return matchLocal&&matchFecha;
  });

  var totalFiltered=filtered.reduce(function(a,r){return a+parseFloat(r.monto||0);},0);

  function doSave(){
    if(!form.socio.trim()||!form.monto)return;
    var retiro={
      id:String(Date.now()),
      socio:form.socio.trim(),
      local:form.local,
      monto:parseFloat(form.monto),
      tipo_retiro:form.tipo_retiro+(form.subtipo?" - "+form.subtipo:""),
      notas:form.notas,
      fecha:form.fecha,
      usuario:usuario,
      created_at:new Date().toISOString()
    };
    onSave(retiro);
    setForm({socio:"",local:"l1",monto:"",tipo_retiro:"Efectivo",subtipo:"",notas:"",fecha:hoy});
    setShowForm(false);
  }

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Módulo Administración</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>💼 Retiros de Socios</div>
        </div>
        <button onClick={function(){setShowForm(function(v){return !v;});}} style={{background:"#8B2FC9",border:"none",borderRadius:8,color:"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer",padding:"8px 16px"}}>+ Cargar retiro</button>
      </div>

      {showForm&&(
        <div style={{background:"#0F0F0F",border:"1px solid #8B2FC944",borderRadius:14,padding:"18px",marginBottom:18}}>
          <div style={{fontSize:11,color:"#8B2FC9",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Nuevo retiro</div>

          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Socio</label>
            <input value={form.socio} onChange={function(e){setForm(function(f){return{...f,socio:e.target.value};});}} placeholder="Nombre del socio..." style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>Local</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {LOCALES.map(function(l){return(<button key={l.id} onClick={function(){setForm(function(f){return{...f,local:l.id};});}} style={{padding:"7px 12px",borderRadius:8,border:"2px solid "+(form.local===l.id?l.color:"#1E1E1E"),background:form.local===l.id?l.color+"22":"#111",color:form.local===l.id?l.color:"#555",fontFamily:"'Lora',serif",fontSize:11,fontWeight:600,cursor:"pointer"}}>{l.emoji} {l.nombre}</button>);})}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Monto $</label>
              <input type="number" value={form.monto} onChange={function(e){setForm(function(f){return{...f,monto:e.target.value};});}} placeholder="0.00" style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Fecha</label>
              <input type="date" value={form.fecha} onChange={function(e){setForm(function(f){return{...f,fecha:e.target.value};});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Tipo de retiro</label>
            <select value={form.tipo_retiro} onChange={function(e){setForm(function(f){return{...f,tipo_retiro:e.target.value,subtipo:""};});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box",marginBottom:6}}>
              {TIPOS_RETIRO.map(function(t){return <option key={t}>{t}</option>;})}
            </select>
            {SUBTIPOS[form.tipo_retiro]&&(
              <select value={form.subtipo} onChange={function(e){setForm(function(f){return{...f,subtipo:e.target.value};});}} style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:form.subtipo?"#F0EDE8":"#555",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}>
                <option value="">-- Seleccioná cuenta --</option>
                {SUBTIPOS[form.tipo_retiro].map(function(s){return <option key={s}>{s}</option>;})}
              </select>
            )}
          </div>

          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:5}}>Notas</label>
            <input value={form.notas} onChange={function(e){setForm(function(f){return{...f,notas:e.target.value};});}} placeholder="Observaciones..." style={{padding:"9px 12px",borderRadius:8,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:13,width:"100%",boxSizing:"border-box"}}/>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={doSave} disabled={!form.socio||!form.monto} style={{background:!form.socio||!form.monto?"#1A1A1A":"#8B2FC9",border:"none",borderRadius:8,color:!form.socio||!form.monto?"#444":"#fff",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:!form.socio||!form.monto?"not-allowed":"pointer",flex:2,padding:"11px"}}>✓ Guardar retiro</button>
            <button onClick={function(){setShowForm(false);}} style={{padding:"11px",borderRadius:8,border:"1px solid #2A2A2A",background:"none",color:"#888",fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",flex:1}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Resumen */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7,marginBottom:16}}>
        <div style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"11px 14px"}}>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:4}}>Total retiros</div>
          <div style={{fontSize:20,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#8B2FC9"}}>${totalFiltered.toLocaleString("es-AR")}</div>
          <div style={{fontSize:10,color:"#444",marginTop:3}}>{filtered.length} retiros</div>
        </div>
        <div style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"11px 14px"}}>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",marginBottom:4}}>Por local</div>
          {LOCALES.map(function(l){
            var tot=filtered.filter(function(r){return r.local===l.id;}).reduce(function(a,r){return a+parseFloat(r.monto||0);},0);
            if(tot===0)return null;
            return <div key={l.id} style={{fontSize:11,color:l.color,display:"flex",justifyContent:"space-between"}}><span>{l.emoji} {l.nombre}</span><span>${tot.toLocaleString("es-AR")}</span></div>;
          })}
        </div>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:5,marginBottom:13,flexWrap:"wrap",alignItems:"center"}}>
        {[["hoy","Hoy"],["semana","7 días"],["mes","Este mes"],["all","Todo"]].map(function(opt){
          return <button key={opt[0]} onClick={function(){setFiltroFecha(opt[0]);}} style={{padding:"4px 11px",borderRadius:20,border:"1px solid "+(filtroFecha===opt[0]?"#8B2FC9":"#1A1A1A"),background:filtroFecha===opt[0]?"#8B2FC922":"none",color:filtroFecha===opt[0]?"#8B2FC9":"#444",fontSize:11,cursor:"pointer"}}>{opt[1]}</button>;
        })}
        <div style={{width:1,height:16,background:"#222",margin:"0 4px"}}/>
        {LOCALES.map(function(l){return(
          <button key={l.id} onClick={function(){setFiltroLocal(filtroLocal===l.id?"all":l.id);}} style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(filtroLocal===l.id?l.color:"#1A1A1A"),background:filtroLocal===l.id?l.color+"22":"none",color:filtroLocal===l.id?l.color:"#444",fontSize:11,cursor:"pointer"}}>{l.emoji} {l.nombre}</button>
        );})}
      </div>

      {/* Lista */}
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:32,marginBottom:10}}>💼</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"#2E2E2E"}}>Sin retiros en este período</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(function(r){
            var loc=getLocal(r.local);
            return(
              <div key={r.id} style={{background:"#111",border:"1px solid #8B2FC922",borderRadius:12,padding:"12px 15px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#F0EDE8"}}>💼 {r.socio}</span>
                    {loc&&<span style={{fontSize:10,color:loc.color}}>{loc.emoji} {loc.nombre}</span>}
                  </div>
                  <div style={{fontSize:11,color:"#555"}}>{r.tipo_retiro} · {fmtDate(r.fecha)}</div>
                  {r.notas&&<div style={{fontSize:11,color:"#444",fontStyle:"italic",marginTop:3}}>📝 {r.notas}</div>}
                  <div style={{fontSize:10,color:"#333",marginTop:2}}>por {r.usuario} · {fmtDateTime(r.created_at)}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:16,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#8B2FC9"}}>${parseFloat(r.monto).toLocaleString("es-AR")}</div>
                  <button onClick={function(){if(window.confirm("¿Eliminar este retiro?"))onDelete(r.id);}} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:12,marginTop:4}}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── PANEL RESULTADOS (P&L por local) ────────────────────────────────────────
function PanelResultados(p){
  var gastos=p.gastos, cierres=p.cierres, corrResultados=p.corrResultados||{}, onSaveCorr=p.onSaveCorr;
  var mesCurrent=new Date().toISOString().slice(0,7);
  var [mesFiltro,setMesFiltro]=useState(mesCurrent);
  var [corrLocal,setCorrLocal]=useState({}); // edición local temporal antes de guardar
  var MEDIOS_CORR=[["efectivo","💵 Efectivo"],["transferencia","📲 Transferencia"],["debito","💳 Débito"],["credito","💳 Crédito"],["otros","📦 Otros"]];

  // Obtener corrección: primero la edición local, sino la de Supabase
  function getCorr(lid){
    if(corrLocal[lid])return corrLocal[lid];
    return corrResultados[lid+"_"+mesFiltro]||{};
  }
  function corrTotal(lid){
    var c=getCorr(lid);
    return ["efectivo","transferencia","debito","credito","otros"].reduce(function(a,k){return a+(parseFloat(c[k])||0);},0);
  }
  function saveCorr(lid){
    var c=getCorr(lid);
    var obj={id:lid+"_"+mesFiltro,local:lid,mes:mesFiltro,efectivo:parseFloat(c.efectivo)||0,transferencia:parseFloat(c.transferencia)||0,debito:parseFloat(c.debito)||0,credito:parseFloat(c.credito)||0,otros:parseFloat(c.otros)||0,nota:c.nota||"",updated_at:new Date().toISOString()};
    if(onSaveCorr)onSaveCorr(obj);
    // Actualizar corrLocal con el obj guardado para reflejo inmediato
    setCorrLocal(function(prev){var n={...prev};n[lid]=obj;return n;});
  }
  var localesFiltro=LOCALES.filter(function(l){return l.id!=="l4";});

  var mesesDisp=[...new Set([
    ...cierres.map(function(c){return c.fecha?c.fecha.substring(0,7):null;}),
    ...gastos.map(function(g){return g.fecha?g.fecha.substring(0,7):null;})
  ].filter(Boolean))].sort().reverse();
  if(mesesDisp.indexOf(mesCurrent)===-1)mesesDisp.unshift(mesCurrent);

  // Calcular traspaso automático del mes anterior
  function calcTraspaso(lid){
    // Mes anterior
    var d=new Date(mesFiltro+"-01");
    d.setMonth(d.getMonth()-1);
    var mesPrev=d.toISOString().slice(0,7);
    var clPrev=cierres.filter(function(c){return c.local===lid&&c.fecha&&c.fecha.substring(0,7)===mesPrev;});
    if(clPrev.length===0)return null;
    var efectivo=clPrev.reduce(function(a,c){return a+parseFloat(c.efectivo||0)-(parseFloat(c.retiro_socio||0))-(parseFloat(c.egresos_diarios||0));},0);
    var electronico=clPrev.reduce(function(a,c){return a+parseFloat(c.transferencia||0)+parseFloat(c.tarjeta_debito||0)+parseFloat(c.tarjeta_credito||0)+parseFloat(c.otros||0);},0);
    return{efectivo,electronico,total:efectivo+electronico,mes:mesPrev};
  }

  function calcLocal(lid){
    var cl=cierres.filter(function(c){return c.local===lid&&c.fecha&&c.fecha.substring(0,7)===mesFiltro;});
    // Ventas netas = total_ventas ya incluye retiro/egresos restados en el cierre
    var ventas=cl.reduce(function(a,c){return a+parseFloat(c.total_ventas||0);},0);
    var retiros=cl.reduce(function(a,c){return a+parseFloat(c.retiro_socio||0);},0);
    var egresos=cl.reduce(function(a,c){return a+parseFloat(c.egresos_diarios||0);},0);
    var ventasPorMedio={};
    cl.forEach(function(c){
      [["efectivo","💵 Efectivo"],["transferencia","📲 Transferencia"],["tarjeta_debito","💳 Débito"],["tarjeta_credito","💳 Crédito"],["otros","📦 Otros"]].forEach(function(f){
        var v=parseFloat(c[f[0]]||0);
        if(f[0]==="efectivo")v=v-(parseFloat(c.retiro_socio||0))-(parseFloat(c.egresos_diarios||0));
        if(v>0)ventasPorMedio[f[1]]=(ventasPorMedio[f[1]]||0)+v;
      });
    });

    var gl=gastos.filter(function(g){return g.local===lid&&g.fecha&&g.fecha.substring(0,7)===mesFiltro;});
    var totalGastos=gl.reduce(function(a,g){return a+parseFloat(g.monto||0);},0);
    var porCat={};
    gl.forEach(function(g){
      var cat=(g.categoria||"Otro").split(" - ")[0];
      porCat[cat]=(porCat[cat]||0)+parseFloat(g.monto||0);
    });

    var traspaso=calcTraspaso(lid);

    // Gastos por medio de pago (efectivo vs electrónico)
    var gastoEfectivo=0,gastoElectronico=0;
    gl.forEach(function(g){
      var fp=(g.forma_pago||"").toLowerCase();
      if(fp.startsWith("efectivo"))gastoEfectivo+=parseFloat(g.monto||0);
      else gastoElectronico+=parseFloat(g.monto||0);
    });

    // Ingresos de cierres por medio
    var ventaEfectivo=cl.reduce(function(a,c){return a+(parseFloat(c.efectivo||0)-parseFloat(c.retiro_socio||0)-parseFloat(c.egresos_diarios||0));},0);
    var ventaElectronico=cl.reduce(function(a,c){return a+parseFloat(c.transferencia||0)+parseFloat(c.tarjeta_debito||0)+parseFloat(c.tarjeta_credito||0)+parseFloat(c.otros||0);},0);

    // Disponibilidad
    var dispEfectivo=ventaEfectivo-gastoEfectivo+(traspaso?traspaso.efectivo:0);
    var dispElectronico=ventaElectronico-gastoElectronico+(traspaso?traspaso.electronico:0);
    var corrMonto=corrTotal(lid);
    var corr=getCorr(lid);
    var resultado=ventas-totalGastos+(traspaso?traspaso.total:0)+corrMonto;
    return{ventas,ventasPorMedio,totalGastos,porCat,resultado,diasCierre:cl.length,cantGastos:gl.length,retiros,egresos,traspaso,corrMonto,corrNota:corr.nota||"",corrDetalle:corr,dispEfectivo,dispElectronico,ventaEfectivo,ventaElectronico,gastoEfectivo,gastoElectronico};
  }

  var datos=localesFiltro.reduce(function(acc,l){acc[l.id]=calcLocal(l.id);return acc;},{});
  var totalVentas=localesFiltro.reduce(function(a,l){return a+datos[l.id].ventas;},0);
  var totalGastos=localesFiltro.reduce(function(a,l){return a+datos[l.id].totalGastos;},0);
  var totalResultado=totalVentas-totalGastos;

  function fmt(n){return "$"+(Math.round(n)||0).toLocaleString("es-AR");}

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Administración</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>📈 Resultados por local</div>
        </div>
        <select value={mesFiltro} onChange={function(e){setMesFiltro(e.target.value);}} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #2A2A2A",background:"#111",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>
          {mesesDisp.map(function(m){return <option key={m} value={m}>{m}</option>;})}
        </select>
      </div>

      {/* Card resumen grupo */}
      <div style={{background:"#111",border:"1px solid "+(totalResultado>=0?"#3A7D4444":"#C1440E44"),borderRadius:12,padding:"14px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,textAlign:"center"}}>
        <div>
          <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Ventas totales</div>
          <div style={{fontSize:22,fontWeight:800,color:"#3A7D44",fontFamily:"'Playfair Display',serif"}}>{fmt(totalVentas)}</div>
        </div>
        <div>
          <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Gastos totales</div>
          <div style={{fontSize:22,fontWeight:800,color:"#C1440E",fontFamily:"'Playfair Display',serif"}}>{fmt(totalGastos)}</div>
        </div>
        <div>
          <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Resultado</div>
          <div style={{fontSize:22,fontWeight:800,color:totalResultado>=0?"#3A7D44":"#C1440E",fontFamily:"'Playfair Display',serif"}}>{totalResultado>=0?"":"−"}{fmt(Math.abs(totalResultado))}</div>
        </div>
      </div>

      {/* Cards por local */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {localesFiltro.map(function(l){
          var d=datos[l.id];
          var margen=d.ventas>0?((d.resultado/d.ventas)*100).toFixed(1):null;
          return(
            <div key={l.id} style={{background:"#0F0F0F",border:"1px solid "+l.color+"44",borderRadius:12,padding:"14px 16px"}}>
              {/* Header local */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:14,fontWeight:700,color:l.color}}>{l.emoji} {l.nombre}</div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:800,color:d.resultado>=0?"#3A7D44":"#C1440E",fontFamily:"'Playfair Display',serif"}}>{d.resultado>=0?"":"-"}{fmt(Math.abs(d.resultado))}</div>
                  {margen!==null&&<div style={{fontSize:10,color:"#555",marginTop:2}}>Margen: {margen}%</div>}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {/* Ventas */}
                <div style={{background:"#0A0A0A",borderRadius:10,padding:"12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:10,color:"#3A7D44",textTransform:"uppercase",letterSpacing:1}}>Ventas netas</div>
                    <div style={{fontSize:14,fontWeight:800,color:"#3A7D44",fontFamily:"'Playfair Display',serif"}}>{fmt(d.ventas)}</div>
                  </div>
                  {d.diasCierre===0?(
                    <div style={{fontSize:10,color:"#333"}}>Sin cierres cargados</div>
                  ):(
                    <div>
                      {Object.keys(d.ventasPorMedio).map(function(mp){return(
                        <div key={mp} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555",marginBottom:3}}>
                          <span>{mp}</span>
                          <span style={{color:"#F0EDE8",fontWeight:600}}>{fmt(d.ventasPorMedio[mp])}</span>
                        </div>
                      );})}
                      {(d.retiros>0||d.egresos>0)&&(
                        <div style={{marginTop:6,paddingTop:5,borderTop:"1px solid #1A1A1A"}}>
                          {d.retiros>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#C1440E",marginBottom:2}}><span>👤 Retiros socios</span><span>−{fmt(d.retiros)}</span></div>}
                          {d.egresos>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#C1440E"}}><span>📤 Egresos diarios</span><span>−{fmt(d.egresos)}</span></div>}
                        </div>
                      )}
                      {d.traspaso&&d.traspaso.total>0&&(
                        <div style={{marginTop:6,paddingTop:5,borderTop:"1px solid #1A1A1A"}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#D4A017",marginBottom:2}}><span>🔄 Traspaso de {d.traspaso.mes}</span><span>+{fmt(d.traspaso.total)}</span></div>
                          <div style={{fontSize:9,color:"#555"}}>💵 {fmt(d.traspaso.efectivo)} · 📲 {fmt(d.traspaso.electronico)}</div>
                        </div>
                      )}
                      <div style={{fontSize:9,color:"#333",marginTop:6}}>{d.diasCierre} cierre{d.diasCierre!==1?"s":""}</div>
                    </div>
                  )}
                </div>

                {/* Gastos */}
                <div style={{background:"#0A0A0A",borderRadius:10,padding:"12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:10,color:"#C1440E",textTransform:"uppercase",letterSpacing:1}}>Gastos</div>
                    <div style={{fontSize:14,fontWeight:800,color:"#C1440E",fontFamily:"'Playfair Display',serif"}}>{fmt(d.totalGastos)}</div>
                  </div>
                  {d.cantGastos===0?(
                    <div style={{fontSize:10,color:"#333"}}>Sin gastos cargados</div>
                  ):(
                    <div>
                      {Object.keys(d.porCat).sort(function(a,b){return d.porCat[b]-d.porCat[a];}).map(function(cat){return(
                        <div key={cat} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555",marginBottom:3}}>
                          <span>{cat}</span>
                          <span style={{color:"#F0EDE8",fontWeight:600}}>{fmt(d.porCat[cat])}</span>
                        </div>
                      );})}
                      <div style={{fontSize:9,color:"#333",marginTop:6}}>{d.cantGastos} gasto{d.cantGastos!==1?"s":""}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra visual resultado */}
              {d.ventas>0&&(
                <div style={{marginTop:10}}>
                  <div style={{height:5,background:"#1A1A1A",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:Math.min(100,(d.totalGastos/d.ventas)*100)+"%",background:"#C1440E",borderRadius:3,transition:"width 0.4s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#333",marginTop:3}}>
                    <span>Gastos: {d.ventas>0?((d.totalGastos/d.ventas)*100).toFixed(1):0}% de ventas</span>
                    <span style={{color:d.resultado>=0?"#3A7D44":"#C1440E"}}>Resultado: {margen}%</span>
                  </div>
                </div>
              )}

              {/* Estado de disponibilidad */}
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #1A1A1A"}}>
                <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>💰 Disponibilidad estimada</div>
                {/* Efectivo */}
                <div style={{background:"#0A0A0A",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:10,color:"#555",fontWeight:700}}>💵 Efectivo</span>
                    <span style={{fontSize:13,fontWeight:800,color:d.dispEfectivo>=0?"#3A7D44":"#C1440E",fontFamily:"'Playfair Display',serif"}}>{fmt(d.dispEfectivo)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#444",marginBottom:2}}>
                    <span>Ingresos en efectivo</span><span style={{color:"#3A7D44"}}>+{fmt(d.ventaEfectivo)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#444",marginBottom:2}}>
                    <span>Gastos pagados en efectivo</span><span style={{color:"#C1440E"}}>−{fmt(d.gastoEfectivo)}</span>
                  </div>
                  {d.traspaso&&d.traspaso.efectivo>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#D4A017"}}>
                      <span>Traspaso mes anterior</span><span>+{fmt(d.traspaso.efectivo)}</span>
                    </div>
                  )}
                </div>
                {/* Electrónico */}
                <div style={{background:"#0A0A0A",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:10,color:"#555",fontWeight:700}}>📲 Electrónico</span>
                    <span style={{fontSize:13,fontWeight:800,color:d.dispElectronico>=0?"#3A7D44":"#C1440E",fontFamily:"'Playfair Display',serif"}}>{fmt(d.dispElectronico)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#444",marginBottom:2}}>
                    <span>Ingresos electrónicos</span><span style={{color:"#3A7D44"}}>+{fmt(d.ventaElectronico)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#444",marginBottom:2}}>
                    <span>Gastos pagados electrónico</span><span style={{color:"#C1440E"}}>−{fmt(d.gastoElectronico)}</span>
                  </div>
                  {d.traspaso&&d.traspaso.electronico>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#D4A017"}}>
                      <span>Traspaso mes anterior</span><span>+{fmt(d.traspaso.electronico)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Corrección manual por medio de pago */}
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #1A1A1A"}}>
                <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>🔧 Corrección manual</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:7}}>
                  {MEDIOS_CORR.map(function(mc){
                    var cv=getCorr(l.id);
                    return(
                      <div key={mc[0]}>
                        <label style={{display:"block",fontSize:9,color:"#444",marginBottom:3}}>{mc[1]}</label>
                        <input type="number" placeholder="0" value={(cv[mc[0]])||""} onChange={function(e){var v=e.target.value;setCorrLocal(function(prev){var c=prev[l.id]||getCorr(l.id);var n={...prev};n[l.id]={...c,[mc[0]]:v};return n;});}} style={{padding:"6px 9px",borderRadius:7,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,width:"100%",boxSizing:"border-box"}}/>
                      </div>
                    );
                  })}
                </div>
                <input placeholder="Nota de corrección..." value={(getCorr(l.id).nota)||""} onChange={function(e){var v=e.target.value;setCorrLocal(function(prev){var c=prev[l.id]||getCorr(l.id);var n={...prev};n[l.id]={...c,nota:v};return n;});}} style={{padding:"6px 9px",borderRadius:7,border:"1px solid #2A2A2A",background:"#0F0F0F",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,width:"100%",boxSizing:"border-box",marginBottom:6}}/>
                <button onClick={function(){saveCorr(l.id);}} style={{width:"100%",padding:"8px",borderRadius:7,border:"none",background:"#D4A017",color:"#000",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:4}}>💾 Guardar corrección</button>
                {d.corrMonto!==0&&(
                  <div style={{fontSize:10,color:"#D4A017",marginTop:4}}>
                    Total ajuste: {d.corrMonto>0?"+":""}{fmt(d.corrMonto)}
                    {d.corrNota&&<span style={{color:"#888"}}> · {d.corrNota}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PANEL IVA ────────────────────────────────────────────────────────────────
function PanelIVA(p) {
  var gastos=p.gastos, cierres=p.cierres||[];
  var hoy=new Date().toISOString().split("T")[0];
  var mesCurrent=hoy.slice(0,7);
  var [mesFiltro,setMesFiltro]=useState(mesCurrent);
  var [tab,setTab]=useState("posicion"); // posicion | compras | optimizacion

  var mesesDisp=[...new Set([
    ...gastos.map(function(g){return g.fecha?g.fecha.substring(0,7):null;}),
    ...cierres.map(function(c){return c.fecha?c.fecha.substring(0,7):null;})
  ].filter(Boolean))].sort().reverse();
  if(mesesDisp.length===0)mesesDisp=[mesCurrent];

  // ── Helpers IVA ──
  function calcIVACompra(g){
    var monto=parseFloat(g.monto||0);
    var cat=(g.categoria||"").toLowerCase();
    var alicuota=cat.includes("verdulería")||cat.includes("verduleria")?0.105:0.21;
    return {neto:monto/(1+alicuota),iva:monto-(monto/(1+alicuota)),alicuota};
  }
  function calcIVAVenta(monto){
    // ventas electrónicas van con IVA incluido al 21%
    var neto=monto/1.21;
    return {neto,iva:monto-neto};
  }

  // ── IVA Compras (crédito fiscal) ──
  var gastosFacturados=gastos.filter(function(g){return g.facturado&&g.fecha&&g.fecha.substring(0,7)===mesFiltro&&g.local!=="l4";});

  // IVA credito se asigna por CUIT de la factura, no por local
  // f1 = Calzon Gitano SRL (CUIT 30-71844629-1) -> SRL
  // f2 = Colantonio Carlos Nicolas (CUIT 20-26958479-4) -> Bodegon (l1)
  // sin CUIT -> se asigna por local
  var comprasPorLocal={l1:{ivaCF:0,items:[]},l2:{ivaCF:0,items:[]},l3:{ivaCF:0,items:[]}};
  gastosFacturados.forEach(function(g){
    var c=calcIVACompra(g);
    var destino=g.local;
    if(g.facturacion==="f1"){
      // CUIT SRL: si el gasto es del Bodegon con CUIT SRL, lo asignamos a l2 como representante SRL
      destino=(g.local==="l1")?"l2":g.local;
    } else if(g.facturacion==="f2"){
      destino="l1";
    }
    if(!comprasPorLocal[destino])return;
    comprasPorLocal[destino].ivaCF+=c.iva;
    comprasPorLocal[destino].items.push({...g,ivaCalc:c.iva,neto:c.neto,localOrigen:g.local,cuitUsado:g.facturacion});
  });

  // ── IVA Ventas (débito fiscal) — solo medios electrónicos ──
  var MEDIOS_ELECTRONICOS=["transferencia","tarjeta","débito","debito","crédito","credito","mercado pago","mercado libre","qr"];
  function esElectronico(fp){
    var f=(fp||"").toLowerCase();
    return MEDIOS_ELECTRONICOS.some(function(m){return f.includes(m);});
  }

  var cierresMes=cierres.filter(function(c){return c.fecha&&c.fecha.substring(0,7)===mesFiltro&&c.local!=="l4";});
  var ventasPorLocal={l1:{ivaDF:0,base:0},l2:{ivaDF:0,base:0},l3:{ivaDF:0,base:0}};
  cierresMes.forEach(function(c){
    if(!ventasPorLocal[c.local])return;
    var montoElect=(parseFloat(c.transferencia||0)+parseFloat(c.tarjeta_debito||0)+parseFloat(c.tarjeta_credito||0));
    var v=calcIVAVenta(montoElect);
    ventasPorLocal[c.local].ivaDF+=v.iva;
    ventasPorLocal[c.local].base+=v.neto;
  });

  // ── Posición neta por local ──
  var posicionPorLocal={};
  ["l1","l2","l3"].forEach(function(lid){
    var df=ventasPorLocal[lid]?ventasPorLocal[lid].ivaDF:0;
    var cf=comprasPorLocal[lid]?comprasPorLocal[lid].ivaCF:0;
    posicionPorLocal[lid]={df,cf,neta:df-cf}; // positivo = a pagar, negativo = a favor
  });

  // Posición consolidada SRL (Kusama + Colantonio's)
  var posSRL={
    df:posicionPorLocal.l2.df+posicionPorLocal.l3.df,
    cf:posicionPorLocal.l2.cf+posicionPorLocal.l3.cf,
    neta:posicionPorLocal.l2.neta+posicionPorLocal.l3.neta
  };

  var ALERTA_UMBRAL=500000;

  // ── Sugerencias de optimización ──
  function generarSugerencias(){
    var sugs=[];
    var posL1=posicionPorLocal.l1.neta;
    var posL2=posicionPorLocal.l2.neta;
    var posL3=posicionPorLocal.l3.neta;

    // Kusama vs Colantonios (mismo CUIT SRL - reasignacion valida)
    if(posL2>0&&posL3<0){
      var necesita=Math.min(posL2,Math.abs(posL3));
      var candidatos=comprasPorLocal.l3.items.filter(function(g){return g.ivaCalc<=necesita+1000;}).sort(function(a,b){return b.ivaCalc-a.ivaCalc;}).slice(0,3);
      if(candidatos.length>0)sugs.push({tipo:"reasignar",de:"l3",a:"l2",
        titulo:"Kusama tiene IVA a pagar — Colantonio tiene credito a favor",
        detalle:"Ambos usan el mismo CUIT (Calzon Gitano SRL). Reasigna estas facturas a Kusama para compensar la posicion:",
        items:candidatos,impacto:candidatos.reduce(function(a,c){return a+c.ivaCalc;},0)});
    }
    if(posL3>0&&posL2<0){
      var necesita2=Math.min(posL3,Math.abs(posL2));
      var candidatos2=comprasPorLocal.l2.items.filter(function(g){return g.ivaCalc<=necesita2+1000;}).sort(function(a,b){return b.ivaCalc-a.ivaCalc;}).slice(0,3);
      if(candidatos2.length>0)sugs.push({tipo:"reasignar",de:"l2",a:"l3",
        titulo:"Colantonio tiene IVA a pagar — Kusama tiene credito a favor",
        detalle:"Ambos usan el mismo CUIT (Calzon Gitano SRL). Reasigna estas facturas a Colantonio para compensar la posicion:",
        items:candidatos2,impacto:candidatos2.reduce(function(a,c){return a+c.ivaCalc;},0)});
    }

    // Bodegon vs SRL (distinto CUIT - sugerencia de proximas facturas)
    // Identificar proveedores comunes (que aparezcan en ambos CUITs)
    var provsSRL=[...new Set([...comprasPorLocal.l2.items,...comprasPorLocal.l3.items].map(function(g){return g.categoria;}))];
    var provsL1=[...new Set(comprasPorLocal.l1.items.map(function(g){return g.categoria;}))];
    var provsComunes=provsSRL.filter(function(p){return provsL1.includes(p);});

    if(posL1>0&&posSRL.neta<0){
      var diff=Math.min(posL1,Math.abs(posSRL.neta));
      sugs.push({tipo:"futuro",
        titulo:"Bodegon tiene IVA a pagar — SRL tiene credito a favor",
        detalle:"Pedile a los proveedores que comparten ambos locales que las proximas facturas las emitan al CUIT de Calzon Gitano SRL (30-71844629-1). Monto a redirigir:",
        cuitDestino:"Calzon Gitano SRL — CUIT 30-71844629-1",
        monto:diff,
        provsComunes:provsComunes});
    }
    if(posSRL.neta>0&&posL1<0){
      var diff2=Math.min(posSRL.neta,Math.abs(posL1));
      sugs.push({tipo:"futuro",
        titulo:"SRL tiene IVA a pagar — Bodegon tiene credito a favor",
        detalle:"Pedile a los proveedores que comparten ambos locales que las proximas facturas las emitan al CUIT del Bodegon (20-26958479-4). Monto a redirigir:",
        cuitDestino:"Colantonio Carlos Nicolas — CUIT 20-26958479-4",
        monto:diff2,
        provsComunes:provsComunes});
    }
    return sugs;
  }

  var sugerencias=generarSugerencias();

  function fmt(n){return "$"+Math.abs(n).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});}

  var LOCALES_CTRL=[
    {id:"l1",nombre:"El Bodegón",emoji:"🍷",color:"#C1440E",cuit:"20-26958479-4"},
    {id:"l2",nombre:"Kusama",emoji:"🌸",color:"#8B2FC9",cuit:"30-71844629-1"},
    {id:"l3",nombre:"Colantonio's",emoji:"🍝",color:"#1A6B8A",cuit:"30-71844629-1"}
  ];

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Módulo Administración</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>🧾 Posición IVA</div>
        </div>
        <select value={mesFiltro} onChange={function(e){setMesFiltro(e.target.value);}} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #2A2A2A",background:"#111",color:"#F0EDE8",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>
          {mesesDisp.map(function(m){return <option key={m} value={m}>{m}</option>;})}
        </select>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {[["posicion","📊 Posición"],["compras","🧾 Crédito fiscal"],["optimizacion","💡 Optimización"]].map(function(t){
          return <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{padding:"7px 14px",borderRadius:9,border:"1px solid "+(tab===t[0]?"#D4A017":"#1A1A1A"),background:tab===t[0]?"#D4A01722":"none",color:tab===t[0]?"#D4A017":"#555",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif",fontWeight:tab===t[0]?700:400}}>{t[1]}</button>;
        })}
      </div>

      {/* TAB: POSICIÓN */}
      {tab==="posicion"&&(
        <div>
          {/* Alertas $500k */}
          {LOCALES_CTRL.map(function(l){
            var pos=posicionPorLocal[l.id];
            if(!pos||pos.neta<=ALERTA_UMBRAL)return null;
            return(
              <div key={l.id} style={{background:"#1A0800",border:"2px solid #FF4400",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:22}}>🚨</div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#FF4400"}}>{l.emoji} {l.nombre} — Posición a pagar supera $500.000</div>
                  <div style={{fontSize:11,color:"#AA3300",marginTop:2}}>IVA neto a ingresar: {fmt(pos.neta)}</div>
                </div>
              </div>
            );
          })}

          {/* Cards por local */}
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            {LOCALES_CTRL.map(function(l){
              var pos=posicionPorLocal[l.id];
              var aPagar=pos.neta>0;
              return(
                <div key={l.id} style={{background:"#111",border:"1px solid "+l.color+"44",borderRadius:12,padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:l.color}}>{l.emoji} {l.nombre}</div>
                      <div style={{fontSize:10,color:"#444",marginTop:2}}>CUIT {l.cuit}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10,color:aPagar?"#FF4400":"#3A7D44",textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{aPagar?"A PAGAR":"A FAVOR"}</div>
                      <div style={{fontSize:18,fontWeight:800,fontFamily:"'Playfair Display',serif",color:aPagar?"#FF6644":"#3A7D44"}}>{fmt(pos.neta)}</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <div style={{background:"#0F0F0F",borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:9,color:"#555",textTransform:"uppercase",marginBottom:3}}>📤 Débito fiscal (ventas)</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#F0EDE8"}}>{fmt(pos.df)}</div>
                      <div style={{fontSize:9,color:"#444",marginTop:2}}>transferencias + tarjetas</div>
                    </div>
                    <div style={{background:"#0F0F0F",borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:9,color:"#555",textTransform:"uppercase",marginBottom:3}}>📥 Crédito fiscal (compras)</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#D4A017"}}>{fmt(pos.cf)}</div>
                      <div style={{fontSize:9,color:"#444",marginTop:2}}>facturas registradas</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Consolidado SRL */}
          <div style={{background:"#0F0A1A",border:"1px solid #8B2FC944",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#8B2FC9",marginBottom:8}}>🏢 Consolidado SRL — Kusama + Colantonio's (CUIT 30-71844629-1)</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:"#555"}}>Débito fiscal: <span style={{color:"#F0EDE8"}}>{fmt(posSRL.df)}</span> · Crédito fiscal: <span style={{color:"#D4A017"}}>{fmt(posSRL.cf)}</span></div>
              <div>
                <div style={{fontSize:10,color:posSRL.neta>0?"#FF4400":"#3A7D44",fontWeight:700}}>{posSRL.neta>0?"A PAGAR":"A FAVOR"}</div>
                <div style={{fontSize:16,fontWeight:800,fontFamily:"'Playfair Display',serif",color:posSRL.neta>0?"#FF6644":"#3A7D44"}}>{fmt(posSRL.neta)}</div>
              </div>
            </div>
            {posSRL.neta>ALERTA_UMBRAL&&<div style={{marginTop:8,fontSize:11,color:"#FF4400",fontWeight:700}}>🚨 Posición SRL supera $500.000</div>}
          </div>
        </div>
      )}

      {/* TAB: CRÉDITO FISCAL (compras) */}
      {tab==="compras"&&(
        <div>
          {LOCALES_CTRL.map(function(l){
            var loc=comprasPorLocal[l.id];
            if(!loc||loc.items.length===0)return(
              <div key={l.id} style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:l.color,marginBottom:4}}>{l.emoji} {l.nombre}</div>
                <div style={{fontSize:11,color:"#444"}}>Sin comprobantes facturados en {mesFiltro}</div>
              </div>
            );
            return(
              <div key={l.id} style={{background:"#111",border:"1px solid "+l.color+"33",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:l.color}}>{l.emoji} {l.nombre}</div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:"#555"}}>IVA crédito fiscal</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#D4A017"}}>{fmt(loc.ivaCF)}</div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {loc.items.map(function(g){
                    return(
                      <div key={g.id} style={{borderBottom:"1px solid #1A1A1A",padding:"6px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:11,color:"#F0EDE8"}}>{g.concepto}</div>
                          <div style={{fontSize:10,color:"#444"}}>{fmtDate(g.fecha)} · {g.categoria} · IVA: {fmt(g.ivaCalc)}</div>
                        </div>
                        <div style={{fontSize:12,fontWeight:700,color:"#555"}}>{fmt(parseFloat(g.monto||0))}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB: OPTIMIZACIÓN */}
      {tab==="optimizacion"&&(
        <div>
          {sugerencias.length===0?(
            <div style={{background:"#0A1A0A",border:"1px solid #3A7D4433",borderRadius:12,padding:"24px",textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>✅</div>
              <div style={{fontSize:13,color:"#3A7D44",fontWeight:700}}>Posiciones balanceadas</div>
              <div style={{fontSize:11,color:"#444",marginTop:4}}>No hay oportunidades de optimización en {mesFiltro}</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {sugerencias.map(function(s,i){
                var lDe=LOCALES_CTRL.find(function(l){return l.id===s.de;});
                var lA=LOCALES_CTRL.find(function(l){return l.id===s.a;});
                return(
                  <div key={i} style={{background:"#111",border:"1px solid #D4A01733",borderRadius:12,padding:"14px 16px"}}>
                    {s.tipo==="reasignar"?(
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                          <div style={{fontSize:18}}>🔄</div>
                          <div style={{fontSize:12,fontWeight:700,color:"#D4A017"}}>{s.titulo}</div>
                        </div>
                        <div style={{fontSize:11,color:"#888",marginBottom:8}}>{s.detalle}</div>
                        <div style={{fontSize:11,color:"#555",marginBottom:8}}>
                          De <span style={{color:lDe?lDe.color:"#F0EDE8",fontWeight:700}}>{lDe?lDe.emoji+" "+lDe.nombre:s.de}</span> → <span style={{color:lA?lA.color:"#F0EDE8",fontWeight:700}}>{lA?lA.emoji+" "+lA.nombre:s.a}</span>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:10}}>
                          {s.items.map(function(g){
                            var lOrigen=LOCALES_CTRL.find(function(l){return l.id===g.localOrigen;});
                            return(
                              <div key={g.id} style={{background:"#0F0F0F",borderRadius:8,padding:"8px 10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                                <div>
                                  <div style={{fontSize:11,color:"#F0EDE8",fontWeight:600}}>{g.concepto}</div>
                                  <div style={{fontSize:10,color:"#444",marginTop:2}}>{fmtDate(g.fecha)} · {g.categoria}</div>
                                  {g.localOrigen&&g.localOrigen!==s.de&&lOrigen&&<div style={{fontSize:10,color:lOrigen.color,marginTop:2}}>Cargado en {lOrigen.emoji} {lOrigen.nombre}</div>}
                                  <div style={{fontSize:10,color:"#D4A017",marginTop:2}}>IVA: {fmt(g.ivaCalc)}</div>
                                </div>
                                <div style={{fontSize:12,fontWeight:700,color:"#888",marginLeft:10}}>{fmt(parseFloat(g.monto||0))}</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{background:"#1A1400",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#D4A017",fontWeight:700}}>
                          💡 Reasignando estas facturas reducís la posición a pagar en {fmt(s.impacto)}
                        </div>
                      </div>
                    ):(
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                          <div style={{fontSize:18}}>📋</div>
                          <div style={{fontSize:12,fontWeight:700,color:"#D4A017"}}>{s.titulo}</div>
                        </div>
                        <div style={{fontSize:11,color:"#888",marginBottom:10}}>{s.detalle}</div>
                        <div style={{background:"#0F0F0F",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                          <div style={{fontSize:10,color:"#555",marginBottom:4}}>Facturar a:</div>
                          <div style={{fontSize:12,fontWeight:700,color:"#D4A017",marginBottom:6}}>{s.cuitDestino}</div>
                          <div style={{fontSize:11,color:"#555"}}>Monto a redirigir: <span style={{color:"#F0EDE8",fontWeight:700}}>{fmt(s.monto)}</span></div>
                        </div>
                        {s.provsComunes&&s.provsComunes.length>0&&(
                          <div style={{background:"#0A0A1A",borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontSize:10,color:"#555",marginBottom:6}}>Categorías de proveedores compartidos entre locales:</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                              {s.provsComunes.map(function(p){return(
                                <span key={p} style={{background:"#1A1A2A",borderRadius:5,padding:"3px 8px",fontSize:10,color:"#8888CC"}}>{p}</span>
                              );})}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// PANEL ANALYTICS
function PanelAnalytics(p) {
  var ordenes=p.ordenes, proveedores=p.proveedores;
  var [periodo,setPeriodo]=useState("todo");

  // Filter by period
  var ahora=new Date();
  var ordensFiltradas=ordenes.filter(function(o){
    if(o.status==="cancelada")return false;
    if(periodo==="todo")return true;
    var fecha=new Date(o.createdAt||o.fecha);
    if(periodo==="mes") return fecha.getMonth()===ahora.getMonth()&&fecha.getFullYear()===ahora.getFullYear();
    if(periodo==="semana"){var diff=(ahora-fecha)/(1000*60*60*24);return diff<=7;}
    return true;
  });

  // Gasto por local
  var gastoLocal={};
  LOCALES.forEach(function(l){gastoLocal[l.id]=0;});
  ordensFiltradas.forEach(function(o){
    var tot=(o.provSections||[]).reduce(function(a,s){return a+s.items.reduce(function(b,i){return b+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);
    gastoLocal[o.local]=(gastoLocal[o.local]||0)+tot;
  });

  // Gasto por proveedor
  var gastoProv={};
  ordensFiltradas.forEach(function(o){
    (o.provSections||[]).forEach(function(sec){
      var pv=proveedores.find(function(x){return x.id===sec.provId;});
      var nombre=pv?pv.nombre:sec.provId;
      var tot=sec.items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
      gastoProv[nombre]=(gastoProv[nombre]||0)+tot;
    });
  });

  // Productos más pedidos
  var conteoProds={};
  ordensFiltradas.forEach(function(o){
    (o.provSections||[]).forEach(function(sec){
      sec.items.forEach(function(item){
        var key=item.nombre;
        if(!conteoProds[key])conteoProds[key]={nombre:item.nombre,cantidad:0,veces:0};
        conteoProds[key].cantidad+=parseFloat(item.cantidad||0);
        conteoProds[key].veces+=1;
      });
    });
  });

  var topProvs=Object.entries(gastoProv).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  var topProds=Object.values(conteoProds).sort(function(a,b){return b.veces-a.veces;}).slice(0,10);
  var totalGeneral=Object.values(gastoLocal).reduce(function(a,b){return a+b;},0);
  var maxGasto=Math.max.apply(null,Object.values(gastoLocal).concat([1]));
  var maxProv=topProvs.length>0?topProvs[0][1]:1;

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      {/* Periodo filter */}
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[["todo","Todo el tiempo"],["mes","Este mes"],["semana","Esta semana"]].map(function(opt){
          return(
            <button key={opt[0]} onClick={function(){setPeriodo(opt[0]);}}
              style={{padding:"6px 14px",borderRadius:20,border:"1px solid "+(periodo===opt[0]?"#D4A017":"#1E1E1E"),background:periodo===opt[0]?"#D4A01722":"none",color:periodo===opt[0]?"#D4A017":"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
              {opt[1]}
            </button>
          );
        })}
      </div>

      {/* Total general */}
      <div style={{background:"#111",border:"1px solid #C1440E33",borderRadius:12,padding:"14px 18px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Total gastado</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:800,color:"#C1440E"}}>${totalGeneral.toFixed(0)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"#555"}}>{ordensFiltradas.length} órdenes</div>
          <div style={{fontSize:11,color:"#555"}}>{Object.keys(conteoProds).length} productos distintos</div>
        </div>
      </div>

      {/* Gasto por local */}
      <div style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:12,padding:"14px 18px",marginBottom:14}}>
        <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}}>Gasto por local</div>
        {LOCALES.map(function(l){
          var gasto=gastoLocal[l.id]||0;
          var pct=totalGeneral>0?(gasto/totalGeneral*100):0;
          var barPct=maxGasto>0?(gasto/maxGasto*100):0;
          return(
            <div key={l.id} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:l.color,fontWeight:600}}>{l.emoji} {l.nombre}</span>
                <span style={{fontSize:12,color:"#F0EDE8",fontWeight:700}}>${gasto.toFixed(0)} <span style={{color:"#555",fontSize:10}}>({pct.toFixed(0)}%)</span></span>
              </div>
              <div style={{height:6,background:"#1A1A1A",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:barPct+"%",background:l.color,borderRadius:3,transition:"width 0.5s"}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top proveedores */}
      <div style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:12,padding:"14px 18px",marginBottom:14}}>
        <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}}>Top proveedores por gasto</div>
        {topProvs.length===0?<div style={{fontSize:12,color:"#333",fontStyle:"italic"}}>Sin datos</div>:topProvs.map(function(entry,idx){
          var pct=maxProv>0?(entry[1]/maxProv*100):0;
          return(
            <div key={entry[0]} style={{marginBottom:9}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:11,color:"#CCC"}}>{idx+1}. {entry[0]}</span>
                <span style={{fontSize:11,color:"#D4A017",fontWeight:700}}>${entry[1].toFixed(0)}</span>
              </div>
              <div style={{height:4,background:"#1A1A1A",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:pct+"%",background:"#D4A017",borderRadius:2}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top productos */}
      <div style={{background:"#111",border:"1px solid #1A1A1A",borderRadius:12,padding:"14px 18px"}}>
        <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}}>Productos más pedidos</div>
        {topProds.length===0?<div style={{fontSize:12,color:"#333",fontStyle:"italic"}}>Sin datos</div>:topProds.map(function(prod,idx){
          return(
            <div key={prod.nombre} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1A1A1A"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#444",width:16}}>{idx+1}</span>
                <span style={{fontSize:12,color:"#CCC"}}>{prod.nombre}</span>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"#C1440E",fontWeight:700}}>{prod.veces}x pedido</div>
                <div style={{fontSize:10,color:"#555"}}>{prod.cantidad.toFixed(0)} unidades total</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



// Stock Supabase
async function sbLoadStock(localId) {
  try {
    var r = await fetch(SURL + "/rest/v1/stock?local=eq."+localId+"&order=plato", { headers: SH });
    var d = await r.json();
    if (!Array.isArray(d)) return {};
    var result = {};
    d.forEach(function(s){ result[s.plato] = { cantidad: s.cantidad, minimo: s.minimo||0, updatedAt: s.updated_at }; });
    return result;
  } catch(e) { return {}; }
}

async function sbUpdateStock(localId, plato, cantidad, minimo) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    var id = localId + "_" + plato.replace(/[^a-zA-Z0-9]/g,"_");
    await fetch(SURL + "/rest/v1/stock", { method: "POST", headers: h, body: JSON.stringify({ id: id, local: localId, plato: plato, cantidad: cantidad, minimo: minimo||0, updated_at: new Date().toISOString() }) });
  } catch(e) {}
}

async function sbLogMovimiento(localId, plato, tipo, cantidad, usuario) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/stock_movimientos", { method: "POST", headers: h, body: JSON.stringify({ id: String(Date.now()), local: localId, plato: plato, tipo: tipo, cantidad: cantidad, usuario: usuario, created_at: new Date().toISOString() }) });
  } catch(e) {}
}



// ─── EDITOR MENÚ STOCK ────────────────────────────────────────────────────────
function EditorMenuStock(p) {
  var onClose=p.onClose, onSave=p.onSave;
  var [localSel,setLocalSel]=useState("l1");
  var [menu,setMenu]=useState(function(){ return JSON.parse(JSON.stringify(MENU_POR_LOCAL)); });
  var [nuevaCat,setNuevaCat]=useState("");
  var [nuevoPlato,setNuevoPlato]=useState("");
  var [catSel,setCatSel]=useState("");

  var menuActual=menu[localSel]||{};
  var cats=Object.keys(menuActual);

  function addCat(){
    if(!nuevaCat.trim())return;
    setMenu(function(m){var n=JSON.parse(JSON.stringify(m));if(!n[localSel])n[localSel]={};n[localSel][nuevaCat.trim()]=[];return n;});
    setCatSel(nuevaCat.trim());
    setNuevaCat("");
  }

  function delCat(cat){
    if(!window.confirm("¿Eliminar la categoría '"+cat+"' y todos sus platos?"))return;
    setMenu(function(m){var n=JSON.parse(JSON.stringify(m));delete n[localSel][cat];return n;});
    if(catSel===cat)setCatSel("");
  }

  function addPlato(){
    if(!nuevoPlato.trim()||!catSel)return;
    setMenu(function(m){var n=JSON.parse(JSON.stringify(m));if(!n[localSel][catSel])n[localSel][catSel]=[];n[localSel][catSel].push(nuevoPlato.trim());return n;});
    setNuevoPlato("");
  }

  function delPlato(cat,plato){
    setMenu(function(m){var n=JSON.parse(JSON.stringify(m));n[localSel][cat]=n[localSel][cat].filter(function(p){return p!==plato;});return n;});
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,5,5,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:18,width:"min(820px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:"'Lora',serif",overflow:"hidden"}}>
        
        {/* Header */}
        <div style={{padding:"17px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:10,color:"#444",letterSpacing:3,textTransform:"uppercase"}}>Administración</div>
            <h2 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19}}>🍽️ Editor de Menú / Stock</h2>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){onSave(menu);}} style={{...BS("#3A7D44"),fontSize:12}}>✓ Guardar</button>
            <button onClick={onClose} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:8,width:30,height:30,cursor:"pointer"}}>✕</button>
          </div>
        </div>

        {/* Local selector */}
        <div style={{padding:"12px 22px",borderBottom:"1px solid #1E1E1E",display:"flex",gap:6,flexShrink:0}}>
          {LOCALES.map(function(l){
            return(
              <button key={l.id} onClick={function(){setLocalSel(l.id);setCatSel("");}}
                style={{padding:"6px 14px",borderRadius:20,border:"1px solid "+(localSel===l.id?l.color:"#1E1E1E"),background:localSel===l.id?l.color+"22":"none",color:localSel===l.id?l.color:"#555",fontFamily:"'Lora',serif",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {l.emoji} {l.nombre}
              </button>
            );
          })}
        </div>

        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Categorías */}
          <div style={{width:240,borderRight:"1px solid #1A1A1A",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"10px 12px",borderBottom:"1px solid #1A1A1A"}}>
              <div style={{fontSize:10,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Categorías</div>
              <div style={{display:"flex",gap:5}}>
                <input placeholder="Nueva categoría..." value={nuevaCat} onChange={function(e){setNuevaCat(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addCat();}} style={{...INP,flex:1,fontSize:11,padding:"6px 8px"}}/>
                <button onClick={addCat} style={{...BS("#C1440E"),padding:"6px 10px",fontSize:12,flexShrink:0}}>+</button>
              </div>
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {cats.length===0?<div style={{padding:"20px 12px",fontSize:12,color:"#333",fontStyle:"italic"}}>Sin categorías</div>:cats.map(function(cat){
                return(
                  <div key={cat} onClick={function(){setCatSel(cat);}}
                    style={{padding:"10px 12px",borderBottom:"1px solid #161616",cursor:"pointer",background:catSel===cat?"#1C1C1C":"transparent",borderLeft:"3px solid "+(catSel===cat?"#C1440E":"transparent"),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:catSel===cat?"#F0EDE8":"#999"}}>{cat}</div>
                      <div style={{fontSize:10,color:"#444"}}>{(menuActual[cat]||[]).length} platos</div>
                    </div>
                    <button onClick={function(e){e.stopPropagation();delCat(cat);}} style={{background:"none",border:"none",color:"#C1440E",cursor:"pointer",fontSize:13,opacity:0.6}}>🗑️</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Platos */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            {!catSel?(
              <div style={{textAlign:"center",paddingTop:60,color:"#2A2A2A"}}>
                <div style={{fontSize:32,marginBottom:10}}>👈</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:"#333"}}>Seleccioná una categoría</div>
              </div>
            ):(
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:14}}>{catSel}</div>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  <input placeholder="Nuevo plato... (Enter)" value={nuevoPlato} onChange={function(e){setNuevoPlato(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addPlato();}} style={{...INP,flex:1}}/>
                  <button onClick={addPlato} style={{...BS("#C1440E"),padding:"9px 13px",flexShrink:0}}>+</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(menuActual[catSel]||[]).length===0?<div style={{fontSize:12,color:"#333",fontStyle:"italic",padding:"12px 0"}}>Sin platos en esta categoría.</div>:(menuActual[catSel]||[]).map(function(plato,idx){
                    return(
                      <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 11px",background:"#0F0F0F",borderRadius:8,border:"1px solid #1A1A1A"}}>
                        <span style={{fontSize:12,color:"#CCC"}}>🍽️ {plato}</span>
                        <button onClick={function(){delPlato(catSel,plato);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:14}}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── RECETAS AUTOMÁTICAS ──────────────────────────────────────────────────────
var RECETAS = {
  "Desmechado de carne":  [{ plato: "Pan de desmechado", cantidad: 1 }],
  "Desmechado de cerdo":  [{ plato: "Pan de desmechado", cantidad: 1 }],
  "Desmechado de pollo":  [{ plato: "Pan de desmechado", cantidad: 1 }],
  "Medallón de carne":         [{ plato: "Pan de papa", cantidad: 1 }],
  "Medallón de carne ahumado": [{ plato: "Pan de papa", cantidad: 1 }],
  "Medallón de carne crispy":  [{ plato: "Pan de papa", cantidad: 1 }],
  "Medallón de carne NKT":     [{ plato: "Pan de papa", cantidad: 1 }],
};

// ─── PANEL STOCK ──────────────────────────────────────────────────────────────
function PanelStock(p) {
  var localId=p.localId, localNombre=p.localNombre, usuario=p.usuario, esAdmin=p.esAdmin;
  var menu = MENU_POR_LOCAL[localId] || {};
  var categorias = Object.keys(menu);
  var [stock,setStock]=useState({});
  var [loading,setLoading]=useState(true);
  var [catAct,setCatAct]=useState(categorias[0]||"");
  var [modo,setModo]=useState("ver"); // ver | cargar | descontar
  var [cambios,setCambios]=useState({});
  var [descuentos,setDescuentos]=useState({});
  var [saving,setSaving]=useState(false);
  var [minimos,setMinimos]=useState({});
  var [minimoEdit,setMinimoEdit]=useState({});

  useState(function(){
    setLoading(true);
    sbLoadStock(localId).then(function(d){
      setStock(d);
      var mins={};
      Object.keys(d).forEach(function(k){mins[k]=d[k].minimo||0;});
      setMinimos(mins);
      setLoading(false);
      // Play sound if any product is critical or zero
      var hasCritical=Object.keys(d).some(function(k){
        var status=getStockColor(d[k].cantidad,d[k].minimo||0);
        return status==="critico"||status==="cero";
      });
      if(hasCritical) setTimeout(playAlertSound, 500);
    }).catch(function(){setLoading(false);});
  },[localId]);

  function getCantidad(plato){ return stock[plato]?stock[plato].cantidad:0; }
  function getMinimo(plato){ return minimos[plato]||0; }

  async function guardarMinimos(){
    setSaving(true);
    var newStock={...stock};
    var newMinimos={...minimos};
    for(var plato of Object.keys(minimoEdit)){
      var val=parseInt(minimoEdit[plato])||0;
      newMinimos[plato]=val;
      var cant=getCantidad(plato);
      newStock[plato]={cantidad:cant,minimo:val,updatedAt:stock[plato]?stock[plato].updatedAt:new Date().toISOString()};
      await sbUpdateStock(localId,plato,cant,val);
    }
    setStock(newStock);
    setMinimos(newMinimos);
    setMinimoEdit({});
    setModo("ver");
    setSaving(false);
  }

  async function guardarCarga(){
    setSaving(true);
    var newStock={...stock};
    for(var plato of Object.keys(cambios)){
      var val=parseInt(cambios[plato])||0;
      if(val===0)continue;
      var actual=getCantidad(plato);
      var nuevo=actual+val;
      newStock[plato]={cantidad:nuevo,minimo:getMinimo(plato),updatedAt:new Date().toISOString()};
      await sbUpdateStock(localId,plato,nuevo,getMinimo(plato));
      await sbLogMovimiento(localId,plato,"entrada",val,usuario);
    }
    setStock(newStock);
    setCambios({});
    setModo("ver");
    setSaving(false);
  }

  async function guardarDescuento(){
    setSaving(true);
    var newStock={...stock};
    var todosDescuentos={...descuentos};

    // Aplicar recetas automáticas
    for(var plato of Object.keys(descuentos)){
      var val=parseInt(descuentos[plato])||0;
      if(val===0)continue;
      var receta=RECETAS[plato];
      if(receta){
        receta.forEach(function(r){
          todosDescuentos[r.plato]=(parseInt(todosDescuentos[r.plato])||0)+(r.cantidad*val);
        });
      }
    }

    // Aplicar todos los descuentos
    for(var pl of Object.keys(todosDescuentos)){
      var v=parseInt(todosDescuentos[pl])||0;
      if(v===0)continue;
      var actual=getCantidad(pl);
      var nuevo=Math.max(0,actual-v);
      newStock[pl]={cantidad:nuevo,minimo:getMinimo(pl),updatedAt:new Date().toISOString()};
      await sbUpdateStock(localId,pl,nuevo,getMinimo(pl));
      await sbLogMovimiento(localId,pl,!descuentos[pl]?"salida_auto":"salida",v,usuario);
    }
    setStock(newStock);
    setDescuentos({});
    setModo("ver");
    setSaving(false);

    // Mostrar resumen de descuentos automáticos
    var autoItems=Object.keys(todosDescuentos).filter(function(k){return !descuentos[k]&&parseInt(todosDescuentos[k])>0;});
    if(autoItems.length>0){
      alert("✓ Descuento guardado.\n\n🔗 Descuentos automáticos:\n"+autoItems.map(function(k){return "• "+k+": -"+todosDescuentos[k];}).join("\n"));
    }
  }

  var platosActuales=menu[catAct]||[];
  var totalBajos=Object.keys(stock).filter(function(k){return stock[k].cantidad<=getMinimo(k)&&stock[k].cantidad>=0;}).length;

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Control de Stock</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>{localNombre}</div>
        </div>
        {totalBajos>0&&<div style={{background:"#C1440E22",border:"1px solid #C1440E44",borderRadius:8,padding:"6px 12px",fontSize:12,color:"#C1440E",fontWeight:700}}>⚠️ {totalBajos} producto{totalBajos!==1?"s":""} bajo mínimo</div>}
      </div>

      {/* Modo buttons */}
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        <button onClick={function(){setModo("ver");setCambios({});setDescuentos({});}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(modo==="ver"?"#555":"#1E1E1E"),background:modo==="ver"?"#222":"#111",color:modo==="ver"?"#F0EDE8":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>👁 Ver stock</button>
        <button onClick={function(){setModo("cargar");setDescuentos({});}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(modo==="cargar"?"#3A7D44":"#1E1E1E"),background:modo==="cargar"?"#3A7D4422":"#111",color:modo==="cargar"?"#3A7D44":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Cargar stock</button>
        <button onClick={function(){setModo("descontar");setCambios({});}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(modo==="descontar"?"#C1440E":"#1E1E1E"),background:modo==="descontar"?"#C1440E22":"#111",color:modo==="descontar"?"#C1440E":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>- Descontar</button>
        <button onClick={function(){setModo("minimos");setCambios({});setDescuentos({});}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(modo==="minimos"?"#8B2FC9":"#1E1E1E"),background:modo==="minimos"?"#8B2FC922":"#111",color:modo==="minimos"?"#8B2FC9":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>⚡ Mínimos</button>
      </div>

      {/* Categorias */}
      <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
        {categorias.map(function(cat){
          var bajos=(menu[cat]||[]).filter(function(pl){return stock[pl]&&stock[pl].cantidad<=getMinimo(pl);}).length;
          return(
            <button key={cat} onClick={function(){setCatAct(cat);}} style={{padding:"5px 12px",borderRadius:20,border:"1px solid "+(catAct===cat?"#D4A017":"#1E1E1E"),background:catAct===cat?"#D4A01722":"none",color:catAct===cat?"#D4A017":"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
              {cat} {bajos>0&&<span style={{color:"#C1440E",fontWeight:700}}>({bajos})</span>}
            </button>
          );
        })}
      </div>

      {loading?<div style={{textAlign:"center",padding:"30px",color:"#444"}}>⏳ Cargando...</div>:(
        <div>
          {/* Lista de platos */}
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:16}}>
            {platosActuales.map(function(plato){
              var cant=getCantidad(plato);
              var min=getMinimo(plato);
              var stockSt=getStockStatus(cant,min);
              var sc=STOCK_COLORS[stockSt.status];
              return(
                <div key={plato} style={{background:sc.bg,border:"1px solid "+sc.border,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,transition:"all 0.3s"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                      <div style={{fontSize:12,color:sc.text,fontWeight:stockSt.status!=="ok"?700:400}}>{plato}</div>
                      {sc.badge&&<span style={{fontSize:10,fontWeight:800,color:sc.text,background:sc.border,padding:"1px 7px",borderRadius:10}}>{sc.badge}</span>}
                      {stockSt.status==="proximo"&&<span style={{fontSize:10,fontWeight:800,color:"#5A9D44",background:"#0F2A00",padding:"1px 7px",borderRadius:10}}>📊 A {stockSt.diff} del mínimo</span>}
                    </div>
                    {min>0&&<div style={{fontSize:10,color:"#555",marginTop:2}}>Mínimo: {min}{stock[plato]&&stock[plato].updatedAt?" · "+fmtDateTime(stock[plato].updatedAt):""}</div>}
                    {!min&&stock[plato]&&stock[plato].updatedAt&&<div style={{fontSize:10,color:"#444",marginTop:2}}>Actualizado: {fmtDateTime(stock[plato].updatedAt)}</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    {modo==="cargar"&&(
                      <input type="number" min="0" placeholder="+" value={cambios[plato]||""}
                        onChange={function(e){setCambios(function(p){var n={...p};n[plato]=e.target.value;return n;});}}
                        style={{width:60,padding:"4px 8px",borderRadius:6,border:"1px solid #3A7D44",background:"#0A140A",color:"#3A7D44",fontFamily:"'Lora',serif",fontSize:12,textAlign:"center"}}/>
                    )}
                    {modo==="descontar"&&(
                      <input type="number" min="0" max={cant} placeholder="-" value={descuentos[plato]||""}
                        onChange={function(e){setDescuentos(function(p){var n={...p};n[plato]=e.target.value;return n;});}}
                        style={{width:60,padding:"4px 8px",borderRadius:6,border:"1px solid #C1440E",background:"#1A0808",color:"#C1440E",fontFamily:"'Lora',serif",fontSize:12,textAlign:"center"}}/>
                    )}
                    {modo==="minimos"&&(
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <input type="number" min="0" placeholder="0" value={minimoEdit[plato]!==undefined?minimoEdit[plato]:getMinimo(plato)}
                          onChange={function(e){setMinimoEdit(function(m){var n={...m};n[plato]=e.target.value;return n;});}}
                          style={{width:60,padding:"4px 8px",borderRadius:6,border:"1px solid #8B2FC9",background:"#0F0A1A",color:"#8B2FC9",fontFamily:"'Lora',serif",fontSize:12,textAlign:"center"}}/>
                        <div style={{fontSize:9,color:"#555"}}>mínimo</div>
                      </div>
                    )}
                    <div style={{width:50,textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:800,fontFamily:"'Playfair Display',serif",color:sc.text}}>{cant}</div>
                      <div style={{fontSize:9,color:"#444"}}>unidades</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botón guardar */}
          {modo==="cargar"&&Object.keys(cambios).filter(function(k){return cambios[k]>0;}).length>0&&(
            <button onClick={guardarCarga} disabled={saving} style={{...BS("#3A7D44"),width:"100%",padding:"12px",fontSize:14}}>{saving?"⏳ Guardando...":"✓ Guardar carga de stock"}</button>
          )}
          {modo==="descontar"&&Object.keys(descuentos).filter(function(k){return descuentos[k]>0;}).length>0&&(
            <button onClick={guardarDescuento} disabled={saving} style={{...BS("#C1440E"),width:"100%",padding:"12px",fontSize:14}}>{saving?"⏳ Guardando...":"✓ Guardar descuento de cierre"}</button>
          )}
          {modo==="minimos"&&Object.keys(minimoEdit).length>0&&(
            <button onClick={guardarMinimos} disabled={saving} style={{...BS("#8B2FC9"),width:"100%",padding:"12px",fontSize:14}}>{saving?"⏳ Guardando...":"✓ Guardar mínimos"}</button>
          )}
        </div>
      )}
    </div>
  );
}


// Menu Stock Supabase
async function sbLoadMenuStock() {
  try {
    var r = await fetch(SURL + "/rest/v1/menu_stock?order=local,categoria", { headers: SH });
    var d = await r.json();
    if (!Array.isArray(d) || d.length === 0) return null;
    var result = { l1:{}, l2:{}, l3:{}, l4:{} };
    d.forEach(function(row){
      if(!result[row.local]) result[row.local]={};
      result[row.local][row.categoria] = row.platos||[];
    });
    return result;
  } catch(e) { return null; }
}

async function sbSaveMenuStock(localId, categoria, platos) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    var id = localId + "_" + categoria.replace(/[^a-zA-Z0-9]/g,"_");
    await fetch(SURL + "/rest/v1/menu_stock", { method: "POST", headers: h, body: JSON.stringify({ id: id, local: localId, categoria: categoria, platos: platos }) });
  } catch(e) {}
}

async function sbDeleteMenuStock(localId, categoria) {
  try {
    var id = localId + "_" + categoria.replace(/[^a-zA-Z0-9]/g,"_");
    await fetch(SURL + "/rest/v1/menu_stock?id=eq."+id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

// Stock Materia Prima Supabase
async function sbLoadStockMP(localId) {
  try {
    var r = await fetch(SURL + "/rest/v1/stock_materia_prima?local=eq."+localId+"&order=producto", { headers: SH });
    var d = await r.json();
    if (!Array.isArray(d)) return {};
    var result = {};
    d.forEach(function(s){ result[s.producto] = { cantidad: s.cantidad, unidad: s.unidad||"unid", minimo: s.minimo||0, proveedor: s.proveedor||"", updatedAt: s.updated_at }; });
    return result;
  } catch(e) { return {}; }
}

async function sbUpdateStockMP(localId, producto, cantidad, unidad, minimo, proveedor) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    var id = localId + "_" + producto.replace(/[^a-zA-Z0-9]/g,"_").slice(0,50);
    await fetch(SURL + "/rest/v1/stock_materia_prima", { method: "POST", headers: h, body: JSON.stringify({ id: id, local: localId, producto: producto, cantidad: cantidad, unidad: unidad||"unid", minimo: minimo||0, proveedor: proveedor||"", updated_at: new Date().toISOString() }) });
  } catch(e) {}
}

async function sbLogMovimientoMP(localId, producto, tipo, cantidad, unidad, usuario) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/stock_mp_movimientos", { method: "POST", headers: h, body: JSON.stringify({ id: String(Date.now())+"_"+Math.random().toString(36).slice(2,6), local: localId, producto: producto, tipo: tipo, cantidad: cantidad, unidad: unidad||"unid", usuario: usuario, created_at: new Date().toISOString() }) });
  } catch(e) {}
}

// ─── CIERRES CAJA SUPABASE ────────────────────────────────────────────────────
async function sbLoadCierres() {
  try {
    var r = await fetch(SURL + "/rest/v1/cierres_caja?order=created_at.desc", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function sbSaveCierre(cierre) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    var r = await fetch(SURL + "/rest/v1/cierres_caja", { method: "POST", headers: h, body: JSON.stringify(cierre) });
    if (!r.ok) {
      var err = await r.text();
      alert("Error al guardar: " + err);
    }
    return r.ok;
  } catch(e) { alert("Error de conexión: " + e.message); return false; }
}

async function sbDeleteCierre(id) {
  try {
    await fetch(SURL + "/rest/v1/cierres_caja?id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

// ─── RETIROS SUPABASE ─────────────────────────────────────────────────────────
async function sbLoadRetiros() {
  try {
    var r = await fetch(SURL + "/rest/v1/retiros?order=created_at.desc", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function sbSaveRetiro(retiro) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/retiros", { method: "POST", headers: h, body: JSON.stringify(retiro) });
  } catch(e) {}
}

async function sbDeleteRetiro(id) {
  try {
    await fetch(SURL + "/rest/v1/retiros?id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

// ─── CATEGORIAS GASTOS SUPABASE ───────────────────────────────────────────────
async function sbLoadCategoriasGastos() {
  try {
    var r = await fetch(SURL + "/rest/v1/categorias_gastos?order=grupo,nombre", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function sbSaveCategoriaGasto(id, grupo, nombre) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/categorias_gastos", { method: "POST", headers: h, body: JSON.stringify({ id: id, grupo: grupo, nombre: nombre }) });
  } catch(e) {}
}

async function sbDeleteCategoriaGasto(id) {
  try {
    await fetch(SURL + "/rest/v1/categorias_gastos?id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

// ─── GASTOS SUPABASE ──────────────────────────────────────────────────────────
async function sbLoadGastos() {
  try {
    var r = await fetch(SURL + "/rest/v1/gastos?order=created_at.desc", { headers: SH });
    var d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function sbSaveGasto(gasto) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/gastos", { method: "POST", headers: h, body: JSON.stringify(gasto) });
  } catch(e) {}
}

async function sbDeleteGasto(id) {
  try {
    await fetch(SURL + "/rest/v1/gastos?id=eq." + id, { method: "DELETE", headers: SH });
  } catch(e) {}
}

async function sbLoadCorrResultados() {
  try {
    var r = await fetch(SURL + "/rest/v1/correcciones_resultados?select=*", { headers: SH });
    var data = await r.json();
    // Convertir array a objeto {localId_mes: {...}}
    var obj = {};
    (data||[]).forEach(function(c){ obj[c.local+"_"+c.mes] = c; });
    return obj;
  } catch(e) { return {}; }
}

async function sbSaveCorrResultado(corr) {
  try {
    var h = {...SH, "Prefer": "resolution=merge-duplicates,return=representation"};
    await fetch(SURL + "/rest/v1/correcciones_resultados", { method: "POST", headers: h, body: JSON.stringify(corr) });
  } catch(e) {}
}

// ─── ALERTAS STOCK ────────────────────────────────────────────────────────────
function playAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Three beeps
    [0, 0.3, 0.6].forEach(function(t) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch(e) {}
}

function getStockStatus(cant, minimo) {
  if (cant === 0) return { status: "cero", diff: 0 };
  if (minimo <= 0) return { status: "ok", diff: 0 };
  var diff = cant - minimo;
  if (cant <= minimo) return { status: "critico", diff: diff };
  if (diff <= 2) return { status: "proximo", diff: diff };
  if (cant <= minimo * 1.5) return { status: "bajo", diff: diff };
  return { status: "ok", diff: diff };
}

function getStockColor(cant, minimo) {
  return getStockStatus(cant, minimo).status;
}

var STOCK_COLORS = {
  ok:      { bg: "#111",    border: "#1A1A1A", text: "#CCC",     badge: null },
  proximo: { bg: "#0F1A00", border: "#3A7D4488", text: "#5A9D44", badge: null },
  bajo:    { bg: "#1A1500", border: "#D4A01744", text: "#D4A017", badge: "⚠️ BAJO" },
  critico: { bg: "#1A0808", border: "#C1440E88", text: "#C1440E", badge: "🔴 CRÍTICO" },
  cero:    { bg: "#2A0000", border: "#C1440EBB", text: "#FF4444", badge: "❌ SIN STOCK" },
};

// ─── STOCK DATA ───────────────────────────────────────────────────────────────
var MENU_BODEGON = {
  "Entradas": ["Albóndigas de cerdo","Albóndigas de merluza y langostinos","Aros de cebolla","Bastones de muzzarella","Bastones de salmón","Bombas de papa","Brocheta de langostinos","Brusquetón de pastrón","Brusquetón de salmón","Brusquetón NKT","Burrata capresse","Cornalitos fritos","Crocantes de pollo","Croquetas de verdura","Gambas al ajillo","Langostinos","Mejillones","Omelette XL","Provoleta campera","Provoleta NKT","Rabas","Rabas media porción","Sushi Kusama"],
  "Picadas": ["Picada de fiambres","Picada de mariscos"],
  "Pizzas": ["Anchoas","Boconccinos","Burrata y pesto","Capresse","Crudo y rúcula","Del bosque","Del mar","Especial","Fugazzeta","Hongos y salsa de ostras","Langostinos al ajillo","Mortadela","Muzzarella","Muzzarella con huevo","Napolitana","Panceta y huevo","Pepperoni","Super roquefort","Tres quesos","Verduras"],
  "Sándwiches": ["Baguette de mortadela","Baguette de pastrón","Ciabatta de rabas","Crudo","Desmechado de carne","Desmechado de cerdo","Desmechado de pollo","Gravlax de salmón","Medallón de carne","Medallón de carne ahumado","Medallón de carne crispy","Medallón de carne NKT","Vegetariano"],
  "Papas": ["Papas de mar","Papas fritas","Papas ibéricas","Papas NKT","Papas picantes","Papas roquefort"],
  "Ensaladas": ["Ensalada con langostinos","Ensalada de vegetales asados","Ensalada NKT","Ensalada serrana"],
  "Especialidades": ["Abadejo de autor","Bife de chorizo","Milanesa de lenguado","Milanesa de pollo","Milanesa de ternera","Salmón","Trucha al eneldo"]
};

// MENU_POR_LOCAL starts empty - loaded from Supabase, falls back to MENU_BODEGON only if no Supabase data
var MENU_POR_LOCAL = { "l1": {}, "l2": {}, "l3": {}, "l4": {} };


// ─── PANEL STOCK MATERIA PRIMA ────────────────────────────────────────────────
function PanelStockMP(p) {
  var localId=p.localId, localNombre=p.localNombre, usuario=p.usuario, proveedores=p.proveedores, productos=p.productos;
  var [stock,setStock]=useState({});
  var [loading,setLoading]=useState(true);
  var [modo,setModo]=useState("ver");
  var [descuentos,setDescuentos]=useState({});
  var [cargaManual,setCargaManual]=useState({});
  var [saving,setSaving]=useState(false);
  var [provSel,setProvSel]=useState(null);
  var [showAddProd,setShowAddProd]=useState(false);
  var [newProd,setNewProd]=useState({nombre:"",cantidad:"",unidad:"kg",proveedor:""});
  var [minimoEditMP,setMinimoEditMP]=useState({});

  useState(function(){
    setLoading(true);
    sbLoadStockMP(localId).then(function(d){
      setStock(d);
      setLoading(false);
      var hasCritical=Object.keys(d).some(function(k){
        var status=getStockColor(parseFloat(d[k].cantidad),parseFloat(d[k].minimo||0));
        return status==="critico"||status==="cero";
      });
      if(hasCritical) setTimeout(playAlertSound, 500);
    }).catch(function(){setLoading(false);});
  },[localId]);

  // Build product list from proveedores
  var todosProductos=[];
  proveedores.forEach(function(pv){
    (productos[pv.id]||[]).forEach(function(prod){
      todosProductos.push({nombre:prod,proveedor:pv.nombre,provId:pv.id});
    });
  });

  // Filter by selected proveedor
  var proveedoresFiltrados = provSel
    ? proveedores.filter(function(pv){return pv.id===provSel;})
    : proveedores.filter(function(pv){return (productos[pv.id]||[]).length>0;});

  // Also include manual products in stock not in list
  var stockKeys=Object.keys(stock);
  var nombresEnLista=todosProductos.map(function(p){return p.nombre;});
  var extrasEnStock=stockKeys.filter(function(k){return !nombresEnLista.includes(k);});

  function getCant(prod){return stock[prod]?parseFloat(stock[prod].cantidad):0;}
  function getUnidad(prod){return stock[prod]?stock[prod].unidad:"unid";}
  function getProv(prod){return stock[prod]?stock[prod].proveedor:"";}

  async function guardarDescuento(){
    setSaving(true);
    var newStock={...stock};
    for(var prod of Object.keys(descuentos)){
      var val=parseFloat(descuentos[prod])||0;
      if(val===0)continue;
      var actual=getCant(prod);
      var nuevo=Math.max(0,actual-val);
      var unidad=getUnidad(prod);
      var prov=getProv(prod);
      newStock[prod]={cantidad:nuevo,unidad:unidad,minimo:stock[prod]?stock[prod].minimo:0,proveedor:prov,updatedAt:new Date().toISOString()};
      await sbUpdateStockMP(localId,prod,nuevo,unidad,stock[prod]?stock[prod].minimo:0,prov);
      await sbLogMovimientoMP(localId,prod,"salida",val,unidad,usuario);
    }
    setStock(newStock);
    setDescuentos({});
    setModo("ver");
    setSaving(false);
  }

  async function guardarCargaManual(){
    setSaving(true);
    var newStock={...stock};
    for(var prod of Object.keys(cargaManual)){
      var entry=cargaManual[prod];
      if(!entry.cantidad||parseFloat(entry.cantidad)===0)continue;
      var val=parseFloat(entry.cantidad);
      var actual=getCant(prod);
      var nuevo=actual+val;
      var unidad=entry.unidad||getUnidad(prod);
      var prov=getProv(prod);
      newStock[prod]={cantidad:nuevo,unidad:unidad,minimo:stock[prod]?stock[prod].minimo:0,proveedor:prov,updatedAt:new Date().toISOString()};
      await sbUpdateStockMP(localId,prod,nuevo,unidad,stock[prod]?stock[prod].minimo:0,prov);
      await sbLogMovimientoMP(localId,prod,"entrada_manual",val,unidad,usuario);
    }
    setStock(newStock);
    setCargaManual({});
    setModo("ver");
    setSaving(false);
  }

  async function guardarMinimosMP(){
    setSaving(true);
    var newStock={...stock};
    for(var prod of Object.keys(minimoEditMP)){
      var val=parseFloat(minimoEditMP[prod])||0;
      var cant=getCant(prod);
      var unidad=getUnidad(prod);
      var prov=getProv(prod);
      newStock[prod]={cantidad:cant,unidad:unidad,minimo:val,proveedor:prov,updatedAt:stock[prod]?stock[prod].updatedAt:new Date().toISOString()};
      await sbUpdateStockMP(localId,prod,cant,unidad,val,prov);
    }
    setStock(newStock);
    setMinimoEditMP({});
    setModo("ver");
    setSaving(false);
  }

  async function agregarProductoNuevo(){
    if(!newProd.nombre.trim()||!newProd.cantidad)return;
    var val=parseFloat(newProd.cantidad);
    var newStock={...stock};
    newStock[newProd.nombre]={cantidad:val,unidad:newProd.unidad,minimo:0,proveedor:newProd.proveedor,updatedAt:new Date().toISOString()};
    await sbUpdateStockMP(localId,newProd.nombre,val,newProd.unidad,0,newProd.proveedor);
    await sbLogMovimientoMP(localId,newProd.nombre,"entrada_manual",val,newProd.unidad,usuario);
    setStock(newStock);
    setNewProd({nombre:"",cantidad:"",unidad:"kg",proveedor:""});
    setShowAddProd(false);
  }

  var totalBajos=Object.keys(stock).filter(function(k){return parseFloat(stock[k].minimo||0)>0&&parseFloat(stock[k].cantidad)<=parseFloat(stock[k].minimo||0);}).length;
  var provsUnicos=["todos",...new Set(todosProductos.map(function(p){return p.proveedor;}))];

  return(
    <div style={{fontFamily:"'Lora',serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1.5}}>Stock de Materia Prima</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>{localNombre}</div>
        </div>
        {totalBajos>0&&<div style={{background:"#C1440E22",border:"1px solid #C1440E44",borderRadius:8,padding:"6px 12px",fontSize:12,color:"#C1440E",fontWeight:700}}>⚠️ {totalBajos} bajo mínimo</div>}
      </div>

      {/* Modo buttons */}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={function(){setModo("ver");setDescuentos({});setCargaManual({});}} style={{padding:"7px 14px",borderRadius:10,border:"1px solid "+(modo==="ver"?"#555":"#1E1E1E"),background:modo==="ver"?"#222":"#111",color:modo==="ver"?"#F0EDE8":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>👁 Ver</button>
        <button onClick={function(){setModo("cargar");setDescuentos({});}} style={{padding:"7px 14px",borderRadius:10,border:"1px solid "+(modo==="cargar"?"#3A7D44":"#1E1E1E"),background:modo==="cargar"?"#3A7D4422":"#111",color:modo==="cargar"?"#3A7D44":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Cargar</button>
        <button onClick={function(){setModo("descontar");setCargaManual({});setMinimoEditMP({});}} style={{padding:"7px 14px",borderRadius:10,border:"1px solid "+(modo==="descontar"?"#C1440E":"#1E1E1E"),background:modo==="descontar"?"#C1440E22":"#111",color:modo==="descontar"?"#C1440E":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>- Descontar</button>
        <button onClick={function(){setModo("minimos");setCargaManual({});setDescuentos({});}} style={{padding:"7px 14px",borderRadius:10,border:"1px solid "+(modo==="minimos"?"#8B2FC9":"#1E1E1E"),background:modo==="minimos"?"#8B2FC922":"#111",color:modo==="minimos"?"#8B2FC9":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>⚡ Mínimos</button>
        <button onClick={function(){setShowAddProd(true);}} style={{padding:"7px 14px",borderRadius:10,border:"1px solid #D4A017",background:"#D4A01711",color:"#D4A017",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>✏️ Agregar producto</button>
      </div>

      {/* Add product manual */}
      {showAddProd&&(
        <div style={{background:"#0F0F0F",border:"1px solid #D4A01733",borderRadius:12,padding:"14px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#D4A017",fontWeight:700,marginBottom:10}}>Agregar producto al stock</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:7,marginBottom:8}}>
            <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Producto</label><input value={newProd.nombre} onChange={function(e){setNewProd(function(n){return{...n,nombre:e.target.value};});}} placeholder="Nombre..." style={INP}/></div>
            <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Cantidad</label><input type="number" value={newProd.cantidad} onChange={function(e){setNewProd(function(n){return{...n,cantidad:e.target.value};});}} placeholder="0" style={INP}/></div>
            <div><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Unidad</label><select value={newProd.unidad} onChange={function(e){setNewProd(function(n){return{...n,unidad:e.target.value};});}} style={INP}>{UNIDADES.map(function(u){return <option key={u}>{u}</option>;})}</select></div>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:10,color:"#555",display:"block",marginBottom:4}}>Proveedor</label><input value={newProd.proveedor} onChange={function(e){setNewProd(function(n){return{...n,proveedor:e.target.value};});}} placeholder="Proveedor..." style={INP}/></div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={agregarProductoNuevo} style={{...BS("#D4A017","#000"),flex:2}}>✓ Agregar</button>
            <button onClick={function(){setShowAddProd(false);}} style={{...GH,flex:1}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabs por proveedor */}
      <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={function(){setProvSel(null);}} style={{padding:"5px 12px",borderRadius:20,border:"1px solid "+(provSel===null?"#D4A017":"#1E1E1E"),background:provSel===null?"#D4A01722":"none",color:provSel===null?"#D4A017":"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
          Todos
        </button>
        {proveedores.filter(function(pv){return (productos[pv.id]||[]).length>0;}).map(function(pv){
          var enStock=(productos[pv.id]||[]).filter(function(prod){return stock[prod]!==undefined;}).length;
          var bajos=(productos[pv.id]||[]).filter(function(prod){return stock[prod]&&parseFloat(stock[prod].cantidad)===0;}).length;
          return(
            <button key={pv.id} onClick={function(){setProvSel(pv.id);}}
              style={{padding:"5px 12px",borderRadius:20,border:"1px solid "+(provSel===pv.id?"#1A6B8A":"#1E1E1E"),background:provSel===pv.id?"#1A6B8A22":"none",color:provSel===pv.id?"#1A6B8A":"#555",fontFamily:"'Lora',serif",fontSize:11,cursor:"pointer"}}>
              {pv.nombre} {bajos>0&&<span style={{color:"#C1440E",fontWeight:700}}>({bajos})</span>}
            </button>
          );
        })}
      </div>

      {loading?<div style={{textAlign:"center",padding:"30px",color:"#444"}}>⏳ Cargando...</div>:(
        <div>
          {/* Productos agrupados por proveedor */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {proveedoresFiltrados.map(function(pv){
              var prods=productos[pv.id]||[];
              if(prods.length===0)return null;
              var bajosEnProv=prods.filter(function(prod){return stock[prod]&&parseFloat(stock[prod].cantidad)===0;}).length;
              return(
                <div key={pv.id} style={{background:"#0F0F0F",borderRadius:12,border:"1px solid "+(bajosEnProv>0?"#C1440E33":"#1E1E1E"),overflow:"hidden"}}>
                  {/* Proveedor header */}
                  <div style={{padding:"10px 14px",background:"#151515",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#F0EDE8"}}>{pv.nombre}</div>
                      <div style={{fontSize:10,color:"#555"}}>{pv.categoria} · {prods.length} productos</div>
                    </div>
                    {bajosEnProv>0&&<div style={{fontSize:11,color:"#C1440E",fontWeight:700}}>⚠️ {bajosEnProv} en cero</div>}
                  </div>
                  {/* Productos */}
                  <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:4}}>
                    {prods.map(function(prod){
                      var cant=getCant(prod);
                      var unidad=getUnidad(prod)||"unid";
                      var enStock=stock[prod]!==undefined;
                      var minimo=stock[prod]?parseFloat(stock[prod].minimo||0):0;
                      var stockSt2=enStock?getStockStatus(cant,minimo):{status:"ok",diff:0};
                      var sc2=STOCK_COLORS[stockSt2.status];
                      return(
                        <div key={prod} style={{background:enStock?sc2.bg:"#111",border:"1px solid "+(enStock?sc2.border:"#1A1A1A"),borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,transition:"all 0.3s"}}>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                              <span style={{fontSize:12,color:enStock?sc2.text:"#CCC",fontWeight:stockSt2.status!=="ok"&&enStock?700:400}}>{prod}</span>
                              {enStock&&sc2.badge&&<span style={{fontSize:9,fontWeight:800,color:sc2.text,background:sc2.border,padding:"1px 6px",borderRadius:8}}>{sc2.badge}</span>}
                              {enStock&&stockSt2.status==="proximo"&&<span style={{fontSize:9,fontWeight:800,color:"#5A9D44",background:"#0F2A00",padding:"1px 6px",borderRadius:8}}>📊 A {stockSt2.diff} del mín.</span>}
                            </div>
                            {minimo>0&&enStock&&<div style={{fontSize:9,color:"#555",marginTop:1}}>Mínimo: {minimo}</div>}
                          </div>
                          {modo==="cargar"&&(
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <input type="number" min="0" placeholder="+" value={cargaManual[prod]?cargaManual[prod].cantidad:""} onChange={function(e){setCargaManual(function(c){var n={...c};n[prod]={cantidad:e.target.value,unidad:cargaManual[prod]?cargaManual[prod].unidad:unidad};return n;});}} style={{width:55,padding:"4px 6px",borderRadius:6,border:"1px solid #3A7D44",background:"#0A140A",color:"#3A7D44",fontFamily:"'Lora',serif",fontSize:12,textAlign:"center"}}/>
                              <select value={cargaManual[prod]?cargaManual[prod].unidad:unidad} onChange={function(e){setCargaManual(function(c){var n={...c};if(!n[prod])n[prod]={cantidad:"",unidad:e.target.value};else n[prod].unidad=e.target.value;return n;});}} style={{width:50,padding:"3px",borderRadius:6,border:"1px solid #3A7D44",background:"#0A140A",color:"#3A7D44",fontFamily:"'Lora',serif",fontSize:10}}>{UNIDADES.map(function(u){return <option key={u}>{u}</option>;})}</select>
                            </div>
                          )}
                          {modo==="descontar"&&enStock&&<input type="number" min="0" placeholder="-" value={descuentos[prod]||""} onChange={function(e){setDescuentos(function(d){var n={...d};n[prod]=e.target.value;return n;});}} style={{width:55,padding:"4px 6px",borderRadius:6,border:"1px solid #C1440E",background:"#1A0808",color:"#C1440E",fontFamily:"'Lora',serif",fontSize:12,textAlign:"center"}}/>}
                          {modo==="minimos"&&(
                            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                              <input type="number" min="0" placeholder="0" value={minimoEditMP[prod]!==undefined?minimoEditMP[prod]:(stock[prod]?stock[prod].minimo||0:0)}
                                onChange={function(e){setMinimoEditMP(function(m){var n={...m};n[prod]=e.target.value;return n;});}}
                                style={{width:55,padding:"4px 6px",borderRadius:6,border:"1px solid #8B2FC9",background:"#0F0A1A",color:"#8B2FC9",fontFamily:"'Lora',serif",fontSize:12,textAlign:"center"}}/>
                              <div style={{fontSize:9,color:"#555"}}>mínimo</div>
                            </div>
                          )}
                          <div style={{width:55,textAlign:"center",flexShrink:0}}>
                            <div style={{fontSize:15,fontWeight:800,color:enStock?sc2.text:"#333"}}>{enStock?cant:"—"}</div>
                            <div style={{fontSize:9,color:"#444"}}>{enStock?unidad:""}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botones guardar */}
          {modo==="cargar"&&Object.keys(cargaManual).filter(function(k){return cargaManual[k]&&parseFloat(cargaManual[k].cantidad)>0;}).length>0&&(
            <button onClick={guardarCargaManual} disabled={saving} style={{...BS("#3A7D44"),width:"100%",padding:"12px",fontSize:14,marginTop:14}}>{saving?"⏳ Guardando...":"✓ Guardar carga de mercadería"}</button>
          )}
          {modo==="descontar"&&Object.keys(descuentos).filter(function(k){return parseFloat(descuentos[k])>0;}).length>0&&(
            <button onClick={guardarDescuento} disabled={saving} style={{...BS("#C1440E"),width:"100%",padding:"12px",fontSize:14,marginTop:14}}>{saving?"⏳ Guardando...":"✓ Guardar descuento"}</button>
          )}
          {modo==="minimos"&&Object.keys(minimoEditMP).length>0&&(
            <button onClick={guardarMinimosMP} disabled={saving} style={{...BS("#8B2FC9"),width:"100%",padding:"12px",fontSize:14,marginTop:14}}>{saving?"⏳ Guardando...":"✓ Guardar mínimos"}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  var [users,setUsers]=useState(INIT_USERS);
  var [cu,setCu]=useState(null);
  var [proveedores,setProveedores]=useState(INIT_PROVEEDORES);
  var [productos,setProductos]=useState(INIT_PRODUCTOS);
  var [ordenes,setOrdenes]=useState([]);
  var [showOrden,setShowOrden]=useState(false);
  var [showGest,setShowGest]=useState(false);
  var [showMisProds,setShowMisProds]=useState(false);
  var [showPrecios,setShowPrecios]=useState(false);
  var [showEditorMenu,setShowEditorMenu]=useState(false);
  var [menuStock,setMenuStock]=useState(MENU_POR_LOCAL);
  var [showUsers,setShowUsers]=useState(false);
  var [filtroStatus,setFiltroStatus]=useState("all");
  var [filtroLocal,setFiltroLocal]=useState("all");
  var [loading,setLoading]=useState(false);
  var [modulo,setModulo]=useState("compras"); // compras | admin
  // Default admin vista
  var [vista,setVista]=useState("despacho");
  var [faltantes,setFaltantes]=useState([]);
  var [gastos,setGastos]=useState([]);
  var [retiros,setRetiros]=useState([]);
  var [cierres,setCierres]=useState([]);
  var [categoriasGastos,setCategoriasGastos]=useState([]);
  var [showEditorCats,setShowEditorCats]=useState(false);
  var [showExportarGastos,setShowExportarGastos]=useState(false);
  var [vistaUsuario,setVistaUsuario]=useState("ordenes");
  var [precios,setPrecios]=useState(INIT_PRECIOS);
  var [corrResultados,setCorrResultados]=useState({});

  useEffect(function(){
    if(!cu)return;
    setLoading(true);
    sbLoad().then(function(d){setOrdenes(d);initContadores(d);setLoading(false);}).catch(function(){setLoading(false);});
    sbGetFaltantes().then(function(d){setFaltantes(d);}).catch(function(){});
    sbLoadGastos().then(function(d){setGastos(d);}).catch(function(){});
    sbLoadRetiros().then(function(d){setRetiros(d);}).catch(function(){});
    sbLoadCierres().then(function(d){setCierres(d);}).catch(function(){});
    sbLoadCategoriasGastos().then(function(d){setCategoriasGastos(d);}).catch(function(){});
    sbLoadProveedores().then(function(d){if(d)setProveedores(d);}).catch(function(){});
    sbLoadMenuStock().then(function(d){
      if(d && Object.keys(d.l1||{}).length>0){
        // Supabase has data - use it completely (respects deletions)
        Object.keys(d).forEach(function(k){ MENU_POR_LOCAL[k]=d[k]; });
      } else {
        // No Supabase data yet - use default menu and save it
        MENU_POR_LOCAL["l1"] = MENU_BODEGON;
        Object.keys(MENU_BODEGON).forEach(function(cat){
          sbSaveMenuStock("l1", cat, MENU_BODEGON[cat]);
        });
      }
      setMenuStock(JSON.parse(JSON.stringify(MENU_POR_LOCAL)));
    }).catch(function(){
      MENU_POR_LOCAL["l1"] = MENU_BODEGON;
      setMenuStock(JSON.parse(JSON.stringify(MENU_POR_LOCAL)));
    });
    sbLoadProductos().then(function(d){if(d)setProductos(d);}).catch(function(){});
    sbLoadPrecios().then(function(d){if(d)setPrecios(d);}).catch(function(){});
    sbLoadCorrResultados().then(function(d){setCorrResultados(d);}).catch(function(){});
  },[cu]);

  if(!cu)return <Login users={users} onLogin={setCu}/>;

  var esAdmin=cu.rol==="admin";
  var esSofia=cu.usuario==="sofia";
  var esCajero=cu.rol==="cajero";
  var lf=esAdmin?null:cu.local;
  var la=getLocal(lf);
  var seccion=cu.seccion||"";

  var filtered=ordenes.filter(function(o){
    return (lf?o.local===lf:(filtroLocal==="all"?true:o.local===filtroLocal))&&(filtroStatus==="all"||o.status===filtroStatus);
  });

  var stats={
    total:filtered.length,
    pendientes:filtered.filter(function(o){return o.status==="pendiente";}).length,
    enviadas:filtered.filter(function(o){return o.status==="enviada";}).length,
    monto:filtered.filter(function(o){return o.status!=="cancelada";}).reduce(function(a,o){return a+(o.provSections||[]).reduce(function(b,s){return b+s.items.reduce(function(c,i){return c+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);},0),
  };

  function updOrden(id,ch){sbPatch(id,{status:ch.status});setOrdenes(function(p){return p.map(function(o){return o.id===id?{...o,...ch}:o;});});}
  function delOrden(id){if(window.confirm("¿Eliminar esta orden? No se puede deshacer.")){sbDelete(id);setOrdenes(function(p){return p.filter(function(o){return o.id!==id;});});}}
  function saveOrden(o){
    var now = new Date().toISOString(); var ordenConSeccion = {...o, emisor: cu.nombre, seccion: cu.seccion||"", createdAt: now};
    sbSave(ordenConSeccion);
    setOrdenes(function(p){return[ordenConSeccion,...p];});
  }

  return(
    <div>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Lora:wght@400;600;700&display=swap" rel="stylesheet"/>
      <div style={{minHeight:"100vh",background:"#0D0D0D",color:"#F0EDE8",fontFamily:"'Lora',serif"}}>

        {/* HEADER */}
        <div style={{borderBottom:"1px solid #181818",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div><div style={{fontSize:10,color:"#333",letterSpacing:3,textTransform:"uppercase"}}>Grupo NKT</div><h1 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:800}}>Gestión Grupo NKT</h1></div>
            {la&&<div style={{padding:"4px 11px",borderRadius:20,background:la.color+"22",border:"1px solid "+la.color+"44",color:la.color,fontSize:12,fontWeight:700}}>{la.emoji} {la.nombre}{seccion?" · "+seccion:""}</div>}
            {esAdmin&&<Badge color="#C1440E">👑 Admin</Badge>}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"#444",borderRight:"1px solid #222",paddingRight:9,marginRight:2}}>👤 {cu.nombre}</span>
            {esAdmin&&<button onClick={function(){setShowUsers(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>👥 Usuarios</button>}
            {esAdmin&&<button onClick={function(){setShowGest(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>⚙️ Proveedores</button>}
            {esAdmin&&<button onClick={function(){setShowPrecios(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>💲 Precios</button>}
            {esAdmin&&<button onClick={function(){setShowEditorMenu(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>🍽️ Menú Stock</button>}
            {!esAdmin&&<button onClick={function(){setShowMisProds(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>📦 Mis Productos</button>}
            <button onClick={function(){setShowOrden(true);}} style={{...BS("#C1440E"),padding:"7px 15px",fontSize:12,boxShadow:"0 4px 14px #C1440E33"}}>+ Nueva Orden</button>
            <button onClick={function(){setCu(null);}} style={{...GH,padding:"6px 8px",fontSize:12,color:"#555"}} title="Cerrar sesión">🚪</button>
          </div>
        </div>

        {/* MÓDULOS */}
        {esSofia&&(
          <div style={{borderBottom:"1px solid #111",background:"#0A0A0A",padding:"10px 20px",display:"flex",gap:6}}>
            <button onClick={function(){setModulo("compras");setVista("despacho");}}
              style={{padding:"8px 20px",borderRadius:10,border:"none",background:modulo==="compras"?"#C1440E":"transparent",color:modulo==="compras"?"#fff":"#555",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              📋 Compras
            </button>
            <button onClick={function(){setModulo("admin");setVista("gastos");}}
              style={{padding:"8px 20px",borderRadius:10,border:"none",background:modulo==="admin"?"#1A6B8A":"transparent",color:modulo==="admin"?"#fff":"#555",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              💰 Administración
            </button>
          </div>
        )}

        <div style={{padding:"14px 20px",maxWidth:900,margin:"0 auto"}}>

          {/* STATS */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:16}}>
            {[{label:"Órdenes",value:stats.total,icon:"📋"},{label:"Pendientes",value:stats.pendientes,icon:"⏳",color:"#D4A017"},{label:"Enviadas",value:stats.enviadas,icon:"🚚",color:"#1A6B8A"},{label:"Monto",value:"$"+stats.monto.toFixed(0),icon:"💰",color:"#3A7D44"}].map(function(s){return(
              <div key={s.label} style={{background:"#111",border:"1px solid #181818",borderRadius:11,padding:"10px 12px"}}>
                <div style={{fontSize:15,marginBottom:4}}>{s.icon}</div>
                <div style={{fontSize:16,fontWeight:800,fontFamily:"'Playfair Display',serif",color:s.color||"#F0EDE8"}}>{s.value}</div>
                <div style={{fontSize:10,color:"#333",textTransform:"uppercase",letterSpacing:1,marginTop:2}}>{s.label}</div>
              </div>
            );})}
          </div>

          {/* TABS MÓDULO COMPRAS */}
          {esAdmin&&(!esSofia||modulo==="compras")&&(
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              <button onClick={function(){setVista("despacho");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="despacho"?"#C1440E":"#1E1E1E"),background:vista==="despacho"?"#C1440E":"#111",color:vista==="despacho"?"#fff":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>🚀 Despacho</button>
              <button onClick={function(){setVista("historial");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="historial"?"#555":"#1E1E1E"),background:vista==="historial"?"#222":"#111",color:vista==="historial"?"#F0EDE8":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>📋 Historial</button>
              <button onClick={function(){setVista("faltantes");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="faltantes"?"#C1440E":"#1E1E1E"),background:vista==="faltantes"?"#C1440E11":"#111",color:vista==="faltantes"?"#C1440E":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                ⚠️ Faltantes {faltantes.length>0?"("+faltantes.length+")":""}
              </button>
              <button onClick={function(){setVista("stock");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="stock"?"#8B2FC9":"#1E1E1E"),background:vista==="stock"?"#8B2FC922":"#111",color:vista==="stock"?"#8B2FC9":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                📦 Stock Platos
              </button>
              <button onClick={function(){setVista("stockmp");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="stockmp"?"#1A6B8A":"#1E1E1E"),background:vista==="stockmp"?"#1A6B8A22":"#111",color:vista==="stockmp"?"#1A6B8A":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🥩 Materia Prima
              </button>
            </div>
          )}

          {/* TABS MÓDULO ADMINISTRACIÓN */}
          {esSofia&&modulo==="admin"&&(
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              <button onClick={function(){setVista("gastos");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="gastos"?"#1A6B8A":"#1E1E1E"),background:vista==="gastos"?"#1A6B8A22":"#111",color:vista==="gastos"?"#1A6B8A":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                💰 Gastos
              </button>
              <button onClick={function(){setVista("analytics");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="analytics"?"#D4A017":"#1E1E1E"),background:vista==="analytics"?"#D4A01722":"#111",color:vista==="analytics"?"#D4A017":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                📊 Análisis
              </button>
              <button onClick={function(){setVista("retiros");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="retiros"?"#8B2FC9":"#1E1E1E"),background:vista==="retiros"?"#8B2FC922":"#111",color:vista==="retiros"?"#8B2FC9":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                💼 Retiros
              </button>
              <button onClick={function(){setVista("cierres");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="cierres"?"#C1440E":"#1E1E1E"),background:vista==="cierres"?"#C1440E22":"#111",color:vista==="cierres"?"#C1440E":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🏪 Cierres
              </button>
              <button onClick={function(){setVista("iva");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="iva"?"#3A7D44":"#1E1E1E"),background:vista==="iva"?"#3A7D4422":"#111",color:vista==="iva"?"#3A7D44":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🧾 IVA
              </button>
              <button onClick={function(){setVista("cruzados");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="cruzados"?"#E07B00":"#1E1E1E"),background:vista==="cruzados"?"#E07B0022":"#111",color:vista==="cruzados"?"#E07B00":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🔀 Cruzados
              </button>
              <button onClick={function(){setVista("resultados");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="resultados"?"#8B2FC9":"#1E1E1E"),background:vista==="resultados"?"#8B2FC922":"#111",color:vista==="resultados"?"#8B2FC9":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                📈 Resultados
              </button>
              <button onClick={function(){setShowEditorCats(true);}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid #555",background:"none",color:"#555",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🏷️ Categorías
              </button>
            </div>
          )}

          {/* PANEL DESPACHO */}
          {esAdmin&&modulo==="compras"&&vista==="despacho"&&(
            <PanelDespacho ordenes={ordenes} proveedores={proveedores} onUpdate={updOrden} onDelete={delOrden}/>
          )}

          {esSofia&&modulo==="admin"&&vista==="gastos"&&(
            <PanelGastos gastos={gastos} usuario={cu.nombre} categoriasCustom={categoriasGastos}
              onSave={function(g){sbSaveGasto(g);setGastos(function(p){return[g,...p];});}}
              onDelete={function(id){sbDeleteGasto(id);setGastos(function(p){return p.filter(function(g){return g.id!==id;});});}}
            />
          )}

          {esSofia&&modulo==="admin"&&vista==="cierres"&&(
            <PanelCierresSofia cierres={cierres}/>
          )}

          {esSofia&&modulo==="admin"&&vista==="cruzados"&&(
            <PanelCruzados gastos={gastos}/>
          )}

          {esSofia&&modulo==="admin"&&vista==="retiros"&&(
            <PanelRetiros retiros={retiros} usuario={cu.nombre}
              onSave={function(r){sbSaveRetiro(r);setRetiros(function(p){return[r,...p];});}}
              onDelete={function(id){sbDeleteRetiro(id);setRetiros(function(p){return p.filter(function(r){return r.id!==id;});});}}
            />
          )}

          {esSofia&&modulo==="admin"&&vista==="iva"&&(
            <PanelIVA gastos={gastos} cierres={cierres}/>
          )}

          {esSofia&&modulo==="admin"&&vista==="resultados"&&(
            <PanelResultados gastos={gastos} cierres={cierres} corrResultados={corrResultados} onSaveCorr={function(corr){
              sbSaveCorrResultado(corr);
              setCorrResultados(function(prev){var n={...prev};n[corr.local+"_"+corr.mes]=corr;return n;});
            }}/>
          )}

          {(esAdmin&&!esSofia&&vista==="analytics")||(esSofia&&modulo==="admin"&&vista==="analytics")&&(
            <PanelAnalytics ordenes={ordenes} proveedores={proveedores}/>
          )}

          {esAdmin&&modulo==="compras"&&vista==="stockmp"&&(
            <div>
              <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
                {LOCALES.map(function(l){return(
                  <button key={l.id} onClick={function(){setVistaUsuario(l.id);}}
                    style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(vistaUsuario===l.id?l.color:"#1E1E1E"),background:vistaUsuario===l.id?l.color+"22":"#111",color:vistaUsuario===l.id?l.color:"#666",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    {l.emoji} {l.nombre}
                  </button>
                );})}
              </div>
              <PanelStockMP localId={vistaUsuario||"l1"} localNombre={LOCALES.find(function(l){return l.id===(vistaUsuario||"l1");})?LOCALES.find(function(l){return l.id===(vistaUsuario||"l1");}).nombre:""} usuario={cu.nombre} proveedores={proveedores} productos={productos}/>
            </div>
          )}

          {esAdmin&&modulo==="compras"&&vista==="stock"&&(
            <div>
              <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
                {LOCALES.map(function(l){
                  var hasMenu=Object.keys(MENU_POR_LOCAL[l.id]||{}).length>0;
                  return(
                    <button key={l.id} onClick={function(){if(hasMenu)setVistaUsuario(l.id);}}
                      style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(vistaUsuario===l.id?l.color:"#1E1E1E"),background:vistaUsuario===l.id?l.color+"22":"#111",color:vistaUsuario===l.id?l.color:hasMenu?"#666":"#333",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:hasMenu?"pointer":"not-allowed",opacity:hasMenu?1:0.5}}>
                      {l.emoji} {l.nombre} {!hasMenu&&<span style={{fontSize:9}}>(próximamente)</span>}
                    </button>
                  );
                })}
              </div>
              {vistaUsuario&&MENU_POR_LOCAL[vistaUsuario]&&Object.keys(MENU_POR_LOCAL[vistaUsuario]).length>0&&(
                <PanelStock localId={vistaUsuario} localNombre={LOCALES.find(function(l){return l.id===vistaUsuario;})?LOCALES.find(function(l){return l.id===vistaUsuario;}).nombre:""} usuario={cu.nombre} esAdmin={true}/>
              )}
            </div>
          )}

          {esAdmin&&modulo==="compras"&&vista==="faltantes"&&(
            <div>
              <div style={{fontSize:11,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>
                {faltantes.length===0?"Sin faltantes pendientes":faltantes.length+" producto"+( faltantes.length!==1?"s":"")+" faltante"+(faltantes.length!==1?"s":"")}
              </div>
              {faltantes.length===0?(
                <div style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:36,marginBottom:10}}>✅</div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"#3A7D44"}}>Sin faltantes pendientes</div>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {faltantes.map(function(f){
                    var loc=getLocal(f.local);
                    return(
                      <div key={f.id} style={{background:"#111",border:"1px solid #C1440E33",borderRadius:12,padding:"12px 15px",display:"flex",alignItems:"center",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#F0EDE8"}}>{f.producto}</div>
                          <div style={{fontSize:11,color:"#555",marginTop:3}}>
                            {f.proveedor} · {f.cantidad} {f.unidad}
                            {loc&&<span style={{marginLeft:6,color:loc.color}}>· {loc.emoji} {loc.nombre}</span>}
                          </div>
                          <div style={{fontSize:10,color:"#444",marginTop:2}}>Orden: {f.orden_id} · {fmtDateTime(f.created_at)}</div>
                        </div>
                        <button onClick={function(){sbDeleteFaltante(f.id);setFaltantes(function(p){return p.filter(function(x){return x.id!==f.id;});});}}
                          style={{...GH,padding:"5px 9px",fontSize:11,color:"#3A7D44",borderColor:"#3A7D4444"}}>✓ Resuelto</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* HISTORIAL */}
          {!esAdmin&&(
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              <button onClick={function(){setVistaUsuario("ordenes");}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(vistaUsuario==="ordenes"?"#555":"#1E1E1E"),background:vistaUsuario==="ordenes"?"#222":"#111",color:vistaUsuario==="ordenes"?"#F0EDE8":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>📋 Mis Órdenes</button>
              {MENU_POR_LOCAL[lf]&&Object.keys(MENU_POR_LOCAL[lf]).length>0&&(
                <button onClick={function(){setVistaUsuario("stock");}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(vistaUsuario==="stock"?"#8B2FC9":"#1E1E1E"),background:vistaUsuario==="stock"?"#8B2FC922":"#111",color:vistaUsuario==="stock"?"#8B2FC9":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>📦 Stock Platos</button>
              )}
              <button onClick={function(){setVistaUsuario("stockmp");}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+(vistaUsuario==="stockmp"?"#1A6B8A":"#1E1E1E"),background:vistaUsuario==="stockmp"?"#1A6B8A22":"#111",color:vistaUsuario==="stockmp"?"#1A6B8A":"#555",fontFamily:"'Lora',serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>🥩 Materia Prima</button>
            </div>
          )}

          {!esAdmin&&vistaUsuario==="stock"&&MENU_POR_LOCAL[lf]&&Object.keys(MENU_POR_LOCAL[lf]).length>0&&(
            <PanelStock localId={lf} localNombre={la?la.nombre:""} usuario={cu.nombre} esAdmin={false}/>
          )}

          {esCajero&&(
            <PanelCierre localId={lf} localNombre={la?la.nombre:""} usuario={cu.nombre} cierres={cierres}
              onSave={async function(c){var ok=await sbSaveCierre(c);if(ok){setCierres(function(p){var filtered=p.filter(function(x){return x.id!==c.id;});return[c,...filtered];});}else{alert("No se pudo guardar el cierre. Revisá la conexión.");}}}
            />
          )}

          {!esAdmin&&!esCajero&&vistaUsuario==="stockmp"&&(
            <PanelStockMP localId={lf} localNombre={la?la.nombre:""} usuario={cu.nombre} proveedores={proveedores} productos={productos}/>
          )}

          {(!esAdmin&&vistaUsuario==="ordenes"||esAdmin&&modulo==="compras"&&vista==="historial")&&(
            <div>
              <div style={{display:"flex",gap:5,marginBottom:13,flexWrap:"wrap",alignItems:"center"}}>
                {esAdmin&&(
                  <button onClick={function(){setFiltroLocal("all");}} style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(filtroLocal==="all"?"#555":"#1A1A1A"),background:filtroLocal==="all"?"#222":"none",color:filtroLocal==="all"?"#F0EDE8":"#444",fontSize:11,cursor:"pointer"}}>
                    Todos
                  </button>
                )}
                {esAdmin&&LOCALES.map(function(l){
                  var cnt=ordenes.filter(function(o){return o.local===l.id;}).length;
                  return(
                    <button key={l.id} onClick={function(){setFiltroLocal(filtroLocal===l.id?"all":l.id);}} style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(filtroLocal===l.id?l.color:"#1A1A1A"),background:filtroLocal===l.id?l.color+"22":"none",color:filtroLocal===l.id?l.color:"#444",fontSize:11,cursor:"pointer"}}>
                      {l.emoji} {l.nombre} {cnt>0?"("+cnt+")":""}
                    </button>
                  );
                })}
                <select value={filtroStatus} onChange={function(e){setFiltroStatus(e.target.value);}} style={{...INP,width:"auto",padding:"4px 9px",fontSize:11,borderRadius:20}}>
                  <option value="all">Todo estado</option>
                  <option value="borrador">Borrador</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="enviada">Enviada</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              {loading?(
                <div style={{textAlign:"center",padding:"44px 20px"}}><div style={{fontSize:28,marginBottom:10}}>⏳</div><div style={{fontSize:13,color:"#444"}}>Cargando historial...</div></div>
              ):filtered.length===0?(
                <div style={{textAlign:"center",padding:"44px 20px"}}><div style={{fontSize:36,marginBottom:10}}>📋</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"#2E2E2E",marginBottom:4}}>Sin órdenes</div><div style={{fontSize:12,color:"#222"}}>{la?"No hay órdenes de "+la.nombre+" todavía":"Creá tu primera orden"}</div></div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {filtered.map(function(o){return <OrdenCard key={o.id} orden={o} proveedores={proveedores} onUpdate={updOrden} onDelete={delOrden} esAdmin={esAdmin} p={{proveedores:proveedores}}/>;  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showOrden&&<NuevaOrden proveedores={proveedores} productos={productos} precios={precios} localFijo={lf} onClose={function(){setShowOrden(false);}} onSave={saveOrden}/>}
      {showGest&&<GestProveedores proveedores={proveedores} productos={productos} onClose={function(){setShowGest(false);}} onSave={function(pv,pd){
        // Save all proveedores to Supabase
        pv.forEach(function(p){ sbSaveProveedor(p); });
        // Save all productos to Supabase
        Object.keys(pd).forEach(function(provId){
          pd[provId].forEach(function(nombre){ sbSaveProducto(provId, nombre); });
        });
        setProveedores(pv);setProductos(pd);setShowGest(false);
      }}/>}
      {showMisProds&&<MisProductosModal proveedores={proveedores} productos={productos} onClose={function(){setShowMisProds(false);}} onSave={function(pd){
        Object.keys(pd).forEach(function(provId){
          pd[provId].forEach(function(nombre){ sbSaveProducto(provId, nombre); });
        });
        setProductos(pd);setShowMisProds(false);
      }}/>}
      {showExportarGastos&&<ExportarGastosModal gastos={gastos} onClose={function(){setShowExportarGastos(false);}}/>}
      {showEditorCats&&<EditorCategoriasGastos categorias={categoriasGastos} onClose={function(){setShowEditorCats(false);}} onSave={function(cats){setCategoriasGastos(cats);setShowEditorCats(false);}}/>}
      {showEditorMenu&&<EditorMenuStock onClose={function(){setShowEditorMenu(false);}} onSave={function(m){
        // Save to Supabase
        Object.keys(m).forEach(function(localId){
          var localMenu=m[localId]||{};
          // Save each category
          Object.keys(localMenu).forEach(function(cat){
            sbSaveMenuStock(localId,cat,localMenu[cat]);
          });
          // Delete categories that were removed
          var oldMenu=MENU_POR_LOCAL[localId]||{};
          Object.keys(oldMenu).forEach(function(cat){
            if(!localMenu[cat]){
              sbDeleteMenuStock(localId,cat);
            }
          });
        });
        // Update global menu
        Object.keys(m).forEach(function(k){MENU_POR_LOCAL[k]=m[k];});
        setMenuStock({...m});
        setShowEditorMenu(false);
      }}/>}
      {showPrecios&&<GestPreciosModal proveedores={proveedores} productos={productos} precios={precios} onClose={function(){setShowPrecios(false);}} onSave={function(prs){
        // Save all precios to Supabase
        Object.keys(prs).forEach(function(key){
          var parts = key.split("_");
          var provId = parts[0];
          var producto = parts.slice(1).join("_");
          if(prs[key]) sbSavePrecio(provId, producto, prs[key]);
        });
        setPrecios(prs);setShowPrecios(false);
      }}/>}
      {showUsers&&<GestUsuarios users={users} onClose={function(){setShowUsers(false);}} onSave={function(u){setUsers(u);setShowUsers(false);}}/>}
    </div>
  );
}
