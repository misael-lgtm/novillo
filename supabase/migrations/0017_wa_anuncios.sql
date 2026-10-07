-- Mensajes que llegan desde anuncios de Meta ("Enviar mensaje" en Instagram/Facebook), para contarlos.
alter table public.wa_messages add column ad_id text, add column ad_title text, add column ad_url text;
create index wa_messages_ads on public.wa_messages (line, at) where ad_id is not null;

-- El chat recuerda que vino de un anuncio (para marcarlo con 📣 en la lista).
alter table public.wa_chats add column from_ad_at timestamptz, add column ad_title text;

-- La vista suma las columnas nuevas al final (create or replace, sin borrarla: la usan todo el tiempo).
create or replace view public.wa_chat_list with (security_invoker = true) as
  select c.line, c.jid, c.name, c.phone, c.last_message, c.last_at, c.read_at,
    (select count(*) from public.wa_messages m
      where m.line = c.line and m.jid = c.jid and not m.from_me and m.at > coalesce(c.read_at, '-infinity'::timestamptz))::int as unread,
    coalesce((select array_agg(l.label_id order by l.label_id) from public.wa_chat_labels l where l.line = c.line and l.jid = c.jid), '{}') as labels,
    c.from_ad_at, c.ad_title
  from public.wa_chats c;
