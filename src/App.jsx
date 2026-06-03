// v4.0 - Supabase + Panel Despacho + Multi-proveedor
import { useState, useEffect } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
var SURL = "https://hgeosttxkqyprkwdwbjw.supabase.co";
var SKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnZW9zdHR4a3F5cHJrd2R3Ymp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODE1NzEsImV4cCI6MjA5NDM1NzU3MX0.bdqYFKUj1dwm2Os9ert3NZfIIDkxSZuXItaPqYDmUE8";
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
    await fetch(SURL + "/rest/v1/ordenes", { method: "POST", headers: SH, body: JSON.stringify({ id: orden.id, local: orden.local, fecha: orden.fecha, fecha_entrega: orden.fechaEntrega || null, notas: orden.notas || null, facturacion: orden.facturacion || null, status: orden.status, prov_sections: orden.provSections, created_at: orden.createdAt }) });
  } catch(e) {}
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
  { id: "u1", nombre: "Admin",      usuario: "admin",      password: "admin123", local: null, rol: "admin"   },
  { id: "u2", nombre: "El Bodegón", usuario: "bodegon",    password: "bodegon1", local: "l1", rol: "usuario" },
  { id: "u3", nombre: "Kusama",     usuario: "kusama",     password: "kusama1",  local: "l2", rol: "usuario" },
  { id: "u4", nombre: "Colantonio", usuario: "colantonio", password: "colant1",  local: "l3", rol: "usuario" },
  { id: "u5", nombre: "Oficina",    usuario: "oficina",    password: "oficina1", local: "l4", rol: "usuario" },
];

var INIT_PROVEEDORES = [
  { id: "p1", nombre: "Carnicería",    categoria: "Carnes & Aves",           compartido: true, whatsapp: "" },
  { id: "p2", nombre: "Fiambrería",    categoria: "Lácteos & Fiambres",      compartido: true, whatsapp: "" },
  { id: "p3", nombre: "Pescadería",    categoria: "Mariscos & Pescados",     compartido: true, whatsapp: "" },
  { id: "p4", nombre: "Verdulería",    categoria: "Frutas & Verduras",       compartido: true, whatsapp: "" },
  { id: "p5", nombre: "Distribuidora", categoria: "Secos & Limpieza",        compartido: true, whatsapp: "" },
  { id: "p6", nombre: "Papelera",      categoria: "Descartables",            compartido: true, whatsapp: "" },
  { id: "p7", nombre: "Especias",      categoria: "Especias & Frutos secos", compartido: true, whatsapp: "" },
  { id: "p8", nombre: "Insumos",       categoria: "Insumos & Salsas",        compartido: true, whatsapp: "" },
  { id: "p9", nombre: "Bebidas",       categoria: "Bebidas",                 compartido: true, whatsapp: "" },
];

var INIT_PRODUCTOS = {
  p1: ["Pechuga de pollo","Carne picada","Pulpa de cerdo","Desmechado de cerdo","Alitas","Paleta","Bola de lomo o nalga","Pata Muslo","Osobuco"],
  p2: ["Queso brie","Queso semiduro"],
  p3: ["Kanikama","Salmon ahumado","Penca de salmon","Langostinos","Penca de trucha","Abadejo","Anchoas"],
  p4: ["Zanahoria","Papas","Batata","Cebolla comun","Cebolla morada","Verdeo","Ciboulette","Albahaca","Menta","Manzana verde","Jenjibre","Palta","Limon","Huevos","Tomates cherry","Pepino","Lechuga crespa","Remolacha","Rucula","Repollo","Zuccini","Frutillas","Mango","Curcuma"],
  p5: ["Atun","Mayonesa","Choclo","Vino blanco","Vino tinto","Harina 0000","Maicena","Panko","Polenta","Azucar","Sal fina","Sal gruesa","Azucar mascabo","Vinagre blanco","Esponja cocina","Esponja acero","Detergente","Trapo de piso","Rejillas","Desengrasante","Alcohol","Guantes de limpieza","Desodorante piso","Papel higienico","Lavandina","Bolsas residuos","Aceite","Aceitunas","Perfumina","Repasadores","Vinagre de manzana"],
  p6: ["Dips","Tapas de dips","Lapiceras","Cinta","Bolsas delivery F8 o F9","Papel manteca","Film","Aluminio","Bandejas de aluminio f75","Guantes de nitrilo","Mangas descartables N5","Bobina de papel","Cajas de empanadas chinas","Ensaladeras","Palitos chinos","Rollo comandera","Rollo posnet","Sticker dips","Tarjeta QR","Baucher","Caja de servilletas","Caja de pizza","Caja de media docena","Pinchos","Bandejas de aluminio f100","Bandeja de aluminio f200"],
  p7: ["Ajo en polvo","Sesamo negro","Sesamo blanco","Tomates secos","Tomillo","Almendras","Nueces","Mani","Pimenton Ahumado","Humo en polvo","Hongos de Pino","Perejil","Pimienta negra","Cebolla crispy"],
  p8: ["Cajas de sushi","Wasabi","Mirin","Alga kombu","Aceite de sesamo","Salsa de soja","Salsa de ostras","Arroz koyi","Alga nori","Caviar","Finlandia","Ajinomoto","Crema de leche","Flores decoracion"],
  p9: ["Gin","Vinos","Coca","Coca zero","Sprite","Fanta","Pomelo","Pera","Manzana","Naranja","Cerveza","Heineken lata","Imperial IPA","Grolsh lata"],
};

var UNIDADES = ["kg","gr","lt","ml","unid","caja","docena","bolsa"];
var CATEGORIAS = ["Carnes & Aves","Frutas & Verduras","Lácteos & Fiambres","Bebidas","Mariscos & Pescados","Limpieza","Secos & Almacén","Descartables","Especias & Frutos secos","Insumos & Salsas","Otro"];

var _oc = 1, _pc = 10, _uc = 10;
function genOC() { return "OC-" + String(_oc++).padStart(4,"0"); }
function genProv() { return "p" + _pc++; }
function genUser() { return "u" + _uc++; }
function getLocal(id) { return LOCALES.find(function(l) { return l.id === id; }) || null; }
function getFact(id) { return FACTURACION.find(function(f) { return f.id === id; }) || null; }
function fmtDate(s) { if (!s) return "—"; var p = s.split("-"); return p[2]+"/"+p[1]+"/"+p[0]; }
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
          <div style={{fontSize:10,color:"#444",letterSpacing:4,textTransform:"uppercase",marginBottom:6}}>Sistema de</div>
          <h1 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:800,color:"#F0EDE8"}}>Órdenes de Compra</h1>
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
        <div style={{marginTop:16,background:"#111",border:"1px solid #1E1E1E",borderRadius:12,padding:"11px 15px"}}>
          <div style={{fontSize:10,color:"#444",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>Usuarios de demo</div>
          {INIT_USERS.map(function(u){var loc=getLocal(u.local); return (
            <div key={u.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#555",padding:"3px 0",borderBottom:"1px solid #1A1A1A"}}>
              <span style={{color:u.rol==="admin"?"#C1440E":"#888"}}>{u.rol==="admin"?"👑":"👤"} {u.usuario}</span>
              <span style={{color:"#333"}}>{u.password}</span>
              <span style={{color:loc?loc.color:"#555"}}>{loc?loc.nombre:"Admin"}</span>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function makePDF(orden, local, prov, items, fact) {
  if (!window.jspdf) {
    await new Promise(function(res,rej){var s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  }
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

// ─── MODAL WSP ────────────────────────────────────────────────────────────────
function WspModal(p) {
  var orden=p.orden, local=p.local, prov=p.provEntry.prov, items=p.provEntry.items, fact=p.fact;
  var [step,setStep]=useState("preview"), [phone,setPhone]=useState(prov.whatsapp||""), [gen,setGen]=useState(false), [fname,setFname]=useState("");
  var tot=items.reduce(function(a,i){return a+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);
  var itext=items.map(function(i){return "• "+i.nombre+": "+i.cantidad+" "+i.unidad;}).join("\n");
  var ftxt=fact?("\n\n🧾 *Facturar a:* "+fact.razonSocial+"\nCUIT: "+fact.cuit+" · "+fact.condicion+"\n"+fact.domicilio):"";
  var msg="📋 *Orden "+orden.id+"*\n\n🏪 *"+(local?local.nombre:"")+"*\n📅 "+fmtDate(orden.fecha)+(orden.fechaEntrega?"\n🚚 Entrega: "+fmtDate(orden.fechaEntrega):"")+"\n\n*Detalle:*\n"+itext+"\n\n💰 *Total: $"+tot.toFixed(2)+"*"+(orden.notas?"\n\n📝 "+orden.notas:"")+ftxt+"\n\n_(Adjunto PDF)_";
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
    p.onSave({...orden,provSections:vs,id:genOC(),status:status,createdAt:new Date().toISOString()});
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
                {p.proveedores.map(function(pv){
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
                          <select value={ni.producto} onChange={function(e){setNi(function(n){return{...n,producto:e.target.value};});}} style={INP}>
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
function OrdenCard(p) {
  var orden=p.orden, proveedores=p.proveedores, onUpdate=p.onUpdate, onDelete=p.onDelete;
  var local=getLocal(orden.local), bc=local?local.color:"#444";
  var [open,setOpen]=useState(false), [wsp,setWsp]=useState(null), [sent,setSent]=useState([]);
  var tot=(orden.provSections||[]).reduce(function(a,s){return a+s.items.reduce(function(b,i){return b+parseFloat(i.cantidad||0)*parseFloat(i.precio||0);},0);},0);
  var fact=orden.facturacion?getFact(orden.facturacion):null;
  var NS={borrador:"pendiente",pendiente:"enviada",enviada:"confirmada"};
  var NL={borrador:"Emitir",pendiente:"Marcar Enviada",enviada:"Confirmar Recepción"};
  return(
    <div>
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
              <span style={{margin:"0 4px"}}>·</span>
              <span>{(orden.provSections||[]).length} proveedores</span>
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:14,fontWeight:800,fontFamily:"'Playfair Display',serif"}}>${tot.toFixed(2)}</div>
            <div style={{fontSize:10,color:"#333"}}>{fmtDate(orden.fecha)}</div>
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
              {NS[orden.status]&&<button onClick={function(){onUpdate(orden.id,{status:NS[orden.status]});}} style={{...BS("#C1440E"),padding:"6px 10px",fontSize:11}}>{NL[orden.status]}</button>}
              {!["cancelada","confirmada"].includes(orden.status)&&<button onClick={function(){onUpdate(orden.id,{status:"cancelada"});}} style={{...GH,padding:"6px 10px",fontSize:11}}>Cancelar</button>}
              <button onClick={function(){if(window.confirm("¿Eliminar la orden "+orden.id+"? Esta acción no se puede deshacer."))onDelete(orden.id);}} style={{...GH,padding:"6px 10px",fontSize:11,color:"#C1440E",borderColor:"#C1440E33"}}>🗑️ Eliminar</button>
            </div>
          </div>
        )}
      </div>
      {wsp&&<WspModal orden={orden} local={local} provEntry={wsp} fact={fact} onClose={function(){setWsp(null);}} onMarkSent={function(){setSent(function(s){return [...s,wsp.prov.id];});onUpdate(orden.id,{status:"enviada"});}}/>}
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

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  var [users,setUsers]=useState(INIT_USERS);
  var [cu,setCu]=useState(null);
  var [proveedores,setProveedores]=useState(INIT_PROVEEDORES);
  var [productos,setProductos]=useState(INIT_PRODUCTOS);
  var [ordenes,setOrdenes]=useState([]);
  var [showOrden,setShowOrden]=useState(false);
  var [showGest,setShowGest]=useState(false);
  var [showUsers,setShowUsers]=useState(false);
  var [filtroStatus,setFiltroStatus]=useState("all");
  var [filtroLocal,setFiltroLocal]=useState("all");
  var [loading,setLoading]=useState(false);
  var [vista,setVista]=useState("despacho");

  useEffect(function(){
    if(!cu)return;
    setLoading(true);
    sbLoad().then(function(d){setOrdenes(d);setLoading(false);}).catch(function(){setLoading(false);});
  },[cu]);

  if(!cu)return <Login users={users} onLogin={setCu}/>;

  var esAdmin=cu.rol==="admin";
  var lf=esAdmin?null:cu.local;
  var la=getLocal(lf);

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
  function delOrden(id){sbDelete(id);setOrdenes(function(p){return p.filter(function(o){return o.id!==id;});});}
  function saveOrden(o){sbSave(o);setOrdenes(function(p){return[o,...p];});}

  return(
    <div>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Lora:wght@400;600;700&display=swap" rel="stylesheet"/>
      <div style={{minHeight:"100vh",background:"#0D0D0D",color:"#F0EDE8",fontFamily:"'Lora',serif"}}>

        {/* HEADER */}
        <div style={{borderBottom:"1px solid #181818",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div><div style={{fontSize:10,color:"#333",letterSpacing:3,textTransform:"uppercase"}}>Sistema de</div><h1 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:800}}>Órdenes de Compra</h1></div>
            {la&&<div style={{padding:"4px 11px",borderRadius:20,background:la.color+"22",border:"1px solid "+la.color+"44",color:la.color,fontSize:12,fontWeight:700}}>{la.emoji} {la.nombre}</div>}
            {esAdmin&&<Badge color="#C1440E">👑 Admin</Badge>}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"#444",borderRight:"1px solid #222",paddingRight:9,marginRight:2}}>👤 {cu.nombre}</span>
            {esAdmin&&<button onClick={function(){setShowUsers(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>👥 Usuarios</button>}
            {esAdmin&&<button onClick={function(){setShowGest(true);}} style={{...GH,padding:"5px 10px",fontSize:12}}>⚙️ Proveedores</button>}
            <button onClick={function(){setShowOrden(true);}} style={{...BS("#C1440E"),padding:"7px 15px",fontSize:12,boxShadow:"0 4px 14px #C1440E33"}}>+ Nueva Orden</button>
            <button onClick={function(){setCu(null);}} style={{...GH,padding:"6px 8px",fontSize:12,color:"#555"}} title="Cerrar sesión">🚪</button>
          </div>
        </div>

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

          {/* TABS ADMIN */}
          {esAdmin&&(
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              <button onClick={function(){setVista("despacho");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="despacho"?"#C1440E":"#1E1E1E"),background:vista==="despacho"?"#C1440E":"#111",color:vista==="despacho"?"#fff":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>🚀 Panel de Despacho</button>
              <button onClick={function(){setVista("historial");}} style={{padding:"9px 18px",borderRadius:10,border:"1px solid "+(vista==="historial"?"#555":"#1E1E1E"),background:vista==="historial"?"#222":"#111",color:vista==="historial"?"#F0EDE8":"#666",fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>📋 Historial</button>
            </div>
          )}

          {/* PANEL DESPACHO */}
          {esAdmin&&vista==="despacho"&&(
            <PanelDespacho ordenes={ordenes} proveedores={proveedores} onUpdate={updOrden}/>
          )}

          {/* HISTORIAL */}
          {(!esAdmin||vista==="historial")&&(
            <div>
              <div style={{display:"flex",gap:5,marginBottom:13,flexWrap:"wrap",alignItems:"center"}}>
                {esAdmin&&LOCALES.map(function(l){return(
                  <button key={l.id} onClick={function(){setFiltroLocal(filtroLocal===l.id?"all":l.id);}} style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(filtroLocal===l.id?l.color:"#1A1A1A"),background:filtroLocal===l.id?l.color+"22":"none",color:filtroLocal===l.id?l.color:"#444",fontSize:11,cursor:"pointer"}}>
                    {l.emoji} {l.nombre}
                  </button>
                );})}
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
                  {filtered.map(function(o){return <OrdenCard key={o.id} orden={o} proveedores={proveedores} onUpdate={updOrden} onDelete={delOrden}/>;  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showOrden&&<NuevaOrden proveedores={proveedores} productos={productos} localFijo={lf} onClose={function(){setShowOrden(false);}} onSave={saveOrden}/>}
      {showGest&&<GestProveedores proveedores={proveedores} productos={productos} onClose={function(){setShowGest(false);}} onSave={function(pv,pd){setProveedores(pv);setProductos(pd);setShowGest(false);}}/>}
      {showUsers&&<GestUsuarios users={users} onClose={function(){setShowUsers(false);}} onSave={function(u){setUsers(u);setShowUsers(false);}}/>}
    </div>
  );
}
