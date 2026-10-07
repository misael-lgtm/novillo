-- ═════════════════════════════════════════════════════════════
-- WhatsApp: fotos (mandar desde el CRM y ver las que llegan) y etiquetas de WhatsApp Business.
-- ═════════════════════════════════════════════════════════════

-- ── Fotos ─────────────────────────────────────────────────────
-- Se guardan en el bucket privado "wa-media": out/<teléfono>/... las que manda el CRM, in/<teléfono>/... las que llegan.
alter table public.wa_outbox add column media_path text check (media_path like 'out/%'), add column media_type text;
alter table public.wa_outbox drop constraint wa_outbox_body_check;
alter table public.wa_outbox alter column body set default '';
alter table public.wa_outbox add constraint wa_outbox_body_check check (length(trim(body)) > 0 or media_path is not null);
alter table public.wa_messages add column media_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wa-media', 'wa-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy wa_media_read on storage.objects for select to authenticated
  using (bucket_id = 'wa-media' and public.is_team_member());
create policy wa_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'wa-media' and (storage.foldername(name))[1] = 'out' and public.is_team_member());

-- ── Etiquetas ─────────────────────────────────────────────────
-- Las de cada teléfono (las crea WhatsApp Business: "Nuevo cliente", "Pagado", etc.).
create table public.wa_labels (
  line    text not null references public.wa_lines (id),
  id      text not null,
  name    text not null,
  color   int,
  deleted boolean not null default false,
  primary key (line, id)
);

create table public.wa_chat_labels (
  line     text not null references public.wa_lines (id),
  jid      text not null,
  label_id text not null,
  primary key (line, jid, label_id)
);

-- Pedidos del CRM de poner/sacar una etiqueta; el conector los aplica en WhatsApp.
create table public.wa_label_ops (
  id         bigint generated always as identity primary key,
  line       text not null references public.wa_lines (id),
  jid        text not null,
  label_id   text not null,
  op         text not null check (op in ('poner', 'sacar')),
  created_by text not null default coalesce(public.current_member(), 'sistema'),
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  error      text
);
create index wa_label_ops_pending on public.wa_label_ops (line, created_at) where done_at is null and error is null;

alter table public.wa_labels enable row level security;
alter table public.wa_chat_labels enable row level security;
alter table public.wa_label_ops enable row level security;
create policy wa_labels_read on public.wa_labels for select to authenticated using (public.is_team_member());
create policy wa_chat_labels_read on public.wa_chat_labels for select to authenticated using (public.is_team_member());
create policy wa_label_ops_read on public.wa_label_ops for select to authenticated using (public.is_team_member());
create policy wa_label_ops_send on public.wa_label_ops for insert to authenticated
  with check (public.is_team_member() and created_by = public.current_member() and done_at is null and error is null);

-- La lista de chats ahora trae sus etiquetas.
create or replace view public.wa_chat_list with (security_invoker = true) as
  select c.*,
    (select count(*) from public.wa_messages m
      where m.line = c.line and m.jid = c.jid and not m.from_me and m.at > coalesce(c.read_at, '-infinity'::timestamptz))::int as unread,
    coalesce((select array_agg(l.label_id order by l.label_id) from public.wa_chat_labels l where l.line = c.line and l.jid = c.jid), '{}') as labels
  from public.wa_chats c;

-- ── Nombres ───────────────────────────────────────────────────
-- El nombre que ya tiene el chat (el agendado en el celu, que trae el conector) no lo pisa el que se puso la persona.
create or replace function public.wa_touch_chat(p_line text, p_jid text, p_phone text, p_name text, p_last_message text, p_last_at timestamptz)
returns void language sql set search_path = public as $$
  insert into public.wa_chats as c (line, jid, phone, name, last_message, last_at)
  values (p_line, p_jid, p_phone, p_name, p_last_message, p_last_at)
  on conflict (line, jid) do update set
    phone = coalesce(excluded.phone, c.phone),
    name = coalesce(c.name, excluded.name),
    last_message = case when excluded.last_at >= coalesce(c.last_at, '-infinity'::timestamptz) then excluded.last_message else c.last_message end,
    last_at = greatest(excluded.last_at, c.last_at)
$$;
