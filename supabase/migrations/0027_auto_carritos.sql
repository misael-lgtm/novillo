-- Mensaje automático a los carritos abandonados (lo deja en la cola la ruta del reloj, con su clave).
-- Uno por carrito (se guarda con el id del carrito en negativo para no chocar con los pedidos), y no se repite a la misma
-- persona si en las últimas 24 h ya recibió el de carrito (automático o a mano). Nunca a alguien bloqueado.
create or replace function public.auto_queue_cart(p_key text, p_cart_id bigint, p_line text, p_phone text, p_body text)
returns boolean language plpgsql security definer set search_path = public, crm_private as $$
declare
  v_jid text := p_phone || '@s.whatsapp.net';
begin
  if not public.auto_check_key(p_key) then raise exception 'clave inválida'; end if;
  if p_phone !~ '^549\d{10}$' or length(trim(p_body)) = 0 then return false; end if;
  if exists (select 1 from public.wa_blocked where line = p_line and jid = v_jid) then return false; end if;
  if exists (select 1 from public.wa_auto_messages where jid = v_jid and kind = 'carrito' and created_at > now() - interval '24 hours') then return false; end if;
  if exists (select 1 from public.wa_outbox where line = p_line and jid = v_jid and body ~* 'carrito armado' and created_at > now() - interval '24 hours') then return false; end if;
  insert into public.wa_auto_messages (order_id, order_number, kind, line, jid) values (-p_cart_id, null, 'carrito', p_line, v_jid)
  on conflict (order_id) do nothing;
  if not found then return false; end if;
  insert into public.wa_outbox (line, jid, body, created_by) values (p_line, v_jid, p_body, 'automático');
  return true;
end $$;

revoke execute on function public.auto_queue_cart(text, bigint, text, text, text) from public;
grant execute on function public.auto_queue_cart(text, bigint, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
