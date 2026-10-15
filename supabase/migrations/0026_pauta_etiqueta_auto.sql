-- Los chats que entran por un anuncio (from_ad_at) se etiquetan solos con la etiqueta de pauta de ese teléfono
-- (la primera cuyo nombre diga "pauta"). Cuando se crea esa etiqueta en WhatsApp Business, se etiquetan los
-- chats de anuncios de los últimos 30 días. El conector aplica las etiquetas en el celu.
create or replace function public.wa_pauta_label(p_line text) returns text
language sql stable security definer set search_path = public as $$
  select id from public.wa_labels where line = p_line and not deleted and name ~* 'pauta' order by (lower(name) = 'pauta') desc, id limit 1
$$;

create or replace function public.wa_queue_label(p_line text, p_jid text, p_label text) returns void
language sql security definer set search_path = public as $$
  insert into public.wa_label_ops (line, jid, label_id, op, created_by)
  select p_line, p_jid, p_label, 'poner', 'automático'
  where p_label is not null
    and not exists (select 1 from public.wa_chat_labels where line = p_line and jid = p_jid and label_id = p_label)
    and not exists (select 1 from public.wa_label_ops where line = p_line and jid = p_jid and label_id = p_label and op = 'poner' and done_at is null and error is null)
$$;

create or replace function public.wa_chats_tag_pauta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.from_ad_at is not null and (tg_op = 'INSERT' or old.from_ad_at is distinct from new.from_ad_at) then
    perform public.wa_queue_label(new.line, new.jid, public.wa_pauta_label(new.line));
  end if;
  return new;
end $$;
create trigger wa_chats_tag_pauta after insert or update of from_ad_at on public.wa_chats
  for each row execute function public.wa_chats_tag_pauta();

create or replace function public.wa_labels_backfill_pauta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.deleted and new.name ~* 'pauta' and new.id = public.wa_pauta_label(new.line)
     and (tg_op = 'INSERT' or old.deleted or old.name !~* 'pauta') then
    perform public.wa_queue_label(c.line, c.jid, new.id)
      from public.wa_chats c where c.line = new.line and c.from_ad_at > now() - interval '30 days';
  end if;
  return new;
end $$;
create trigger wa_labels_backfill_pauta after insert or update on public.wa_labels
  for each row execute function public.wa_labels_backfill_pauta();

revoke execute on function public.wa_pauta_label(text) from public, anon;
revoke execute on function public.wa_queue_label(text, text, text) from public, anon, authenticated;
