-- ═════════════════════════════════════════════════════════════
-- Objetivos de venta por mes: uno del equipo y uno por vendedor.
-- Los carga el admin a mano; el avance sale de los pedidos que pasaron a "Compró" en el mes.
-- ═════════════════════════════════════════════════════════════

create table public.monthly_goals (
  month      date not null check (extract(day from month) = 1),   -- primer día del mes
  scope      text not null,   -- 'equipo' o el email del vendedor (team_members.email)
  amount     numeric(14, 2) not null check (amount > 0),
  updated_by text not null default coalesce(public.current_member(), 'sistema'),
  updated_at timestamptz not null default now(),
  primary key (month, scope)
);

alter table public.monthly_goals enable row level security;
create policy goals_read   on public.monthly_goals for select to authenticated using (public.is_team_member());
create policy goals_insert on public.monthly_goals for insert to authenticated with check (public.is_admin());
create policy goals_update on public.monthly_goals for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Un objetivo es configuración, no un registro: el admin lo puede sacar.
create policy goals_delete on public.monthly_goals for delete to authenticated using (public.is_admin());

-- Ventas del mes (hora argentina) por vendedor: pedidos que están en Compró y llegaron ahí ese mes.
create function public.month_sales(p_month date)
returns table (member text, total numeric, ventas bigint)
language sql stable security invoker set search_path = public as $$
  select o.assigned_to, coalesce(sum(o.total), 0), count(*)
  from public.orders o
  where o.stage = 'compro'
    and o.stage_changed_at >= (p_month::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and o.stage_changed_at <  ((p_month + interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires')
  group by o.assigned_to
$$;
