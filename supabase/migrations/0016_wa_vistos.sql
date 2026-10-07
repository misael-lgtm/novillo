-- Tildes de WhatsApp en los mensajes que mandamos: 2 = enviado (✓), 3 = le llegó (✓✓ gris), 4 = lo vio (✓✓ celeste), 5 = escuchó el audio.
alter table public.wa_messages add column status smallint;

-- El conector marca el estado sin bajarlo nunca (los avisos pueden llegar desordenados).
create function public.wa_mark_status(p_line text, p_ids text[], p_status smallint)
returns void language sql set search_path = public as $$
  update public.wa_messages set status = greatest(coalesce(status, 0), p_status)
  where line = p_line and id = any (p_ids) and from_me and coalesce(status, 0) < p_status
$$;
revoke execute on function public.wa_mark_status(text, text[], smallint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.wa_mark_status(text, text[], smallint) to service_role;
  end if;
end $$;
