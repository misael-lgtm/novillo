-- Mensaje de transferencia pendiente: uno por pedido, pero si la misma persona ya lo recibió en las últimas 24 h no se repite.
create or replace function public.auto_queue_transfer(p_key text, p_order_id bigint, p_order_number int, p_line text, p_phone text, p_body text)
returns boolean language plpgsql security definer set search_path = public, crm_private as $$
declare
  v_jid text := p_phone || '@s.whatsapp.net';
begin
  if not public.auto_check_key(p_key) then raise exception 'clave inválida'; end if;
  if p_phone !~ '^549\d{10}$' or length(trim(p_body)) = 0 then return false; end if;
  if exists (select 1 from public.wa_auto_messages where jid = v_jid and kind = 'transferencia' and created_at > now() - interval '24 hours') then return false; end if;
  insert into public.wa_auto_messages (order_id, order_number, line, jid) values (p_order_id, p_order_number, p_line, v_jid)
  on conflict (order_id) do nothing;
  if not found then return false; end if;
  insert into public.wa_outbox (line, jid, body, created_by) values (p_line, v_jid, p_body, 'automático');
  return true;
end $$;
