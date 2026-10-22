-- Las ventas del mes se guardan cada minuto (antes cada 5). Los mensajes automáticos siguen cada 5 minutos.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'auto-transferencias'),
  command := $$
  select net.http_get(
    url := 'https://wayfarer-crm.vercel.app/api/auto/transferencias?parte=mensajes&key=' || (select value from crm_private.secrets where name = 'cron'),
    timeout_milliseconds := 60000
  )
$$
);

select cron.schedule('ventas-cada-minuto', '* * * * *', $$
  select net.http_get(
    url := 'https://wayfarer-crm.vercel.app/api/auto/transferencias?parte=ventas&key=' || (select value from crm_private.secrets where name = 'cron'),
    timeout_milliseconds := 60000
  )
$$);
