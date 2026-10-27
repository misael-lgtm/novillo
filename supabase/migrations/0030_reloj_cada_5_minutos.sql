-- Vercel pausó el CRM por consumo (la actualización de ventas cada minuto lo hacía trabajar todo el día).
-- Vuelve a haber un solo reloj, cada 5 minutos, que hace todo: ventas del mes, transferencias y carritos.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'auto-transferencias'),
  command := $$
  select net.http_get(
    url := 'https://wayfarer-crm.vercel.app/api/auto/transferencias?key=' || (select value from crm_private.secrets where name = 'cron'),
    timeout_milliseconds := 60000
  )
$$,
  active := true
);
select cron.unschedule('ventas-cada-minuto');
