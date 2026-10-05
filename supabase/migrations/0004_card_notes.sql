-- ═════════════════════════════════════════════════════════════
-- Notas en la tarjeta del tablero.
-- Las notas siguen en activity_log (historial); el pedido guarda una copia de la última
-- para mostrarla en la tarjeta sin tener que leer todo el historial.
-- ═════════════════════════════════════════════════════════════

alter table public.orders
  add column last_note    text,
  add column last_note_at timestamptz,
  add column last_note_by text;

-- El historial no registra estas columnas: ya queda la nota misma.
create or replace function public.log_changes() returns trigger
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
    diff := n - array['id', 'created_at', 'updated_at', 'stage_changed_at', 'created_by', 'archived_at',
                      'last_note', 'last_note_at', 'last_note_by'];
  else
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'stage_changed_at', 'done_by', 'last_note', 'last_note_at', 'last_note_by')
         and (n -> k) is distinct from (o -> k) then
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

-- Cada nota nueva de un pedido pasa a ser "la última nota" de su tarjeta.
create function public.copy_last_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'note' and new.order_id is not null and new.message not like 'Importado de ClickUp%' then
    update public.orders
       set last_note = new.message, last_note_at = new.created_at, last_note_by = new.actor
     where id = new.order_id;
  end if;
  return new;
end $$;

create trigger activity_last_note after insert on public.activity_log
  for each row execute function public.copy_last_note();

-- Notas que ya existían (sin contar la nota automática de la importación)
alter table public.orders disable trigger orders_touch;
update public.orders o set last_note = a.message, last_note_at = a.created_at, last_note_by = a.actor
from (
  select distinct on (order_id) order_id, message, created_at, actor
  from public.activity_log
  where kind = 'note' and order_id is not null and message not like 'Importado de ClickUp%'
  order by order_id, created_at desc, id desc
) a
where o.id = a.order_id;
alter table public.orders enable trigger orders_touch;
