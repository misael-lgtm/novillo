-- Objetivos de los locales (Palermo, Güemes) y de cada vendedor en el local, por mes.
-- Se cargan como cantidad de ventas y ticket promedio; la facturación objetivo es ventas × ticket.
create table public.local_goals (
  month       date not null check (extract(day from month) = 1),
  local       text not null check (local in ('palermo', 'guemes')),
  seller      text not null default '',   -- '' = el local entero; si no, el vendedor (mail del equipo o nombre)
  sales_count int check (sales_count > 0),
  avg_ticket  numeric(14, 2) check (avg_ticket > 0),
  updated_by  text not null default coalesce(public.current_member(), 'sistema'),
  updated_at  timestamptz not null default now(),
  primary key (month, local, seller)
);
alter table public.local_goals enable row level security;
create policy local_goals_read on public.local_goals for select to authenticated using ((select public.is_team_member()));
create policy local_goals_insert on public.local_goals for insert to authenticated with check ((select public.is_admin()));
create policy local_goals_update on public.local_goals for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy local_goals_delete on public.local_goals for delete to authenticated using ((select public.is_admin()));
