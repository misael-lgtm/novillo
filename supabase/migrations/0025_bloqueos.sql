-- Bloquear gente desde el CRM. El conector aplica el bloqueo en WhatsApp y mantiene la lista de bloqueados de cada teléfono.
create table public.wa_blocked (
  line text not null references public.wa_lines (id),
  jid  text not null,
  primary key (line, jid)
);
alter table public.wa_blocked enable row level security;
create policy wa_blocked_read on public.wa_blocked for select to authenticated using ((select public.is_team_member()));

create table public.wa_block_ops (
  id         bigint generated always as identity primary key,
  line       text not null references public.wa_lines (id),
  jid        text not null,
  op         text not null check (op in ('bloquear', 'desbloquear')),
  created_by text not null default coalesce(public.current_member(), 'sistema'),
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  error      text
);
create index wa_block_ops_pending on public.wa_block_ops (created_at) where done_at is null and error is null;
alter table public.wa_block_ops enable row level security;
create policy wa_block_ops_read on public.wa_block_ops for select to authenticated using ((select public.is_team_member()));
create policy wa_block_ops_send on public.wa_block_ops for insert to authenticated
  with check ((select public.is_team_member()) and created_by = (select public.current_member()) and done_at is null and error is null);

notify pgrst, 'reload schema';
