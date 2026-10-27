-- Actualización parcial de las ventas del mes: el reloj trae solo los pedidos que cambiaron desde la última vez
-- y acá se reemplazan en lo guardado (se sacan los de esos ids y se agregan los nuevos). Una vez por hora se rehace todo.
create or replace function public.merge_store_snapshot(p_key text, p_month date, p_seen bigint[], p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v_data jsonb;
begin
  if not public.auto_check_key(p_key) then raise exception 'clave inválida'; end if;
  select data into v_data from public.store_sales_snapshot where month = p_month for update;
  if v_data is null then
    insert into public.store_sales_snapshot (month, data, updated_at) values (p_month, p_data, now());
    return;
  end if;
  foreach k in array array['off', 'local', 'checks', 'localChecks'] loop
    v_data := jsonb_set(
      v_data, array[k],
      coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(v_data -> k, '[]')) e
                where coalesce((e ->> 'id')::bigint, 0) <> all (p_seen)), '[]'::jsonb)
      || coalesce(p_data -> k, '[]'::jsonb),
      true);
  end loop;
  update public.store_sales_snapshot set data = v_data, updated_at = now() where month = p_month;
end $$;
revoke execute on function public.merge_store_snapshot(text, date, bigint[], jsonb) from public;
grant execute on function public.merge_store_snapshot(text, date, bigint[], jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

-- Cuándo se guardaron por última vez las ventas de ese mes (para saber desde cuándo leer en la parcial).
create or replace function public.store_snapshot_updated_at(p_key text, p_month date) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.auto_check_key(p_key) then raise exception 'clave inválida'; end if;
  return (select updated_at from public.store_sales_snapshot where month = p_month);
end $$;
revoke execute on function public.store_snapshot_updated_at(text, date) from public;
grant execute on function public.store_snapshot_updated_at(text, date) to anon, authenticated;
notify pgrst, 'reload schema';
