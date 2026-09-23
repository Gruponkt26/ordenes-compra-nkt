# 🛒 Compras Pro — Guía de instalación en Vercel

## ¿Qué necesitás?
- Una cuenta gratuita en [vercel.com](https://vercel.com) (se puede crear con Gmail)
- Una cuenta gratuita en [github.com](https://github.com) (opcional pero recomendado)

---

## Opción A — Subir directo desde la web (más fácil)

1. Abrí [vercel.com](https://vercel.com) y creá una cuenta gratis
2. Hacé clic en **"Add New Project"**
3. Elegí **"Upload"** y arrastrá toda la carpeta `compras-pro`
4. Vercel detecta que es un proyecto Vite automáticamente
5. Hacé clic en **Deploy** — ¡listo!
6. Te da un link tipo `compras-pro-xxx.vercel.app` — ese es el link de tu app

---

## Opción B — Via GitHub (recomendado para actualizaciones fáciles)

1. Creá un repo en GitHub y subí esta carpeta
2. En Vercel conectá tu cuenta de GitHub
3. Seleccioná el repo y hacé clic en Deploy
4. Cada vez que actualices el código en GitHub, Vercel actualiza la app solo

---

## ¿Cómo instalarla en el celular?

### Android (Chrome):
1. Abrí el link de la app en Chrome
2. Aparece un banner que dice **"Agregar a pantalla de inicio"** → tocalo
3. ¡Ya está instalada como app!

### iPhone (Safari):
1. Abrí el link en Safari
2. Tocá el botón de compartir (cuadradito con flechita ↑)
3. Elegí **"Agregar a pantalla de inicio"**
4. ¡Lista!

---

## Compartir con empleados

Simplemente mandales el link de Vercel por WhatsApp.
Ellos lo abren en el celu y lo instalan como app.

**Los datos de cada celular son independientes** (cada uno tiene su propio stock y historial guardado localmente).

---

## ⚠️ Nota sobre la IA
El asistente de IA usa la API de Anthropic (Claude).
Para que funcione en producción, necesitás configurar una API key:

1. Creá una cuenta en [console.anthropic.com](https://console.anthropic.com)
2. Generá una API key
3. En Vercel → Settings → Environment Variables → agregá:
   - Nombre: `VITE_ANTHROPIC_API_KEY`
   - Valor: tu API key

Luego en `src/App.jsx`, en el fetch de la IA, agregá el header:
```js
"x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
"anthropic-version": "2023-06-01",
"anthropic-dangerous-direct-browser-ipc": "true"
```

---

## ⚠️ Antes de crear cualquier tabla: el RLS

**Toda tabla nueva de este proyecto nace con Row Level Security prendido**, se cree desde
el SQL Editor o desde el botón *New table*. Con RLS activo y sin políticas, la key anónima
—que es con la que funciona toda la app— no puede leer ni escribir: la pantalla abre, se
carga algo, y al recargar no está. No da error visible, así que es difícil de adivinar.

Después de crear una tabla, siempre:

```sql
alter table <la_tabla> disable row level security;
```

Para verificar que quedó como el resto:

```sql
select relname as tabla, relrowsecurity as rls
from pg_class
where relname = '<la_tabla>';
```

Tiene que dar `false`. Algunas tablas viejas (`ordenes`, `gastos`, `ideas`) están al revés:
RLS prendido con una política `Allow all` que no filtra nada. Es equivalente en la práctica;
lo que no funciona es RLS prendido **sin** política.

Esto no es una recomendación de seguridad, es cómo está armada la app: la `SKEY` viaja en
el bundle de JavaScript y es pública. Cerrar eso de verdad es un trabajo para todas las
tablas juntas, y está anotado en los pendientes.

---

## ⚠️ Tabla nueva en Supabase: `aportes`

El módulo **🤝 Aportes de Socios** (Administración → Egresos → pestaña *Aportes*)
necesita una tabla propia. Creala una sola vez desde Supabase → SQL Editor:

```sql
create table if not exists aportes (
  id          text primary key,
  socio       text,
  local       text,
  monto       numeric,
  tipo_aporte text,
  notas       text,
  fecha       date,
  usuario     text,
  created_at  timestamptz default now()
);
```

Hasta que la tabla exista, el panel abre y funciona pero los aportes no se guardan
entre sesiones.

### ⚠️ Columna `local_cuenta` en `aportes` y `retiros`

Los aportes y retiros distinguen **a qué local le corresponde** el movimiento de **por qué
cuenta se movió la plata** (por ejemplo: un aporte para Kusama que el socio depositó en
Mercado Pago Nicolás, que es cuenta de Bodegón). Eso requiere una columna más en las dos
tablas. Corré esto en Supabase → SQL Editor:

```sql
alter table aportes add column if not exists local_cuenta text;
alter table retiros add column if not exists local_cuenta text;
```

Hasta que la columna exista, **los aportes y retiros no se van a guardar**: la app avisa en
pantalla con un cartel rojo indicando justamente esto. Los registros viejos, sin el dato,
se siguen comportando como antes (la cuenta se asume del mismo local del movimiento).

### ⚠️ Tabla `vacaciones`

Las vacaciones del calendario de 👥 Personal necesitan su tabla:

```sql
create table if not exists vacaciones (
  id              text primary key,
  empleado_id     text,
  empleado_nombre text,
  fecha_desde     date,
  fecha_hasta     date,
  notas           text,
  created_at      timestamptz default now()
);
alter table vacaciones disable row level security;
```

Si falta la tabla, o está el RLS prendido, el guardado **lo dice en pantalla con el SQL para
copiar**: antes se guardaba en la pantalla y no en la base, y recién se notaba al recargar.

## ⚠️ Tabla `vencimientos`

El módulo 📅 **Vencimientos a pagar**, dentro de Administración, necesita su propia tabla.
Corré esto en Supabase → SQL Editor:

```sql
create table if not exists vencimientos (
  id          text primary key,
  local       text,
  concepto    text,
  area        text,
  subramo     text,
  monto       numeric default 0,
  referencia  text,
  grupo       text default 'otros',
  cuotas      int default 0,
  cuotas_previas int default 0,
  tipo        text default 'simple',
  nro_plan    text,
  cuotas_plan jsonb default '[]'::jsonb,
  recurrente  boolean default true,
  dia         int,
  fecha       date,
  activo      boolean default true,
  notas       text,
  pagos       jsonb default '[]'::jsonb,
  usuario     text,
  created_at  timestamptz default now()
);
alter table vencimientos disable row level security;
```

Si la tabla ya existía de antes, las tres columnas nuevas se agregan con:

```sql
alter table vencimientos add column if not exists grupo          text default 'otros';
alter table vencimientos add column if not exists referencia     text;
alter table vencimientos add column if not exists cuotas         int default 0;
alter table vencimientos add column if not exists cuotas_previas int default 0;
alter table vencimientos add column if not exists tipo           text default 'simple';
alter table vencimientos add column if not exists nro_plan       text;
alter table vencimientos add column if not exists cuotas_plan    jsonb default '[]'::jsonb;
alter table vencimientos add column if not exists cuit           text;
alter table vencimientos add column if not exists debito_cuenta  text;
alter table vencimientos add column if not exists debito_cbu     text;
alter table vencimientos add column if not exists caduca_en      int default 3;
```

Hasta que exista la tabla, el módulo abre y se puede usar, pero no guarda nada entre
sesiones y avisa en pantalla.

**El botón 🩺, arriba a la derecha del módulo, prueba el guardado de punta a punta**: escribe
en la tabla **un vencimiento suelto y un plan** —cada uno con exactamente los campos que
manda su formulario, que no son los mismos: el suelto lleva `subramo` y día, el plan lleva
`tipo` y `cuotas_plan`—, los lee de vuelta, comprueba que los campos hayan llegado enteros y
los borra. Si falla sólo uno de los dos, el informe lo muestra por separado. El informe queda en pantalla con el
código HTTP y la respuesta textual de Supabase, con un botón para copiarlo. Es lo primero a
mirar cuando algo "no guarda": dice si el problema es una columna que falta, el RLS
prendido, o que la columna existe pero no conserva el dato.

**Si falta una columna, el módulo lo dice solo.** Al entrar a Vencimientos se le pregunta a
la tabla por **todas** las columnas que la app escribe —las nuevas y las de siempre— y, si falta alguna, aparece arriba un cartel rojo con
cuáles son y el `alter table` listo para copiar. Un vencimiento suelto **se guarda igual**
sin ese dato; un **plan** no, porque sin `tipo` y `cuotas_plan` no se podría ni leer ni
pagar: ahí el guardado se corta y dice qué correr.

### Un vencimiento no es un gasto

Es lo que **hay que pagar**: el alquiler, el IVA, la luz. El gasto nace recién cuando se
paga, y por eso **marcarlo pagado genera el egreso** en 💰 Egresos —con su medio de pago, su
área y su factura—, igual que el pago de una cuenta corriente. Así la misma plata no se
carga dos veces ni depende de que alguien se acuerde.

Si el pago ya se había cargado a mano, hay un casillero para decirlo y entonces no se genera
nada: sólo queda marcado como pagado.

**🔁 Débito automático.** Cada vencimiento y cada plan puede decir **de qué cuenta se
debita** y con qué **CBU o alias** —«el plan 3 de AFIP se debita de Provincia»—. Las cuentas
son las mismas de la lista de medios de pago, así que al marcarlo pagado **el medio ya viene
elegido**: no hay que acordarse de cuál era. Aparece en la fila y en la tarjeta del plan, y
en los avisos. En blanco significa que lo pagás vos.

**🔔 Avisos de lo que vence.** Lo que venció o vence dentro de 7 días aparece en tres
lugares, sin entrar a buscarlo: un cartel arriba del **Dashboard** de Administración con los
cinco más urgentes y el total, un **número rojo** en la solapa 📅 Vencimientos, y el mismo
cartel en la portada del módulo, donde cada línea lleva a su organismo. Cuenta los
recurrentes de este mes y del que viene, los de una sola vez y las cuotas de los planes; lo
que ya se pagó no aparece.

**Pagar algo vencido: se carga el total y el interés sale solo.** Cuando lo que se está
pagando ya venció —un vencimiento suelto o la cuota de un plan—, el formulario suma un campo
**Valor real a pagar**: el número que da el organismo, con la mora adentro. El interés se
calcula como la diferencia contra la cuota y queda a la vista («Cuota $100.000 + intereses
$18.500 (18,5%) = $118.500»), sin tener que hacer la cuenta a mano. El egreso se genera por
el total, con el detalle de cuánto fue interés.

El interés **no descuenta del plan**: pagar con mora saca más plata de la cuenta pero no
adelanta el plan, así que lo pagado del plan sigue siendo la cuota y el interés se cuenta
aparte («Pagado $100.000 · resta $100.000 · $18.500 de intereses (salieron $118.500)»).

**El pago y su egreso van juntos, en los dos sentidos.** El pago guarda el `egreso_id` del
egreso que generó, así que si el egreso se borra desde 💰 Egresos el vencimiento vuelve a
quedar impago —y avisa en pantalla, porque el cambio pasa en otra pantalla—, y si el pago se
deshace desde Vencimientos se borra el egreso. Nunca queda uno sin el otro: un egreso
huérfano sería plata gastada que nada explica, y un vencimiento pagado sin egreso sería un
pago que no figura en ningún lado. Vale igual para las cuotas de un plan. Un pago marcado
como «ya lo cargué en Egresos» no generó nada, así que al deshacerlo no se borra nada.

**Se puede pagar con más de un medio.** Cada línea es un medio con su monto —parte en
efectivo y parte por transferencia, o desde dos cuentas distintas— y entre todas tienen que
dar el total pagado; si no dan, el aviso dice cuánto falta. La lista de medios es la misma
que la de Egresos (efectivo por local, las transferencias de cada cuenta, las tarjetas,
cheque), así que lo que se puede elegir en un lado existe en el otro. El egreso que se
genera queda con esos mismos medios, que es lo que después mira el impuesto al débito.

- **Recurrentes**: aparecen todos los meses en el día que se les puso. Si el mes es más
  corto —un vencimiento el 31 en febrero— cae el último día. Cada mes se marca pagado por
  separado, así que el historial queda por período.
- **De una vez**: aparecen sólo en el mes de su fecha. Por eso, al cargar uno con fecha de
  otro mes, **el filtro de mes se mueve solo** al guardarlo: si no, quedaba guardado pero
  fuera de la vista y parecía que no se había guardado. El formulario lo avisa antes.
- El **monto es estimado**; al pagar se carga el real, y ése es el que va al egreso.
- El **identificador** es texto libre: el número de cliente del servicio, el contrato del
  alquiler, lo que sirva para encontrar la boleta. Aparece al lado del concepto.

**Un submódulo por organismo.** El módulo abre en una portada con siete tarjetas —🏛️ AFIP,
🏙️ ARBA, 🏘️ Municipalidad, 💡 Servicios, 👥 Gremio, 🏦 Créditos y 📦 Otros—, cada una con lo que le falta
pagar este mes, cuántos vencieron o en cuántos días cae el próximo. Se entra a uno y adentro
pasa todo: el listado, los totales, el alta y el pago, siempre de ese rubro —adentro de AFIP
no aparece nada de ARBA ni de los otros—. Arriba queda sólo el ← para volver a la portada.

Abajo de las tarjetas hay dos botones. **📅 Ver todos juntos** muestra el mes completo sin
separar por organismo. **🗂️ Todo lo cargado** es otra cosa: la lista general de todo lo que
existe, **sin filtro de mes**, agrupada por rubro y ordenada por el próximo vencimiento
impago de cada uno. Es donde aparece lo que vence en otro mes —que en la vista mensual, por
definición, no se ve—, con un buscador por concepto, identificador, N° de plan o alias, y un
**Ir a su mes →** que abre el organismo en el mes que corresponde.

Tiene además un **filtro de mes propio**, que arranca en «todos los meses» y se puede acotar
a uno: muestra lo que cae ahí —los recurrentes, que caen todos los meses; los de una sola
vez cuya fecha sea de ese mes; y los planes con alguna cuota que venza ahí—. La lista de
meses incluye cualquier mes al que apunte algo cargado, aunque quede lejos, así nada queda
fuera de alcance.

ARBA y Municipalidad van separados a propósito: son dos organismos distintos, con sus
propios vencimientos y su propia boleta. Lo que se haya cargado con el rubro viejo `iibb`,
de cuando iban juntos, entra por **ARBA**, que es donde se declara Ingresos Brutos.

Al dar de alta desde adentro de un submódulo, el rubro **queda fijo**: es el del submódulo
donde estás, no se elige.

**🏦 Créditos** es para los préstamos y créditos bancarios. Funciona igual que los demás y
usa la misma planilla que los planes de pago, que es lo que es un crédito: un número, un
monto por cuota y una fecha por cuota.

**AFIP, ARBA, Gremio y Créditos van por CUIT, no por local.** El IVA, el F.931 o la cuota sindical son
de la persona jurídica, no del salón donde se vendió, así que en esos tres rubros —y en sus
planes de pago— se elige el CUIT:

| CUIT | Quién | Cubre | El egreso se carga en |
|------|-------|-------|----------------------|
| 20-26958479-4 | Colantonio Carlos Nicolas | El Bodegón | 🍷 El Bodegón |
| 30-71844629-1 | Calzon Gitano SRL | Kusama + Colantonio's | 🏢 Oficina |

Un crédito lo toma un CUIT, no un salón, por eso va con los otros tres.

Municipalidad, Servicios y Otros siguen **por local**: la tasa de Seguridad e Higiene y la
luz vienen a nombre de una dirección. Como el egreso que se genera al pagar siempre necesita
un local, en los rubros por CUIT lo pone el CUIT: el personal es el Bodegón, y lo de la SRL
—que es de dos locales a la vez— va a Oficina, igual que ya venían los planes de pago. Lo
cargado antes de que existiera el campo se lee igual: Bodegón = CUIT personal, el resto SRL.

Cada rubro trae además **el área de egreso que le suele corresponder** (AFIP e IIBB a
Administrativo, Servicios a Servicios, Gremio a Sueldos): al elegir el rubro se completa
sola, y se puede cambiar. El rubro ordena los vencimientos; el área es la que manda al
egreso que se genera al pagar.

### Planes de pago

**Una cuota puede tener tres fechas.** La del plan —el día que se elige al cargarlo—, el
**2º vencimiento**, que es un día del **mismo mes** (el 26, por ejemplo), y el **corrido**,
que cae en el **mes siguiente** (el 12). Los dos se ponen una vez en el alta, valen para
todas las cuotas y se ven debajo de la fecha en la planilla: «16/10/2026 · 2º 26/10/2026 ·
corrido 12/11/2026». Con 0 en cualquiera de los dos, esa fecha no existe. Se guardan en cada
cuota, así que correr las fechas del plan las recalcula, y ✏️ Editar plan los cambia para
todas. Un plan cargado antes de que existieran estas fechas **abre con los días de siempre
puestos —26 y 12— y lo avisa**: alcanza con entrar a ✏️ Editar plan y guardar para que todas
sus cuotas los tengan. Al pagar algo vencido, el aviso recuerda las dos fechas que le quedaban.

**Una cuota está vencida recién cuando se le pasaron todas sus fechas.** Si el primer
vencimiento fue el 16 pero el segundo es el 26, el día 22 todavía se puede pagar: la
planilla la muestra como **⏳ 2º vto 26/09** y no como vencida, no entra en las adeudadas del
plan, no cuenta para la caducidad y **no figura en las deudas** de 🔔 Novedades —figura en
los vencimientos, con la fecha que viene—. Lo mismo con el corrido, que es la última.

**Un plan que ya se venía pagando** se carga entero igual: se pone el **mes de la primera
cuota de verdad**, aunque sea pasado, y en «¿Ya lo venías pagando?» cuántas cuotas llevás
pagadas (y si el anticipo ya está pago). Las primeras nacen marcadas pagadas y **no generan
egresos** —esa plata salió antes de que el plan existiera acá, generarlos sería contarla dos
veces—. En la planilla se distinguen: dicen «✅ ya venía» en vez de «✅». Después se corrige
el monto o la fecha de cualquier cuota, una por una.

**Un plan cargado se edita entero.** Abajo de la planilla hay tres botones: **✏️ Editar
plan** cambia el nombre, el N° de plan, el CUIT (o el local), el débito automático, las
notas y **las fechas del anticipo y de la 1ª cuota** —mover la primera corre todas las
demás, mes a mes, manteniendo el día, que es el arreglo de haber cargado el plan con el mes
de inicio equivocado; una cuota pagada acá conserva la fecha real de su pago—; **+ Cuota** agrega una al final —con el monto de la última y un
mes más— para cuando el plan se estira; y **🗑️ Borrar plan** lo saca entero. Dentro de la
planilla, cada cuota tiene su ✏️ para el monto y la fecha, y las impagas un ✕ para borrarlas
—una pagada primero hay que deshacerla—.

**Un plan se cae si se dejan de pagar cuotas**, y perderlo significa volver a la deuda
original con sus intereses, así que se avisa antes: con **una cuota menos que el límite**
sale un cartel amarillo —«2 cuotas vencidas sin pagar: con una más se cae el plan»— y al
llegar al límite uno rojo —«3 cuotas vencidas sin pagar: el plan se cayó»—. El aviso está en
la tarjeta del plan, en la portada del módulo y en el Dashboard de Administración, porque un
plan por caerse es más urgente que un vencimiento suelto.

El límite es **3 cuotas impagas**, que es lo habitual en AFIP y ARBA, y se puede cambiar por
plan —algunos caducan con 2— en el campo «Se cae con» del alta y de ✏️ Editar plan.

La tarjeta de cada plan lleva sus **cuatro cuentas**, sacadas de las cuotas y no de un
contador a mano: **totales**, **pagadas**, **por pagar** —las que faltan y todavía no
vencieron— y **adeudadas** —las que faltan y ya vencieron—, cada una con su cantidad y su
importe. La diferencia entre las dos últimas es la que importa: no es lo mismo deber una
cuota que todavía no tener que pagarla.

Un plan aparece **una sola vez**: su tarjeta, en 📋 Planes de pago, con la planilla adentro.
Las cuotas del mes no se repiten abajo como filas sueltas —se pagan desde la planilla, que
es donde están el monto, la fecha y el estado de cada una—. La tarjeta dice de entrada
cuántas cuotas caen en el mes que se está mirando, cuánto suman y cuántas están vencidas, y
se abre sola cuando hay alguna. Los totales de arriba siguen contando todo, planes
incluidos.

AFIP, ARBA y la municipalidad no mandan un vencimiento por mes: mandan **un plan**, con su
número, su **anticipo —la cuota cero—** y cuotas que casi nunca valen lo mismo entre sí. Por
eso un plan es otra cosa que un vencimiento suelto y guarda **sus cuotas una por una**, con
su monto y su fecha, en vez de un día del mes y un importe estimado.

Necesita tres columnas más en la tabla —`tipo`, `nro_plan` y `cuotas_plan`—, incluidas en el
SQL de arriba. Sin ellas el plan se guarda sin sus cuotas, que es lo mismo que no guardarlo:
el aviso lo dice al intentarlo.

Se carga desde **+ Plan de pago**, adentro del submódulo del organismo: nombre, N° de plan,
anticipo con su fecha, cantidad de cuotas, monto y día de vencimiento. Con eso se arma la
grilla entera de una vez. Las cuotas arrancan el mes siguiente al anticipo, para que la
primera no venza antes que él.

Después cada cuota **se edita por separado** —monto y fecha— desde la planilla del plan, que
es una fila por cuota con su estado: pagada, vencida o pendiente. Ahí mismo se paga cada una,
y eso genera su egreso como cualquier otro pago. Abajo queda lo pagado y lo que resta.

Las cuotas que vencen en el mes **también aparecen en el listado del mes**, mezcladas con el
resto, diciendo de qué plan son y cuánto resta. Un plan puede tener **más de una cuota en el
mismo mes** —el anticipo y la primera suelen caer juntos— y se listan las dos: si se mostrara
sólo una, el mes podría figurar al día teniendo una cuota vencida.

**Cuotas.** Un recurrente puede tener un total de cuotas —un préstamo, una compra
financiada— o no tenerlo, como el alquiler, que no termina nunca. Las **pagadas no se
cargan a mano**: son las que se fueron marcando pagadas en el módulo, más las que ya venían
pagas al darlo de alta (*ya pagadas antes*, para arrancar en la mitad). Un contador manual
se desincroniza al primer olvido; éste no puede.

La fila muestra en qué cuota va, cuántas faltan y cuánta plata es eso. Arriba, la tarjeta
**Cuotas por delante** suma la deuda de todos los planes abiertos: no es de este mes, pero
saber que hay ocho cuotas de $200.000 esperando cambia cómo se lee el resto. Al pagar la
última, el vencimiento deja de aparecer —salvo en los meses donde quedó un pago, para no
borrar el historial—.

Arriba del listado hay cuatro números del mes: total, pagado, falta pagar y cuántos están
vencidos. Cada fila dice si venció, cuántos días faltan o si ya está pago.

Deshacer un pago lo vuelve a poner como impago, pero **no borra el egreso**: eso se hace
desde Egresos. Está dicho en el aviso, porque borrar plata cargada no puede ser un efecto
lateral.

### ⚠️ Columnas de Patagonia Personas en `cierres_caja`

El Bodegón cobra por dos cuentas de banco: Provincia, que son los campos de siempre, y
**Patagonia Personas**. Los cuatro medios de esa segunda cuenta van en campos propios:

```sql
alter table cierres_caja add column if not exists pat_transferencia numeric default 0;
alter table cierres_caja add column if not exists pat_qr            numeric default 0;
alter table cierres_caja add column if not exists pat_debito        numeric default 0;
alter table cierres_caja add column if not exists pat_credito       numeric default 0;
```

Por esa cuenta también **se paga**: `Transferencia - Patagonia Personas` está en los medios
de pago de gastos y de sueldos, y se reconoce como cuenta de El Bodegón —no de Colantonio's,
que usa Patagonia *Empresas*—. Así el impuesto al débito y la disponibilidad salen del local
correcto.

Se guardan aparte **para saber por cuál cuenta entró cada peso**, pero en los cálculos cada
uno se suma a su medio de siempre: la transferencia de Patagonia cuenta como transferencia,
su débito como débito. Una transferencia es una transferencia venga del banco que venga, y
así el débito respeta sus 48 hs hábiles y los impuestos salen los mismos, sin duplicar
lógica. El bloque aparece **sólo en el cierre de El Bodegón**; los otros dos locales cobran
por una sola cuenta y no ven esos campos.

### ⚠️ Columnas de Mercado Pago en `cierres_caja`

Los tres locales cobran también por Mercado Pago, que es otra cuenta y tiene sus propias
comisiones. Por eso los medios de MP van en campos propios y no mezclados en "otros":

```sql
alter table cierres_caja add column if not exists mp_transferencia numeric default 0;
alter table cierres_caja add column if not exists mp_qr           numeric default 0;
alter table cierres_caja add column if not exists mp_debito       numeric default 0;
alter table cierres_caja add column if not exists mp_credito      numeric default 0;
```

Hasta que existan, el cierre **igual se guarda**: el guardado detecta la columna que falta
por el error de Postgrest, la saca y reintenta, y después avisa en pantalla qué datos
quedaron afuera con el `alter table` listo para copiar.

En la disponibilidad, Mercado Pago es **una caja aparte**: entra lo cobrado por MP, se le
descuentan su comisión y su IIBB, y de ahí salen los gastos pagados desde cuentas de MP
(que se reconocen por el nombre del medio de pago). El "otros" de Colantonio's era el QR de
MP antes de esto, así que conserva la tasa del QR para que los cierres viejos sigan bien.

### ⚠️ Columnas `retiro_caja` y `retiro_caja_nota` en `cierres_caja`

El cierre de caja de cada local deja anotado el **retiro diario de caja**. Es sólo un
registro: **no se resta del total del cierre ni de las ventas**, no toca el IVA ni
Resultados. Corré esto en Supabase → SQL Editor:

```sql
alter table cierres_caja add column if not exists retiro_caja      numeric default 0;
alter table cierres_caja add column if not exists retiro_caja_nota text;
```

Hasta que las columnas existan el cierre **igual se guarda**, pero sin el retiro: la app
reintenta sin ese campo, avisa en pantalla y deja el `alter table` a la vista para
copiarlo. Los cierres viejos, sin el dato, se ven como siempre.

Ese aviso aparece **en el momento de guardar**, así que es fácil que se pierda. Por eso
Novedades del día lo vuelve a decir: si **ningún** cierre trae la columna, la tarjeta de
cierres muestra el `alter table` arriba de todo. «No hubo retiros» y «el retiro no se está
guardando» se ven igual en pantalla y son cosas muy distintas, así que se distinguen por
cómo contesta Postgrest: manda la clave en `null` cuando la columna existe y está vacía, y
la **omite del todo** cuando la columna no existe.

### El pago de cuenta corriente pregunta por la factura

Pagar la cuenta corriente de un proveedor genera solo un egreso en Egresos → Proveedores.
Ese egreso nacía siempre **sin factura**, así que su IVA nunca entraba al crédito fiscal del
mes por más que la compra estuviera facturada. Ahora el formulario de pago pregunta si tiene
factura y con qué CUIT, igual que cualquier otro egreso.

Ojo con el mes: el IVA se imputa **por la fecha del pago**, que es cuando nace el egreso, no
por la de la factura. Si se paga en un mes una factura del anterior, el crédito cae en el
mes del pago.

### Impuesto al crédito (el "impuesto al cheque")

Cada vez que **entra** plata a la cuenta bancaria, el fisco se lleva el **0,6%**. La tabla
`IMP_CREDITO` lo tiene por local, porque cada uno cobra por una cuenta distinta:

- **Galicia** (Kusama) y **Patagonia Empresas** (Colantonio's), por Calzon Gitano SRL: 0,6%.
- **Provincia** (Bodegón), por el CUIT personal: 0,6%, la misma alícuota.
- **Cuentas de Mercado Pago**: en cero hasta confirmar si el impuesto las alcanza.

Se trata igual que el IIBB y las comisiones: **suma a los egresos** (área Administrativo) y
**se descuenta de la disponibilidad**, medio por medio. Las ventas no se tocan.

La otra mitad es el **impuesto al débito**: 0,6% cuando **sale** plata de la cuenta, o sea
sobre los pagos, no sobre las ventas. Misma alícuota y mismas cuentas (`IMP_DEBITO`). Del
medio de pago se deduce de qué caja salió: **el efectivo no toca el banco y no paga**, y los
pagos desde Mercado Pago van con la tasa de MP, hoy en cero.

**Lo paga todo lo que sale**, no sólo los gastos: `salidasPorMedio` junta gastos y
proveedores, sueldos y aguinaldos, adelantos y retiros de socios. El retiro de un socio no es
gasto operativo y no toca el resultado, pero la plata sale de la cuenta igual y el banco
cobra el impuesto lo mismo — así que su impuesto sí es un egreso, aunque el retiro no lo sea.

Es la misma función para las dos vistas, y repite el criterio de la disponibilidad —pagos
cruzados incluidos, imputados a la cuenta de la que salió la plata— para que el impuesto que
suma a los egresos y el que descuenta de la caja sean el mismo número y no dos parecidos. Un
gasto cargado a mano como "impuesto al cheque" apaga los dos cálculos, el del crédito y el
del débito, porque es el mismo impuesto.

### Cuándo se acredita cada cobro

El débito del **POS del banco** tarda **48 hs hábiles** en entrar a la cuenta, tanto en
Provincia (Bodegón) como en Patagonia Empresas (Colantonio's). La excepción es Kusama
(Galicia), que acredita en el momento. La disponibilidad "de hoy" descuenta lo que todavía
no se acreditó y avisa desde qué día entra.

El débito y el crédito cobrados por **Mercado Pago** no pasan por esa espera: van a la caja
de MP y se cuentan disponibles al momento, que es justamente lo que se paga con esa
comisión.

Pendiente: el plazo del **crédito** por POS del banco. Hoy se cuenta disponible al momento
en los tres locales.

### Comisiones del procesador

Cobrar con tarjeta cuesta, y ese costo no estaba en ningún lado. La tabla `COMISIONES`
—arriba del panel de cierres, al lado de `ALICUOTA_IIBB`— tiene el porcentaje **por local y
por medio de pago**, porque cada local puede cobrar por un procesador distinto:

```js
var COMISIONES={
  l1:{transferencia:0, tarjeta_debito:0.0314, tarjeta_credito:0.0629, otros:0},
  ...
};
```

Van los porcentajes **con IVA adentro** —el costo real de la liquidación, no la comisión
nominal— y **sin** las retenciones de IIBB, que se calculan aparte. Un medio en 0 no
descuenta nada y no aparece en pantalla. Las de **Mercado Pago** son iguales en los tres locales, porque es la misma cuenta: QR 1,41%,
débito 3,14%, crédito 6,29%, transferencia 0. Esas ya vienen **con IVA adentro**, que es como
las informa MP.

Los bancos publican el arancel **sin IVA**, así que los suyos se escriben con `conIVA()` —el
número del contrato queda a la vista y la cuenta también. **Galicia** (Kusama) ya está:

| Medio | Arancel | Con IVA |
|---|---|---|
| Transferencia y QR | 0,8% | 0,968% |
| Débito | 1,6% | 1,936% |
| Crédito | 5,8% | 7,018% |

**Provincia** (Bodegón) y **Patagonia** (Colantonio's y la cuenta Personas de Bodegón) siguen
en cero; un medio en cero no descuenta nada.

Se comporta igual que el IIBB: **suma a los egresos** del resultado y del cuadro de Ventas
y Egresos (área Administrativo) y **se descuenta de la disponibilidad**, medio por medio.
Las ventas no se tocan.

### La tabla de impuestos del mes

El cuadro 🧮 **Ventas y Egresos** abre, debajo del cuadro por local, una tabla con los cuatro
costos calculados del mes —IIBB, impuesto al crédito, impuesto al débito y comisiones—
abiertos por local y con su total. No son un renglón aparte: ya están adentro de los egresos
de arriba, en el área Administrativo. La tabla existe para poder identificarlos, que es
distinto de sumarlos otra vez.

Aparece sólo cuando hay algo que mostrar, así que en los meses anteriores al corte no está.

Ejemplo, un cierre con $100.000 de débito, $100.000 de crédito y $50.000 de QR:

| | Venta | IIBB 2% | Comisión | Llega a la cuenta |
|---|---|---|---|---|
| Débito | $100.000 | $2.000 | $3.140 | $94.860 |
| Crédito | $100.000 | $2.000 | $6.290 | $91.710 |
| QR | $50.000 | $1.000 | $705 | $48.295 |

### Ingresos Brutos: el IVA se separa, IIBB ya viene descontado

Los dos se calculan sobre lo facturado —transferencia, débito, crédito y QR; el efectivo
queda afuera— pero se leen al revés:

- **IVA**: la plata entra entera y hay que **separarla** para pagarlo después. Es una
  reserva: si no se aparta, se gasta.
- **IIBB**: el banco y las tarjetas lo **retienen apenas se acredita la venta**. No hay
  nada que separar — es plata que nunca llega a la cuenta. El cierre lo muestra para saber
  cuánto de la venta electrónica se va por ese camino.

La alícuota está en `ALICUOTA_IIBB` (hoy **2%**), arriba del panel de cierres. Para
cambiarla se toca ese único valor. Si algún día los locales quedan en jurisdicciones
distintas, esto pasa a ser una alícuota por local.

Los dos números se ven en 🏪 Cierres: en el cierre del día, en el total del mes por local y
en el detalle de cada cierre.

**Dónde pega el IIBB, y dónde no.** Son dos preguntas distintas y cada una tiene su
respuesta:

- **Ventas y resultado**: la cifra del cierre, entera. Eso fue lo que se vendió, y es lo
  que hay que mirar para saber cómo anduvo el local.
- **Disponibilidad de caja**: la venta electrónica entra a la cuenta con el 2% ya retenido,
  así que ahí sí se descuenta, medio por medio. El efectivo no se toca: sobre la caja no
  hay retención.

- **Resultado y cuadro de Ventas y Egresos**: el IIBB **suma a los egresos**. Es un costo
  de vender, como la comisión de la tarjeta: si no está, el margen sale inflado. Entra en
  el área *Administrativo*, que es donde vive "Ingresos Brutos" en el árbol de áreas.

Con eso las tres vistas dan lo mismo: si se vendieron $150.000 con $50.000 electrónicos,
ventas $150.000, egresos $1.000 y disponibilidad $149.000.

En Resultados, el bloque 📲 Electrónico muestra el renglón *IIBB retenido (2%)* entre los
ingresos y los gastos, y el desglose por medio ya viene neto.

**El cálculo automático corre desde septiembre de 2026**, el mes en que se puso. Hasta agosto
inclusive los impuestos y las comisiones se cargaban a mano en Egresos, así que ahí el
automático no corre: si corriera, esos meses contarían el mismo costo dos veces y los cierres
ya presentados cambiarían de número. De septiembre en adelante los calcula la app y no se
cargan más; si en septiembre quedó algo cargado a mano, el aviso de duplicado lo marca.

El corte es un solo valor, `MES_AUTOMATICO`, y es **por mes entero, no por día**: partir un
mes al medio dejaría la primera quincena cargada a mano y la segunda calculada, y ningún
informe cerraría.

Antes el corte no era por fecha sino por contenido: un impuesto cargado a mano apagaba el
cálculo de ese mes. Eso terminaba apagándolo por cosas que no eran el impuesto —una
"comisión bancaria" cargada como gasto, por ejemplo— y dejaba meses enteros sin calcular sin
que nadie se enterara. Una fecha es más previsible: se sabe de antemano qué meses están de
cada lado.

Del mes del corte en adelante, si igual se carga un impuesto a mano, las dos vistas avisan en rojo
que ese mes lo está contando dos veces, con el monto, para que se borre ese egreso. El aviso
señala el problema; no cambia los números por su cuenta. En los meses anteriores no aparece:
ahí la carga a mano es la única fuente y está bien que esté.

El aviso mira sólo lo que de verdad duplicaría: la **comisión del procesador** por cobrar
con tarjeta, el IIBB y el impuesto al cheque. El mantenimiento y el abono del POS son otra
cosa —monto fijo del banco, no un porcentaje de las ventas—, la app no los calcula y tienen
que seguir cargados como el gasto que son: por eso no los marca.

La **comisión bancaria** también está excluida, pero por un motivo que se vence: con las
tasas del POS en cero, cargarla a mano es hoy la única forma de que ese costo figure. Ver el
pendiente de los aranceles antes de tocar esas tasas.

### Qué se carga a mano y qué no, de septiembre 2026 en adelante

| | |
|---|---|
| IIBB, impuesto al crédito y al débito | los calcula la app — **no cargar** |
| Comisión del procesador (MP, tarjetas) | la calcula la app — **no cargar** |
| Mantenimiento o abono del POS | **cargar** en Administrativo → Bancos |
| Comisión del POS del banco | **cargar** hasta que sus tasas estén en `COMISIONES`; ahí se deja |
| Egresos del día del cierre | los anota el cajero, **los carga Administración** en Egresos |
| Todo el resto de los gastos | como siempre |

El recorte se calcula sobre la venta ya corregida a mano si hay corrección, medio por
medio, y la disponibilidad "de hoy" lo aplica sobre el débito efectivamente acreditado
(respetando los 2 días hábiles, y que Kusama y Colantonio's acreditan al instante). Los
aportes de socios y el traspaso del mes anterior no se tocan: no son venta.

### El cierre anota lo que salió de la caja, no lo descuenta

El **total del cierre es lo que se vendió**: el efectivo va bruto. Lo que salió de la caja
durante el día se anota al pie del cierre y no toca el total:

- **📤 Egresos del día** — lo que se pagó de la caja, con su concepto. Lo carga el cajero,
  y **Administración lo tiene que cargar en 💰 Egresos** para que impacte en el resultado y
  en la disponibilidad de caja. Aparece listado en 🏪 Cierres, en el bloque
  *"Salió de la caja este mes"*, para que no se pierda ninguno.
- **💼 Retiro diario de caja** — sólo informativo, no se carga en ningún lado.

El **retiro de socio salió del cierre**: ya no se carga desde ahí. Los retiros de socios
van por el módulo 🤝 Socios, que es donde se leen. Los cierres viejos conservan el dato que
tenían y la disponibilidad de caja lo sigue respetando.

Antes el egreso se restaba del efectivo del cierre. **Los meses ya cerrados se siguen
viendo exactamente como se vieron siempre**: cada cierre sabe de qué época es por su propio
total guardado —si coincide con la suma bruta de los medios se guardó con el criterio nuevo,
y si no, con el viejo— así que en los cierres de antes el egreso se sigue neteando. El
criterio nuevo corre sólo para los cierres que se carguen de acá en adelante.

Por eso el bloque *"Salió de la caja este mes"* lista **sólo los egresos que todavía no
están descontados**. Los de los cierres viejos no aparecen: ya salieron por la venta, y
cargarlos en Egresos los contaría dos veces.

Ojo con una consecuencia: **editar y volver a guardar un cierre viejo lo pasa al criterio
nuevo**, porque se regraba su total. Ahí el egreso deja de estar descontado y pasa a figurar
en el bloque para cargar.

### Cómo se leen los aportes y los retiros

Los movimientos de socios **no son parte del resultado operativo**:

- **Resultado del mes** = ventas − gastos reales. No incluye ni aportes ni retiros.
  Es lo que el local genera por sí solo.
- **Movimientos de socios** = aportes (+) y retiros (−), en un bloque aparte debajo
  del resultado. Un retiro mayor a la ganancia del mes se marca con una alerta:
  esa diferencia sale del capital del local, no de la ganancia.
- **Disponibilidad de caja** = incluye todo, con su medio de pago, para que el
  efectivo y los bancos cuadren contra la realidad.

Ojo con los dos criterios de imputación, que conviven a propósito:

- El **resultado** se imputa por el local del movimiento — quién consumió el gasto, a qué
  local le corresponde el aporte o el retiro.
- La **disponibilidad** se imputa por el local de la cuenta — de dónde salió o entró la
  plata realmente.

Por eso un mismo movimiento puede figurar en el resultado de un local y en la
disponibilidad de otro. No está duplicado: responden preguntas distintas.

---

## ⚠️ Columnas `clase` y `bien` en `aportes` y `retiros`

El módulo **🤝 Socios** permite registrar aportes y retiros de **bienes muebles** (una
heladera, mesas, un equipo), no sólo de plata. Eso necesita dos columnas más en cada tabla:

```sql
alter table aportes add column if not exists clase      text default 'dinero';
alter table aportes add column if not exists bien       text;
alter table aportes add column if not exists cotizacion numeric;
alter table aportes add column if not exists usd        numeric;
alter table retiros add column if not exists clase      text default 'dinero';
alter table retiros add column if not exists bien       text;
alter table retiros add column if not exists cotizacion numeric;
alter table retiros add column if not exists usd        numeric;
```

### La cuenta corriente va en dólares

Cada movimiento guarda además el **dólar blue del día** y su equivalente en USD, calculado
al cargarlo y **congelado**: es el valor de ese día y no se recalcula nunca más. Sin eso,
$800.000 puestos en 2024 y $800.000 puestos hoy figuran iguales en la cuenta corriente del
socio, y no lo son.

La cotización se carga a mano, con la última usada precargada. Se eligió a mano y no por
API porque el CSP de `vercel.json` sólo permite conectarse a Supabase: traerla automática
implicaría abrir el `connect-src` a un servicio externo que puede caerse o cambiar.

Un movimiento sin cotización suma en pesos pero no en dólares, y la cuenta corriente avisa
cuántos hay en esa situación para poder completarlos.

Hasta que existan, al guardar un movimiento aparece un aviso diciendo que faltan. Todo lo
ya cargado sigue funcionando: sin `clase` se lo toma como dinero, que es lo que era.

**Un bien no toca ninguna caja.** No entró ni salió plata, así que queda afuera de la
disponibilidad y del resultado del mes: sólo pesa en la cuenta corriente del socio. Por eso
al elegir "📦 Bien mueble" el formulario esconde el medio de pago y la cuenta, y pide en
cambio qué es y su valor estimado.

---

## ⚠️ Columna `pagos` en `adelantos`

Un adelanto de sueldo se puede repartir entre varios medios de pago (una parte en efectivo,
el resto por transferencia), igual que los sueldos. Eso necesita una columna más:

```sql
alter table adelantos add column if not exists pagos jsonb default '[]'::jsonb;
```

Hasta que la columna exista, al guardar un adelanto aparece un aviso diciendo justamente
que falta correr esto. Los adelantos ya cargados siguen funcionando: se leen por su
`medio_pago` de siempre.

---

## ⚠️ Columna `contenido` en `productos`

El **⚖️ Comparador** (módulo Proveedores → pestaña *Comparador*) compara **precio por
unidad**, no precio de lista: un atún x 6 a $6.000 y uno suelto a $900 sólo se pueden
mirar de frente después de dividir. Para eso necesita saber cuánto trae cada
presentación, y eso va en una columna nueva:

```sql
alter table productos add column if not exists contenido numeric;
```

Hasta que la columna exista, el producto se guarda igual (sin el contenido) y el
comparador sigue andando: cuando el campo está vacío deduce la presentación del propio
nombre, así que "Atún x 6", "Aceite 900 ml" o "Coca 2 lt" se calculan solos. El campo a
mano sirve para los nombres que no dicen la presentación, o cuando la app la deduce mal
—ahí el producto muestra la etiqueta `auto` al lado de la unidad.

Las equivalencias están fijas en el código: los kilos y los gramos se comparan entre sí,
los litros y los mililitros también, y las docenas cuentan como 12 unidades. Lo que no
tiene contenido propio (una caja, un atado, una bandeja) sólo se compara contra otra
igual, y si dos proveedores cargan el mismo producto en unidades incompatibles la fila
queda marcada y no se compara.

---

## ⚠️ Tablas nuevas en Supabase: checklist

El **✅ Checklist** (módulo Locales → elegís un local → pestaña *Checklist*) es el
checklist operativo diario, con turno de apertura y de cierre. Necesita tres tablas y un
bucket de fotos. Creá las tablas una sola vez desde Supabase → SQL Editor:

```sql
-- Encargado y firma de cada local / turno / fecha
create table if not exists checklist_turnos (
  id         text primary key,
  local      text,
  fecha      date,
  turno      text,
  encargado  text,
  firmado    boolean default false,
  updated_at timestamptz default now()
);

-- Estado, hora, comentario y foto de cada tarea
create table if not exists checklist_items (
  id         text primary key,
  turno_id   text,
  local      text,
  fecha      date,
  turno      text,
  area_id    text,
  idx        integer,
  status     text,
  comentario text,
  foto_url   text,
  hora       text,
  usuario    text,
  updated_at timestamptz default now()
);

-- Tareas personalizadas de un local / área / turno (pisan la plantilla del código)
create table if not exists checklist_tareas (
  id         text primary key,
  local      text,
  area_id    text,
  turno      text,
  tareas     jsonb,
  updated_at timestamptz default now()
);
```

Y para las fotos: Supabase → **Storage** → **New bucket** → nombre `checklist`, marcado
como **público**. Sin el bucket todo lo demás funciona, pero al subir una foto avisa que
no se pudo.

Hasta que existan las tablas, la pestaña abre y se puede usar, pero nada se guarda entre
sesiones (y al tildar aparece un aviso diciéndolo).

Cómo está armado:

- Las **tareas base** de las 6 áreas (Salón, Depósito, Cocina, Baños, Patio y Vereda) están
  en el código, en `CHK_AREAS`, separadas por turno. El **Patio es sólo del Bodegón**.
- Si un local agrega o saca tareas, eso se guarda en `checklist_tareas` y pisa la plantilla
  **para ese local, esa área y ese turno**. Los demás locales no se tocan.
- El `id` de un ítem es `local_turno_fecha_area_idx`, así marcar y desmarcar pisa la misma
  fila en vez de acumular filas muertas.

---

## ⚠️ Tabla nueva en Supabase: `deportes`

El módulo **🏅 Deportes** lleva la plata del predio. Lo que se hace ahí adentro es casi
siempre lo mismo —anotar algo que entró o algo que salió—, así que **la caja es la única
puerta** y el módulo abre directo en ella:

- **📊 Resumen** → de dónde entró y en qué se fue, en una pantalla. Las entradas agrupadas
  por concepto (turnos de tenis, de pádel, clases, horas de profes, otras) y las salidas
  por rubro, con el saldo abajo. Lo pendiente va aparte y en amarillo: prometer plata no es
  lo mismo que tenerla, y sumarlo al total haría que el mes parezca mejor de lo que es.
- **📥 Entradas** → todo lo que entra, con el saldo del predio arriba.
- **📤 Salidas** → todo lo que sale, clasificado por rubro.
- **⚙️** (🏗️ Obras, 👤 Profes y 🏚️ Galpón) → detrás del engranaje, porque no son el día a
  día: las obras ya se ven en Salidas y las otras dos son fichas que se miran de vez en
  cuando. Tampoco hacen falta para *cargar*: el selector de *Anotar entrada* ya ofrece el
  ingreso al galpón. Se esconden pero no se sacan, porque los artículos y los profes no
  aparecen en ninguna otra pantalla y quedarían cargados sin forma de verlos. Estando
  parado en una de ellas la fila se abre sola.

  Las obras sí son plata (salen), pero profes y artículos no: un profe es una persona y un
  artículo es stock, y ninguno de los dos toca el saldo.

Las dos secciones preguntan primero **qué fue**, y recién después piden los datos:

- *Anotar entrada* → 🎾 turno de tenis, 🏓 turno de pádel, 🎾 clase de tenis, 💰 otra
  entrada (un torneo, el kiosco, una seña) o 🏚️ ingreso al galpón.
- *Anotar salida* → 🔧 mantenimiento, 💡 servicios, 👷 sueldo canchero, 🏗️ obra o
  📦 otra salida. El rubro queda elegido de entrada.

El registro se guarda como lo que es: un turno de tenis sigue siendo un turno de tenis, con
su cancha y su duración, no una fila suelta de caja. Por eso en las listas conviven cosas
distintas, cada una rotulada. La excepción es el **ingreso al galpón**: se carga por la
misma puerta, por comodidad, pero un artículo es stock y no plata, así que no suma al saldo
y el módulo lleva a la ficha de Galpón al guardarlo, para que se vea dónde quedó.

Un **profe** guarda de qué deporte es —🎾 tenis o 🏓 pádel—, porque de un lado y del otro
son personas distintas y la lista los mezclaba: antes todos quedaban como de pádel, que era
el valor fijo de la sección.

Las **sugerencias de nombres** se separan por lo que pide cada campo, y no salen todas de
la misma bolsa: quien alquila una cancha puede ser cualquiera que ya vino antes, pero al
cargar un porcentaje o el profe de una clase sólo tienen que aparecer **profes**, y quien
hace una obra no tiene nada que ver con ninguno de los dos.

Las **🤝 horas de un profe** no son lo mismo que un turno, y por eso son un tipo aparte. El
turno es alquilar la cancha a quien venga; esto es lo que paga un profe por las horas que
usa para sus clases, a su tarifa. Entra plata en los dos casos, pero por motivos distintos,
y mezclarlos haría imposible saber de dónde viene cada peso.

Se cargan las horas usadas y **la cuenta se hace sola**. La tarifa sale de la ficha del
profe —el campo *$ por hora* que ya tenía— y se trae al elegir el nombre: el precio vive en
un solo lugar, así no termina diciendo una cosa distinta en cada carga. Todo se puede pisar
igual, porque si el profe pagó otra cosa manda lo que pagó y no la cuenta.

> Antes esto era un porcentaje sobre lo que el profe le cobraba a sus alumnos. Resultó ser
> una tarifa por hora, así que el tipo cambió de `porcentaje` a `uso`. Las columnas `base` y
> `porcentaje` quedaron sin uso; se dejan por si algún día aparece un arreglo de ese tipo.

Una **🏗️ obra** es plata que sale, así que vive en Salidas y se imputa sola al rubro obras.
Además tiene su propia vista, en la fila de abajo, para verlas todas juntas con lo que
llevan gastado. Guarda a cargo de quién está y su teléfono, que es lo que se busca cuando
hay que llamar al que la hizo.

El grueso son los **alquileres de cancha que se le cobran a los profes**. Todo lo que mueve
plata guarda **medio de pago** (efectivo, Mercado Pago Sofía o Belo) y su estado es de
cobranza —*a cobrar*, *cobrado*/*pagado*, *cancelado*—, no de agenda. El resumen muestra
cuánto se movió, cuánto falta y por qué medio; lo cancelado no suma en ningún lado.

Todo eso vive en **una sola tabla**: cada fila guarda de qué `disciplina` es y qué
`tipo` de registro es, así un turno de tenis y uno de pádel no se pisan aunque usen
las mismas columnas. Creala una sola vez desde Supabase → SQL Editor:

```sql
create table if not exists deportes (
  id          text primary key,
  disciplina  text,      -- tenis | padel | galpon
  tipo        text,      -- clase | turno | profe | articulo | entrada | salida | obra | uso
  fecha       date,
  hora        text,
  nombre      text,      -- alumno, cliente, profe o artículo, según el tipo
  profe       text,
  cancha      text,      -- en Galpón se usa como ubicación
  duracion    numeric,
  cantidad    numeric,
  precio      numeric,
  monto       numeric,
  medio_pago  text,      -- efectivo | mp_sofia | belo
  rubro       text,      -- salidas y obras: mantenimiento | servicios | obras | canchero | otros
  base        numeric,   -- sin uso (quedó de cuando las horas de profe eran un porcentaje)
  porcentaje  numeric,   -- sin uso, ídem
  estado      text,
  contacto    text,
  notas       text,
  usuario     text,
  created_at  timestamptz default now()
);
```

Si `comanda_items` se creó antes de que existiera la carga de pedidos, le faltan tres
columnas:

```sql
alter table comanda_items add column if not exists ronda        integer;
alter table comanda_items add column if not exists enviado_at   timestamptz;
alter table comanda_items add column if not exists entregado_at timestamptz;
```

Si la tabla ya estaba creada de antes, sin la columna del medio de pago, alcanza con:

```sql
alter table deportes add column if not exists medio_pago text;
alter table deportes add column if not exists rubro      text;
alter table deportes add column if not exists base       numeric;
alter table deportes add column if not exists porcentaje numeric;
```

Hasta que la tabla exista, el módulo abre y se puede usar, pero nada se guarda entre
sesiones. Al entrar, el módulo consulta la tabla y —si falta ella o alguna columna— muestra
un cartel rojo arriba de todo con **la respuesta textual de Supabase**, que nombra qué es lo
que falta. Es el mismo criterio que el checklist: más vale decirlo antes de que alguien
cargue un mes de alquileres y se pierdan todos al recargar.

Los estados y los medios de pago salen del código (`DEP_ESTADOS` y `DEP_MEDIOS`), no de
la base: una clase o un alquiler va de *a cobrar* a *cobrado* o *cancelado*, un profe está
activo o inactivo, y un artículo está en el galpón, prestado, en reparación o dado de baja.
Sumar un medio de pago nuevo es agregarlo a `DEP_MEDIOS` y nada más.

### Comandar: cargar, mandar, entregar

Al tocar una mesa se abre **su comanda**, no se cierra la mesa. Adentro:

1. **Se arma el pedido.** *Agregar de la carta* → categoría o buscador → tocar un plato lo
   suma. Si ese plato ya está sin mandar, sube la cantidad en vez de repetir el renglón:
   una mesa que pide cuatro cervezas quiere `4x Heineken` y no cuatro líneas iguales. Cada
   ítem tiene su ✎ para la aclaración ("sin cebolla"), que es lo que arruina un plato si no
   se lee.
2. **Se manda a la cocina**, todo junto. El pedido se arma primero y se manda después a
   propósito: el mozo toma la mesa entera y la cocina recibe **una tanda**, no siete
   papelitos sueltos.
3. **Se entrega**, ítem por ítem, a medida que sale.

Una mesa **no se puede cerrar con ítems sin mandar**: o se mandan o se sacan. Un plato
cargado que nunca llegó a la cocina es un plato que el cliente pidió y no va a recibir.

### El cronómetro de cocina

Cuenta desde que la tanda **sale a la cocina**, no desde que se abrió la mesa: entre que se
sientan y piden pueden pasar quince minutos que no son culpa de nadie.

Y va **por tanda, no por mesa**. Una mesa pide entradas, después principales, después
postre; un solo reloj mezcla los tres y no dice nada. En el plano, cada mesa muestra el de
**la tanda más vieja que todavía no se entregó**, con el color de la demora: verde hasta 10
minutos, amarillo hasta 20, rojo después. Mientras no haya nada en la cocina la mesa va en
el color del local — una mesa recién abierta sin pedir no es un problema, y una con una
tanda de hace media hora sí.

Eso permite pararse en el salón, mirar la pantalla y saber en un segundo qué mesa está
demorada, que es para lo que sirve.

### Cómo está armada la navegación

Las secciones están en `DEP_SECCIONES`, con dos flags que no son lo mismo: `principal`
(va en la fila de arriba) y `plata` (se resume como plata, no como inventario). Una obra
tiene `plata` pero no `principal`.

Qué tipos junta cada sección lo decide `depTiposDe()` —Entradas son `entrada`, `clase` y
`turno`; Salidas son `salida` y `obra`—, y las opciones de los dos selectores están en
`DEP_ORIGENES` y `DEP_ORIGENES_SALIDA`: cada una dice qué `disciplina`, qué `tipo` y, si
hace falta, con qué `rubro` ya puesto. Sumar "turno de fútbol" es agregar una línea ahí.

El formulario no se arma con el tipo de la sección sino con el que se está cargando
(`formTipo`/`formDisciplina`), que es lo que permite anotar un turno de tenis sin salir de
la caja. Y cada fila del listado se lee con **su propio** tipo, porque en Entradas conviven
una entrada suelta, una clase y un alquiler, y cada uno tiene sus campos y sus estados.

Las **salidas** se clasifican por rubro, obligatorio: 🔧 mantenimiento del predio,
💡 servicios, 🏗️ obras, 👷 sueldo canchero y 📦 otros (`DEP_RUBROS`). El resumen muestra
cuánto se fue en cada uno.

Todo lo que tiene fecha se puede mirar **mes por mes**, con un selector arriba de los
filtros de estado. No es cosmético: el saldo de arriba se recalcula con el mes elegido, así
que es la forma de preguntarle al módulo cómo cerró septiembre.

Dos criterios que conviene tener presentes:

- El saldo cuenta **sólo lo que ya se movió**: entradas cobradas —incluidos los turnos y
  las clases— y salidas pagadas. Lo pendiente se ve aparte, en el resumen de cada pestaña,
  y lo cancelado no suma en ningún lado.
- La caja del predio **no se cruza con Administración**: no entra al resultado del mes ni
  a la disponibilidad de caja del grupo. Es un circuito propio.
Agregar un campo nuevo a un tipo es tocar `DEP_CAMPOS` y sumar la columna en Supabase:
el formulario y el listado se arman solos a partir de esa lista.

---

## ⚠️ Columna `ambito` en `ideas`

El módulo **💡 Ideas** separa las ideas por ámbito —Generales, 🏅 Predio y cada local—,
con solapas para filtrar, igual que 📌 Pautas. Eso necesita una columna más:

```sql
alter table ideas add column if not exists ambito text;
```

Hasta que exista, al publicar una idea aparece un aviso diciendo justamente que falta
correr esto. Las ideas ya cargadas siguen funcionando: sin `ambito` se las toma como
**generales**, que es lo que eran antes de que esto existiera.

Los ámbitos salen de `IDEAS_AMBITOS`, que son los de las pautas más el predio.

---

## ⚠️ Tablas nuevas en Supabase: comandas

El módulo **🍽️ Comandas** es la pantalla de servicio: el plano de mesas, los deliverys y
los mostradores. Por ahora es **la estructura**: una mesa se abre y se cierra, pero todavía
no se le cargan platos.

```sql
-- Las mesas de cada local, por sector
create table if not exists comanda_mesas (
  id         text primary key,
  local      text,
  sector     text,      -- salon | patio | vereda | barra
  nombre     text,      -- "12", "Barra 1", "Reservado"
  orden      integer,
  activa     boolean default true,
  created_at timestamptz default now()
);

-- Una fila por mesa abierta, delivery o pedido de mostrador
create table if not exists comandas (
  id         text primary key,
  local      text,
  tipo       text,      -- mesa | delivery | mostrador
  mesa_id    text,
  numero     integer,
  estado     text,      -- abierta | cerrada | cancelada
  mozo       text,
  cliente    text,
  direccion  text,
  telefono   text,
  personas   integer,
  total      numeric,
  medio_pago text,
  notas      text,
  abierta_at timestamptz default now(),
  cerrada_at timestamptz,
  usuario    text
);

-- La carta: los platos con su precio de venta, por local
create table if not exists carta (
  id         text primary key,
  local      text,
  categoria  text,
  nombre     text,
  precio     numeric,
  activo     boolean default true,
  orden      integer,
  created_at timestamptz default now()
);

-- Los ítems de cada comanda
create table if not exists comanda_items (
  id           text primary key,
  comanda_id   text,
  nombre       text,
  cant         numeric default 1,
  precio       numeric,
  nota         text,
  estado       text,      -- pendiente | enviado | entregado | cancelado
  ronda        integer,   -- la tanda con la que salió a la cocina
  enviado_at   timestamptz,
  entregado_at timestamptz,
  usuario      text,
  created_at   timestamptz default now()
);
```

### Una fila por ítem, no un JSON adentro de la comanda

Es la decisión de fondo del módulo. Todo el resto de la app guarda cada cosa como un objeto
entero y lo manda con `merge-duplicates`: se lee la fila, se modifica y se pisa. Para una
comanda eso no sirve. Si dos mozos tocan la misma mesa —uno agrega el postre y el otro una
bebida— el último en guardar borra lo que agregó el primero, y nadie se entera hasta que
falta un plato. Con una fila por ítem, cada uno agrega lo suyo y nada se pisa.

### La sesión no se cierra al recargar

El usuario logueado vivía sólo en memoria, así que recargar la página, cambiar de pestaña o
que el teléfono descartara la pantalla mandaba de vuelta al login — varias veces por turno.
Ahora se guarda en `localStorage` **el id del usuario, nunca la contraseña**, y al abrir se
lo vuelve a resolver contra la lista. Si ese usuario ya no existe, pide login de nuevo. El
botón 🚪 borra el dato, así que cerrar sesión sigue cerrando de verdad.

Esto no es un permiso: el acceso a los datos no depende de esta clave, lo único que se
recuerda es quién estaba usando la app.

### La pantalla se refresca sola

Durante el servicio la misma mesa la miran el mozo, el encargado y la caja. Si cada uno ve
una foto de hace diez minutos, el sistema no sirve. Por ahora vuelve a leer cada 20
segundos, que es lo mínimo razonable; lo correcto sería Supabase Realtime, que además
necesita abrir el `connect-src` del CSP a `wss://*.supabase.co`.

### La carta

Hasta ahora la app no tenía precios de venta: la tabla `precios` es de *compra* (cuánto
cobra cada proveedor) y `MENU_POR_LOCAL` tiene los nombres de los platos pero ningún
precio. La pestaña **📖 Carta** es donde se cargan.

Lo importante es de dónde salen los platos: **del menú de stock**, con el botón *Traer los
platos del stock*. Los nombres ya estaban cargados —son los mismos que se usan para contar
stock—, así que no hay que escribir cien platos de nuevo, sólo ponerles precio. El botón no
pisa lo que ya está, así que se puede volver a apretar cuando se agrega algo al menú sin
perder los precios cargados.

Las categorías se muestran en el orden de la carta (entradas, pizzas, principales), que es
el del menú de stock, y no alfabético: una carta no se lee así. Lo que se agregue a mano
—Bebidas, Postres, que no están en el stock— va al final.

Un plato sin precio no se puede cobrar, pero sí mandar a la cocina. Por eso el contador
avisa cuántos faltan en vez de impedir usar la carta a medio cargar.

El ✓ de cada plato lo saca de la carta sin borrarlo, para lo que está fuera de temporada o
se acabó: vuelve con otro toque, sin perder el precio.

#### Cargar una carta entera de una vez

`sql/carta-bodegon.sql` carga los 160 platos del Bodegón con sus precios, sacados de la
carta publicada en `menu.maxirest.com/24076`. Reemplaza la carta del local entera: borra y
vuelve a insertar, dentro de una transacción.

Sirve de molde para los otros locales. Dos cosas que hace y conviene mantener:

- **Numera los platos de corrido** (1 a 160, de punta a punta de la carta). Las categorías
  se ordenan en pantalla por el `orden` más chico de sus platos, así que numerar seguido
  alcanza para que la carta se vea igual que la impresa —las bebidas al final— sin guardar
  el orden de las categorías en ningún lado.
- **Distingue lo que se repite.** Una Grolsh en lata y una en litro son dos platos con el
  mismo nombre y distinto precio, así que van como `GROLSH (lata)` y `GROLSH (litro)`. Sin
  eso el mozo no sabe cuál está tocando.

---

## 🧾 IVA: la reserva diaria

La pestaña **📅 Reserva diaria** del módulo IVA dice, día por día y local por local, cuánto
hay que separar de cada caja por el IVA que generó la venta. No necesita nada nuevo en la
base: sale de los cierres que ya se cargan.

Dos cosas que hay que tener claras para leerla, y son la razón de que exista:

**El IVA ya está adentro del precio.** De $100.000 facturados, el IVA son **$17.355**, no
$21.000: el 21% se calcula sobre el neto ($82.645) y no sobre el total. Reservar el 21% del
bruto sería guardar de más; calcularlo mal para el otro lado es gastarse plata ajena. Por
eso cada celda muestra también de cuánto sale, para poder controlarla contra el cierre.

**Cuenta lo cobrado por medios electrónicos**: transferencias, tarjetas y el **QR** de cada
local. El QR vive en la columna `otros` del cierre y cada local lo etiqueta distinto —QR
Provincia (l1), QR Galicia (l2), QR Mercado Pago (l3)—, pero no es un cajón de sobras: entra
a la cuenta bancaria igual que una transferencia y está igual de declarado. El módulo IVA lo
dejaba afuera y **achicaba el débito fiscal de los tres locales**; se suma en
`ventaFacturada(c)`, que es el único lugar donde se define qué es facturado.

Las ventas en **efectivo no se facturan**, así que quedan afuera a propósito. Si algún día se
factura efectivo, hay que reservar más que lo que muestra el cuadro.

Y es el **débito fiscal**, no lo que se termina pagando: al cerrar el mes se le descuenta el
crédito de las compras. Guardar el débito y ajustar al final nunca deja corto, que para una
reserva es lo que conviene.

Al pie del cuadro están el techo y el piso juntos, que es lo que hace falta cuando buena
parte de la mercadería se compra sin factura:

| | | |
|---|---:|---|
| Reservado (débito) | $886.321 | lo que hay que guardar |
| Crédito aprovechado | −$658.015 | facturas de compra que tapan débito **del mismo CUIT** |
| **A pagar estimado** | **$228.307** | lo que sobra vuelve a caja |

El crédito que se cuenta es `min(crédito, débito)` **por CUIT**, no el crédito total: el que
sobra en un CUIT no le tapa nada al otro. Ese sobrante va a una nota aparte —$165.764 en
septiembre— porque no descuenta nada y se arrastra hasta que ese CUIT tenga ventas que lo
absorban. Cuanto más se compra sin factura, menos crédito hay y más se pega el *a pagar* al
*reservado*; comprando todo en negro serían el mismo número.

### El mismo número en el cierre de caja

Reservar a fin de mes es tarde: la plata ya se movió. Por eso la pantalla de **Cierres** de
Administración muestra, junto a cada total, **cuánto de eso no es de la casa**: en la
cabecera del local (el mes), en la alerta del día de hoy y al abrir cualquier día, más el
total al pie de cada columna en la 📊 Vista mensual.

**Sólo lo ve Administración.** El cajero cierra su caja como siempre y no ve ninguna línea
de IVA: la de él es otra pantalla (`PanelCierre`, rol `cajero`), y ahí no se tocó nada. La
decisión fue deliberada —el personal no maneja información fiscal—, con el costo asumido de
que la plata no se aparta físicamente en el momento del cierre.

Las dos pantallas calculan con las mismas funciones, `ventaFacturada(c)` e `ivaAReservar(c)`,
a nivel de módulo. Son el único lugar donde se define qué es facturado y cuánto se separa:
si mañana cambia la alícuota o entra un medio de pago nuevo, se toca ahí y se actualizan el
módulo IVA y los cierres a la vez.

---

### La posición por CUIT

El IVA **se liquida por CUIT**, y los CUIT no se compensan entre sí: un saldo a favor en uno
no le sirve al otro, se arrastra hasta que haya ventas que lo absorban. Por eso lo que se
paga es **la suma de las posiciones positivas**, no el neto de todas.

La pestaña **🏛️ Por CUIT** es la que se presenta. Qué CUIT factura las ventas de cada local
está en `CUIT_DE_LOCAL`:

| CUIT | Locales |
|---|---|
| Calzon Gitano SRL (30-71844629-1) | Kusama y Colantonio's |
| Colantonio Carlos Nicolás (20-26958479-4) | El Bodegón |

Un gasto sin CUIT elegido se factura al del local que lo hizo.

La pestaña **📊 Posición por local** sigue existiendo para ver qué genera cada local, pero
**mezcla criterios** —el crédito se imputa por CUIT y el débito por local—, así que no es lo
que se declara. Si algún local pasara a facturar con los dos CUIT, esto deja de alcanzar: el
dato exacto tendría que guardarse en el cierre de caja y no deducirse del local.


### A qué CUIT facturar la próxima compra

Arriba de las fichas, la pestaña 🏛️ Por CUIT dice **cuánto crédito le entra todavía a cada
CUIT** sin pasarse de su propio débito, y el equivalente en compras al 21%.

La lógica es la que importa, no el número: **mientras los dos CUIT estén a pagar, mover
crédito de uno al otro no cambia el total** —se le saca a uno lo que se le pone al otro—, así
que la pantalla lo dice en vez de fingir que hay una optimización. Lo único que sí cambia lo
que se paga es **pasarse de crédito en un CUIT**: el excedente no se compensa contra el otro y
queda dormido hasta que ese CUIT tenga ventas que lo absorban. Cuando eso pasa, el cartel
cambia de tono y nombra a cuál mandar las facturas.

Tres estados: los dos con margen (da igual, se sugiere el más holgado), uno pasado (mandá al
otro, acá sí cambia), los dos pasados (cualquier factura nueva queda inmovilizada).

El margen se recalcula con el mes elegido. El saldo a favor **no se pierde**, se arrastra. Y
a qué CUIT facturar no siempre se elige: depende de quién compra — el cartel lo aclara para
que no se lea como una instrucción.

---

## 📋 Pendientes

Cosas decididas a medias o dejadas para después, con el porqué. No están hechas ni
empezadas: si alguien retoma el proyecto, esto es lo que falta.

### De los costos de cobrar y de la caja

1. **Los aranceles por venta del POS de Provincia y de Patagonia.** Galicia ya está cargado;
   los otros dos siguen en cero en `COMISIONES`. Mientras estén así, lo cobrado con la
   maquinita en El Bodegón y en Colantonio's se muestra sin ese descuento, o sea con más
   plata de la que realmente entra. Ojo al cargarlos: los bancos informan el arancel **sin
   IVA**, y la tabla espera el costo real — para eso está `conIVA()`.

   Mientras tanto esas comisiones **se cargan a mano** en Egresos, con el nombre "comisión
   bancaria", y está bien que así sea: el cálculo automático da cero, así que no duplican
   nada. **Al cargar las tasas hay que hacer las tres cosas juntas**: poner los porcentajes,
   dejar de cargar la comisión a mano, y sacar `bancaria` de las exclusiones de
   `esGastoComision` para que el aviso vuelva a marcar si alguien la sigue cargando. Si se
   hace sólo la primera, el mismo costo se cuenta dos veces.
   Ojo: el **abono mensual del POS** es otra cosa —monto fijo, no porcentaje— y va cargado
   como un egreso más en Administrativo → Bancos. No entra en esta tabla.

2. **El plazo de acreditación del crédito por POS del banco.** El débito ya espera sus 48 hs
   hábiles en Provincia y Patagonia; del crédito no se sabe el plazo, así que hoy se cuenta
   disponible al momento en los tres locales. Si tarda, la disponibilidad de hoy está
   sobreestimada por esa diferencia. Mercado Pago, débito y crédito, sí es al instante.

3. **El impuesto al cheque en Mercado Pago, y en los sueldos.** Las dos mitades ya están:
   0,6% sobre lo que entra y sobre lo que sale de las tres cuentas de banco. Quedan dos
   agujeros:

   - **Si el impuesto alcanza a las cuentas de Mercado Pago.** Hoy están en cero, en los dos
     sentidos. Si las alcanza, la disponibilidad de MP está sobreestimada, y cada vez pesa
     más.
   - **Los aportes de socios que entran por transferencia** son acreditaciones en la cuenta,
     así que pagarían impuesto al crédito, y hoy no lo pagan: sólo se calcula sobre las
     ventas. Es la contracara del retiro, que sí quedó cubierto del lado del débito.

   Queda pendiente también preguntarle al contador **qué parte se computa a cuenta de
   Ganancias**: si se recupera una porción, el costo real es menor al 0,6% que se descuenta.

### Del predio (módulo Deportes)

1. **Un artículo del galpón no genera el gasto.** Si se compra una red y se anota como
   *ingreso al galpón*, queda el stock pero no la salida de plata: hay que cargar la salida
   aparte. Lo razonable sería que al anotar un ingreso pregunte si se compró y por cuánto,
   y genere las dos cosas de una.
2. **El filtro de mes en Profes no sirve.** Filtra por el campo *Desde*, o sea cuándo
   empezó el profe, que no es un movimiento de ningún mes. Conviene esconderlo para ese
   tipo; en clases, turnos, entradas y salidas sí tiene sentido.
3. **Un artículo sin fecha de ingreso desaparece al filtrar por mes.** El campo es
   opcional, así que sólo aparece en *Todos los meses*. O se hace obligatorio, o los
   registros sin fecha se muestran siempre.

### De permisos

4. **Ideas no distingue quién ve qué.** Cualquier usuario ve y publica en todos los
   ámbitos, el predio incluido, y puede cambiar el estado de una idea ajena (borrar, en
   cambio, sólo puede el autor). Viene de cuando Ideas era un buzón abierto para todo el
   grupo; si el predio pasa a ser otro negocio, habría que acotarlo.
5. **Deportes lo ve sólo `sofia`**, como el resto de los módulos de la barra. Si el
   canchero o un profe tuvieran que anotar sus propios turnos, hay que darles acceso, como
   se hizo con Compras para encargadas y cajeros.

### Del módulo de comandas

8. **Cargar ítems a una comanda**: hoy la mesa se abre y se cierra, nada más. Con la carta
   ya cargada, es el paso siguiente.
9. **El cronómetro de cocina**: desde que la tanda sale a la cocina hasta que se entrega.
   Va por ronda y no por mesa —una mesa pide entradas, principales y postre, y un solo
   reloj mezcla los tres— y la mesa muestra el de la tanda más vieja sin entregar. Necesita
   que exista "mandar a cocina", o sea los ítems.
10. **Imprimir en la comandera**: el puente está en `comandera/` y hay que engancharlo al
    bucle que mira las comandas nuevas. Ojo con el ticket duplicado si corre en las dos PC.
11. **Quién ve Comandas**: hoy sólo `sofia`. Los mozos necesitan entrar, y acotados a su
    local (el panel ya acepta `localFijo` para eso).

### Más grande

6. **El predio no se cruza con Administración**, y eso está decidido así por ahora. Lo que
   entra y sale de su caja no pesa en el resultado del mes ni en la disponibilidad del
   grupo: es un circuito propio.

   Se deja independiente **hasta que la caja de los cuatro locales esté depurada** en
   ingresos y egresos. Enchufar una quinta fuente de plata a una contabilidad que todavía
   se está ajustando agrega un lugar más donde buscar cuando un número no cierra.

   No se pierde nada esperando: cada movimiento del predio ya guarda fecha, monto, medio de
   pago y rubro, que es lo que hace falta para imputarlo. Lo acumulado se migra con un SQL,
   no cargándolo de nuevo.

   Cuando se haga, hay tres cosas que hoy no existen y hay que resolver:

   - **El predio no es un local.** Hay cuatro (`l1` a `l4`) y todo lo que gestión imputa
     cuelga de uno. Tendría que ser un quinto, o imputarse a alguno. Lo más limpio es que
     sea un local: es una unidad de negocio como las otras.
   - **Belo y Mercado Pago Sofía sólo existen dentro de Deportes** (`DEP_MEDIOS`). La
     disponibilidad del grupo no sabe qué son ni de qué local, así que esa plata no
     aparecería en ningún lado hasta agregarlos a `MEDIO_LOCAL_MAP`.
   - **Los ingresos del grupo entran por los cierres de caja diarios**, uno por local por
     día. El predio no cierra caja: sus entradas son turnos y porcentajes sueltos. Hay que
     decidir si genera su propio cierre o entra por otro camino.

   Las salidas son lo fácil: mantenimiento, servicios, canchero y obras son gastos como
   cualquier otro y pueden escribirse en `gastos` con su rubro.
7. **El acceso a Supabase es anónimo y abierto.** La `SKEY` viaja en el bundle de
   JavaScript, así que es pública, y las tablas o no tienen RLS o tienen una política
   `Allow all`. La app entera funciona así desde siempre —no es algo que haya roto un
   cambio puntual—, pero si algún día se quiere cerrar, es un trabajo para todas las tablas
   juntas y no para una sola.

---

## 🕐 Fichaje

Los chicos marcan entrada y salida, y la app **saca una foto en el momento**. La foto no se
compara con nada ni se reconoce a nadie: **es la prueba**. Si alguien fichó por un
compañero, se ve en la foto y listo. Eso evita tener que guardar datos biométricos de los
empleados, que en Argentina son dato sensible bajo la Ley 25.326 y necesitan consentimiento
firmado.

Sí se usa **detección de cara** —no reconocimiento—: el navegador mira si hay *una* cara en
el cuadro, sin averiguar de quién es. Si no ve ninguna, no deja marcar, así nadie ficha
apuntando al techo o con el dedo sobre la cámara. Esto anda en Chrome de Android; en iPhone
el navegador no lo trae, así que ahí la foto se saca igual y la marca queda con `cara` en
blanco. Nunca bloquea el fichaje por no poder mirar.

### El PIN

Cada uno tiene **cuatro números propios**. Al tocar su nombre aparece un teclado, y recién
con el PIN correcto se abre la cámara. Se comprueba solo al cuarto dígito, sin botón de
aceptar.

Se cargan en 🕐 Fichaje → **🔑 PINs**: un renglón por empleado, con 👁 para ver el que está
puesto y 🎲 para sortear uno. No deja repetir un PIN entre dos personas —si se repitiera no
distinguiría a nadie— y avisa cuántos quedan sin cargar.

**Al que todavía no tiene PIN se lo deja marcar igual.** Si no, nadie podría fichar hasta
que administración termine de cargarlos uno por uno. Cada marca guarda en `con_pin` si se
validó o no, así se ve después cuáles pasaron por el teclado.

El PIN frena **el favor entre compañeros**, que es el problema real: «marcá vos por mí» deja
de ser gratis. No es una contraseña —cuatro números se miran por encima del hombro, y quien
sepa leer la base los ve—, por eso **la foto se saca siempre igual**: esa es la prueba, y el
PIN sólo sube el costo de intentarlo.

### Dónde se ficha

- **La tablet del local**: se entra a 🕐 Fichaje → Fichar, se elige el local una vez y se
  tilda **«Tablet del local»**. Queda guardado en ese aparato, así que la pantalla abre
  siempre igual. Después de cada marca vuelve sola a la lista a los 6 segundos.
- **El celular de cada uno**: los usuarios que no son administración ven una tarjeta
  **🕐 Fichar** en su pantalla de inicio. Las marcas hechas desde un celular quedan con
  `aparato = celular` y, si el que ficha da permiso, con la ubicación: en el registro
  aparece un **📍 dónde** que abre el mapa. Si no da permiso, se guarda igual sin ubicación.

La lista muestra a cada uno con un punto verde si está adentro («Adentro desde 09:12») o
gris si no. **Adentro o afuera se decide por la última marca de las últimas 18 horas, no por
la del día**: el que entra a las 20 y sale a la 1 sigue adentro aunque haya cambiado la
fecha. Por eso también las horas se calculan con la **hora local**, no con la UTC: un cierre
a las 22:30 quedaría con fecha del día siguiente si se usara `toISOString()`.

### Las jornadas y los francos

En 🕐 Fichaje → **📆 Jornadas** se carga el horario de cada uno, día por día de la semana.
**Un día sin horario es franco.** Hay un botón para copiar el horario cargado al resto de
los días —la mayoría trabaja siempre lo mismo—, que respeta los francos ya marcados. Un
turno que termina antes de empezar (22:00 → 02:00) se entiende como cruce de medianoche.

Con la jornada cargada, el Registro deja de mostrar sólo lo que marcaron y **lo compara
contra lo que les tocaba**:

- **Previstas**: las horas del mes hasta hoy. Lo que todavía no pasó no se le reclama a nadie.
- **La diferencia**, al lado de las horas trabajadas: `−1h 30 de 136h` en rojo si falta,
  verde si sobra, gris si la diferencia es menor a media hora.
- **Faltas**: los días que le tocaban y no marcó, listados por fecha al abrir su renglón.
- **En franco**: lo que marcó un día que tenía libre, etiquetado en la fila.

Al que **no tiene jornada cargada no se le compara nada** —no se sabe qué le tocaba— y el
renglón lo dice. La pestaña avisa cuántos faltan.

### El registro

En 🕐 Fichaje → **Registro** está el parte del mes: horas totales, cuánta gente marcó y
cuántos turnos quedaron **sin cerrar** (alguien que entró y nunca marcó la salida). Abriendo
cada empleado se ven sus jornadas, con la miniatura de cada foto —se hace clic y se agranda,
con el local, el aparato y el mapa— y un 🗑 para borrar una marca mal puesta.

Un turno que cruza la medianoche se cuenta **entero en el día en que se entró**, no partido
al medio.

Cuando no anduvo la cámara o alguien se olvidó de marcar, **✎ Marca manual** carga la
entrada o la salida a mano, con fecha, hora y el motivo. Queda anotada como manual (se ve un
✎ en vez de la foto), para que se note la diferencia con lo que marcó la persona.

**Corregir a mano y borrar marcas es sólo de administración.** Cambia lo que se le paga a
alguien, así que no puede quedar del lado del que ficha. El Registro entero se abre nada más
que desde el módulo de Sofía, y además el permiso viaja explícito al panel (`puedeEditar`),
para que un cambio de navegación futuro no lo regale sin querer: sin él no aparecen ni el
botón de marca manual ni los 🗑.

Se cargan **los últimos cuatro meses** de marcas: alcanza para liquidar el mes y discutir el
anterior, sin traer años de datos que nadie mira.

### Lo que hay que crear en Supabase

```sql
create table if not exists fichajes (
  id              text primary key,
  empleado_id     text,
  empleado_nombre text,
  local           text,
  fecha           date,
  hora            text,
  tipo            text,
  momento         timestamptz,
  foto_url        text,
  cara            boolean,
  lat             double precision,
  lng             double precision,
  aparato         text,
  usuario         text,
  manual          boolean,
  con_pin         boolean,
  notas           text,
  created_at      timestamptz default now()
);
alter table fichajes disable row level security;
create index if not exists fichajes_fecha_idx on fichajes (fecha);
```

Y la columna del PIN en la tabla de empleados:

```sql
alter table empleados add column if not exists pin text;
alter table empleados add column if not exists jornada jsonb;
```

La jornada va en una sola columna del empleado, no en una tabla aparte: es un dato de la
persona, no un registro que crezca.

Y en **Supabase → Storage**, un bucket llamado **`fichajes`**, marcado como **público**. Si
el bucket no está, **la marcación se guarda igual, sin foto**, y avisa en pantalla: llegar
tarde y que no ande la cámara son dos problemas distintos, y perder el horario por el
segundo sería el peor de los dos.

### Probarlo desde el celular

La app está en Vercel, así que sirve por **HTTPS**, que es lo que el navegador exige para
dejar abrir la cámara. Se entra al link de siempre desde el celular y anda.

Dos cosas que hay que tener en cuenta:

- **El permiso de cámara se pide una vez por aparato.** Si se rechaza sin querer, no vuelve
  a preguntar solo: hay que tocar el candado en la barra de direcciones y habilitarlo a
  mano. La app avisa con ese texto cuando pasa.
- **Desde `localhost` o una IP de la red local (`http://192.168...`) la cámara no abre.** No
  es la app: los navegadores sólo dan cámara en HTTPS o en `localhost`. Probar siempre por
  el link de Vercel.

El CSP de `vercel.json` tiene que dejar pasar las imágenes de Supabase
(`img-src ... https://*.supabase.co`), o las fotos se suben bien pero salen rotas al
mostrarlas.

### Si no guarda

En 🕐 Fichaje hay un botón **🔧 Probar guardado** que prueba las tres cosas por separado y
dice cuál falla y cómo se arregla:

1. **Leer la tabla** — si no está, muestra el `create table` entero.
2. **Guardar una marca** — distingue la tabla que falta, el **RLS activado** (`alter table
   fichajes disable row level security;`) y la **columna que falta**, con el tipo correcto
   para cada una: `cara` y `manual` son `boolean`, `lat`/`lng` son `double precision`, no
   `text`. La marca de prueba se borra sola.
3. **Subir una foto** — separa el bucket que no existe del bucket que existe pero no es
   público.

## 🧾 Facturas de servicios por cuotas

La luz, el gas o el agua no llegan como «vence el 10 y son $90.000»: llegan con un
**período**, un **número de asociado** y **dos cuotas**, cada una con su vencimiento y su
importe, y **las dos se pagan**.

En Vencimientos → **💡 Servicios** (y en Otros) hay un botón **+ Factura** con esos campos.
Si la factura viene en un solo pago, se deja la cuota 2 vacía.

Una factura guarda sus cuotas en la misma estructura que un plan de pago (`cuotas_plan`),
así que todo lo que ya sabía recorrer cuotas la entiende sola: cada cuota se paga por
separado con su propio botón, entra en los avisos de vencimiento próximo, y su deuda se
cuenta en Novedades. Lo que **no** comparte con un plan es la **caducidad**: una factura de
luz no se cae por dejar una cuota impaga —te cortan el servicio, que es otra cosa—, así que
ese cartel no aparece.

Se ve en la planilla como «Luz · período ago-sep 2026 · asoc. 4471/2», con el local y
cuántas cuotas van pagadas.

Hace falta esto en Supabase:

```sql
alter table vencimientos add column if not exists periodo      text;
alter table vencimientos add column if not exists nro_asociado text;
```

### Borrar un vencimiento se lleva sus egresos

Pagar un vencimiento genera un egreso. Borrar ese **egreso** ya despagaba el vencimiento y
avisaba. Faltaba la otra mitad: borrar el **vencimiento** dejaba los egresos dados de alta,
sin nada que los respalde, inflando el rubro para siempre — y es justo lo que pasa cuando
alguien carga una factura de prueba y después la borra.

Ahora el cartel de borrado dice cuántos egresos se van con él y los borra. Los egresos de
otros vencimientos no se tocan: sólo los que llevan el `egreso_id` de sus propias cuotas y
pagos.

**Los que quedaron huérfanos de antes** no se recuperan solos: el `egreso_id` que los unía
se fue con el vencimiento borrado. Para ésos, en 📅 Vencimientos aparece un botón
**🧹 N huérfanos** al lado del 🩺 cuando los hay. Lista cuáles son, con su monto y su fecha,
y los borra. Reconoce sólo los que generó la app al pagar un vencimiento (su id empieza con
`egr_venc_`): un egreso cargado a mano nunca se toca, aunque haya salido de un vencimiento
marcado como «ya cargado».

## 🏦 Créditos bancarios

Un crédito no es un plan de facilidades ni un servicio, así que tiene su propia carga:
**+ Crédito**, con entidad bancaria, descripción, tipo de préstamo, fecha de otorgamiento,
TNA, deuda a la fecha, forma de pago, y las cuotas (cuántas, de cuánto, qué día vencen y
desde qué mes). En Créditos **no aparece «+ Plan de pago»**: ahí esa opción confundía.

La **deuda a la fecha se carga a mano**: es la que informa el banco, que incluye intereses
devengados y casi nunca coincide con la suma de las cuotas que faltan. Se guardan las dos y
se muestran las dos, que es justamente lo que sirve para compararlas.

En la planilla se lee «Crédito cocina Kusama · Banco Provincia · Inversión productiva», y
abajo «TNA 68,5% · deuda a la fecha $3.200.000 · Débito automático · otorgado 23/09/2026».

Como los planes y las facturas, guarda sus cuotas en `cuotas_plan`, así que cada una se paga
por separado y entra en los avisos y en la deuda. **Tampoco caduca**: un crédito impago se
reclama y se informa al Veraz, no se «cae», así que ese cartel no aparece.

Hace falta esto en Supabase:

```sql
alter table vencimientos add column if not exists entidad            text;
alter table vencimientos add column if not exists tipo_prestamo      text;
alter table vencimientos add column if not exists fecha_otorgamiento date;
alter table vencimientos add column if not exists tna                text;
alter table vencimientos add column if not exists deuda_actual       numeric default 0;
alter table vencimientos add column if not exists forma_pago         text;
```

## 🔔 Novedades del día

Un módulo principal que junta, en una sola pantalla, lo que pasó y lo que hay que mirar. No
guarda nada propio: lee de los mismos lugares que los módulos, con las mismas reglas, así que
no puede decir algo distinto.

La pantalla está armada para leerse de un vistazo, de arriba abajo:

1. **Lo urgente**, si lo hay: una línea por cosa —el cierre que falta, un plan por caerse o
   caído, lo vencido sin pagar—. Si no hay nada, la franja no aparece.
2. **Cuatro números**: ventas del período, deuda (con cuánto está vencido), lo que vence en
   7 días y el neto de socios.
3. **Cinco tarjetas**, en dos columnas cuando la pantalla da:
   - **💳 Deudas por título**, en dos bloques: **vencido sin pagar**, por rubro —AFIP, ARBA,
     Municipalidad, Servicios, Gremio, Créditos, Otros—, y **saldo con proveedores**, uno por
     proveedor, con el total abajo. La deuda se muestra **entera**, venga del mes que venga:
     lo que se debe se debe. Cada renglón se abre en una línea chica con **quién la debe**:
     los rubros que van por CUIT —AFIP, ARBA, Gremio, Créditos— se parten por CUIT («SRL
     $100.000 · CUIT personal $60.000»), los que van por local se parten por local, y el
     saldo de cada proveedor se parte por local («El Bodegón $250.000 · Kusama $180.000»).
   - **🏪 Cierres de caja**, en dos bloques dentro de la misma tarjeta. Arriba, **cuánto
     lleva vendido cada local en lo que va del mes**: un renglón por local con su acumulado
     y cuántos cierres lleva, y el total del mes al pie. No lista cierre por cierre —ese
     detalle está en el módulo de Cierres—: acá va el número con el que se maneja el
     negocio. Abajo, si los hubo, los **💼 retiros de caja** de cada local, con su monto y su
     nota. Son dos cosas distintas —lo que entró
     y lo que salió del cajón— y mezcladas se leían mal. Los dos bloques dicen en su
     encabezado a qué período miran: el de cierres es **del mes a la fecha**, el de retiros
     sigue el selector de arriba. Al pie, el total retirado; y si
     algún local retiró más de una vez, también el desglose por local («El Bodegón $200.000
     · Kusama $50.000»), que es el único lugar donde se ve esa suma. Si no hubo retiros, la
     tarjeta queda igual que siempre: sin bloques ni encabezados. El cierre sólo lo
     anota: **no se descuenta de la venta**, pero es plata que salió del cajón y conviene
     verla sin entrar a cada cierre.
   - **📅 Vencimientos del mes**: lo que queda por vencer **en el mes en curso**, con **de
     quién es** y su fecha —«AFIP · SRL · Plan T · cuota 3 — 26/09/2026 · en 3d»—. Igual que
     en Deudas, los rubros que van por CUIT —AFIP, ARBA, Gremio, Créditos— nombran el CUIT y
     los que van por local nombran el local. Lo vencido no aparece acá, ni siquiera como
     recordatorio: está entero en Deudas, arriba, y repetirlo era leer dos veces lo mismo.
   - **👥 Altas y bajas del mes**: quién entró y quién se fue, con su local y, en las bajas,
     el motivo. Son las dos novedades de personal que cambian el sueldo y el F931. Van por
     **mes**, no por el selector de arriba: un alta del día 5 sigue siendo la novedad del mes
     cuando se mira el 23, y es el mes lo que se liquida. La tarjeta sólo aparece si hubo
     alguna.
   - **🏖️ Vacaciones**: quién está de licencia y cuánto le queda, y quiénes se van en los
     próximos dos meses.
   - **🤝 Socios**: los aportes y retiros del período.

**Cada renglón lleva a donde está el dato.** En 💳 Deudas por título y en 📅 Vencimientos
del mes, tocar un rubro —Servicios, AFIP, Municipalidad…— abre **ese submódulo** de
Vencimientos, no la portada: el que hizo clic en «Servicios» ya dijo a dónde quería ir. Se
marcan con un `›` al final, porque un renglón que se puede tocar y no lo parece no lo toca
nadie. El botón «Vencimientos →» del encabezado sigue abriendo la portada con todos los
submódulos.

**Deuda y vencimiento no son lo mismo**, y el panel los separa. **Deuda** es lo que ya se
debería haber pagado: un vencimiento cuya fecha ya pasó y sigue impago, y el saldo que se le
debe a un proveedor. **Vencimiento** es lo que todavía no venció —la luz de este mes, la
cuota que viene de un plan—: se mira para no llegar tarde, pero no se debe. Cada cosa está
en una tarjeta sola: un vencido aparece en Deudas y no se repite en Vencimientos.

Arriba a la derecha, **Hoy · Ayer · 7 días** mueve los cierres y los movimientos de socios;
los vencimientos y las deudas miran siempre lo mismo, porque lo que se debe no cambia por
mirar otro día. Cada tarjeta lleva al módulo que le toca, y las listas largas se cortan con
un **«+N más» que se toca y las abre ahí mismo** —un número que avisa que hay algo más y no
deja verlo es peor que no cortar la lista—.

## ♻️ Recuperar los productos de un proveedor

Los productos de un proveedor viven en su propia tabla, pero **su nombre queda grabado en
cada orden que se le pidió y en cada precio que se le cargó**. Si esa lista se pierde, se
puede reconstruir desde ahí.

En 🏭 Proveedores, al elegir un proveedor, si hay productos que ya tuvo y hoy no están en la
lista aparece un cartel con el botón **♻️ Recuperar**: muestra cuáles son, los agrega a la
lista de abajo y ahí se borran los que no van antes de guardar. No es un backup —sólo
aparece lo que alguna vez se pidió o se le puso precio—, pero suele ser casi todo.

**Guardar productos borra los del proveedor y los vuelve a escribir**, así que una lista
vacía los borraría a todos. Cuando un proveedor pasaría de tener productos a no tener
ninguno se pregunta antes, con su nombre y cuántos tenía; si no se confirma, no se toca ni
la base ni la pantalla.

## Estructura del proyecto
```
compras-pro/
├── index.html          ← entrada principal
├── package.json        ← dependencias
├── vite.config.js      ← configuración con PWA
└── src/
    ├── main.jsx        ← punto de entrada React
    └── App.jsx         ← toda la aplicación
```
