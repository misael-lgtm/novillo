-- ═════════════════════════════════════════════════════════════
-- Wayfarer CRM: esquema inicial
-- Pegalo entero en Supabase > SQL Editor > Run.
--
-- Principios:
--   * Solo entra gente cargada en team_members.
--   * Nada se borra: todo se archiva (archived_at). DELETE tira error.
--   * La base valida lo mismo que la interfaz (src/lib/rules.ts), así
--     que es imposible guardar un pedido "Enviado" sin seguimiento, etc.
--   * Cada cambio queda registrado en activity_log (quién, qué, cuándo).
-- ═════════════════════════════════════════════════════════════

-- ── Equipo ───────────────────────────────────────────────────
-- Cada fila es una persona. `email` es su identificador (y su mail, si entra con uno propio).
-- `login_email`: si varias personas comparten una casilla para entrar (ej. ventas@), va acá;
-- al entrar con esa casilla, la app pregunta "¿Quién sos?" y todo queda a nombre de quien eligió.

create table public.team_members (
  email       text primary key check (email = lower(trim(email)) and email like '%@%'),
  login_email text check (login_email = lower(trim(login_email)) and login_email like '%@%'),
  name        text not null check (length(trim(name)) >= 2),
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- ¿Puede entrar este login? (mail propio o casilla compartida)
create function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                 where coalesce(login_email, email) = public.current_email() and active)
$$;

-- La persona que está usando la app ahora.
--  * Con mail propio: esa persona.
--  * Con casilla compartida: la que eligió en "¿Quién sos?" (header x-crm-as), y SOLO si
--    comparte esa casilla. Si no eligió a nadie válido, null (y no puede guardar nada).
create function public.current_member() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.email from public.team_members m
      where m.active
        and coalesce(m.login_email, m.email) = public.current_email()
        and m.email = lower(nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-crm-as', ''))),
    (select m.email from public.team_members m
      where m.active and m.login_email is null and m.email = public.current_email())
  )
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = public.current_member() and active and is_admin)
$$;

-- ── Clientes ─────────────────────────────────────────────────

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) >= 2),
  instagram   text check (instagram ~ '^[a-z0-9._]{1,30}$'),
  phone       text check (phone ~ '^549[0-9]{10}$'),
  email       text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city        text,
  notes       text,
  created_by  text not null default public.current_member(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint customers_contact_required check (instagram is not null or phone is not null)
);
-- Un mismo IG o celular no puede estar dos veces (evita clientes duplicados)
create unique index customers_instagram_key on public.customers (instagram) where instagram is not null;
create unique index customers_phone_key on public.customers (phone) where phone is not null;

-- ── Pedidos ──────────────────────────────────────────────────

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  number           integer generated always as identity (start with 1001) unique,
  customer_id      uuid not null references public.customers (id),
  channel          text not null check (channel in ('instagram', 'whatsapp', 'tienda_online', 'otro')),
  stage            text not null default 'consulta'
                   check (stage in ('consulta', 'esperando_pago', 'pagado', 'enviado', 'entregado', 'cancelado')),
  kind             text not null default 'venta' check (kind in ('venta', 'cambio')),
  parent_order_id  uuid references public.orders (id),   -- en un cambio: el pedido original
  description      text not null check (length(trim(description)) >= 3),
  total            numeric(12, 2) check (total > 0),
  payment_method   text check (payment_method in ('transferencia', 'mercado_pago')),
  shipping_address text,
  carrier          text check (carrier in ('correo_argentino', 'andreani', 'oca')),
  tracking_code    text,
  cancel_reason    text,
  assigned_to      text not null default public.current_member() references public.team_members (email),
  created_by       text not null default public.current_member(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  archived_at      timestamptz,

  -- Mismas reglas que STAGE_REQUIREMENTS en src/lib/rules.ts
  -- Un cambio sin cargo (kind = 'cambio' y sin monto) no lleva monto ni medio de pago.
  constraint orders_total_required check (
    stage in ('consulta', 'cancelado') or total is not null or kind = 'cambio'),
  constraint orders_payment_required check (
    stage not in ('pagado', 'enviado', 'entregado') or payment_method is not null or (kind = 'cambio' and total is null)),
  constraint orders_address_required check (
    stage not in ('pagado', 'enviado', 'entregado') or nullif(trim(shipping_address), '') is not null),
  constraint orders_exchange_has_parent check (
    (kind = 'cambio') = (parent_order_id is not null)),
  constraint orders_shipping_required check (
    stage not in ('enviado', 'entregado') or (carrier is not null and nullif(trim(tracking_code), '') is not null)),
  constraint orders_cancel_reason_required check (
    stage <> 'cancelado' or nullif(trim(cancel_reason), '') is not null)
);
create index orders_stage_idx on public.orders (stage) where archived_at is null;
create index orders_customer_idx on public.orders (customer_id);

-- ── Tareas ───────────────────────────────────────────────────

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) >= 3),
  due_date    date not null,
  assigned_to text not null default public.current_member() references public.team_members (email),
  order_id    uuid references public.orders (id),
  customer_id uuid references public.customers (id),
  auto_stage  text,          -- si la creó el sistema al pasar un pedido a esa etapa
  done_at     timestamptz,
  done_by     text,
  created_by  text not null default public.current_member(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index tasks_open_idx on public.tasks (assigned_to, due_date) where done_at is null and archived_at is null;
create index tasks_order_idx on public.tasks (order_id);

-- ── Historial ────────────────────────────────────────────────

create table public.activity_log (
  id         bigint generated always as identity primary key,
  entity     text not null check (entity in ('order', 'customer', 'task')),
  entity_id  uuid not null,
  order_id   uuid,           -- para mostrar en el pedido también lo que pasa con sus tareas
  kind       text not null check (kind in ('created', 'updated', 'stage', 'archived', 'restored', 'done', 'reopened', 'note')),
  message    text,
  changes    jsonb,
  actor      text not null default coalesce(public.current_member(), 'sistema'),
  created_at timestamptz not null default now(),
  constraint activity_note_has_message check (kind <> 'note' or length(trim(message)) > 0)
);
create index activity_entity_idx on public.activity_log (entity, entity_id, created_at desc);
create index activity_order_idx on public.activity_log (order_id, created_at desc);

-- ═════════════════════════════════════════════════════════════
-- Triggers
-- ═════════════════════════════════════════════════════════════

-- updated_at / stage_changed_at automáticos
create function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.touch_order_stage() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;

create trigger customers_touch before update on public.customers for each row execute function public.touch_row();
create trigger orders_touch    before update on public.orders    for each row execute function public.touch_row();
create trigger tasks_touch     before update on public.tasks     for each row execute function public.touch_row();
create trigger orders_stage_at before update on public.orders    for each row execute function public.touch_order_stage();

-- Nadie puede pisar quién creó algo
create function public.stamp_creator() returns trigger
language plpgsql as $$
begin
  if public.current_member() is not null then
    new.created_by := public.current_member();
  elsif public.current_email() <> '' and public.is_team_member() then
    raise exception 'Elegí quién sos antes de guardar.';
  end if;
  return new;
end $$;

create trigger customers_stamp before insert on public.customers for each row execute function public.stamp_creator();
create trigger orders_stamp    before insert on public.orders    for each row execute function public.stamp_creator();
create trigger tasks_stamp     before insert on public.tasks     for each row execute function public.stamp_creator();

-- Tareas: quién la completó
create function public.stamp_task_done() returns trigger
language plpgsql as $$
begin
  if new.done_at is not null and old.done_at is null then
    new.done_by := coalesce(public.current_member(), 'sistema');
  elsif new.done_at is null then
    new.done_by := null;
  end if;
  return new;
end $$;

create trigger tasks_done before update on public.tasks for each row execute function public.stamp_task_done();

-- Historial automático de todos los cambios
create function public.log_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n        jsonb := to_jsonb(new);
  o        jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  diff     jsonb := '{}'::jsonb;
  k        text;
  v_kind   text;
  v_entity text := case tg_table_name when 'orders' then 'order' when 'customers' then 'customer' else 'task' end;
  v_order  uuid := case tg_table_name when 'orders' then new.id else (n ->> 'order_id')::uuid end;
begin
  if tg_op = 'INSERT' then
    v_kind := 'created';
    diff := n - array['id', 'created_at', 'updated_at', 'stage_changed_at', 'created_by', 'archived_at'];
  else
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'stage_changed_at', 'done_by') and (n -> k) is distinct from (o -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('de', o -> k, 'a', n -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
    v_kind := case
      when diff ? 'archived_at' and n ->> 'archived_at' is not null then 'archived'
      when diff ? 'archived_at' then 'restored'
      when diff ? 'done_at' and n ->> 'done_at' is not null then 'done'
      when diff ? 'done_at' then 'reopened'
      when diff ? 'stage' then 'stage'
      else 'updated'
    end;
  end if;

  insert into public.activity_log (entity, entity_id, order_id, kind, message, changes, actor)
  values (v_entity, new.id, v_order, v_kind,
          case when v_entity = 'task' then n ->> 'title' end,
          diff, coalesce(public.current_member(), 'sistema'));
  return new;
end $$;

create trigger customers_log after insert or update on public.customers for each row execute function public.log_changes();
create trigger orders_log    after insert or update on public.orders    for each row execute function public.log_changes();
create trigger tasks_log     after insert or update on public.tasks     for each row execute function public.log_changes();

-- Nada se borra. Ni siquiera con la service key.
create function public.prevent_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'En el CRM no se borra nada: usá "Archivar".';
end $$;

create trigger customers_no_delete    before delete on public.customers    for each row execute function public.prevent_delete();
create trigger orders_no_delete       before delete on public.orders       for each row execute function public.prevent_delete();
create trigger tasks_no_delete        before delete on public.tasks        for each row execute function public.prevent_delete();
create trigger team_no_delete         before delete on public.team_members for each row execute function public.prevent_delete();
create trigger activity_no_delete     before delete on public.activity_log for each row execute function public.prevent_delete();

create function public.prevent_update() returns trigger
language plpgsql as $$
begin
  raise exception 'El historial no se puede modificar.';
end $$;

create trigger activity_no_update before update on public.activity_log for each row execute function public.prevent_update();

-- ═════════════════════════════════════════════════════════════
-- Permisos (Row Level Security)
-- ═════════════════════════════════════════════════════════════

alter table public.team_members enable row level security;
alter table public.customers    enable row level security;
alter table public.orders       enable row level security;
alter table public.tasks        enable row level security;
alter table public.activity_log enable row level security;

revoke delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;

create policy team_read   on public.team_members for select to authenticated using (public.is_team_member());
create policy team_insert on public.team_members for insert to authenticated with check (public.is_admin());
create policy team_update on public.team_members for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy customers_read   on public.customers for select to authenticated using (public.is_team_member());
create policy customers_insert on public.customers for insert to authenticated with check (public.is_team_member());
create policy customers_update on public.customers for update to authenticated using (public.is_team_member()) with check (public.is_team_member());

create policy orders_read   on public.orders for select to authenticated using (public.is_team_member());
create policy orders_insert on public.orders for insert to authenticated with check (public.is_team_member());
create policy orders_update on public.orders for update to authenticated using (public.is_team_member()) with check (public.is_team_member());

create policy tasks_read   on public.tasks for select to authenticated using (public.is_team_member());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_team_member());
create policy tasks_update on public.tasks for update to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- El historial se lee; a mano solo se pueden agregar notas propias.
create policy activity_read on public.activity_log for select to authenticated using (public.is_team_member());
create policy activity_note on public.activity_log for insert to authenticated
  with check (public.is_team_member() and kind = 'note' and actor = public.current_member());
