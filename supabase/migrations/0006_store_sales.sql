-- Ventas del mes cargadas en el CRM con canal "Tienda online": el objetivo del equipo las descuenta
-- porque esas mismas ventas ya vienen de Tiendanube (así no se cuentan dos veces).
create function public.month_sales_tienda(p_month date)
returns table (total numeric, ventas bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(o.total), 0), count(*)
  from public.orders o
  where o.stage = 'compro' and o.channel = 'tienda_online'
    and o.stage_changed_at >= (p_month::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and o.stage_changed_at <  ((p_month + interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires')
$$;
