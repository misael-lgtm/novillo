-- ═════════════════════════════════════════════════════════════
-- Etapas = los estados de ClickUp ("CRM - Ventas - OFFLINE"), con "cerrado" → "Compró".
--
-- Reglas por etapa (mismas que STAGE_REQUIREMENTS en src/lib/rules.ts):
--   * Esperando pago: monto.
--   * Compró: monto y medio de pago (un cambio sin cargo no lleva ni uno ni otro).
--   * Sin causa: motivo.
--   * Las etapas de seguimiento no piden nada extra.
-- El historial importado de ClickUp sigue exento mientras esté en la etapa con la que llegó.
-- ═════════════════════════════════════════════════════════════

-- 1) Sacar las reglas que nombran etapas viejas
alter table public.orders
  drop constraint orders_stage_check,
  drop constraint orders_total_required,
  drop constraint orders_payment_required,
  drop constraint orders_address_required,
  drop constraint orders_shipping_required,
  drop constraint orders_cancel_reason_required;

-- 2) Pasar los datos a las etapas nuevas
create function pg_temp.new_stage(old text) returns text language sql immutable as $$
  select case old
    when 'consulta'  then 'primer_contacto'
    when 'pagado'    then 'compro'
    when 'enviado'   then 'compro'
    when 'entregado' then 'compro'
    when 'cancelado' then 'sin_causa'
    else old end
$$;

-- Estado exacto que tenían en ClickUp los pedidos importados (quedó anotado en su nota)
create function pg_temp.clickup_status(order_id uuid) returns text language sql stable as $$
  select replace(substring(a.message from 'estado «([^»]+)»'), ' ', '_')
  from public.activity_log a
  where a.order_id = $1 and a.kind = 'note' and a.message like 'Importado de ClickUp%'
  order by a.id limit 1
$$;

alter table public.orders disable trigger orders_log;   -- es un cambio de nombres, no algo que hizo una persona
alter table public.orders disable trigger orders_touch;
alter table public.orders disable trigger orders_stage_at;

update public.orders o set
  stage = coalesce(case when o.source = 'clickup' and o.stage = 'consulta' then pg_temp.clickup_status(o.id) end,
                   pg_temp.new_stage(o.stage)),
  source_stage = case when o.source_stage is null then null
                      else coalesce(case when o.source = 'clickup' and o.source_stage = 'consulta' then pg_temp.clickup_status(o.id) end,
                                    pg_temp.new_stage(o.source_stage)) end;

-- "mas adelante" en ClickUp no lleva tilde; el id es mas_adelante (ok). Cualquier estado raro queda en Primer contacto.
update public.orders set stage = 'primer_contacto'
where stage not in ('enviar_nuevamente', 'primer_contacto', 'interesado', 'avanzado', 'esperando_pago', 'promos_bancarias',
                    'lista_de_espera', 'mas_adelante', 'promo_del_finde', 'sin_causa', 'hablar_de_nuevo', 'compro');
update public.orders set source_stage = stage where source = 'clickup' and source_stage is distinct from stage
  and source_stage not in ('enviar_nuevamente', 'primer_contacto', 'interesado', 'avanzado', 'esperando_pago', 'promos_bancarias',
                           'lista_de_espera', 'mas_adelante', 'promo_del_finde', 'sin_causa', 'hablar_de_nuevo', 'compro');

alter table public.orders enable trigger orders_log;
alter table public.orders enable trigger orders_touch;
alter table public.orders enable trigger orders_stage_at;

-- Tareas automáticas: misma etapa que su pedido
update public.tasks t set auto_stage = o.stage
from public.orders o where t.order_id = o.id and t.auto_stage is not null and t.auto_stage <> o.stage;

-- 3) Reglas nuevas
alter table public.orders alter column stage set default 'primer_contacto';

alter table public.orders
  add constraint orders_stage_check check (stage in (
    'enviar_nuevamente', 'primer_contacto', 'interesado', 'avanzado', 'esperando_pago', 'promos_bancarias',
    'lista_de_espera', 'mas_adelante', 'promo_del_finde', 'sin_causa', 'hablar_de_nuevo', 'compro')),
  add constraint orders_total_required check (
    stage not in ('esperando_pago', 'compro') or total is not null or kind = 'cambio'
    or (source = 'clickup' and stage = source_stage)),
  add constraint orders_payment_required check (
    stage <> 'compro' or payment_method is not null
    or (kind = 'cambio' and total is null)
    or (source = 'clickup' and stage = source_stage)),
  add constraint orders_cancel_reason_required check (
    stage <> 'sin_causa' or nullif(trim(cancel_reason), '') is not null);
