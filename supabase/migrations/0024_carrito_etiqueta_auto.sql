-- Cuando sale el mensaje de carrito abandonado (dice "carrito armado"), el chat se etiqueta solo como "Carrito abandonado"
-- en ese teléfono (si la etiqueta existe en WhatsApp Business). El conector aplica la etiqueta en WhatsApp.
create or replace function public.wa_outbox_tag_cart() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if new.body !~* 'carrito armado' then return new; end if;
  select id into v_label from public.wa_labels
    where line = new.line and not deleted and lower(name) ~ '^carrito\s+abandonado$'
    order by id limit 1;
  if v_label is null then return new; end if;
  if exists (select 1 from public.wa_chat_labels where line = new.line and jid = new.jid and label_id = v_label)
     or exists (select 1 from public.wa_label_ops where line = new.line and jid = new.jid and label_id = v_label and op = 'poner' and done_at is null and error is null)
  then return new; end if;
  insert into public.wa_label_ops (line, jid, label_id, op, created_by) values (new.line, new.jid, v_label, 'poner', 'automático');
  return new;
end $$;

create trigger wa_outbox_tag_cart after insert on public.wa_outbox
  for each row execute function public.wa_outbox_tag_cart();
