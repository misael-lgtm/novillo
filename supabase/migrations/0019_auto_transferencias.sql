-- ═════════════════════════════════════════════════════════════
-- Mensaje automático a los 30 minutos de un pedido por transferencia que todavía no se acreditó.
-- Cada 5 minutos la base (pg_cron) llama a /api/auto/transferencias en el CRM; esa ruta mira Tiendanube
-- y deja el mensaje en la cola de WhatsApp. Un solo mensaje por pedido (wa_auto_messages).
-- ═════════════════════════════════════════════════════════════

-- Clave que usa el reloj para llamar al CRM (se genera sola; no la ve nadie del equipo).
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;
create table crm_private.secrets (name text primary key, value text not null);
insert into crm_private.secrets (name, value) values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- Mensajes automáticos ya mandados (para no repetir).
create table public.wa_auto_messages (
  order_id     bigint primary key,
  order_number int,
  kind         text not null default 'transferencia',
  line         text not null references public.wa_lines (id),
  jid          text not null,
  created_at   timestamptz not null default now()
);
alter table public.wa_auto_messages enable row level security;
create policy wa_auto_read on public.wa_auto_messages for select to authenticated using ((select public.is_team_member()));

create function public.auto_check_key(p_key text) returns boolean
language sql stable security definer set search_path = public, crm_private as $$
  select exists (select 1 from crm_private.secrets where name = 'cron' and value = p_key)
$$;

/** Deja el mensaje en la cola si la clave es la del reloj y ese pedido no tuvo mensaje todavía. true si lo dejó. */
create function public.auto_queue_transfer(p_key text, p_order_id bigint, p_order_number int, p_line text, p_phone text, p_body text)
returns boolean language plpgsql security definer set search_path = public, crm_private as $$
declare
  v_jid text := p_phone || '@s.whatsapp.net';
begin
  if not public.auto_check_key(p_key) then raise exception 'clave inválida'; end if;
  if p_phone !~ '^549\d{10}$' or length(trim(p_body)) = 0 then return false; end if;
  insert into public.wa_auto_messages (order_id, order_number, line, jid) values (p_order_id, p_order_number, p_line, v_jid)
  on conflict (order_id) do nothing;
  if not found then return false; end if;
  insert into public.wa_outbox (line, jid, body, created_by) values (p_line, v_jid, p_body, 'automático');
  return true;
end $$;

revoke execute on function public.auto_check_key(text) from public;
revoke execute on function public.auto_queue_transfer(text, bigint, int, text, text, text) from public;
grant execute on function public.auto_check_key(text) to anon, authenticated;
grant execute on function public.auto_queue_transfer(text, bigint, int, text, text, text) to anon, authenticated;
