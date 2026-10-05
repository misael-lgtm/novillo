# CRM Wayfarer: actualización posterior al HANDOFF (1/10/2026)

Esto va **después** de `docs/HANDOFF.md`, que se pasó cuando estaba mergeado hasta el PR #10 (modo oscuro + handoff). Acá está todo lo que se hizo después: PRs #11 y #12 y cambios directos en la base de producción. `docs/HANDOFF.md` ya está actualizado con esto mismo (§6, puntos 5 a 8, y el historial de PRs). Este archivo es el resumen para no tener que releer todo.

**Estado de producción:**
- `main` = `76b96a9`, con todo mergeado.
- Vercel publica solo desde `main`. El PR #12 quedó publicándose ("Vercel is deploying") cuando se cerró la sesión, así que confirmá en el GitHub status de `main` que haya terminado bien.

**Rama de trabajo:** `claude/awesome-gauss-1hybhb`. Siempre se trabajó así: PR a `main`, merge, y Vercel publica.

---

## 1. Cambios en la base de producción (por SQL, a pedido del usuario)

Ninguno de estos cambios tiene una migración en `supabase/migrations/`: son cambios de datos, no de esquema. Todo es reversible porque se archivó, no se borró. En el CRM no se borra nada: hay un trigger `prevent_delete`.

### 1.1 "Hablar de nuevo" → "Más adelante"

El usuario pidió vaciar "Hablar de nuevo".

- Se movieron los 2 pedidos que había: **#8459** (@karinacarr76, Fabricio) y **#8584** (+5492234394707, Misael).
- Se hizo lo mismo que hace la app al mover:
  - se cerraron (`done_at`) sus tareas automáticas viejas;
  - se creó para cada uno la tarea "Volver a contactar (#N)" con vencimiento el 31/10/2026, asignada al vendedor y con `auto_stage='mas_adelante'`.
- **Ojo:** `tasks.created_by` es NOT NULL y no tiene default útil desde SQL, así que se cargó `created_by='misael@wayfarerarg.com'`.
- La columna "Hablar de nuevo" **sigue existiendo** en el tablero, vacía. El usuario no pidió sacarla.

### 1.2 Limpieza de duplicados: una tarjeta activa por cliente

El usuario pidió "borrá duplicados y dejá siempre la mejor tarjeta; la mejor es la que ya compró", y después "sí, una sola".

**Antes:** 224 clientes tenían más de un pedido activo, con 259 tarjetas de más. No había clientes duplicados: IG y celular tienen índice único, así que los duplicados eran **pedidos** del mismo cliente.

**Paso 1** (134 archivadas, `archived_at = now()`):
- Si el cliente tenía alguna compra (`compro`), se archivó todo lo que no era compra: 132 tarjetas de "Sin causa".
- Si no tenía compras, quedó la más avanzada y reciente: 2 clientes con dos "Enviar nuevamente" cada uno, y se archivó la más vieja.
- Orden usado para elegir: `(stage='compro') desc, (stage<>'sin_causa') desc, stage_changed_at desc, number desc`.
- Se archivaron también sus 2 tareas abiertas (`tasks.archived_at`).

**Paso 2** (125 archivadas):
- De los 110 clientes que compraron varias veces (en fechas distintas, o sea ventas reales), quedó **solo la compra más reciente** y se archivaron las 125 compras viejas.
- No tenían tareas abiertas.

**Resultado** (verificado): **9.542 clientes = 9.542 tarjetas activas**, ningún cliente con más de una.

| Etapa | Tarjetas activas |
|---|---|
| Compró | 2.083 |
| Sin causa | 7.415 |
| Enviar nuevamente | 21 |
| Interesado | 16 |
| Más adelante | 3 |
| Promo del finde | 2 |
| Avanzado | 1 |
| Esperando pago | 1 |

**Consecuencias:**
- Si se cuentan ventas con `stage='compro' and archived_at is null`, da 2.083 y no 2.208. Para contar todas las ventas históricas, **no** hay que filtrar por `archived_at`.
- Lo archivado se ve en gris en la ficha del cliente (`clientes/[id]` muestra los archivados con `opacity-50` y la etiqueta "Archivado") y en `/archivo` (últimos 100).
- **Para revertir:** filtrar por `archived_at` de 1/10/2026 alrededor de las 19:3x UTC y poner `archived_at = null`. Ojo, que pueden haberse archivado otras cosas a mano después.

> El usuario **no** quiere tarjetas de más por cliente. Si se agrega algo que crea pedidos en lote (por ejemplo, otra importación), hay que mantener "una tarjeta activa por cliente".

---

## 2. PR #11: seleccionar y mover muchas tarjetas + mail obligatorio

### 2.1 Modo selección en el tablero (`src/components/Board.tsx`)

- **Botón "☑️ Seleccionar":** está en la barra de arriba, al lado del buscador. Cuando está activo dice "Listo".
- **Mientras se selecciona:**
  - Las tarjetas se renderizan con `SelectCard`: un `<button role="checkbox">` que envuelve a `CardFace` con `asLink={false}`, así tocarla la elige y no abre el pedido.
  - En ese modo no hay arrastrar y soltar.
  - Cada columna tiene "Elegir todas (N)" / "Desmarcar todas". N es la cantidad de tarjetas **cargadas** de esa columna.
- **Barra fija abajo:** clase `card fixed inset-x-4 bottom-20 md:bottom-4 z-40`. En el celu queda arriba de la barra de navegación.
  - Contenido: "N elegidos", un `<select aria-label="Pasar a">` y los botones "Mover" y "Desmarcar".
  - Si la etapa elegida es "Sin causa", aparece un input "Motivo (para los que no tienen)".
- **Al mover:**
  - Pide `confirm()`.
  - Llama a `moveOrders({ orderIds }, etapa, motivo)`.
  - Actualiza el estado local con los ids que devolvió el servidor y muestra el mensaje en un banner verde (`notice`).
- `CardFace` ahora acepta `asLink` (por defecto `true`) y usa el helper `Wrap`, que es un `Link` o un `div`.

### 2.2 Server action `moveOrders` (`src/app/actions.ts`)

Firma final, después del PR #12:

```ts
moveOrders(from: { orderIds: string[] } | { fromStage: string }, stage: string, cancelReason?: string)
  : Promise<ActionResult<{ moved: string[] }>>
```

- **Si recibe `orderIds`:** lee esos pedidos de a 200 (`chunks()`), solo los no archivados y que no estén ya en la etapa destino.
- **Si recibe `fromStage`:** lee **toda** la etapa, paginando de a 1000 (el máximo de filas de la API de Supabase), ordenando por `id`.
- **Para cada pedido aplica `missingForStage`**, la misma regla que al mover de a uno:
  - El que no cumple **no se mueve** y queda en `skipped`. El mensaje lista hasta 10 números: "N no se movieron porque les faltan datos (#…)".
  - Para `sin_causa`, a los pedidos sin `cancel_reason` se les pone el motivo enviado. Si no se manda motivo, esos quedan sin mover.
- **Updates:** de a 200 ids.
- **Tareas:** `createFollowUps(moved, target)`, en lote y de a 200. Cierra las tareas automáticas abiertas de esos pedidos y crea la de seguimiento de la etapa (`STAGES[].followUp`).
- **Mensaje cuando no se mueve ninguno:** "No se movió ninguno a X".
- `createFollowUp` (singular) ahora llama a `createFollowUps`.
- Nuevo helper `chunks(xs, size=200)`.

### 2.3 Mail para contactos nuevos (después pasó a opcional, PR #13)

> **Actualización 2/10:** el usuario pidió que se pida pero **no sea obligatorio**. Ya no existe el error "Poné el mail" y el campo no tiene `required`; solo se valida el formato si lo ponen. Lo que sigue describe la versión original.

- **Formulario** (`src/components/NewOrderForm.tsx`, en la sección "Es un cliente nuevo"): nuevo campo **Mail** (`name="new_email"`, `type="email"`, obligatorio). El texto de ayuda dice "Mail siempre, y además Instagram o celular."
- **Servidor** (`createOrder` en `actions.ts`):
  - Si el cliente es nuevo y falta el mail, devuelve "Poné el mail"; si está mal escrito, "Mail inválido. Ej: juana@gmail.com".
  - Lo guarda en minúsculas.
  - La regex se movió a la constante `EMAIL_RE`, que también usa `updateCustomer`.
- `CustomerInput` tiene `email?`. `findOrCreateCustomer` hace dos cosas:
  - lo inserta junto con el cliente nuevo;
  - si el cliente ya existía (por IG o celular) y **no tenía mail**, se lo completa (`.is("email", null)`).
- **No** es obligatorio en la base: no hay CHECK, porque los ~9.500 clientes importados de ClickUp no tienen mail.
- En la ficha del cliente (`CustomerEditForm`) el mail sigue siendo **opcional**.
- El usuario fue avisado de que a muchos clientes de IG les puede faltar el mail. Si pide que sea opcional, alcanza con sacar la validación en `createOrder` y el `required` del campo.

---

## 3. PR #12: "Pasar todas a…" por columna + Compró/Sin causa completos

### 3.1 Compró y Sin causa muestran todo (antes, solo los últimos 14 días)

El usuario quiere ver todos esos contactos en el tablero.

- **`src/app/(app)/tablero/page.tsx`** hace tres consultas en paralelo:
  - Etapas abiertas: todas las no archivadas, `limit 500`, ordenadas por `stage_changed_at` ascendente.
  - Por cada etapa final (`FINAL_STAGES = compro, sin_causa`): las primeras `FINAL_PAGE` (50) por `stage_changed_at` **descendente**, con `count: "exact"`.
  - Le pasa al `Board` `initialRemaining = { compro: total-50, sin_causa: total-50 }`.
- **`src/lib/queries.ts`:** `export const FINAL_PAGE = 50`.
- **Nueva server action `loadMoreOrders(stage, offset)`:** trae la siguiente página de 50.
- **Board:**
  - Lleva el estado `remaining` y `fetched` por etapa (`countByStage`).
  - Al final de la columna muestra el botón "Ver más (quedan N)". Al agregar tarjetas descarta las repetidas por id.
  - El contador de la columna es `items.length + remaining` (el total real, con formato es-AR, por ejemplo "7.415"). Si hay filtro ("Solo los míos" o búsqueda), muestra solo `items.length`.
  - En las etapas finales las tarjetas se ordenan de más nueva a más vieja; en las abiertas, de más vieja a más nueva, para atender primero las que esperan hace más.
- **Limitaciones conocidas:**
  - El buscador del tablero y "Elegir todas" solo cubren las tarjetas **cargadas**. Para buscar un contacto puntual: Clientes.
  - Mover una tarjeta de a una llama a `refresh()` (revalidatePath), que recarga el tablero y pierde las páginas extra que se cargaron con "Ver más".

### 3.2 "Pasar todas a… →" en cada columna

- **Botón** arriba de cada columna, fuera del modo selección, solo si la columna tiene tarjetas.
- **Abre `src/components/MoveAllDialog.tsx`** (usa `Modal` de `./ui`):
  - "Vas a mover las N tarjetas de X. ¿A qué etapa?" con un `<select aria-label="Etapa nueva">` sin la etapa de origen.
  - Si el destino es Sin causa, pide motivo (`required`).
  - Si el destino es Compró o Esperando pago, avisa que las que no tengan monto (o medio de pago) se quedan donde están.
  - El botón dice "Mover N".
- Llama a `moveOrders({ fromStage }, destino, motivo)`, que mueve la **etapa entera, incluidas las tarjetas que no están cargadas**, y después `router.refresh()`.
- N es el total real de la columna (cargadas + `remaining`).

---

## 4. Cómo se probó (sesión anterior)

- `npx tsc --noEmit` y `npx vitest run` (54 tests) OK.
- **Playwright contra la base local** (ver `HANDOFF.md` §8 para levantarla).
  - Arranque de la base local: postgres en `/var/tmp/crmpg` (puerto 5439) se inicia con `su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/crmpg/data -l /var/tmp/crmpg/log -o '-k /var/tmp/crmpg -p 5439' start"`. Después `bash /var/tmp/e2e/reset.sh`, `node /var/tmp/e2e/gateway.mjs &` y `next dev`.
  - Los scripts de `/var/tmp/e2e/` son del contenedor efímero y **no están en el repo**.
  - En la base local tampoco se puede `delete`: para empezar de cero se usa `reset.sh`.
- **Casos verificados:**
  - Elegir todas (4) → Más adelante; tareas creadas.
  - Compró con 2 de 4 sin monto: se movieron 2 y el mensaje avisó de las otras 2.
  - Sin causa con motivo.
  - Elegir de a una y "Listo".
  - Mail: sin mail no crea el contacto; con mail lo guarda en minúsculas.
  - Celu (390px).
  - Con 1.300 pedidos:
    - Sin causa trae 50, el contador muestra "1.199" y "Ver más" trae 50 más;
    - "Pasar todas" con las 101 de Interesado;
    - "Pasar todas" con las 1.199 de Sin causa, cuando solo había 100 cargadas;
    - Compró sin monto: no movió ninguna.
- **Trampas de los tests:**
  - `getByLabel("Pasar a")` choca con el botón del tema ("Pasar a modo oscuro"): usar `{ exact: true }`.
  - `[name=description]` choca con `<meta name="description">`: usar `textarea#description`.
  - Crear un pedido **no redirige**: se queda en `/pedidos/nuevo` y muestra un mensaje.

---

## 5. Pendientes y preguntas abiertas

- **Sin respuesta del usuario:** ¿cambiar también en **ClickUp** el nombre del estado "cerrado" por "Compró"? (En el CRM ya se llama Compró.)
- **Confirmar** que la publicación del PR #12 en Vercel terminó bien. No se pudo ver desde el contenedor: el proxy bloquea vercel.app.
- **Opcionales que ya estaban en el HANDOFF:**
  - las 92 ventas de ClickUp que se saltearon por no tener contacto;
  - borrar `public.clickup_import` y el schema `imp`;
  - actualizar el README (todavía describe las 5 etapas viejas);
  - el artifact viejo `app-vendedores`.
- **Posibles mejoras** (no pedidas):
  - sacar la columna vacía "Hablar de nuevo" si el usuario ya no la usa;
  - una búsqueda en el servidor para las columnas finales.

## 6. Recordatorios para trabajar con el usuario (Misael)

- Responder siempre en **castellano rioplatense**, corto y concreto. El usuario no es programador.
- Pide cosas cortas y a veces ambiguas ("seleccionar toda la lista", "sigo sin verlo"). Una captura suele aclarar más que preguntar.
- Antes de cambios grandes en datos de producción, mostrar los números ("son 134, ninguna compra") y hacerlo de forma reversible: archivar, nunca borrar.
- No guardar la contraseña de la base que haya pegado el usuario. No poner la anon key en el código.


---

## 7. PR #14 (5/10): notas en la tarjeta del tablero

- **Pedido del usuario:** "que puedan escribir en la tarjeta los chicos".
- **Botón "✏️ Nota"** en cada tarjeta (al lado de "Pasar a…"). Abre un textarea en la misma tarjeta.
  - Enter guarda, Shift+Enter hace un salto de línea y Esc cancela.
  - Los botones y el textarea frenan el `pointerdown` y el `touchstart`, así no arrancan un arrastre.
- **Cómo se ve la nota:** la tarjeta muestra la **última nota** en un recuadro ámbar: "💬 texto — Quién, hace N días".
- **Server action:** `addCardNote(orderId, message)` envuelve a `addNote`, así que la nota queda en `activity_log` como `kind='note'`, igual que en la página del pedido.
- **Migración `0004_card_notes.sql`** (ya aplicada en producción con `apply_migration` y verificada):
  - columnas nuevas `orders.last_note`, `last_note_at` y `last_note_by`;
  - trigger `activity_last_note`, que copia ahí cada nota nueva de un pedido, venga de la tarjeta o de la página del pedido, salvo las "Importado de ClickUp…";
  - `log_changes()` ignora esas columnas para no ensuciar el historial;
  - se rellenaron las notas que ya había (6 pedidos).
- **Probado con Playwright local:**
  - escribir y guardar, y que siga al recargar;
  - una nota escrita en la página del pedido también aparece en la tarjeta;
  - el historial no suma entradas "updated";
  - arrastrar sigue funcionando.

## 8. Unificar tarjetas con historial de compras (EN CURSO, frenado)

- **Pedido del usuario:** una tarjeta por cliente, con una descripción que diga qué productos compró (con talles) y cuánto lleva vendido.
- **Lo que hay:**
  - Ya hay una tarjeta activa por cliente (ver §1.2).
  - Las compras importadas de ClickUp dicen solo "Compra importada de ClickUp".
  - El producto y el talle están en cada tarea de ClickUp: en `text_content` (por ejemplo "perth L") y en los custom fields "Informacion de contacto" (familia, por ejemplo "alaska" o "glasgow") y "Modelo del producto".
  - El listado de ClickUp (`filter_tasks`) **no** trae la descripción. Hay que pedir las tareas de a una con `clickup_get_task` e `include: ["custom_fields"]`, y no hay operador en lote.
- **Montos:** ClickUp **no tiene montos**. El "total vendido" solo puede salir de lo cargado en el CRM. Se le avisó al usuario.
- **Avance:**
  - Tabla `imp.cerrados_info(task_id, ref, info, modelo, contenido)` con **25 de 2.208** compras.
  - Las pendientes salen con: `imp.cerrados c join orders o on o.source_ref=c.ref and o.source='clickup' where not exists (select 1 from imp.cerrados_info i where i.task_id=c.task_id)`.
- **Esperando al usuario:**
  - que exporte de ClickUp un CSV **con las tareas cerradas incluidas**. El CSV de antes (`public.clickup_import`) no tiene ninguna cerrada;
  - o que diga "seguí" para seguir de a una (unas 2 a 3 horas).
- **Sin respuesta:** si al cargar un "Nuevo pedido" para un cliente con tarjeta se reusa esa tarjeta en vez de crear otra.


## 9. PR #15 (5/10): objetivos del mes

- **Pedido del usuario:** "un contador de cómo venimos con el objetivo arriba del CRM y uno por vendedor; yo cargo manual por mes".
- **Barra arriba de todas las páginas** (`src/components/GoalBar.tsx`, en `(app)/layout.tsx` debajo del `Nav`):
  - Muestra "🎯 Objetivo de octubre de 2026", una barra de progreso, "$ X de $ Y · N% · K ventas · faltan D días (hoy cuenta: el 5/10 faltan 27; el último día dice "último día")" y "Vos: N%" si el que mira tiene objetivo.
  - Es un `<details>`: al tocarlo se abre la lista por vendedor con su barra (verde cuando llega al 100%).
  - Si el mes no tiene objetivo, el admin ve un aviso con link a `/equipo#objetivos` y los demás no ven nada.
- **Carga** (`GoalsForm` en `src/components/Team.tsx`, en `/equipo`, solo admin):
  - Se elige el mes (`?mes=YYYY-MM`) y se cargan el objetivo del equipo y el de cada vendedor, en pesos.
  - Si un campo queda vacío, se borra ese objetivo.
  - Si no hay objetivo del equipo, se usa la suma de los vendedores.
  - Server action `saveGoals`.
- **Cómo se mide** (función SQL `month_sales(p_month)`): pedidos con `stage='compro'` y `stage_changed_at` dentro del mes en hora argentina, agrupados por `assigned_to`, sumando `total`.
  - Incluye los archivados.
  - Si una tarjeta sale de Compró, deja de contar.
- **Migración `0005_monthly_goals.sql`**, ya aplicada en producción:
  - tabla `monthly_goals(month, scope, amount)`, con `scope` = `'equipo'` o el email del vendedor;
  - RLS: leen todos los del equipo; insert, update y delete solo el admin.
- **Lógica nueva** en `src/lib/goals.ts`: `monthStart`, `monthLabel`, `getGoalSummary` y `percent`.
- **Board:** el alto de las columnas pasó a `max-h-[calc(100dvh-25rem)] md:max-h-[calc(100dvh-19rem)]` para que entre la barra.
- **Estado al aplicarlo (5/10):** octubre ya tenía 12 ventas cargadas en el CRM, por $2.087.697. Todavía no hay objetivos cargados: los carga el usuario.
- **Probado con Playwright local:**
  - aviso al admin cuando falta el objetivo;
  - un monto inválido no guarda nada;
  - guardar, ver los porcentajes y el "Vos";
  - vaciar un monto saca ese objetivo y otro mes arranca vacío;
  - una vendedora ve la barra pero no entra a Equipo;
  - el tablero sigue entrando en 900px.


## 10. PR #17 (5/10): ventas de la tienda online (Tiendanube) en el objetivo

- **Pedido del usuario:** que el objetivo cuente las ventas de la tienda y no solo lo cargado en el CRM.
- **Decisiones del usuario:**
  - conectar con la API de Tiendanube, no cargar el número a mano;
  - contar cada venta **una sola vez**.
- **Regla de conteo:**
  - **Objetivo del equipo** = CRM (Compró del mes) − CRM con `channel='tienda_online'` + pedidos de Tiendanube del mes.
  - **Objetivo de cada vendedor:** sigue contando solo sus tarjetas, incluidas las de canal Tienda online.
  - Si la tienda no está conectada o da error, el equipo usa solo el CRM y la barra avisa del error.
- **`src/lib/tiendanube.ts`:**
  - `storeSalesForMonth(month)` hace `GET {API}/{store_id}/orders`, con:
    - `created_at_min` = día 1 a las 00:00 -03:00 y `created_at_max` = fin de mes;
    - `payment_status=paid`, `status=any`, `per_page=200`, paginando;
    - el header `Authentication: bearer TOKEN` (así lo pide Tiendanube) y un `User-Agent` "Wayfarer CRM (…)".
  - Saltea los `cancelled` y suma `total`, que incluye el envío.
  - Un 404 se toma como página vacía. Se cachea 10 minutos (`next.revalidate=600`).
  - `exchangeCode(code)` hace `POST https://www.tiendanube.com/apps/authorize/token`.
  - `TIENDANUBE_API_URL` existe **solo para pruebas** con un mock.
- **Variables de entorno en Vercel** (solo servidor; documentadas en `.env.example`): `TIENDANUBE_APP_ID`, `TIENDANUBE_CLIENT_SECRET`, `TIENDANUBE_STORE_ID` y `TIENDANUBE_TOKEN`.
- **Página `/tiendanube`** (solo admin, con acceso desde Equipo, "🛒 Tienda online"):
  - Muestra el estado de la conexión, o el paso a paso para crear la app en partners.tiendanube.com: permiso de lectura de órdenes y redirect `https://wayfarer-crm.vercel.app/tiendanube`.
  - Pide cargar APP_ID y CLIENT_SECRET, y después muestra el botón "Autorizar en mi tienda".
  - Cuando Tiendanube vuelve con `?code`, la página hace el canje y **muestra en pantalla STORE_ID y TOKEN** para que el admin los copie a Vercel y haga Redeploy. El token no se guarda en la base.
- **Migración `0006_store_sales.sql`:** `month_sales_tienda(p_month)`. **Ya aplicada en producción.**
- **Barra:** en "Ver detalle" se muestra "Incluye la tienda online: $X (N pedidos pagados)…" o el aviso de error.
- **Ojo:** no se pudo leer la documentación oficial (la red del contenedor bloquea tiendanube.github.io), así que se armó con lo conocido de la API v1. Si al conectar algo falla, el error queda visible en `/tiendanube` y en la barra.
- **Probado con Playwright y un Tiendanube de mentira** (`/var/tmp/e2e/tnmock.mjs`, no está en el repo):
  - la suma da 70% y no hay doble conteo;
  - excluye los cancelados;
  - el vendedor sigue con su tarjeta;
  - los parámetros, el header y el User-Agent son los esperados;
  - con token malo cae a solo CRM y avisa;
  - sin conectar, muestra el paso a paso.
- **Estado:** el usuario tiene que crear la app en Tiendanube y cargar las variables. Todavía **no está conectada**.


## 11. PR #18 (5/10): los objetivos cuentan solo las ventas off de Tiendanube

- **Qué pidió el usuario**, corrigiendo el §10: "para el CRM, que tome las ventas de off" (eligió *pedidos manuales en Tiendanube*), y "lo mismo para los vendedores".
- **Regla nueva**, con Tiendanube conectada:
  - **Equipo** = suma de los pedidos pagados del mes con `storefront` en `OFF_ORIGINS` (por defecto `form`, los pedidos manuales), sin cancelados.
  - **No cuentan:** las compras en la web (`store`) y **tampoco las tarjetas del CRM**.
  - **Cada vendedor**, en este orden:
    1. su nombre (el primer nombre, sin importar tildes ni mayúsculas) aparece en `owner_note`/`note` del pedido;
    2. si no, el celular (`contact_phone`/`customer.phone`, normalizado) o el mail del pedido coincide con un cliente del CRM, y va al `assigned_to` de su tarjeta más reciente no archivada;
    3. si no, queda "sin asignar": suma solo al equipo y la barra lo muestra con la sugerencia de poner el nombre en la nota.
  - **Sin Tiendanube** (o si falla): todo sigue como antes, con Compró del CRM.
- **`TIENDANUBE_OFF_ORIGINS`** (variable de entorno opcional, ej. `form,pos`) permite cambiar qué orígenes cuentan **sin tocar código**.
  - Ojo: que los pedidos manuales tengan `storefront='form'` es lo que se sabe de la API, pero **no está verificado con la tienda real**.
  - `/tiendanube` muestra los pedidos pagados del mes **por origen**, con ✔ en los que cuentan. Con eso se confirma o corrige.
- **Código:**
  - `storeSalesForMonth` devuelve `{ off: TnSale[], byOrigin }`.
  - La asignación está en `attributeStoreSales` (`src/lib/goals.ts`).
  - `getGoalSummary` devuelve también `unassigned`.
- `month_sales_tienda` (migración 0006) **ya no se usa**. Se dejó en la base: no molesta.
- **Probado con Playwright y el Tiendanube de mentira:**
  - una compra web, tres manuales (una con "Marián" en la nota, una con el celular de un cliente de Bruno y una sin datos) y una cancelada;
  - resultado: equipo $160.000 (16%), Marian 10%, Bruno 80% y $30.000 sin asignar;
  - la venta de Misael cargada solo en el CRM ya no cuenta;
  - `/tiendanube` muestra el detalle por origen.
- **Estado:** el usuario estaba conectando la tienda. Tiendanube le mostró un `curl` con el `code` en vez de redirigir.
  - Se le indicó abrir `https://wayfarer-crm.vercel.app/tiendanube?code=…` dentro de los 5 minutos, con APP_ID y CLIENT_SECRET ya cargados en Vercel.
  - El `client_secret` quedó visible en una captura del chat: se le recomendó regenerarlo después de conectar.


## 12. PR #19 (5/10): marca "OFF/Nombre"

- **Cómo marcan los chicos sus ventas en Tiendanube:** "OFF/Mariano", "OFF/Fabricio", etc.
- **Regla `OFF_MARK`** (`/\bOFF\s*[\/|\-]\s*(nombre)/i`): se busca en `owner_note`, `note`, `customer.name`, `contact_name` y `billing_name`.
- **Es venta off** todo pedido pagado y no cancelado que tenga la marca, venga de donde venga, más los de origen manual (`OFF_ORIGINS`, por defecto `form`).
- **Vendedor:** sale del nombre de la marca, comparando el principio sin tildes y con al menos 4 letras ("Mariano" → Marian, "Fabri" → Fabricio).
  - Si el nombre no está en el equipo (ej. "Brian"), se sigue con las otras reglas: nombre en la nota, después celular o mail del cliente del CRM, y si nada sirve, "sin asignar".
- **`/tiendanube`** resume "Ventas off que cuentan: $X (N pedidos, K con OFF/Nombre)" y debajo muestra todos los pedidos pagados por origen.
- **Probado con el mock:**
  - "OFF/Mariano" en el nombre del cliente de una compra web → Marian;
  - "OFF - bruno" en la nota → Bruno;
  - "OFF/Brian" y un manual sin datos → sin asignar;
  - la compra web sin marca y el cancelado no cuentan.


## 13. PR #20 (5/10): solo "off/Nombre" en las notas, y revisión pedido por pedido

- **Lo que reportó el usuario, ya con la tienda conectada en producción:** el CRM mostraba más de $6.000.000 vendidos y lo real era unos $4.700.000. La diferencia estaba toda en Fabricio; Mariano y Bruno daban bien.
- **Ejemplo real de cómo cargan:** nota del vendedor `off/fabricio/wsp / comp ICBC`.
- **Causa probable:**
  1. Se contaban también los pedidos de origen manual (`form`) **sin** marca.
  2. Se asignaban "por cliente" (celular o mail de una tarjeta del CRM). Fabricio tenía muchas tarjetas importadas de ClickUp, así que se llevaba ventas ajenas.
- **Regla final:**
  - **Solo** cuenta un pedido pagado y no cancelado con `off/Nombre` en `owner_note` o `note`. Ya no se mira el resto del pedido.
  - Se toma por **fecha de pago** (`paid_at`; si no tiene, `created_at`) dentro del mes. Se piden los pedidos con `updated_at_min` = día 1, así entran los creados antes y cobrados este mes.
  - El vendedor sale **solo** del nombre de la marca. Si no coincide con nadie del equipo, queda "sin asignar". Ya no hay asignación por cliente.
- **`/tiendanube` → "Revisar pedido por pedido":** tabla con #, fecha, marca, monto y ✔ vendedor, o ✗ motivo: pago pendiente, cancelado, sin "off/Nombre" o nombre que no es del equipo. Sirve para comparar contra lo que el usuario ve en Tiendanube.
- **`OFF_ORIGINS`:** ahora solo sirve para listar en la revisión los manuales sin marca; no los cuenta.
- **Cache:** `storeSalesForMonth` usa la caché de fetch de Next (10 minutos). En desarrollo local hay que borrar `.next/cache/fetch-cache` al cambiar el mock.
- **Pendiente:** que el usuario compare la tabla con Tiendanube. Si la diferencia sigue, revisar si su número "real" incluye el envío (se suma `total`, que incluye envío) o si filtra por fecha de creación en vez de fecha de pago.


## 14. PR #21 (5/10): color según el ritmo por día

- **Pedido del usuario:** el color tiene que depender de cómo vienen por día: verde si van igual o arriba del promedio necesario, amarillo si van hasta 20% abajo, rojo si van más de 20% abajo. Lo mismo para cada vendedor.
- **Cálculo** (`pace(line, today)` en `src/lib/goals.ts`):
  - necesario por día = objetivo / días del mes;
  - promedio = vendido / días que pasaron, **hoy incluido**;
  - `ratio ≥ 1` da verde, `≥ 0,8` da amarillo y menos que eso, rojo.
  - Tiene tests en `src/lib/goals.test.ts`; vitest corre 59 tests.
- **Barra (`GoalBar`):**
  - la barra del equipo y la de cada vendedor se pintan emerald-500, amber-400 o rose-500;
  - chip "🟢 Al día · $X/día de $Y" para el equipo;
  - "Vos" con el color de su ritmo;
  - cada vendedor muestra un punto de color y "$X/día · necesita $Y/día".
- **Ojo:** el día 1 a la mañana todos arrancan en rojo, porque hoy cuenta como día transcurrido. Si molesta, se puede no contar hoy hasta cierta hora.
