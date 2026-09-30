# Wayfarer CRM

CRM interno para los pedidos que entran por Instagram, WhatsApp y la tienda online.
Pensado para que sea **imposible cargar mal un pedido**.

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Hoy** | Tus tareas del día (atrasadas en rojo) y cuántos pedidos hay en cada etapa. |
| **Tablero** | Kanban de pedidos. Arrastrás la tarjeta o tocás "Pasar a…". |
| **+ Nuevo** | Cargar un pedido en 4 pasos. Busca si el cliente ya existe. |
| **Clientes** | Ficha de cada cliente con todos sus pedidos y lo que gastó. |
| **Tareas** | Las tareas de todo el equipo, filtrables por persona. |
| **Archivo** | Lo archivado. Se puede restaurar. |
| **Equipo** (admin) | Quién puede entrar. |

### A prueba de errores

- **Cada etapa exige sus datos.** No podés pasar a *Pagado* sin medio de pago, ni a *Enviado* sin dirección, correo y número de seguimiento, ni *Cancelar* sin motivo. Si faltan, se abre una ventanita que pide **solo lo que falta**.
- **La base de datos repite las mismas reglas**, así que ni un bug ni alguien metiendo mano puede dejar un pedido incompleto.
- **Opciones fijas** para canal, medio de pago y correo. Nadie escribe "mercadopago", "MP" y "Mercado pago" por separado.
- **Datos normalizados**: `@Juana.Perez`, `instagram.com/juana.perez/` y `juana.perez` son lo mismo. `011 15 2345-6789` y `+54 9 11 2345 6789` también. El monto acepta `45.000`, `45000` o `$ 45.000,50`.
- **Sin clientes duplicados**: si cargás un cliente "nuevo" con un IG o celular que ya existe, usa el existente y te avisa.
- **Nada se borra.** Se archiva. La base rechaza cualquier DELETE, incluso con la clave de admin.
- **Historial completo**: cada cambio queda registrado con quién, qué y cuándo (ej: *"Sofi cambió el monto: $40.000 → $45.000"*).
- **Etapas**: Consulta → Esperando pago → Pagado → Enviado → Entregado (+ Cancelado / Perdido).
- **Cambios de talle / prenda**: en un pedido enviado o entregado, "Pedir cambio" crea un pedido de cambio vinculado al original. Sin cargo arranca en *Pagado*; si paga diferencia, en *Esperando pago*.
- **Tareas automáticas**: al pasar a una etapa se crea la tarea que corresponde ("Chequear si pagó", "Armar y despachar", "Confirmar que le llegó"…) y se cierran solas las de la etapa anterior.
- **Alertas**: las tarjetas que llevan más de 3 días sin moverse se marcan en naranja.
- **Formularios que no pierden lo escrito** cuando hay un error.
- **Solo entra el equipo** (login con Google + lista blanca de mails).

## App para vendedores (ya online)

`app-vendedores/index.html` es una versión liviana del mismo CRM que corre como artifact de claude.ai,
con base de datos compartida: https://claude.ai/artifact/JMTDZe8keySBXgHkY95aJz

Se comparte desde el menú **Compartir** del artifact, dándole a cada vendedor acceso de **Colaborador**
(con Lector solo pueden mirar). Tiene las mismas reglas por etapa, detección de clientes repetidos,
tareas automáticas, cambios de talle, historial y archivo. Los datos viven en la base del artifact,
separados de la versión completa de abajo.

## Versión completa: cómo ponerla en marcha (una sola vez, ~20 min)

### 1. Supabase (base de datos + login)

1. Crear cuenta y proyecto en [supabase.com](https://supabase.com) (el plan gratis alcanza). Región: São Paulo.
2. **SQL Editor** → pegar todo `supabase/migrations/0001_init.sql` → **Run**.
3. En el mismo SQL Editor, sumarte como primer admin (con tu mail de Google):
   ```sql
   insert into team_members (email, name, is_admin) values ('tu-mail@gmail.com', 'Tu Nombre', true);
   ```
   Al resto del equipo lo sumás después desde la pantalla **Equipo**.
4. **Authentication → Providers → Google**: activarlo. Pide un *Client ID* y *Secret* de Google Cloud ([guía oficial](https://supabase.com/docs/guides/auth/social-login/auth-google)).
5. **Authentication → URL Configuration**: en *Site URL* poner la URL final (ej. `https://crm.wayfarerarg.com`) y en *Redirect URLs* agregar `https://crm.wayfarerarg.com/auth/callback` (y `http://localhost:3000/auth/callback` para probar local).

### 2. Vercel (la app)

1. Importar este repo en [vercel.com](https://vercel.com).
2. En *Environment Variables* cargar (están en Supabase → Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy. Opcional: apuntar `crm.wayfarerarg.com` al proyecto.

En el celu: abrir la URL en Chrome/Safari → *Agregar a pantalla de inicio*, y queda como una app.

## Cambiar etapas, canales, medios de pago o correos

Todo está en **`src/lib/config.ts`** (nombres, colores, textos de ayuda y tareas automáticas).
Los datos que exige cada etapa están en `STAGE_REQUIREMENTS` en **`src/lib/rules.ts`**.

Si agregás o sacás una opción, la base también la valida: hay que crear una migración nueva
en `supabase/migrations/` que actualice los `CHECK` correspondientes (buscá el mismo nombre en `0001_init.sql`).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con los datos de Supabase
npm run dev                  # http://localhost:3000
```

Tests:

```bash
npm test          # reglas de negocio (normalización de IG/celular/montos, requisitos por etapa)
npm run test:db   # esquema de la base contra un Postgres local (PGHOST/PGPORT/PGUSER)
npm run typecheck
```

Stack: Next.js 15 · React 19 · Supabase (Postgres + Auth + RLS) · Tailwind 4 · dnd-kit.
