-- Reloj: cada 5 minutos llama al CRM. Solo en Supabase (en la base de prueba local no hay pg_cron).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('auto-transferencias', '*/5 * * * *', $job$
      select net.http_get(
        url := 'https://wayfarer-crm.vercel.app/api/auto/transferencias?key=' || (select value from crm_private.secrets where name = 'cron'),
        timeout_milliseconds := 30000
      )
    $job$);
  end if;
end $$;
