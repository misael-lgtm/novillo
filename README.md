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
- **Solo entra el equipo**: login con mail y contraseña (los usuarios los crea el admin en Supabase) y lista de personas autorizadas.

## Dónde está online

**https://wayfarer-crm.vercel.app** (Vercel, proyecto `wayfarer-crm`; base en Supabase, proyecto `wayfarer-crm`).
Cada cambio que entra a `main` se publica solo.

## Ponerlo online para el equipo (una sola vez, ~20 min)

Queda en una dirección propia (ej. `wayfarer-crm.vercel.app`). Los vendedores la abren en Chrome
desde la compu o el celu **sin instalar nada y sin cuenta de Claude**: entran con mail y contraseña.
Supabase y Vercel son gratis para este uso.

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
5. **Authentication → Users → Add user → Create new user**: creá un usuario por cada mail con el que se
   entra (tu mail y la casilla compartida, ej. `ventas@...`), con una contraseña y tildando **Auto Confirm User**.
6. **Project Settings → API**: copiá *Project URL* y la clave *anon public*. Las usás en el paso 2.

### 2. Vercel (la página)

1. Entrá a [vercel.com](https://vercel.com) → registrate con GitHub.
2. **Add New → Project** → elegí el repo `novillo` → **Import**.
3. En **Environment Variables** agregá las dos del paso 1.6:
   - `NEXT_PUBLIC_SUPABASE_URL` = el *Project URL*
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave *anon public*
4. **Deploy**. Al terminar te da la dirección (ej. `https://novillo.vercel.app`). Esa es la dirección para el equipo.

### 3. Sumar a los vendedores

1. Entrá vos a la dirección con tu mail y contraseña.
2. Si no los cargaste en el paso 1.4, andá a **Equipo** y sumalos: con su propio mail, o con
   "Entra con la casilla compartida". Cada mail con el que se entra necesita su usuario en Supabase (paso 1.5).
3. Pasales la dirección y la contraseña. Si la casilla es compartida, al entrar eligen su nombre.
   La compu se acuerda; para cambiar de persona, tocan su nombre arriba a la derecha.
   En el celu: *Agregar a pantalla de inicio* y queda como una app.

Si alguien entra con un mail que no está en Equipo, ve una pantalla que dice que no tiene acceso: no ve nada.

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
