-- Clientes de Tiendanube en el CRM.
-- * source = 'tiendanube' y tn_customer_id (el id de Tiendanube) para no duplicar si se importa de nuevo.
-- * Un cliente puede tener solo mail (en la tienda muchos no dejan celular): alcanza con IG, celular o mail.
-- * El mail tampoco se repite (sin distinguir mayúsculas).

alter table public.customers drop constraint customers_source_check;
alter table public.customers add constraint customers_source_check check (source in ('clickup', 'tiendanube'));

alter table public.customers add column tn_customer_id bigint;
create unique index customers_tn_customer_id_key on public.customers (tn_customer_id) where tn_customer_id is not null;

alter table public.customers drop constraint customers_contact_required;
alter table public.customers add constraint customers_contact_required
  check (instagram is not null or phone is not null or email is not null);

update public.customers set email = lower(email) where email <> lower(email);
create unique index customers_email_key on public.customers (lower(email)) where email is not null;
