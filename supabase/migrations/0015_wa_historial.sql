-- Pedidos del CRM de "traer mensajes anteriores" de un chat: el conector se los pide al celu (como WhatsApp Web al subir).
create table public.wa_history_requests (
  id         bigint generated always as identity primary key,
  line       text not null references public.wa_lines (id),
  jid        text not null,
  created_by text not null default coalesce(public.current_member(), 'sistema'),
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  error      text
);
create index wa_history_requests_pending on public.wa_history_requests (line, created_at) where done_at is null and error is null;
alter table public.wa_history_requests enable row level security;
create policy wa_history_read on public.wa_history_requests for select to authenticated using ((select public.is_team_member()));
create policy wa_history_ask on public.wa_history_requests for insert to authenticated
  with check ((select public.is_team_member()) and created_by = (select public.current_member()) and done_at is null and error is null);
