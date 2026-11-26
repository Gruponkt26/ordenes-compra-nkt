// Celulares de los colaboradores: cada celular queda asociado a UNA persona; con el de un compañero no se puede marcar.
// Rige desde CELULAR_BLOQUEO_DESDE. Se guarda en pautas (ámbito fichaje_dispositivo, id fdisp_<id del celular>):
// {empleado_id, empleado_nombre, estado: "aprobado" | "pendiente", origen, desde}. La tablet del local (kiosco) y administración no se ven afectadas.
// El primer celular de cada persona se aprueba solo; uno más queda «pendiente» hasta que administración lo apruebe.
export var CELULAR_BLOQUEO_DESDE = "2026-11-25";

var MSG_AJENO = function (n) { return "🚫 Este celular está asociado a " + (n || "otro compañero") + ". No se puede marcar con el celular de un compañero.\n\nSi es tu celular, pedile a administración que lo libere."; };
var MSG_PENDIENTE = "⏳ Este celular nuevo está esperando que administración lo apruebe.\n\nMientras tanto marcá con la tablet del local o avisale a administración.";
var MSG_NUEVO = "⏳ Ya tenés un celular aprobado. Este quedó pendiente: administración lo tiene que aprobar para que puedas marcar desde acá.\n\nMientras tanto marcá con la tablet del local.";

// Decide si ese celular sirve para esa persona. No hace nada por su cuenta: devuelve {ok, msg?, crear?} y quien llama guarda el registro que pide crear.
//  hoy: "AAAA-MM-DD" · reg: el registro de ese celular (null = no hay; undefined = no se pudo leer) · todos: todos los registros · fichajes, empleados: para el historial.
export function decidirCelular(c) {
  if (c.kiosco || c.libre || !c.emp || String(c.hoy || "") < CELULAR_BLOQUEO_DESDE) return { ok: true };
  if (!c.d || c.d === "sinid" || c.reg === undefined) return { ok: true };   // sin id o sin poder leer la lista: no se bloquea a nadie por un error
  var emp = c.emp, ahora = new Date().toISOString();
  if (c.reg) {
    if (c.reg.empleado_id !== emp.id) return { ok: false, msg: MSG_AJENO(c.reg.empleado_nombre) };
    if (c.reg.estado === "pendiente") return { ok: false, msg: MSG_PENDIENTE };
    return { ok: true };
  }
  // Sin registro: si en el historial lo usó otra persona (2 marcas o más), es de ella.
  var uso = {};
  (c.fichajes || []).forEach(function (x) { var m = /Disp:([a-z0-9]+)/.exec(x.notas || ""); if (m && m[1] === c.d) uso[x.empleado_id] = (uso[x.empleado_id] || 0) + 1; });
  var ids = Object.keys(uso).sort(function (a, b) { return uso[b] - uso[a]; });
  if (ids.length && uso[ids[0]] >= 2 && ids[0] !== emp.id) {
    var due = (c.empleados || []).find(function (e) { return e.id === ids[0]; });
    return { ok: false, msg: MSG_AJENO(due && due.nombre), crear: { empleado_id: ids[0], empleado_nombre: due ? due.nombre : "", estado: "aprobado", origen: "historial", desde: ahora } };
  }
  // Primer celular de esta persona: se aprueba solo. Uno más: queda pendiente.
  var tiene = (c.todos || []).some(function (r) { return r.empleado_id === emp.id && r.estado !== "pendiente"; });
  var reg = { empleado_id: emp.id, empleado_nombre: emp.nombre, estado: tiene ? "pendiente" : "aprobado", origen: tiene ? "celular nuevo" : "primer celular", desde: ahora };
  return tiene ? { ok: false, msg: MSG_NUEVO, crear: reg } : { ok: true, crear: reg };
}
