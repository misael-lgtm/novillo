# Wayfarer CRM: know-how para el próximo Claude

Guía corta para arrancar. El detalle completo está en `docs/HANDOFF.md`, que es el estado al 1/10, y `docs/HANDOFF-ACTUALIZACION.md`, con los cambios de §1 a §43. Leé primero esto y después buscá en esos dos lo que necesites.

---

## 1. Con quién hablás y cómo

- **Misael** (`misael@wayfarerarg.com`) es el dueño de Wayfarer, una marca de ropa, y el **admin** del CRM. No es técnico.
- **Escribile siempre en español rioplatense**, corto y concreto. Nada de jerga técnica ni de pasos de código.
- Quiere que **hagas las cosas vos**. Dijo explícitamente: "no me pidas más permiso, ejecutá todo lo que necesites". Pedile algo solo si físicamente tiene que hacerlo él: escanear un QR, pagar, aceptar un permiso o tocar el celu.
- Cuando terminás algo, contale **qué cambió para él** en 3 o 4 líneas y si tiene que hacer algo (por ejemplo "recargá la página (F5)").
- Si algo se rompe por algo que hiciste vos, decíselo claro y arreglalo.

## 2. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| CRM en producción | https://wayfarer-crm.vercel.app. Se instala como app en el celu (PWA): Chrome → ⋮ → Instalar app |
| Código | GitHub `misael-lgtm/novillo`. Rama de trabajo `claude/awesome-gauss-1hybhb`; `main` es lo publicado |
| Hosting | Vercel, proyecto `wayfarer-crm`, región `gru1`, **plan Pro**. Cada merge a `main` se publica solo, en 1 a 3 minutos |
| Base | Supabase, proyecto `hhjkhhtqueaprjyviufb` (sa-east-1). Se maneja con el **MCP de Supabase**: `execute_sql`, `apply_migration` |
| Tienda | Tiendanube. El token y el store id viven **solo** en las variables de Vercel (`TIENDANUBE_*`) |
| WhatsApp | Conector Baileys (`wa-conector/`) corriendo en un **celular Android con Termux**. Atiende 3 líneas: `carritos`, `guemes`, `palermo` |
| Reloj | `pg_cron` en Supabase. Un solo job, `auto-transferencias`, cada 5 minutos, llama a `/api/auto/transferencias?key=…` |

**Ojo:** desde el contenedor no hay salida directa a `wayfarer-crm.vercel.app`, porque el proxy lo bloquea. Para pegarle a una ruta del CRM usá **pg_net desde la base**:

```sql
select net.http_get(url := 'https://wayfarer-crm.vercel.app/api/auto/…&key=' || (select value from crm_private.secrets where name='cron'), timeout_milliseconds := 60000);
-- y después, con el id que devuelve:
select status_code, content from net._http_response where id = <id>;
```

## 3. Cómo se trabaja (siempre igual)

1. `git fetch origin main && git checkout -B claude/awesome-gauss-1hybhb origin/main`. **Siempre arrancá desde main.**
2. Hacés el cambio y corrés `npx tsc --noEmit -p .` y `npx vitest run`. Si no hay `node_modules`, primero `npm ci`.
3. Commit con el pie de atribución que pida la sesión, y `git push --force-with-lease -u origin claude/awesome-gauss-1hybhb`. El force es normal: la rama solo tiene cosas ya mergeadas.
4. Creás el PR y lo **mergeás con squash** vos mismo, con el MCP de GitHub.
5. Esperás el deploy: `gh api repos/misael-lgtm/novillo/deployments?per_page=1&environment=Production` hasta que el sha coincida y el status sea `success`.
6. **Migraciones:** escribís el archivo `supabase/migrations/00NN_nombre.sql` **y** lo aplicás con `apply_migration`, porque no hay CLI conectada.
   - Después de crear funciones, `notify pgrst, 'reload schema'`.
   - Con un `DO $$ … raise exception … $$` probás sin dejar rastro.
7. Al final, agregás una sección en `docs/HANDOFF-ACTUALIZACION.md`.

**Trampas conocidas:**
- `DROP VIEW` sobre `wa_chat_list` se cuelga: usá `create or replace view` agregando columnas al final.
- Si `execute_sql` da timeout, verificá si igual se aplicó antes de reintentar.
- Prettier a 80 columnas reescribe archivos enteros. No lo corras sobre archivos existentes, o usá `--print-width 160`.
- **No subas el consumo de Vercel:** nada de crons cada minuto ni de funciones largas seguidas. Así fue como se pausó el sitio el 27/10.

## 4. Cómo está armado (lo esencial)

- **Next.js 15 + React 19 + Tailwind 4 + Supabase.**
  - Lecturas que se repiten → rutas GET en `src/app/api/...`, porque las server actions salen de a una.
  - Acciones → `src/app/actions.ts`, `wa-actions.ts`, `goal-actions.ts`.
- **Modo oscuro por defecto.** En `html.dark` se invierten las paletas (`globals.css`).
  - Para colores que no se tienen que invertir: clases `pace-*` (verde, amarillo y rojo del objetivo), `force-light` (barra de arriba y chats) o colores hex fijos como `bg-[#25D366]`.
- **Vendedores:** comparten el login `ventas@` y eligen su nombre. Misael entra con su mail y es el **único admin**: carga objetivos, edita Equipo y bloquea.

### Ventas y objetivos (lo que más pregunta)
- Las ventas salen de **Tiendanube**, desde las notas del pedido:
  - **Off:** `off/Nombre/...`. Es la venta por WhatsApp e Instagram.
  - **Locales:** `local/Nombre/Palermo` o `local/Nombre/Guemes`. Se acepta en cualquier orden y con `P`/`G`. El parser es `localOf()` en `src/lib/tiendanube.ts`.
- **Cuentan** los pedidos `paid`, `partially_refunded` y `partially_paid` no cancelados, por **fecha de pago**, usando el `total`.
- El reloj guarda todo en `store_sales_snapshot`. Normalmente lee solo los pedidos que cambiaron (`merge_store_snapshot`) y una vez por hora relee el mes entero. Para forzarlo: `/api/auto/transferencias?parte=ventas&todo=1&key=…`.
- **Objetivo off:** `monthly_goals` (scope `equipo` y uno por vendedor). **Objetivo de locales:** `local_goals` (cantidad de ventas × ticket, por local y por vendedor). Se cargan en `/equipo` y `/locales`.
- **Cuando dice "tengo diferencia":**
  1. Mirá en el snapshot `data->'localChecks'` y `data->'checks'`: tienen los pedidos que no cuentan y por qué.
  2. Buscá nombres raros en `off[].offName` y `local[].seller`.
  3. Usá `/api/auto/diagnostico?solo=retiros|compradores|transferencias`.
  - Lo típico es una nota mal escrita, un pago pendiente, o que Tiendanube cuenta "por local" todo lo que se retira ahí.

### WhatsApp (Teléfonos)
- El conector lee `wa_outbox`, `wa_label_ops` y `wa_block_ops` cada 2 segundos y escribe `wa_messages`, `wa_chats`, `wa_labels` y `wa_blocked`.
- **Si el conector está apagado:** se ve en `wa_lines.seen_at`, que tiene más de 1 o 2 minutos. Misael lo prende abriendo Termux y corriendo `bash ~/conector.sh`.
- **Si cambiás el conector:** regenerá `public/conector/wa-conector.zip` (con Python zipfile: `conector.mjs`, `mensajes.mjs`, `package*.json`, `.env.ejemplo`, `.env` vacío, `iniciar.bat`, `LEEME.txt`). Misael actualiza con una sesión nueva de Termux: `curl -fsSL https://wayfarer-crm.vercel.app/conector/android.sh | bash`.
- **Automatismos en la base:**
  - Mensaje de **transferencia pendiente**: 30 minutos después de hacer el pedido, desde Güemes, uno por pedido y sin repetir en 24 horas.
  - Mensaje de **carrito abandonado**: apenas entra, desde Carritos, **una sola vez por persona**, nunca a compradores ni a bloqueados.
  - **Etiquetas automáticas:** "Carrito abandonado" cuando el mensaje dice "carrito armado", y "pauta" para los chats que entran por un anuncio.
- **Respuestas rápidas:** tabla `wa_quick_replies` (se usan con `/atajo` en el chat). Para agregar una, hacé un insert.

## 5. Reglas de seguridad (no negociables)

- **Nunca** pongas en código ni en archivos: contraseñas, la service key de Supabase (vive solo en el `.env` del conector, en el celu), el client secret de Tiendanube ni la clave del reloj.
  - La clave del reloj vive en `crm_private.secrets` y se usa con un subselect, nunca escrita a mano.
- No mandes mensajes a clientes fuera de los automatismos ya aprobados: transferencias y carritos.
- No pongas el mail de Misael en servicios externos.
- No pongas identificadores de modelo en commits ni en PRs.

## 6. Pendientes al 13/11/2026

1. **Avisos en vivo:** aplicar `supabase/migrations/0032_realtime.sql` (quedó sin aplicar porque Supabase pidió una confirmación que no llegó). Después poner `LIVE_READY = true` en `src/lib/live.ts`. Baja mucho el consumo de Vercel y es necesario si Misael vuelve al plan gratis.
2. **Stock del depósito México** y envío de fotos por talle: la app de Tiendanube necesita el permiso `read_locations` para saber cuál depósito es México.
3. **Transcripción de audios:** se le ofrecieron dos opciones, Groq con API key o en el navegador. No eligió.
4. **Notificaciones push** en la app del celu: ofrecido, sin respuesta.
5. **Para borrar:** las tablas auxiliares `crm_private.tmp_tom` y `crm_private.tmp_tom2`.
