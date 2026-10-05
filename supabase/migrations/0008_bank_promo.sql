-- Promo bancaria con la que pagó (opcional), además del medio de pago.
alter table public.orders
  add column bank_promo text check (bank_promo in ('bna', 'provincia', 'naranja', 'bbva', 'galicia'));
