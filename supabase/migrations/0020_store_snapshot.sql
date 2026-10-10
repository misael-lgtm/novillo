-- Ventas del mes de Tiendanube guardadas en la base: el reloj (cada 5 min) las trae frescas y el CRM las lee de acá.
-- Así el objetivo queda al día y las páginas no esperan a Tiendanube.
create table public.store_sales_snapshot (
  month      date primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.store_sales_snapshot enable row level security;
create policy store_snapshot_read on public.store_sales_snapshot for select to authenticated using ((select public.is_team_member()));

create function public.save_store_snapshot(p_key text, p_month date, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.auto_check_key(p_key) then raise exception 'clave inválida'; end if;
  insert into public.store_sales_snapshot (month, data, updated_at) values (p_month, p_data, now())
  on conflict (month) do update set data = excluded.data, updated_at = now();
end $$;
revoke execute on function public.save_store_snapshot(text, date, jsonb) from public;
grant execute on function public.save_store_snapshot(text, date, jsonb) to anon, authenticated;
