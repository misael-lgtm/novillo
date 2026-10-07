-- ═════════════════════════════════════════════════════════════
-- WhatsApp: respuestas rápidas (atajo "/"), stickers y audios/videos/documentos que llegan.
-- ═════════════════════════════════════════════════════════════

-- Respuestas rápidas: las mismas para los 3 teléfonos. Se escriben "/atajo" en el chat.
create table public.wa_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  shortcut   text not null unique check (shortcut ~ '^[a-z0-9áéíóúñü_-]{1,30}$'),
  body       text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_by text not null default coalesce(public.current_member(), 'sistema'),
  updated_at timestamptz not null default now()
);
alter table public.wa_quick_replies enable row level security;
create policy wa_quick_replies_read on public.wa_quick_replies for select to authenticated using (public.is_team_member());
create policy wa_quick_replies_insert on public.wa_quick_replies for insert to authenticated with check (public.is_team_member());
create policy wa_quick_replies_update on public.wa_quick_replies for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy wa_quick_replies_delete on public.wa_quick_replies for delete to authenticated using (public.is_team_member());

-- Stickers: se pueden reenviar los que ya llegaron (están en in/…).
alter table public.wa_outbox add column media_kind text not null default 'foto' check (media_kind in ('foto', 'sticker'));
alter table public.wa_outbox drop constraint wa_outbox_media_path_check;
alter table public.wa_outbox add constraint wa_outbox_media_path_check check (media_path ~ '^(in|out)/');

-- El bucket ahora también guarda stickers, audios, videos y documentos que llegan (hasta 16 MB, como WhatsApp).
update storage.buckets
set file_size_limit = 16777216,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac',
                               'video/mp4', 'video/3gpp', 'application/pdf', 'application/octet-stream']
where id = 'wa-media';
