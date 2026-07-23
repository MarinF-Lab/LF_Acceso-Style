-- Galería de fotos por producto, sub-categorías por estación, y Mercado Pago
-- por producto + link general con reconciliación manual.

alter table products add column if not exists images jsonb not null default '[]'::jsonb;
alter table products add column if not exists season text;
alter table products add column if not exists "mpLink" text;

create table if not exists seasons (
  id text primary key,
  name text not null,
  "order" integer not null default 0
);

alter table seasons enable row level security;
create policy "seasons_select_public" on seasons for select using (true);
create policy "seasons_write_public" on seasons for all using (true) with check (true);

insert into seasons (id, name, "order") values
  ('verano',    'Verano',    0),
  ('otono',     'Otoño',     1),
  ('invierno',  'Invierno',  2),
  ('primavera', 'Primavera', 3)
on conflict (id) do nothing;

alter table orders add column if not exists "mpLinkType" text;
