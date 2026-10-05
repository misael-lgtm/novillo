-- "Fotito" de cada persona del equipo (un emoji), para mostrar al lado de su nombre en los objetivos.
alter table public.team_members
  add column avatar text check (avatar is null or char_length(avatar) <= 16);
