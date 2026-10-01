-- ═════════════════════════════════════════════════════════════
-- Importación del historial de ClickUp ("CRM - Ventas - OFFLINE").
--
-- Los pedidos viejos de ClickUp no tienen monto, pago, dirección ni seguimiento.
-- Para poder traerlos con su estado, los marcados con source = 'clickup' quedan
-- exentos de esos datos SOLO en las etapas a las que llegaron importados
-- (Esperando pago / Entregado). Si alguien los mueve a otra etapa, se exige todo
-- como a cualquier pedido.
-- ═════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists source     text check (source in ('clickup')),
  add column if not exists source_ref text,    -- ej. "VN-11782" (id de ClickUp)
  add column if not exists source_stage text;  -- etapa con la que llegó importado

alter table public.customers
  add column if not exists source     text check (source in ('clickup'));

create unique index if not exists orders_source_ref_key on public.orders (source, source_ref) where source is not null;

alter table public.orders drop constraint orders_total_required;
alter table public.orders add constraint orders_total_required check (
  stage in ('consulta', 'cancelado') or total is not null or kind = 'cambio'
  or (source = 'clickup' and stage = source_stage and stage in ('esperando_pago', 'entregado')));

alter table public.orders drop constraint orders_payment_required;
alter table public.orders add constraint orders_payment_required check (
  stage not in ('pagado', 'enviado', 'entregado') or payment_method is not null
  or (kind = 'cambio' and total is null)
  or (source = 'clickup' and stage = source_stage and stage = 'entregado'));

alter table public.orders drop constraint orders_address_required;
alter table public.orders add constraint orders_address_required check (
  stage not in ('pagado', 'enviado', 'entregado') or nullif(trim(shipping_address), '') is not null
  or (source = 'clickup' and stage = source_stage and stage = 'entregado'));

alter table public.orders drop constraint orders_shipping_required;
alter table public.orders add constraint orders_shipping_required check (
  stage not in ('enviado', 'entregado') or (carrier is not null and nullif(trim(tracking_code), '') is not null)
  or (source = 'clickup' and stage = source_stage and stage = 'entregado'));
