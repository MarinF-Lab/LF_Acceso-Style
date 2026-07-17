-- Migración incremental — tabla de tipos de producto (filtros del catálogo).
-- Correr en el SQL Editor de Supabase (proyecto que ya tiene schema.sql
-- ejecutado).

create table if not exists product_types (
  id text primary key,
  name text not null,
  "order" integer not null default 0
);

alter table product_types enable row level security;
create policy "product_types_select_public" on product_types for select using (true);
create policy "product_types_write_public" on product_types for all using (true) with check (true);

insert into product_types (id, name, "order") values
  ('polera',   'Polera',   0),
  ('poleron',  'Polerón',  1),
  ('pantalon', 'Pantalón', 2),
  ('chaqueta', 'Chaqueta', 3)
on conflict (id) do nothing;
