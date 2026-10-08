-- "Sin leer" = lo que escribió el cliente después de la última respuesta nuestra (desde el CRM o desde el celu)
-- y después de abrirlo en el CRM. Antes contaba todo lo no abierto en el CRM, aunque ya lo hubieran contestado en el celu.
create or replace view public.wa_chat_list with (security_invoker = true) as
  select c.line, c.jid, c.name, c.phone, c.last_message, c.last_at, c.read_at,
    (select count(*) from public.wa_messages m
      where m.line = c.line and m.jid = c.jid and not m.from_me
        and m.at > greatest(
          coalesce(c.read_at, '-infinity'::timestamptz),
          coalesce((select max(o.at) from public.wa_messages o where o.line = c.line and o.jid = c.jid and o.from_me), '-infinity'::timestamptz)
        ))::int as unread,
    coalesce((select array_agg(l.label_id order by l.label_id) from public.wa_chat_labels l where l.line = c.line and l.jid = c.jid), '{}') as labels,
    c.from_ad_at, c.ad_title
  from public.wa_chats c;
