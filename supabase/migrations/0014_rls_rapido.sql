-- ═════════════════════════════════════════════════════════════
-- Velocidad: los permisos ("¿es del equipo?", "¿es admin?") se calculaban fila por fila
-- (miles de veces al abrir el tablero). Envueltos en (select …) se calculan una sola vez por consulta.
-- Mismas reglas, solo más rápido. Se reescriben todas las políticas de public que usan esas funciones.
-- ═════════════════════════════════════════════════════════════
do $$
declare
  p record;
  fix constant text := '\m(is_team_member|is_admin|current_member)\(\)';
  q text;
  c text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ fix or coalesce(with_check, '') ~ fix)
      and coalesce(qual, '') !~* '\(\s*select\s+(public\.)?(is_team_member|is_admin|current_member)'
      and coalesce(with_check, '') !~* '\(\s*select\s+(public\.)?(is_team_member|is_admin|current_member)'
  loop
    q := regexp_replace(p.qual, fix, '(select public.\1())', 'g');
    c := regexp_replace(p.with_check, fix, '(select public.\1())', 'g');
    execute format('alter policy %I on %I.%I %s %s', p.policyname, p.schemaname, p.tablename,
      case when q is not null then format('using (%s)', q) else '' end,
      case when c is not null then format('with check (%s)', c) else '' end);
  end loop;
end $$;

-- Índices que faltaban (los avisos de Supabase).
create index if not exists orders_assigned_to_idx on public.orders (assigned_to);
create index if not exists orders_parent_order_id_idx on public.orders (parent_order_id);
create index if not exists tasks_customer_id_idx on public.tasks (customer_id);
