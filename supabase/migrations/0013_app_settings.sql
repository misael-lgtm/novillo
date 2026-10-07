-- Ajustes generales del CRM (clave → valor). Por ahora: la imagen del festejo de ventas off ("festejo_imagen", PNG en data URL).
create table public.app_settings (
  key        text primary key,
  value      text,
  updated_by text not null default coalesce(public.current_member(), 'sistema'),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated using (public.is_team_member());
create policy app_settings_write on public.app_settings for insert to authenticated with check (public.is_admin());
create policy app_settings_update on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
