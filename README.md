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

En Resultados, el bloque 📲 Electrónico muestra el renglón *IIBB retenido (2%)* entre los
ingresos y los gastos, y el desglose por medio ya viene neto. Dicho de otra forma: el
resultado no cuenta el IIBB como costo. Si algún día se quiere que lo cuente, se carga como
gasto o se resta del resultado — hoy, a propósito, no.

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
