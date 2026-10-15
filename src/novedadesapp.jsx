// Las novedades de la app: cada vez que se agrega algo, se suma una entrada acá (con un id que ordena por fecha) y a quien
// corresponda le aparece un cartel con la síntesis. "No volver a mostrar" lo marca como visto hasta la próxima novedad.
// Lo visto se guarda en la tabla de pautas (ámbito "novedades_vistas", un registro por usuario) y también en el navegador.
import { useState, useEffect } from "react";
import { SURL, SH } from "./comun.js";

// A quiénes se les muestra. Para sumar a alguien, agregar su usuario.
export var NOVEDADES_PARA = ["sofia", "belen"];

// Más nueva al final. id: AAAA-MM-DD + letra.
export var NOVEDADES_APP = [
  { id: "2026-10-15a", titulo: "Personal", items: [
    "Personal se reorganizó en 4 módulos: Colaboradores (Altas, Modificar datos, Vacaciones y Bajas), Sueldos, CUIT e Informe.",
    "Bajas: al dar de baja a alguien su ficha y todo su historial quedan guardados ahí, y se puede reactivar.",
    "La ficha tiene fecha de nacimiento (con edad), altura, talles, grupo sanguíneo, enfermedad congénita y medicación, con un % de datos completos. Cada colaborador carga los suyos desde Mi ficha." ] },
  { id: "2026-10-15b", titulo: "Fichaje", items: [
    "Se ficha sin foto: con un botón, y queda guardada la ubicación (en el Registro hay un 📍 con el mapa y la distancia al local).",
    "Si alguien marca la salida sin haber marcado la entrada, la app le pregunta a qué hora entró. Si faltó a un día que le tocaba, al día siguiente le pide el justificativo.",
    "En el Registro se puede poner en cero las marcas de un mes, de un local o de un empleado (pide confirmación)." ] },
  { id: "2026-10-15c", titulo: "Info y Caja", items: [
    "Info para colaboradores: hay una Info general para todos y una por sector (cajeros, salón, cocina) que ve sólo ese sector.",
    "Cierre de caja: si un día no se vendió nada, el botón «Sin ventas ($0)» lo cierra y no se reclama." ] },
  { id: "2026-10-15d", titulo: "Vencimientos y egresos", items: [
    "Los vencimientos se cargan y pagan en cada local (Locales → local → Vencimientos). La Oficina sólo tiene Alquileres, Servicios y Otros.",
    "Al pagar un vencimiento, el egreso va al área que corresponde y guarda la fecha original en que vencía. Gremio y obra social van a Administrativo.",
    "Novedades siguen mostrando los vencimientos como siempre." ] },
  { id: "2026-10-15e", titulo: "Saldar entre locales", items: [
    "Lo que un local puso de más o de menos por la Oficina ahora se puede saldar (Locales → Oficina → Resumen), igual que los pagos cruzados.",
    "En Novedades hay una tarjeta «Para saldar entre locales» y, cada mes nuevo, pregunta si se van a saldar o para qué fecha." ] },
  { id: "2026-10-15f", titulo: "Deuda", items: [
    "En cada local hay una pestaña nueva «💳 Deuda» al lado de Vencimientos: ahí pasa lo que ya venció y no se pagó, con su botón para pagar.",
    "Vencimientos queda más despejado: sólo lo que viene y lo ya pagado." ] },
  { id: "2026-10-15g", titulo: "Enviar la app", items: [
    "En la pantalla de inicio hay un botón «📲 Enviar la app por WhatsApp»: manda a cada colaborador (con el teléfono de su ficha) el link de la app y el instructivo para instalarla." ] },
  { id: "2026-10-15h", titulo: "Fichaje con ubicación", items: [
    "El PIN se pide sólo en la tablet del local. Desde el celular propio (vinculado a su ficha) se ficha sin PIN, pero hay que estar en el local: si el local tiene su ubicación cargada, la app compara y no deja marcar desde lejos (hasta 150 m).",
    "Para que funcione, cargá la ubicación de cada local parado ahí: Fichajes → Registro → 📍 Locales." ] },
  { id: "2026-10-15i", titulo: "Quién entró a la app", items: [
    "En Fichajes → Registro, cada empleado muestra si está en la app en este momento, a qué hora entró hoy y cuál fue su último ingreso (y desde qué aparato). Hace falta que su usuario esté vinculado a su ficha." ] },
  { id: "2026-10-15j", titulo: "Mapa de cada marca", items: [
    "En Fichajes → Registro, al tocar el 📍 de una marca se abre un mapa con el punto exacto donde marcó y la distancia al local. Las marcas fuera del local se destacan en rojo con «ver mapa»." ] },
  { id: "2026-10-15k", titulo: "Accesos a la app en Personal", items: [
    "El módulo Colaboradores del inicio se eliminó: el usuario y la clave de cada persona ahora se cargan en su ficha (Personal → Colaboradores → ficha → 🔑 Acceso a la app). Los usuarios sin ficha, como las administradoras, están en Personal → Colaboradores → 🔑 Accesos.",
    "Al dar de baja a un empleado se pregunta si se elimina también su acceso.",
    "Se eliminan las cuentas compartidas de cajero (una por local) en cuanto Galo, Ariana y Alejo tengan la suya con rol cajero." ] },
  { id: "2026-10-15l", titulo: "Fichaje en cualquier local", items: [
    "Galo, Ariana y Alejo pueden fichar en cualquiera de los 3 locales: eligen el local donde están y, si no es el suyo, queda avisado en Novedades.",
    "La distancia máxima para fichar desde el celular ahora es de 150 metros del local." ] },
  { id: "2026-10-15m", titulo: "Convenio y bajas", items: [
    "En la ficha, quien tiene convenio ahora lleva el nombre del convenio (por ejemplo UTHGRA – Gastronómicos).",
    "Al dar de baja se pide la fecha, el tipo de baja (renuncia, despido, mutuo acuerdo…) y el motivo; todo queda en Bajas." ] },
  { id: "2026-10-15n", titulo: "Fichaje en varios aparatos", items: [
    "Las marcas se actualizan solas cada minuto en todos los aparatos: si alguien ficha desde el celular y abre la compu, ya figura fichado. En el inicio se ve «Ya estás fichado» con la hora y desde dónde." ] },
  { id: "2026-10-15o", titulo: "Faltas desde que se usa el fichaje", items: [
    "Los días anteriores a que empezáramos a usar el fichaje ya no cuentan como faltas. En Fichajes → Registro se ve y se puede cambiar la fecha desde la que se usa (si no se fija, es el día de la primera marca)." ] },
];

function ultimoVisto(usuario) {
  try { return window.localStorage.getItem("nkt_novedades_" + usuario) || ""; } catch (e) { return ""; }
}

export default function NovedadesApp(p) {
  var cu = p.cu;
  var usuario = String((cu && cu.usuario) || "").toLowerCase();
  var [visto, setVisto] = useState(null);   // null = todavía no se sabe
  var [cerrado, setCerrado] = useState(false);
  var aplica = NOVEDADES_PARA.indexOf(usuario) !== -1;

  useEffect(function () {
    if (!aplica) return;
    var vivo = true;
    var local = ultimoVisto(usuario);
    fetch(SURL + "/rest/v1/pautas?id=eq.nv_" + encodeURIComponent(usuario), { headers: SH })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var db = "";
        try { if (Array.isArray(d) && d[0]) db = (JSON.parse(d[0].texto) || {}).hasta || ""; } catch (e) {}
        if (vivo) setVisto(db > local ? db : local);
      })
      .catch(function () { if (vivo) setVisto(local); });
    return function () { vivo = false; };
  }, [usuario]);

  if (!aplica || visto === null || cerrado) return null;
  var nuevas = NOVEDADES_APP.filter(function (n) { return n.id > visto; });
  if (nuevas.length === 0) return null;

  function noMostrarMas() {
    var hasta = NOVEDADES_APP[NOVEDADES_APP.length - 1].id;
    try { window.localStorage.setItem("nkt_novedades_" + usuario, hasta); } catch (e) {}
    var ahora = new Date().toISOString();
    fetch(SURL + "/rest/v1/pautas", {
      method: "POST",
      headers: { ...SH, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "nv_" + usuario, ambito: "novedades_vistas", texto: JSON.stringify({ hasta: hasta }), usuario: usuario, created_at: ahora, updated_at: ahora })
    }).catch(function () {});
    setCerrado(true);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000CC", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter',sans-serif" }}>
      <div style={{ background: "#111", border: "1px solid #D4A01766", borderRadius: 16, padding: "20px 20px 16px", width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 800, color: "#F0EDE8" }}>🆕 Novedades de la app</div>
        <div style={{ fontSize: 11.5, color: "#9A9A9A", margin: "4px 0 14px", lineHeight: 1.5 }}>Esto es lo que se agregó, en síntesis.</div>
        {nuevas.map(function (n) {
          return (
            <div key={n.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#D4A017", marginBottom: 5 }}>{n.titulo}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#D8D8D8", lineHeight: 1.65 }}>
                {n.items.map(function (t, i) { return <li key={i} style={{ marginBottom: 3 }}>{t}</li>; })}
              </ul>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={function () { setCerrado(true); }} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #2A2A2A", background: "none", color: "#9A9A9A", fontFamily: "'Inter',sans-serif", fontSize: 12.5, cursor: "pointer" }}>Cerrar</button>
          <button onClick={noMostrarMas} style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "#D4A017", color: "#000", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>No volver a mostrar</button>
        </div>
      </div>
    </div>
  );
}
