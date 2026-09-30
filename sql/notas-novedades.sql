-- Notas de la empresa: el cuadro "📝 Notas" de Novedades del día.
-- Correr una vez en Supabase → SQL Editor.

create table if not exists notas_novedades (
  id text primary key,
  texto text not null,
  hecha boolean default false,
  created_at timestamptz default now()
);

-- Igual que el resto de las tablas de la app: acceso con la clave pública.
alter table notas_novedades disable row level security;
