-- Tests del esquema. Correr con: ./supabase/tests/run.sh
\set ON_ERROR_STOP on
\set QUIET on

-- helper: espera que una sentencia falle
create or replace function pg_temp.expect_error(sql text, fragment text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERABA ERROR (%): %', fragment, sql;
exception when others then
  if sqlerrm not ilike '%' || fragment || '%' then
    raise exception 'Error distinto al esperado. Quería "%", vino: %', fragment, sqlerrm;
  end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

insert into public.team_members (email, name, is_admin) values ('admin@wayfarer.test', 'Admin', true), ('chico@wayfarer.test', 'Chico', false);

-- ── Como alguien de afuera: no ve nada ──
set role authenticated;
set request.jwt.claims = '{"email":"extrano@gmail.com"}';
do $$ begin
  if (select count(*) from public.team_members) <> 0 then raise exception 'un extraño ve el equipo'; end if;
end $$;
select pg_temp.expect_error($$insert into public.customers (name, instagram) values ('Hacker', 'hacker')$$, 'row-level security');

-- ── Como miembro del equipo ──
set request.jwt.claims = '{"email":"chico@wayfarer.test"}';

select pg_temp.expect_error($$insert into public.customers (name) values ('Sin contacto')$$, 'customers_contact_required');
select pg_temp.expect_error($$insert into public.customers (name, instagram) values ('Mal IG', '@Juana Perez')$$, 'customers_instagram_check');
select pg_temp.expect_error($$insert into public.customers (name, phone) values ('Mal cel', '11 2345 6789')$$, 'customers_phone_check');

insert into public.customers (name, instagram, phone, created_by) values ('Juana Pérez', 'juana.perez', '5491123456789', 'otro@mentira.com');
select pg_temp.expect_error($$insert into public.customers (name, instagram) values ('Juana dup', 'juana.perez')$$, 'customers_instagram_key');

do $$ begin
  if (select created_by from public.customers where instagram = 'juana.perez') <> 'chico@wayfarer.test' then
    raise exception 'created_by se pudo falsificar';
  end if;
end $$;

insert into public.orders (customer_id, channel, description)
  select id, 'instagram', 'Buzo negro talle M' from public.customers where instagram = 'juana.perez';

do $$ begin
  if (select number from public.orders limit 1) <> 1001 then raise exception 'numeración no arranca en 1001'; end if;
  if (select assigned_to from public.orders limit 1) <> 'chico@wayfarer.test' then raise exception 'assigned_to default'; end if;
end $$;

-- Reglas por etapa
select pg_temp.expect_error($$update public.orders set stage = 'esperando_pago'$$, 'orders_total_required');
update public.orders set stage = 'interesado';
update public.orders set stage = 'esperando_pago', total = 45000;
select pg_temp.expect_error($$update public.orders set stage = 'compro'$$, 'orders_payment_required');
select pg_temp.expect_error($$update public.orders set stage = 'compro', payment_method = 'bitcoin'$$, 'orders_payment_method_check');
select pg_temp.expect_error($$update public.orders set stage = 'enviado'$$, 'orders_stage_check');
update public.orders set stage = 'compro', payment_method = 'mercado_pago';
select pg_temp.expect_error($$update public.orders set stage = 'sin_causa'$$, 'orders_cancel_reason_required');
select pg_temp.expect_error($$update public.orders set stage = 'sin_causa', cancel_reason = '   '$$, 'orders_cancel_reason_required');
select pg_temp.expect_error($$update public.orders set stage = 'volando'$$, 'orders_stage_check');

-- Cambios de talle
select pg_temp.expect_error($$insert into public.orders (customer_id, channel, description, kind) select customer_id, channel, 'Cambio sin original', 'cambio' from public.orders$$, 'orders_exchange_has_parent');
insert into public.orders (customer_id, channel, description, kind, parent_order_id, stage, shipping_address)
  select customer_id, channel, 'Cambio: buzo L por M', 'cambio', id, 'compro', shipping_address from public.orders where number = 1001;
select pg_temp.expect_error($$update public.orders set total = 3000 where kind = 'cambio'$$, 'orders_payment_required');
update public.orders set total = 3000, payment_method = 'transferencia' where kind = 'cambio';
update public.orders set stage = 'sin_causa', cancel_reason = 'test' where kind = 'cambio';

-- Nada se borra
select pg_temp.expect_error($$delete from public.orders$$, 'permission denied');
reset role;
select pg_temp.expect_error($$delete from public.orders$$, 'no se borra nada');
select pg_temp.expect_error($$update public.activity_log set message = 'x'$$, 'no se puede modificar');
set role authenticated;
set request.jwt.claims = '{"email":"chico@wayfarer.test"}';

-- Tareas
insert into public.tasks (title, due_date, order_id) select 'Chequear si pagó', current_date, id from public.orders;
update public.tasks set done_at = now();
do $$ begin
  if (select done_by from public.tasks limit 1) <> 'chico@wayfarer.test' then raise exception 'done_by'; end if;
end $$;
select pg_temp.expect_error($$insert into public.tasks (title, due_date, assigned_to) values ('Algo', current_date, 'nadie@x.com')$$, 'foreign key');

-- Notas: solo propias
insert into public.activity_log (entity, entity_id, order_id, kind, message)
  select 'order', id, id, 'note', 'Pidió que le cambien el talle' from public.orders;
select pg_temp.expect_error($$insert into public.activity_log (entity, entity_id, kind, message, actor) select 'order', id, 'note', 'x', 'admin@wayfarer.test' from public.orders$$, 'row-level security');
select pg_temp.expect_error($$insert into public.activity_log (entity, entity_id, kind, changes) select 'order', id, 'stage', '{}' from public.orders$$, 'row-level security');

-- Solo admin agrega gente
select pg_temp.expect_error($$insert into public.team_members (email, name) values ('nuevo@x.com', 'Nuevo')$$, 'row-level security');
set request.jwt.claims = '{"email":"admin@wayfarer.test"}';
insert into public.team_members (email, name) values ('nuevo@x.com', 'Nuevo');

-- ── Casilla compartida: ventas@ con "¿Quién sos?" ──
insert into public.team_members (email, name, login_email) values
  ('ventas+marian@wayfarer.test', 'Marian', 'ventas@wayfarer.test'),
  ('ventas+bruno@wayfarer.test', 'Bruno', 'ventas@wayfarer.test');
set request.jwt.claims = '{"email":"ventas@wayfarer.test"}';
set request.headers = '{}';
do $$ begin
  if not public.is_team_member() then raise exception 'la casilla compartida no entra'; end if;
  if (select count(*) from public.orders) = 0 then raise exception 'la casilla compartida no ve pedidos'; end if;
  if public.current_member() is not null then raise exception 'sin elegir no debería haber persona'; end if;
end $$;
select pg_temp.expect_error($$insert into public.customers (name, instagram) values ('Sin elegir', 'sinelegir')$$, 'Elegí quién sos');
-- intentar hacerse pasar por alguien que NO comparte la casilla
set request.headers = '{"x-crm-as":"admin@wayfarer.test"}';
select pg_temp.expect_error($$insert into public.customers (name, instagram) values ('Trucho', 'trucho')$$, 'Elegí quién sos');
set request.headers = '{"x-crm-as":"ventas+marian@wayfarer.test"}';
insert into public.customers (name, instagram, created_by) values ('Cliente de Marian', 'cliente.marian', 'ventas+bruno@wayfarer.test');
insert into public.orders (customer_id, channel, description)
  select id, 'whatsapp', 'Campera verde S' from public.customers where instagram = 'cliente.marian';
do $$ begin
  if (select created_by from public.customers where instagram = 'cliente.marian') <> 'ventas+marian@wayfarer.test' then raise exception 'created_by no es Marian'; end if;
  if (select assigned_to from public.orders where description = 'Campera verde S') <> 'ventas+marian@wayfarer.test' then raise exception 'assigned_to no es Marian'; end if;
  if (select actor from public.activity_log where entity = 'customer' order by id desc limit 1) <> 'ventas+marian@wayfarer.test' then raise exception 'el historial no dice Marian'; end if;
  if public.is_admin() then raise exception 'Marian no es admin'; end if;
end $$;
insert into public.activity_log (entity, entity_id, order_id, kind, message, actor)
  select 'order', id, id, 'note', 'nota de Marian', 'ventas+marian@wayfarer.test' from public.orders where description = 'Campera verde S';
select pg_temp.expect_error($$insert into public.activity_log (entity, entity_id, kind, message, actor) select 'order', id, 'note', 'x', 'ventas+bruno@wayfarer.test' from public.orders limit 1$$, 'row-level security');
reset request.headers;
set request.jwt.claims = '{"email":"admin@wayfarer.test"}';

-- Historial importado de ClickUp: exento de datos solo en la etapa importada
insert into public.orders (customer_id, channel, description, stage, source, source_ref, source_stage, assigned_to, created_by)
  select id, 'instagram', 'Importado de ClickUp', 'compro', 'clickup', 'VN-1', 'compro', 'admin@wayfarer.test', 'admin@wayfarer.test'
  from public.customers where instagram = 'juana.perez';
insert into public.orders (customer_id, channel, description, stage, source, source_ref, source_stage, assigned_to, created_by)
  select id, 'instagram', 'Importado de ClickUp', 'esperando_pago', 'clickup', 'VN-2', 'esperando_pago', 'admin@wayfarer.test', 'admin@wayfarer.test'
  from public.customers where instagram = 'juana.perez';
update public.orders set stage = 'interesado' where source_ref = 'VN-1';
select pg_temp.expect_error($$update public.orders set stage = 'compro' where source_ref = 'VN-1'$$, 'orders_');
select pg_temp.expect_error($$update public.orders set stage = 'compro' where source_ref = 'VN-2'$$, 'orders_');
select pg_temp.expect_error($$insert into public.orders (customer_id, channel, description, stage, source, source_ref) select customer_id, channel, 'dup', 'interesado', 'clickup', 'VN-1' from public.orders limit 1$$, 'orders_source_ref_key');
select pg_temp.expect_error($$insert into public.orders (customer_id, channel, description, stage) select customer_id, channel, 'sin source', 'compro' from public.orders limit 1$$, 'orders_');
-- un lead importado en Consulta no puede saltar a Entregado sin datos
insert into public.orders (customer_id, channel, description, stage, source, source_ref, source_stage, assigned_to, created_by)
  select id, 'instagram', 'Lead importado', 'interesado', 'clickup', 'VN-3', 'interesado', 'admin@wayfarer.test', 'admin@wayfarer.test'
  from public.customers where instagram = 'juana.perez';
select pg_temp.expect_error($$update public.orders set stage = 'compro' where source_ref = 'VN-3'$$, 'orders_');

-- Archivar
update public.orders set archived_at = now();

-- ── Historial ──
reset role;
do $$
declare kinds text;
begin
  select string_agg(kind, ',' order by id) into kinds from public.activity_log where entity = 'order' and entity_id = (select id from public.orders where number = 1001);
  if kinds <> 'created,stage,stage,stage,note,archived' then -- solo #1001: interesado, esperando_pago, compro
    raise exception 'historial de pedido inesperado: %', kinds;
  end if;
  if (select changes -> 'stage' ->> 'a' from public.activity_log where entity = 'order' and kind = 'stage' order by id limit 1) <> 'interesado' then
    raise exception 'diff de etapa mal';
  end if;
  if not exists (select 1 from public.activity_log where entity = 'task' and kind = 'done' and order_id is not null and actor = 'chico@wayfarer.test') then
    raise exception 'la tarea completada no quedó en el historial del pedido';
  end if;
end $$;

\echo 'OK: todos los tests del esquema pasaron'
