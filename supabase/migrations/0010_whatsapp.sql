-- ═════════════════════════════════════════════════════════════
-- WhatsApp por QR ("Dispositivos vinculados") para los 3 teléfonos de los locales.
-- El conector (carpeta wa-conector/) corre en una compu del local que queda prendida,
-- usa la service key y escribe acá. Las credenciales de WhatsApp quedan en esa compu, no en la base. El CRM lee, marca leído y deja mensajes en la cola de salida.
-- ═════════════════════════════════════════════════════════════

create table public.wa_lines (
  id         text primary key check (id in ('carritos', 'guemes', 'palermo')),
  status     text not null default 'desconectado' check (status in ('desconectado', 'esperando_qr', 'conectando', 'conectado')),
  qr         text,          -- texto del QR que muestra el CRM mientras espera vincular
  phone      text,          -- número vinculado (solo dígitos)
  command    text check (command in ('desvincular')),  -- pedido del CRM al conector
  seen_at    timestamptz,   -- última vez que el conector dio señales de vida
  updated_at timestamptz not null default now()
);
insert into public.wa_lines (id) values ('carritos'), ('guemes'), ('palermo');

create table public.wa_chats (
  line         text not null references public.wa_lines (id),
  jid          text not null,           -- 5491123456789@s.whatsapp.net
  name         text,
  phone        text,                    -- solo dígitos
  last_message text,
  last_at      timestamptz,
  read_at      timestamptz,             -- hasta cuándo lo leyeron en el CRM
  primary key (line, jid)
);
create index wa_chats_last on public.wa_chats (line, last_at desc nulls last);

create table public.wa_messages (
  line    text not null references public.wa_lines (id),
  id      text not null,                -- id del mensaje en WhatsApp
  jid     text not null,
  from_me boolean not null,
  body    text,
  kind    text not null default 'texto',
  at      timestamptz not null,
  sent_by text,                         -- quién lo mandó desde el CRM (si salió del CRM)
  primary key (line, id)
);
create index wa_messages_chat on public.wa_messages (line, jid, at desc);

create table public.wa_outbox (
  id         bigint generated always as identity primary key,
  line       text not null references public.wa_lines (id),
  jid        text not null,
  body       text not null check (length(trim(body)) > 0),
  created_by text not null default coalesce(public.current_member(), 'sistema'),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  wa_id      text,
  error      text
);
create index wa_outbox_pending on public.wa_outbox (line, created_at) where sent_at is null and error is null;

-- Lista de chats con los mensajes sin leer.
create view public.wa_chat_list with (security_invoker = true) as
  select c.*,
    (select count(*) from public.wa_messages m
      where m.line = c.line and m.jid = c.jid and not m.from_me and m.at > coalesce(c.read_at, '-infinity'::timestamptz))::int as unread
  from public.wa_chats c;

alter table public.wa_lines enable row level security;
alter table public.wa_chats enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_outbox enable row level security;

create policy wa_lines_read on public.wa_lines for select to authenticated using (public.is_team_member());
create policy wa_lines_command on public.wa_lines for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy wa_chats_read on public.wa_chats for select to authenticated using (public.is_team_member());
create policy wa_chats_mark_read on public.wa_chats for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy wa_messages_read on public.wa_messages for select to authenticated using (public.is_team_member());
create policy wa_outbox_read on public.wa_outbox for select to authenticated using (public.is_team_member());
create policy wa_outbox_send on public.wa_outbox for insert to authenticated
  with check (public.is_team_member() and created_by = public.current_member() and sent_at is null and error is null);

-- El conector actualiza un chat sin pisar datos más nuevos (los mensajes viejos del historial llegan desordenados).
create function public.wa_touch_chat(p_line text, p_jid text, p_phone text, p_name text, p_last_message text, p_last_at timestamptz)
returns void language sql set search_path = public as $$
  insert into public.wa_chats as c (line, jid, phone, name, last_message, last_at)
  values (p_line, p_jid, p_phone, p_name, p_last_message, p_last_at)
  on conflict (line, jid) do update set
    phone = coalesce(excluded.phone, c.phone),
    name = coalesce(excluded.name, c.name),
    last_message = case when excluded.last_at >= coalesce(c.last_at, '-infinity'::timestamptz) then excluded.last_message else c.last_message end,
    last_at = greatest(excluded.last_at, c.last_at)
$$;
revoke execute on function public.wa_touch_chat(text, text, text, text, text, timestamptz) from public, anon, authenticated;
-- El conector usa la service key (rol service_role, que existe en Supabase).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.wa_touch_chat(text, text, text, text, text, timestamptz) to service_role;
  end if;
end $$;
