-- Avisos en vivo (Supabase Realtime) en vez de que cada pantalla pregunte cada pocos segundos:
-- así casi no se usa el servidor del CRM (Vercel) y alcanza el plan gratis.
-- Los chats escuchan wa_messages / wa_chats / wa_chat_labels. Para las ventas hay una tabla chiquita (live_ping)
-- que se toca cada vez que se guardan, así no viaja todo el resumen del mes en cada aviso.
create table if not exists public.live_ping (
  topic text primary key,
  at    timestamptz not null default now()
);
alter table public.live_ping enable row level security;
create policy live_ping_read on public.live_ping for select to authenticated using ((select public.is_team_member()));
insert into public.live_ping (topic) values ('ventas') on conflict do nothing;

create or replace function public.store_snapshot_ping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.live_ping (topic, at) values ('ventas', now()) on conflict (topic) do update set at = now();
  return null;
end $$;
drop trigger if exists store_snapshot_ping on public.store_sales_snapshot;
create trigger store_snapshot_ping after insert or update on public.store_sales_snapshot
  for each statement execute function public.store_snapshot_ping();

alter publication supabase_realtime add table public.wa_messages, public.wa_chats, public.wa_chat_labels, public.live_ping;
