# Wayfarer CRM: estado completo del proyecto (handoff)

Este documento resume todo lo hecho hasta el 1/10/2026 para que otra persona (u otro Claude) pueda seguir sin la conversación original. Se escribió al final de la sesión y refleja el estado real del código, la base y ClickUp en ese momento.

> **Para el próximo Claude:** el usuario es Misael (`misael@wayfarerarg.com`), dueño de Wayfarer. **Siempre respondé en español** (lo pidió varias veces). Quiere todo "a prueba de boludos", poco texto y que hagas las cosas vos ("hacelo vos porfa"). No le pidas pasos técnicos salvo que no haya otra forma.

---

## 1. Qué es y para qué

- **Wayfarer** es una marca de ropa que vende por Instagram, WhatsApp y la tienda online (`wayfarerarg.com`, Tiendanube).
- Antes usaban un CRM armado en **ClickUp**, en la lista **"CRM - Ventas - OFFLINE"** (list id `901701629349`).
- Pidieron un CRM propio, simple, que usen los vendedores todos los días desde su PC, sin Claude y sin instalar nada.

**Decisiones del usuario:**

| Tema | Decisión |
|---|---|
| Productos | Texto libre (no hay catálogo) |
| Medios de pago | Transferencia, Mercado Pago |
| Correos | Correo Argentino, Andreani, OCA |
| Cambios de talle/prenda | Sí, botón "Pedir cambio" |
| Reglas | Pocos campos obligatorios, tareas, Kanban, **nada se borra** |
| Hosting | Vercel + Supabase |
| Login | Mail + contraseña (el link mágico no anduvo, ver §9) |
| Vendedores | Comparten la casilla `ventas@wayfarerarg.com` y eligen su nombre en "¿Quién sos?" |
| Etapas | **Las mismas de ClickUp**, con "cerrado" renombrado a **"Compró"** |
| Datos | Migrar todo ClickUp con su estado, sin duplicados. "cerrado" = compró |
| Vendedor de cada pedido importado | mariano → Marian; fabri → Fabricio; el resto → Misael |

---

## 2. Dónde está cada cosa

| Cosa | Dónde |
|---|---|
| App en producción | **https://wayfarer-crm.vercel.app** |
| Repo | GitHub `misael-lgtm/novillo`. Rama de trabajo `claude/awesome-gauss-1hybhb`; `main` es lo publicado |
| Deploy | Vercel, proyecto `wayfarer-crm`. **Cada merge a `main` se publica solo** |
| Base de datos | Supabase, proyecto **`Wayfarer-crm`**, id `hhjkhhtqueaprjyviufb`, región sa-east-1 (São Paulo), Postgres 17 |
| Variables en Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (las cargó el usuario a mano) |
| Usuarios de login | Supabase → Authentication → Users. Los crea el usuario a mano (`misael@...` y `ventas@...`) |
| Versión vieja "app para vendedores" | `app-vendedores/index.html`, publicada como artifact https://claude.ai/artifact/JMTDZe8keySBXgHkY95aJz. **Desactualizada**: usa las 5 etapas viejas. No la usan |

**Accesos que tuvo Claude en la sesión:**
- Supabase MCP: `execute_sql`, `apply_migration`, etc.
- ClickUp MCP: `filter_tasks`, `update_task`, etc. Los operadores bulk **no** están habilitados.
- GitHub MCP para PRs.
- El contenedor **no** llega a las APIs de Vercel ni de Supabase por HTTP.

**Secretos:**
- El usuario pegó la contraseña de la base de Supabase en el chat. **No se guardó en ningún lado** y no hace falta, porque se usa el MCP.
- La anon key es pública, pero igual no se hardcodea en el código. Se intentó y el clasificador lo bloqueó: **no reintentar**.

---

## 3. Stack y estructura del código

- **Next.js 15.5** (App Router) y **React 19**.
- **TypeScript 5.9**. Con TS 7, Next se rompe: dejarlo fijo en 5.9.
- **Tailwind 4** (usa `@utility` en `globals.css`), **@dnd-kit/core** para el tablero, **vitest** para tests.
- **Supabase** (Postgres + Auth + RLS) con `@supabase/ssr`.

```
src/
  middleware.ts            refresca sesión; si faltan/son inválidas las env de Supabase muestra página de error 503 (no un 500)
  lib/
    config.ts              ETAPAS, canales, medios de pago, correos (fuente de verdad de la UI)
    rules.ts               normalizadores + STAGE_REQUIREMENTS + missingForStage (mismas reglas que los CHECK de la base)
    rules.test.ts          54 tests
    session.ts             getLoginMembers / requireMember / getTeam / memberName (casilla compartida + "¿Quién sos?")
    queries.ts             consultas de lectura
    types.ts               TeamMember, Customer, Order, Task, Activity, ActionResult
    supabase/env.ts        lee y LIMPIA las env (cleanKey/cleanUrl/looksLikeKey) — por keys pegadas con caracteres raros
    supabase/env.test.ts
    supabase/server.ts     cliente server; AS_COOKIE = "crm_as"; manda header x-crm-as con la persona elegida
    supabase/client.ts     cliente browser
  app/
    login/page.tsx         mail + contraseña (signInWithPassword), errores en castellano
    quien-soy/page.tsx     selector "¿Quién sos?" (setea cookie crm_as)
    sin-acceso/page.tsx    para mails que no están en el equipo
    auth/callback, auth/logout
    actions.ts             server actions (createOrder, moveOrder, createExchange, addMember, …)
    (app)/page.tsx         "Hoy": tareas del día + contadores por etapa (sin las finales)
    (app)/tablero          Kanban (Compró / Sin causa: de a 50, con "Ver más")
    (app)/pedidos/nuevo, pedidos/[id]
    (app)/clientes, clientes/[id]   ("total comprado" cuenta SOLD_STAGE)
    (app)/tareas, archivo, equipo (admin)
  components/
    Board.tsx              tablero (ver §6)
    StageMoveDialog.tsx    pide SOLO los datos que faltan al mover de etapa
    OrderDetail.tsx, NewOrderForm.tsx, ExchangeButton.tsx, Tasks.tsx, Team.tsx, Nav.tsx, Timeline.tsx, ui.tsx …
supabase/
  migrations/0001_init.sql            esquema completo
  migrations/0002_clickup_import.sql  columnas source/source_ref/source_stage
  migrations/0003_clickup_stages.sql  etapas de ClickUp
  tests/schema_test.sql, auth_stub.sql, run.sh
docs/HANDOFF.md                       este archivo
  (components/ThemeToggle.tsx + lib/theme.ts = modo oscuro)
```

**Patrones de código:**
- Los formularios usan el hook **`useFormAction`**, que evita que React 19 vacíe el formulario cuando hay error.
- Las fechas se muestran siempre en hora de Argentina (`todayAR`, `formatDate`), para evitar errores de hidratación.
- El `DndContext` usa `useId()` por la misma razón.

---

## 4. Base de datos (Supabase)

### 4.1 Migraciones aplicadas

| Migración | Cómo se aplicó |
|---|---|
| `0001_init.sql` | La pegó el usuario en el SQL Editor. **No figura** en `supabase_migrations.schema_migrations` |
| `0002_clickup_import` | Por MCP `apply_migration`, como `clickup_import` |
| `0003_clickup_stages` | Por MCP `apply_migration`, como `clickup_stages` |

### 4.2 Tablas y funciones

**Tablas:**
- `team_members` (`email` PK, `name`, `is_admin`, `login_email`, `active`).
- `customers`.
- `orders`: `number`, `customer_id`, `channel`, `stage`, `kind` (venta/cambio), `parent_order_id`, `description`, `total`, `payment_method`, `shipping_address`, `carrier`, `tracking_code`, `cancel_reason`, `assigned_to`, `created_by`, `created_at`, `stage_changed_at`, `archived_at`, `source`, `source_ref`, `source_stage`.
- `tasks`: con `auto_stage` para las tareas automáticas de cada etapa.
- `activity_log`.

**Funciones de identidad:**
- `current_email()` sale del JWT.
- `current_member()` toma la persona del header `x-crm-as`, y solo la acepta si esa persona comparte la casilla de login.
- `is_team_member()` e `is_admin()`.

**Triggers:**
- `stamp_creator`.
- `touch_row` (updated_at).
- `touch_order_stage` (stage_changed_at).
- `stamp_task_done`.
- `log_changes`: escribe en `activity_log` quién cambió qué.
- **`prevent_delete`** en todas las tablas: no se borra nada, se archiva con `archived_at`.
- `prevent_update` en `activity_log`.

**RLS:** todo exige `is_team_member()`. `team_members` solo lo modifica un admin.

**`customers_contact_required`:** CHECK `instagram IS NOT NULL OR phone IS NOT NULL`. No se puede guardar un cliente sin IG ni celular.

**Normalización:**
- IG: minúsculas, sin `@` ni URL.
- Celular AR: `549` + 10 dígitos. Ver `normalizePhoneAR` y la función SQL `imp.norm_phone`.

### 4.3 Etapas (0003) y reglas por etapa

Son 12 ids, en el orden de ClickUp. Están en `config.ts` y en el CHECK `orders_stage_check`.

| id | label | siguiente sugerida | tarea automática |
|---|---|---|---|
| enviar_nuevamente | Enviar nuevamente | interesado | Volver a escribirle (2 d) |
| primer_contacto | Primer contacto (**default**) | interesado | Responder la consulta (1 d) |
| interesado | Interesado | avanzado | Seguir al interesado (2 d) |
| avanzado | Avanzado | esperando_pago | Cerrar la venta (1 d) |
| esperando_pago | Esperando pago | compro | Chequear si pagó (1 d) |
| promos_bancarias | Promos bancarias | interesado | 7 d |
| lista_de_espera | Lista de espera | interesado | 7 d |
| mas_adelante | Más adelante | interesado | 30 d |
| promo_del_finde | Promo del finde | interesado | 3 d |
| sin_causa | Sin causa (final, `LOST_STAGE`) | — | — |
| hablar_de_nuevo | Hablar de nuevo | interesado | 7 d |
| compro | **Compró** (final, `SOLD_STAGE`) | — | — |

**Datos obligatorios** (iguales en `STAGE_REQUIREMENTS` y en los CHECK):
- **Esperando pago:** monto (`orders_total_required`).
- **Compró:** monto y medio de pago (`orders_payment_required`). Un cambio sin cargo (`kind='cambio'` y sin monto) no pide ninguno de los dos.
- **Sin causa:** motivo no vacío (`orders_cancel_reason_required`).
- Las demás etapas no piden nada. Se sacaron los requisitos de dirección y de envío.
- **Excepción del historial de ClickUp:** si `source='clickup'` y `stage = source_stage`, no se exigen monto ni pago. Apenas alguien lo mueve de etapa, se exige todo como a cualquier pedido. En TS está en `missingForStage`.

**Etapas viejas:** antes de 0003 eran consulta / esperando_pago / pagado / enviado / entregado / cancelado. En 0003:
- consulta pasó a primer_contacto.
- pagado, enviado y entregado pasaron a compro.
- cancelado pasó a sin_causa.
- Los pedidos importados volvieron a su estado exacto de ClickUp, que se leyó de la nota "Importado de ClickUp … estado «x»".

Los nombres viejos se siguen mostrando en el historial gracias a `LEGACY_STAGE_LABELS`.

### 4.4 Equipo cargado

| email (identidad) | nombre | admin | entra con |
|---|---|---|---|
| misael@wayfarerarg.com | Misael | sí | su propio mail |
| ventas+marian@wayfarerarg.com | Marian | no | ventas@wayfarerarg.com |
| ventas+fabricio@wayfarerarg.com | Fabricio | no | ventas@wayfarerarg.com |
| ventas+bruno@wayfarerarg.com | Bruno | no | ventas@wayfarerarg.com |
| ventas+styven@wayfarerarg.com | Styven | no | ventas@wayfarerarg.com |
| ventas+luana@wayfarerarg.com | Luana | no | ventas@wayfarerarg.com |

Las contraseñas las puso el usuario en Supabase Auth. Claude no las conoce.

### 4.5 Números al cierre (1/10/2026)

**Totales:**
- **Clientes:** 9.542, de los cuales 9.540 vienen de ClickUp.
- **Pedidos:** 9.801.
- **Tareas abiertas:** 46.

**Pedidos por etapa:**

| Etapa | Pedidos |
|---|---|
| sin_causa | 7.547 |
| compro | 2.208 |
| enviar_nuevamente | 23 |
| interesado | 16 |
| hablar_de_nuevo | 2 |
| promo_del_finde | 2 |
| mas_adelante | 1 |
| esperando_pago | 1 |
| avanzado | 1 |

**Pedidos por vendedor:**

| Vendedor | Pedidos |
|---|---|
| Misael | 7.072 |
| Fabricio | 2.689 |
| Marian | 39 |
| Bruno | 1 |

---

## 5. Migración desde ClickUp (lo más delicado)

### 5.1 Primera tanda: export CSV (abiertos + "sin causa")

1. El usuario exportó la lista a CSV y la importó él mismo en Supabase (Table Editor) como la tabla **`public.clickup_import`**, con 8.382 filas. **Ese export no traía las tareas "cerrado"**, porque ClickUp oculta las cerradas.
2. Claude creó el esquema **`imp`** con estas funciones y vistas:
   - `imp.norm_phone(text)` y `imp.norm_ig(text)`: normalizan como la app.
   - `imp.parse_date(text)`: fechas del CSV.
   - `imp.strip_seller(name)`: saca el prefijo del vendedor (`fabri/`, `FACU/`, `PABLI |`, `BRIAN |`, `mariano/`, `josue`, `misa`, etc.).
   - `imp.seller(name, tags, assignee)`: si el nombre empieza con `mariano/` o `marian/`, va a Marian. Si es `fabri`, `fabricio` o `fabryi`, o tiene el tag `fabri`, o el único asignado es Fabricio, va a Fabricio. Todo lo demás va a Misael.
   - Vista **`imp.parsed`**: saca teléfono, IG (del `@handle`, de lo que está después de `|`, o del nombre de una sola palabra), nombre visible, canal (por tags whatsapp / instagram / manychat / carrito), producto (campo "Modelo del producto" o el contenido de la tarea) y la etapa vieja.
   - **`imp.run()`**, que hace la importación:
     - Clientes sin duplicar: busca por IG o celular, también contra lo que ya estaba en el CRM. Si encuentra uno, completa los datos que le faltan.
     - Un pedido por cada tarea activa.
     - De los "sin causa", **solo el último de cada cliente y solo si ese cliente no tiene otro pedido activo**.
     - Una tarea "Retomar contacto" para los pedidos abiertos.
     - Una nota "Importado de ClickUp VN-xxxx · estado «x» · último comentario · link".
3. **Arreglo:** un link de checkout se había leído como teléfono. Esos 2 clientes se renombraron a "Cliente web (link de checkout)".
4. **Resultado:** 7.547 pedidos sin_causa y 46 abiertos, que coinciden con ClickUp.

### 5.2 Segunda tanda: los "cerrado" por API (esta sesión)

ClickUp no mostraba los cerrados en la vista ni en el export ("no me toma los cerrados"). Se bajaron por API con `clickup_filter_tasks`:
- Filtros: `list_ids=["901701629349"]`, `statuses=["cerrado"]`, `include_closed=true`.
- Páginas 0 a 23 de 100 tareas cada una. La última trajo 40.
- **Total: 2.340 tareas**, de VN-420 a VN-11782.

Las tareas se fueron guardando en la tabla **`imp.cerrados`** con estas columnas:
- `ref` (PK, VN-xxxx), `task_id`, `name`, `tags` (separadas por coma).
- `assignees` y `updated_ms` solo están en las primeras 100 filas.
- `closed_ms` y `due_ms` (de la página 13 en adelante).

**Hallazgo importante:** el 14/1/2025 (`date_closed` ≈ 1736882945354 / 1736883047686) se cerraron **1.197 tareas de golpe**. En esas, la fecha de cierre no es la fecha de la venta. La fecha de venta (`sold_at`) quedó así:
- Para las cerradas de golpe: `due_date` si existe, y si no, la fecha del cierre masivo.
- Para el resto: `date_closed`.

**Vista `imp.cerr`**, que reemplaza a `imp.cerrados_parsed`; esa vieja quedó sin usar porque el DROP se colgó, ver §9:
- Usa la misma lógica que `imp.parsed`, adaptada a los nombres de las tareas.
- `imp.ok_ig()` descarta "IG" que en realidad son productos o palabras sueltas: g10, g18, capsula, galicia, quiere, insta, wa.me, carrito, glasgow, wp, melton, etc.
- Si el nombre es "Cliente | PRODUCTO", el producto va a `product_hint` y de ahí a la descripción del pedido.

**Función `imp.run_cerrados()`:**
- Clientes: busca por IG o celular, y si no lo encuentra lo crea con `source='clickup'`.
- Pedidos:
  - Uno por cliente por día de venta: junta duplicados como "FACU/x" + "manychat x" del mismo día.
  - `stage='compro'`, `source='clickup'`, `source_ref=VN-xxxx`, `source_stage='compro'`.
  - Descripción "Compra (ClickUp): <producto>" o "Compra importada de ClickUp".
  - `created_at` y `stage_changed_at` = `sold_at`.
  - `on conflict (source, source_ref) do nothing`.
- Nota en `activity_log`: "Importado de ClickUp VN-xxxx · estado «cerrado» (compró)" + link a la tarea.

**Resultado:**
- **2.208 ventas "Compró".**
- **1.951 clientes nuevos.**
- **297 clientes que ya existían** y recibieron la venta.
- **92 tareas omitidas** porque no tienen IG ni celular AR válido y la base no permite clientes sin contacto. Ejemplos: "FABRI/ Lucas Tissera", "Fena Gallardo", números +1, +55 y +39. Se pueden listar con `select ref, raw_name from imp.cerr where ig is null and phone is null`.

Las fechas de las ventas van del 20/2/2024 al 26/9/2026.

### 5.3 Cambios hechos en ClickUp (con aprobación del usuario)

- Las **46 tareas que seguían abiertas** en la lista se pasaron al estado **"cerrado"**, una por una con `clickup_update_task`. Son las de enviar nuevamente, interesado, hablar de nuevo, promo del finde, más adelante, esperando pago y avanzado.
- El usuario eligió "Primero migro los cerrados, después cierro".
- **No** se tocaron las de "sin causa".
- **Ojo:** en ClickUp ahora figuran como "cerrado" (= compró) aunque no compraron. En el **CRM esas 46 siguen en su etapa real** con su tarea de seguimiento, que es lo correcto. Si alguien vuelve a importar desde ClickUp, **no tomar esas 46 como ventas**. Son VN-11782, 11778, 11761, 11760, 11759, 11758, 11757, 11754, 11744, 11737, 11731, 11720, 11715, 11714, 11708, 11705, 11702, 11699, 11698, 11695, 11694, 11693, 11692, 11686, 11682, 11678, 11677, 11655, 11653, 11645, 11641, 11635, 11631, 11609, 11604, 11566, 11562, 11547, 11540, 11532, 11531, 11485, 11419, 11311, 11275 y 2780.
- **No** se renombró ningún estado en ClickUp. El usuario dijo "acordate de cambiar los nombres del estado". En el CRM ya está hecho (usa los nombres de ClickUp y "cerrado" se llama "Compró"). Se le preguntó si también quiere renombrar "cerrado" a "Compró" dentro de ClickUp, y **todavía no respondió**.

### 5.4 SQL usado en la segunda tanda (está en la base, no en el repo)

```sql
create or replace function imp.ok_ig(h text) returns text language sql immutable as $$
  select case when h is null or h ~ '^g\d+$' or h in ('capsula','galicia','quiere','insta','wa.me','carrito','glasgow','glasglow','wp','melton','promo','hotsale','pagado','esperando') then null else h end
$$;

create view imp.cerr as
with b as (
  select ref, task_id, name as raw_name, coalesce(tags,'') tags,
         replace(imp.strip_seller(name), '‑', '-') as rest,
         to_timestamp(closed_ms/1000.0) as closed_at,
         case when due_ms is not null then to_timestamp(due_ms/1000.0) end as due_at,
         closed_ms between 1736882700000 and 1736883100000 as bulk_closed
  from imp.cerrados
), x as (
  select b.*,
    substring(rest, '(\+?\d[\d\s().-]{8,}\d)') as phone_txt,
    substring(rest, '@\s*([A-Za-z0-9._]+)') as at_handle,
    case when rest ~ '\|' then trim(regexp_replace(rest, '^.*\|\s*', '')) end as after_bar,
    case when rest ~ '\|' then trim(regexp_replace(rest, '\s*\|.*$', '')) end as before_bar
  from b
), y as (
  select x.*,
    imp.norm_phone(phone_txt) as phone,
    coalesce(imp.ok_ig(imp.norm_ig(at_handle)),
      imp.ok_ig(imp.norm_ig(after_bar)),
      case when before_bar !~ '\s' and before_bar ~ '[._\d]' then imp.ok_ig(imp.norm_ig(before_bar)) end,
      case when phone_txt is null and trim(rest) !~ '\s' then imp.ok_ig(imp.norm_ig(rest)) end) as ig,
    nullif(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      coalesce(before_bar, rest),
      'wa\.me/\S*', '', 'gi'), '\+?\d[\d\s().-]{8,}\d', '', 'g'), '@\s*[A-Za-z0-9._]+', '', 'g'), '^[\s/|·-]+|[\s/|·-]+$', '', 'g')), '') as name_part,
    case when after_bar is not null and after_bar !~ '@' and after_bar !~ '\d{6,}' and after_bar !~* 'wa\.me'
              and (after_bar ~ '\s' or after_bar ~* '^(glasgow|melton|carrito|g\d+)') then left(after_bar, 120) end as product_hint
  from x
)
select y.*,
  case when lower(tags) ~ 'whatsapp' then 'whatsapp'
       when lower(tags) ~ 'instagram|manychat' then 'instagram'
       when lower(tags) ~ 'carrito' then 'tienda_online'
       when phone is not null then 'whatsapp' when ig is not null then 'instagram' else 'otro' end as channel,
  imp.seller(raw_name, tags, '') as seller,
  case when name_part ~ '[A-Za-zÁ-úñÑ]{2}' and name_part !~ '[{}]' and lower(name_part) is distinct from ig
            and name_part !~* '^(carrito|hot ?sale|g\d+|glasgow|melton|gris|verde|capsula|promo|quiere|esperando|insta|wp|galicia)'
            and (rest ~ '\|' or name_part ~ '\s' or (ig is null and phone is not null))
         then left(initcap(lower(name_part)), 60)
       when ig is not null then '@' || ig
       when phone is not null then '+' || phone end as display_name,
  coalesce(case when bulk_closed then due_at end, closed_at) as sold_at
from y;

create or replace function imp.run_cerrados() returns jsonb language plpgsql as $f$
declare r record; cid uuid; n_new int := 0; n_merged int := 0; n_orders int := 0;
begin
  create temp table rc (ref text primary key, customer_id uuid) on commit drop;
  for r in select * from imp.cerr where ig is not null or phone is not null order by sold_at loop
    select id into cid from public.customers
      where (r.ig is not null and instagram = r.ig) or (r.phone is not null and phone = r.phone)
      order by (instagram = r.ig) desc nulls last limit 1;
    if cid is null then
      insert into public.customers (name, instagram, phone, created_by, created_at, source)
      values (coalesce(r.display_name, coalesce('@'||r.ig, '+'||r.phone)), r.ig, r.phone, 'misael@wayfarerarg.com', r.sold_at, 'clickup')
      returning id into cid;
      n_new := n_new + 1;
    else
      update public.customers c set
        instagram = coalesce(c.instagram, case when r.ig is not null and not exists (select 1 from public.customers where instagram = r.ig) then r.ig end),
        phone     = coalesce(c.phone,     case when r.phone is not null and not exists (select 1 from public.customers where phone = r.phone) then r.phone end),
        name      = case when c.name ~ '^[@+]' and r.display_name !~ '^[@+]' then r.display_name else c.name end
      where c.id = cid and (c.instagram is null or c.phone is null or (c.name ~ '^[@+]' and r.display_name !~ '^[@+]'));
      n_merged := n_merged + 1;
    end if;
    insert into rc values (r.ref, cid) on conflict do nothing;
  end loop;

  with p as (
    select p.*, rc.customer_id,
      row_number() over (partition by rc.customer_id, (p.sold_at at time zone 'America/Argentina/Buenos_Aires')::date order by p.ref) rn
    from imp.cerr p join rc using (ref)
  ), ins as (
    insert into public.orders (customer_id, channel, stage, description, assigned_to, created_by,
                               created_at, stage_changed_at, source, source_ref, source_stage)
    select customer_id, channel, 'compro',
      coalesce('Compra (ClickUp): ' || product_hint, 'Compra importada de ClickUp'),
      seller, 'misael@wayfarerarg.com', sold_at, sold_at, 'clickup', ref, 'compro'
    from p where rn = 1
    order by sold_at
    on conflict (source, source_ref) where source is not null do nothing
    returning id, source_ref
  ), nt as (
    insert into public.activity_log (entity, entity_id, order_id, kind, message, actor)
    select 'order', i.id, i.id, 'note',
      'Importado de ClickUp ' || p.ref || ' · estado «cerrado» (compró)' || E'\nhttps://app.clickup.com/t/' || p.task_id, 'sistema'
    from ins i join imp.cerr p on p.ref = i.source_ref
    returning 1
  )
  select count(*) into n_orders from ins;
  return jsonb_build_object('clientes_nuevos', n_new, 'clientes_existentes', n_merged, 'ventas', n_orders,
    'sin_contacto_omitidas', (select count(*) from imp.cerr where ig is null and phone is null));
end $f$;
-- select imp.run_cerrados();  → {"ventas":2208,"clientes_nuevos":1951,"clientes_existentes":297,"sin_contacto_omitidas":92}
```

Volver a correr `imp.run_cerrados()` no duplica pedidos, porque `source_ref` es único. Sí volvería a recorrer los clientes, aunque sin crear repetidos.

### 5.5 Restos que hay que limpiar

- **`public.clickup_import`** (la tabla del CSV) **sigue existiendo**. Se le pidió al usuario que la borre desde el Table Editor, porque el DROP por MCP se cuelga (ver §9).
- Esquema **`imp`**: `imp.parsed` (vista), `imp.cerrados` (tabla), `imp.cerrados_parsed` (vista vieja, sin uso), `imp.cerr` (vista) y las funciones. Se puede borrar entero cuando ya no haga falta: `drop schema imp cascade`, desde el SQL Editor del dashboard.
- Antes de borrar `imp.parsed`, hay que borrar `clickup_import` o hacerlo todo junto, porque la vista depende de la tabla.

---

## 6. Últimos cambios de UI (esta sesión)

1. **Etapas de ClickUp con "cerrado" como "Compró"**: PR https://github.com/misael-lgtm/novillo/pull/8, mergeado.
   - Toca `config.ts`, `rules.ts`, los tests, `Board`, `OrderDetail`, el detalle de pedido (botón "Pedir cambio" solo en Compró), la ficha de cliente, Hoy, el tablero y `NewOrderForm`.
   - `NewOrderForm` ahora pregunta "¿En qué está?" con tres opciones: "Recién escribe" (primer_contacto), "Le interesa algo" (interesado) y "Confirmó, falta que pague" (esperando_pago).
   - `createExchange`: si hay diferencia de precio, el cambio arranca en esperando_pago; si es sin cargo, directo en Compró.
2. **Tablero con scroll por columna**: PR https://github.com/misael-lgtm/novillo/pull/9, mergeado. El usuario pidió "que no aparezcan todas las tarjetas por estado, que se pueda ir bajando".
   - Cada columna mide `max-h-[calc(100dvh-21rem)]` en el celu y `md:max-h-[calc(100dvh-14rem)]` en compu. Las tarjetas scrollean adentro de la columna (`overflow-y-auto`).
   - La tarjeta que se arrastra se dibuja en un **`DragOverlay`** para que el scroll no la recorte. Por eso `Card` se separó en `Card` (draggable) y `CardFace` (lo visual).
   - Se probó con Playwright (30 tarjetas en una columna):
     - la página no se estira;
     - la columna scrollea;
     - arrastrar desde abajo de la columna sigue funcionando y queda guardado al recargar;
     - en el celu la columna termina arriba del menú inferior.
3. En el tablero, Compró y Sin causa muestran **todo** (antes eran solo los últimos 14 días; el usuario quiere ver esos contactos). Se traen de a 50 (`FINAL_PAGE` en `src/lib/queries.ts`), los más recientes arriba, con "Ver más (quedan N)" (`loadMoreOrders`). El contador de la columna es el total real. El buscador y "Elegir todas" solo cubren las tarjetas ya cargadas; "Pasar todas a…" cubre la etapa entera.

4. **Modo oscuro** con botón 🌙/☀️ en el menú y en el login (ver §7).
5. **Mover muchas tarjetas juntas** (tablero → "☑️ Seleccionar"): se tocan tarjetas o "Elegir todas (N)" arriba de cada columna, y abajo aparece una barra "N elegidos · Pasar a… · Mover".
   - Va por `moveOrders(ids, etapa, motivo?)` en `src/app/actions.ts`.
   - Hace lo mismo que mover de a una: cierra las tareas automáticas viejas y crea la de seguimiento (`createFollowUps`, en lote).
   - Los pedidos a los que les faltan datos para la etapa (monto o medio de pago para Compró/Esperando pago) **no se mueven**; el mensaje dice cuáles quedaron.
   - Para "Sin causa" pide un motivo que se aplica a los que no tienen.
   - Pide confirmación antes de mover.
   - Además, cada columna tiene **"Pasar todas a… →"** (`MoveAllDialog.tsx`): mueve la etapa entera, incluidas las tarjetas no cargadas (`moveOrders({ fromStage }, …)`, lee de a 1000 y actualiza de a 200 ids).
6. **Mail en contactos nuevos** (Nuevo pedido → "Es un cliente nuevo"): se pide pero es **opcional** (primero fue obligatorio; el 2/10 el usuario pidió que no lo sea). Si lo ponen, se valida el formato y se guarda en minúsculas (`createOrder`, campo `new_email`). Si el contacto ya existía y no tenía mail, se le guarda.
7. 1/10/2026: los 2 pedidos de "Hablar de nuevo" (#8459, #8584) se pasaron a "Más adelante" por SQL a pedido del usuario, con su tarea "Volver a contactar" para el 31/10 (`created_by` = misael).
8. 1/10/2026, **duplicados**: se archivaron (no borraron) 134 tarjetas de clientes que tenían más de una. Regla: si el cliente compró, quedan sus compras y se archiva todo lo demás (132 "Sin causa"); si no compró, queda la más avanzada/reciente (2 "Enviar nuevamente" repetidas). También se archivaron sus 2 tareas abiertas. Después, a pedido del usuario, también se archivaron las compras viejas de los 110 clientes que compraron varias veces (125 tarjetas); a cada uno le queda su compra más reciente. Resultado: **una tarjeta activa por cliente** (9.542 clientes = 9.542 tarjetas; Compró 2.083). Se ven en gris en la ficha del cliente y en Archivo; se pueden restaurar.

**Historial de PRs:** #2 a #18, todos mergeados a `main`.
- #2: casilla compartida + "¿Quién sos?".
- #3: README con la URL.
- #4: página de error de configuración.
- #5: login con contraseña.
- #6: limpieza de las env.
- #7: historial de ClickUp.
- #8: etapas de ClickUp.
- #9: scroll del tablero.
- #10: modo oscuro + este handoff.
- #11: seleccionar y mover muchas tarjetas + mail en contactos nuevos.
- #12: "Pasar todas a…" por columna + Compró/Sin causa completos con "Ver más".
- #13: el mail de contacto nuevo pasa a ser opcional.
- #14: notas en la tarjeta del tablero (migración 0004).
- #15: objetivos del mes, barra arriba + carga en Equipo (migración 0005).
- #16: días que faltan cuentan hoy.
- #17: ventas de Tiendanube en el objetivo del equipo (migración 0006, página /tiendanube).
- #18: los objetivos cuentan solo las ventas off (pedidos manuales de Tiendanube), asignadas a cada vendedor.

---

## 7. Estética que hay que mantener

La idea es que se vea **sobria, limpia y fácil de tocar**, tipo herramienta de trabajo y no tipo página de marketing. Que lo pueda usar cualquiera sin explicación. Antes de agregar algo, copiá cómo están hechas las pantallas que ya existen.

**Colores**
- La base es la paleta **`stone`** de Tailwind, un gris cálido. Fondo de página `bg-stone-50`, texto `text-stone-900`, texto secundario `text-stone-500`, bordes `border-stone-200`/`300`. **No uses `gray`, `zinc` ni `neutral`**: se notaría la diferencia.
- Los botones principales son **negro sobre blanco**: `bg-stone-900 text-white`. Lo mismo para la pestaña activa del menú y el "+" del menú del celu.
- **El color solo se usa para dar significado**:
  - Cada **etapa** tiene su color suave (`bg-<color>-50 border-<color>-300`), definido en `STAGES[].color` de `config.ts`: Primer contacto sky, Interesado violet, Avanzado lime, Esperando pago amber, Promos bancarias fuchsia, Lista de espera pink, Más adelante slate, Promo del finde orange, Sin causa rose, Hablar de nuevo teal, Compró green, Enviar nuevamente stone.
  - Errores y lo peligroso en **rose** (`text-rose-600`, `bg-rose-50 text-rose-800`, `btn-danger`). Lo que salió bien en **emerald** (`bg-emerald-50 text-emerald-800`).
  - Las tarjetas que llevan **más de 3 días sin moverse** tienen borde **amber-400** y el "hace X días" en `text-amber-700`. Los cambios usan **violet** (chip "🔄 Cambio").
- **Si agregás una etapa nueva**, usá una de estas paletas, porque son las que el modo oscuro invierte: stone, rose, emerald, violet, amber, teal, slate, sky, pink, orange, lime, green, fuchsia. Si querés otra paleta, sumala a la lista de `html.dark` en `globals.css` (ver Modo oscuro).

**Componentes y clases (en `src/app/globals.css`, con `@utility`)**
- **`input`**: grande (`py-2.5`, `text-base`) para que en el celu no haga zoom; borde stone-300, foco negro. Los errores se marcan con `aria-invalid`.
- **`btn`**: `rounded-lg px-4 py-2.5 text-sm font-semibold`. Variantes: **`btn-primary`** (negro), **`btn-secondary`** (blanco con borde), **`btn-danger`** (blanco con texto rose).
- **`card`**: `rounded-xl border border-stone-200 bg-white`, sin sombra. Las sombras se usan solo en tarjetas del tablero (`shadow-sm`) y modales.
- Bordes redondeados: `rounded-lg` (botones, inputs, chips) y `rounded-xl` (cards, columnas). Los chips y contadores son `rounded-full`.
- En `src/components/ui.tsx` están `Field` (label + error/ayuda), `SubmitButton` (con texto "Guardando…"), `ResultBanner` (mensaje que se va solo a los 4 s) y `Modal` (sale desde abajo en el celu y al centro en la compu, con fondo `bg-black/40`). **Usalos** en lugar de hacer los tuyos.

**Tipografía**
- La fuente del sistema, sin fuentes externas.
- Títulos de página `text-2xl font-bold`, títulos de sección `font-bold`/`text-lg`, el cuerpo en `text-sm`, la ayuda en `text-xs text-stone-500`. Los números de pedido van en `font-mono`.
- El logo es la palabra **WAYFARER** en `font-black tracking-tight`, sin imagen. El ícono es `src/app/icon.svg`.

**Disposición**
- Contenido centrado `max-w-7xl` con `px-4`. Los formularios largos van en una columna angosta (por ejemplo Nuevo pedido, `max-w-xl`).
- **En la compu**: menú arriba (sticky, `bg-white/90 backdrop-blur`) con Hoy, Tablero, "+ Nuevo pedido" (botón negro), Clientes y Tareas. A la derecha: modo oscuro, Equipo (admin), Archivo, el nombre (si es casilla compartida, "Nombre · cambiar") y Salir.
- **En el celu**: barra fija abajo con 5 íconos emoji (☀️ 🗂️ ➕ 👥 ✅) y el "+" en un círculo negro. Todo tiene que poder tocarse con el dedo (mínimo ~40 px de alto).
- **Tablero**: columnas de `w-72` con scroll horizontal y snap. Cada columna tiene su propio scroll vertical y el alto de la pantalla. Botón "Pasar a <siguiente> →" dentro de cada tarjeta.
- Tarjeta del tablero: `#número` + canal, nombre en negrita, @ig, qué quiere (2 líneas como máximo), monto y "Vendedor · hace X días".

**Textos (muy importante para este usuario)**
- **Castellano rioplatense, con voseo**: "Elegí", "Tocá", "Pedísela a Misael", "Si todavía no sabés, dejalo vacío".
- Cortos y sin palabras técnicas. Los errores dicen **qué hacer**: "Revisá el mail, parece que está mal escrito", no "Invalid email".
- Cada opción tiene un nombre humano: "Recién escribe", "Le interesa algo", "Confirmó, falta que pague", "— Todavía no pagó —", "— Sin despachar —".
- Las ayudas de cada etapa (`help` en `config.ts`) son una frase corta que explica qué significa.
- Emojis, pocos y con sentido (👋 en el saludo, 🔄 en los cambios, los íconos del menú del celu).

**Modo oscuro**
- Lo prende y apaga el **botón 🌙/☀️** (`src/components/ThemeToggle.tsx`), que está en el menú de arriba y en la pantalla de login.
- La elección se guarda en el navegador (`localStorage`, clave `crm_theme`). Si la persona nunca eligió, sigue al modo del sistema operativo.
- `src/lib/theme.ts` tiene un script que corre en el `<head>` (`layout.tsx`) **antes de pintar**, para que no aparezca un destello blanco al cargar.
- **Cómo funciona**: no hay clases `dark:` sueltas por la app. En `globals.css`, cuando `html` tiene la clase `dark`, se **invierten las paletas** (50↔950, 100↔900, 200↔800, 300↔700, 400↔600; 500 queda igual) y `white` pasa a ser el gris oscuro de las tarjetas (`oklch(18% 0.005 52)`). Así **todo lo que ya existe y lo que se agregue** cambia solo, siempre que use las clases de colores de Tailwind de la lista de arriba.
- Consecuencias: `bg-stone-900 text-white` (botón principal) se ve **claro con texto oscuro** en modo oscuro, y eso es intencional. Los colores de las etapas se ven en versión oscura del mismo tono.
- Si alguna vez hace falta algo que **no** se invierta, existe la variante `dark:` (`@custom-variant dark`) para casos puntuales.
- **No pongas colores fijos** (hex, `rgb()`, `style={{color}}`): no cambian con el modo oscuro.
- Se probó con Playwright: arranca claro, el botón lo pasa a oscuro, se acuerda al recargar, vuelve a claro, y sin elección guardada sigue al sistema. Hay capturas de Hoy, Tablero, Nuevo pedido, Pedido y Login.

---

## 8. Cómo probar localmente (entorno que usó Claude)

Nada de esto está en el repo, salvo `supabase/tests/`. Vive en el contenedor y **puede no existir** en otra sesión.

- **Postgres 16 local** en `/var/tmp/crmpg`, puerto 5439, con socket en ese mismo directorio. Se arranca con:
  `su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/crmpg/data -o '-k /var/tmp/crmpg -p 5439 -c listen_addresses=' -l /var/tmp/crmpg/log start"`
  Si quedó un `postmaster.pid` viejo, hay que borrarlo.
- **PostgREST** en `/var/tmp/postgrest`, puerto 3001, con config en `/var/tmp/postgrest.conf`. JWT secret de prueba: `super-secret-jwt-token-with-at-least-32-characters-long`.
- **Gateway falso de Supabase** en `/var/tmp/e2e/gateway.mjs`, puerto 54321. Simula `/auth/v1/token?grant_type=password` (la contraseña buena es `clave-buena`) y hace de proxy a PostgREST. Se reinicia con `(node /var/tmp/e2e/gateway.mjs > /var/tmp/gateway.log 2>&1 &)`.
- `/var/tmp/e2e/reset.sh` recrea la base `crm_e2e` con todas las migraciones y un equipo de prueba.
- La app se levanta con `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt anon firmado con el secret> npx next dev -p 3000`.
- **Playwright**: usar `executablePath: "/opt/pw-browsers/chromium"`. Nunca `playwright install`.
  - Scripts en `/var/tmp/e2e/*.mjs`. `board.mjs` es el test del tablero.
  - La sesión se inyecta con la cookie `sb-localhost-auth-token` = `base64-` + JSON de la sesión.
- **Tests del repo:**
  - `npm test`: vitest, 54 tests de reglas y env.
  - `npm run test:db`: esquema contra el Postgres local.
  - `npx tsc --noEmit`: chequeo de tipos.
  - **No hay ESLint configurado.**

---

## 9. Pendientes / ideas

1. **Esperando respuesta del usuario:** ¿renombrar en ClickUp el estado "cerrado" a "Compró"? Es un cambio hacia afuera: preguntar antes de hacerlo.
2. **92 ventas de ClickUp sin contacto** que no se importaron (§5.2). Opciones:
   - dejarlas así;
   - aflojar el CHECK para clientes `source='clickup'` (por ejemplo permitir solo nombre) y volver a correr el paso de clientes;
   - aceptar teléfonos internacionales (`norm_phone` hoy solo acepta números AR).
3. **Limpieza** (§5.5): borrar `public.clickup_import` y el esquema `imp` cuando el usuario esté conforme.
4. **README desactualizado:** todavía habla de las 5 etapas viejas (Consulta → … → Entregado) y de exigir dirección y envío. Actualizarlo a las 12 etapas.
5. **`app-vendedores/index.html`** (artifact) está desactualizado. Actualizarlo o borrarlo; no lo usan.
6. Las 46 tareas abiertas del CRM tienen su tarea de seguimiento "Retomar contacto (ClickUp: …)". Revisar que los vendedores las trabajen.
7. Etapas `promos_bancarias`, `lista_de_espera` y `primer_contacto`: no hay pedidos importados en ellas, pero existen en el tablero.

---

## 10. Problemas que aparecieron y cómo se resolvieron (para no repetirlos)

| Problema | Causa | Solución |
|---|---|---|
| El link mágico de login no llegaba ("No pudimos mandar el mail") | El SMTP por defecto de Supabase solo manda a miembros de la organización | Login con mail + contraseña; usuarios creados a mano en Auth → Users |
| `MIDDLEWARE_INVOCATION_FAILED` en Vercel | Faltaba la variable de la anon key | Página de error de configuración (503) en el middleware; el usuario cargó la variable y redeployó |
| "String contains non ISO-8859-1 code point" | La key se pegó con caracteres invisibles | `src/lib/supabase/env.ts` limpia la URL y la key; se le pidió re-pegarla con el botón Copy de Supabase |
| Vercel nunca deployó | No había commit en `main` | Mergear un PR a `main` dispara el deploy |
| Next roto con TypeScript 7 | Incompatibilidad | TS fijo en 5.9 |
| Errores de hidratación | Fechas y IDs del DnD distintos entre servidor y browser | Hora AR fija y `useId()` en el DndContext |
| Formularios que se vaciaban al dar error | Comportamiento de React 19 | Hook `useFormAction` |
| `touch_row` fallaba en tablas sin `stage` | El trigger tocaba `new.stage` | Trigger aparte `touch_order_stage` |
| Error al castear `request.headers` vacío | El JSON venía vacío | `coalesce(nullif(current_setting(...),''),'{}')` |
| El export CSV de ClickUp no traía los "cerrado" | ClickUp oculta las tareas cerradas | Bajarlas por API con `filter_tasks` e `include_closed=true` |
| Un link de checkout se leyó como teléfono | Regex | Se renombraron esos 2 clientes |
| **El MCP `execute_sql` se cuelga a los 60 s con DROP TABLE/VIEW** | Parece que espera una confirmación del usuario para operaciones destructivas | **No hacer DROP por MCP.** Crear objetos con otro nombre (por eso existe `imp.cerr`) o pedirle al usuario que borre desde el dashboard |
| `pkill -f patrón` mataba la propia shell | El patrón también aparecía en el comando | Usar `ps … \| awk … \| xargs kill` |
| `prettier --write` reformateó todo `Board.tsx` | El repo no usa prettier | **No correr prettier**; se revirtió a mano |
| Hardcodear la anon key en el código | El clasificador lo bloquea por posible fuga de credenciales | No reintentar; va en las env de Vercel |
| `execute_sql` con varias sentencias | Solo devuelve el resultado de la última | Poner lo que se quiere ver al final, o una sola query con `json_build_object` |

---

## 11. Cómo trabajar con este usuario (preferencias observadas)

- Siempre en **español rioplatense**, corto y concreto.
- Si algo tarda, avisarle en una línea qué estás haciendo.
- Prefiere que Claude haga todo. Cuando sí o sí tiene que hacer algo él (Vercel, Supabase Auth), darle pasos de a uno con el nombre exacto de cada botón. Suele mandar capturas.
- Aprobó explícitamente:
  - migrar todo ClickUp;
  - usar las etapas de ClickUp;
  - renombrar "cerrado" a "Compró" en el CRM;
  - cerrar en ClickUp las 46 abiertas, dejando "sin causa" como estaba.
- Cualquier otro cambio en ClickUp (renombrar estados, borrar tareas), pagos o datos de producción: **preguntar antes**.
- Para publicar cambios de código: rama `claude/awesome-gauss-1hybhb`, después PR a `main` y merge. Así lo vino haciendo Claude para que se publique solo en Vercel. No crear PRs que el usuario no quiera; hasta ahora quiso que todo se publique.
