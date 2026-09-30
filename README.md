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
- **Solo entra el equipo**: login con link al mail (sin contraseñas) y lista de mails autorizados.

## Dónde está online

**https://wayfarer-crm.vercel.app** (Vercel, proyecto `wayfarer-crm`; base en Supabase, proyecto `wayfarer-crm`).
Cada cambio que entra a `main` se publica solo.

## Ponerlo online para el equipo (una sola vez, ~20 min)

Queda en una dirección propia (ej. `wayfarer-crm.vercel.app`). Los vendedores la abren en Chrome
desde la compu o el celu **sin instalar nada y sin cuenta de Claude**: ponen su mail, les llega un
link y entran. Supabase y Vercel son gratis para este uso.

### 1. Supabase (base de datos + login)

1. Entrá a [supabase.com](https://supabase.com) → **Start your project** → registrate con GitHub.
2. **New project**: nombre `wayfarer-crm`, inventá una contraseña (guardala), región **South America (São Paulo)** → *Create*.
3. Menú izquierdo → **SQL Editor** → **New query** → pegá todo el contenido de `supabase/migrations/0001_init.sql` → **Run**. Tiene que decir *Success*.
4. En otra query nueva, cargá al equipo y tocá **Run**. Ejemplo: vos como admin con tu mail, y dos
   vendedores que entran con una casilla compartida (al entrar eligen "¿Quién sos?"):
   ```sql
   insert into team_members (email, name, is_admin, login_email) values
     ('vos@tudominio.com',          'Vos',  true,  null),
     ('ventas+ana@tudominio.com',   'Ana',  false, 'ventas@tudominio.com'),
     ('ventas+juan@tudominio.com',  'Juan', false, 'ventas@tudominio.com');
   ```
   `email` identifica a la persona; `login_email` es la casilla con la que entra si la comparte con otros.
   Después podés sumar o desactivar gente desde la pantalla **Equipo**.
5. **Authentication → URL Configuration**: en *Site URL* poné la dirección que te dé Vercel en el paso 2
   (podés volver a completarlo después) y en *Redirect URLs* agregá esa misma dirección seguida de `/auth/callback`.
6. **Project Settings → API**: copiá *Project URL* y la clave *anon public*. Las usás en el paso 2.
7. (Recomendado) **Authentication → Email Templates → Magic Link**: cambiá el asunto a
   `Tu link para entrar al CRM de Wayfarer` y el texto a
   `<p>Tocá acá para entrar:</p><p><a href="{{ .ConfirmationURL }}">Entrar al CRM</a></p>`.

> **Límite de mails:** el correo que trae Supabase de fábrica manda pocos mails por hora. Alcanza porque
> cada vendedor entra una vez por compu y queda logueado. Si algún día dice "muchos links seguidos",
> conectá un correo propio en *Authentication → SMTP Settings* (por ejemplo con Resend, que es gratis).

### 2. Vercel (la página)

1. Entrá a [vercel.com](https://vercel.com) → registrate con GitHub.
2. **Add New → Project** → elegí el repo `novillo` → **Import**.
3. En **Environment Variables** agregá las dos del paso 1.6:
   - `NEXT_PUBLIC_SUPABASE_URL` = el *Project URL*
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave *anon public*
4. **Deploy**. Al terminar te da la dirección (ej. `https://novillo.vercel.app`). Volvé a Supabase y completá el paso 1.5 con esa dirección.

### 3. Sumar a los vendedores

1. Entrá vos a la dirección, poné tu mail y tocá el link que te llega.
2. Si no los cargaste en el paso 1.4, andá a **Equipo** y sumalos: con su propio mail, o con
   "Entra con la casilla compartida".
3. Pasales la dirección. Ponen su mail (o el de la casilla compartida), abren el link **en la misma compu**,
   y si la casilla es compartida eligen su nombre. La compu se acuerda; para cambiar de persona, tocan su nombre arriba a la derecha.
   En el celu: *Agregar a pantalla de inicio* y queda como una app.

Si alguien que no está en Equipo pone su mail, entra a una pantalla que dice que no tiene acceso: no ve nada.

### (Opcional) Botón "Entrar con Google"

Activá Google en *Authentication → Providers* ([guía](https://supabase.com/docs/guides/auth/social-login/auth-google))
y agregá en Vercel la variable `NEXT_PUBLIC_GOOGLE_LOGIN` = `true`.

## Versión de prueba en claude.ai

`app-vendedores/index.html` es una versión liviana publicada como artifact de claude.ai
(https://claude.ai/artifact/JMTDZe8keySBXgHkY95aJz). Sirve para probar, pero cada persona necesita
cuenta de Claude. Para el equipo usá la versión de arriba. Los datos de una y otra no se comparten.

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
