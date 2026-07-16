-- ============================================================================
-- LF Acceso Style — Esquema de Supabase (reemplaza Firestore + Storage)
-- ============================================================================
-- Cómo usar:
--   1. Crea un proyecto en https://supabase.com (plan gratis, sin tarjeta).
--   2. Ve a SQL Editor → pega este archivo completo → Run.
--   3. Ve a Storage → confirma que el bucket "products" quedó creado y público.
--   4. Copia Project URL y anon public key (Settings → API) a supabase-config.js.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PRODUCTOS
-- ----------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  type text,
  price numeric not null default 0,
  tag text,
  description text,
  "imageUrl" text default '',
  colors jsonb not null default '[]'::jsonb,
  "sizeStock" jsonb not null default '{}'::jsonb,
  stock integer not null default 0,
  "createdAt" bigint,
  "updatedAt" bigint
);

alter table products enable row level security;

-- Lectura pública. Escritura abierta: el panel admin usa una contraseña
-- local (no Supabase Auth) — mismo trade-off ya documentado en el proyecto
-- original de Firebase. Para blindar esto en el futuro, migrar el login del
-- admin a Supabase Auth y reemplazar "true" por "auth.role() = 'authenticated'".
create policy "products_select_public" on products for select using (true);
create policy "products_write_public" on products for all using (true) with check (true);

-- ----------------------------------------------------------------------------
-- CATEGORÍAS
-- ----------------------------------------------------------------------------
create table if not exists categories (
  id text primary key,
  name text not null,
  description text,
  "order" integer not null default 0,
  hidden boolean not null default false
);

alter table categories enable row level security;
create policy "categories_select_public" on categories for select using (true);
create policy "categories_write_public" on categories for all using (true) with check (true);

insert into categories (id, name, description, "order", hidden) values
  ('hombre',    'Hombre',    'Poleras, polerones, cargos y más.', 0, false),
  ('unisex',    'Unisex',    'Oversize y básicos para todes.',    1, false),
  ('novedades', 'Novedades', 'Lo último que llegó a la tienda.',  2, false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- PEDIDOS (orders)
-- ----------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  "orderNumber" text,
  "customerName" text,
  "customerPhone" text,
  "customerEmail" text,
  address text,
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  "paymentMethod" text,
  status text not null default 'nuevo',
  "createdAt" bigint,
  "updatedAt" bigint
);

alter table orders enable row level security;

-- El checkout público solo necesita crear pedidos; el admin lee/actualiza/
-- elimina desde el panel con contraseña local. Igual que en Firestore, queda
-- abierto por no haber Supabase Auth todavía (ver nota de seguridad arriba).
create policy "orders_select_public" on orders for select using (true);
create policy "orders_insert_public" on orders for insert with check (true);
create policy "orders_update_public" on orders for update using (true) with check (true);
create policy "orders_delete_public" on orders for delete using (true);

-- ----------------------------------------------------------------------------
-- CONFIGURACIÓN (settings/store y settings/content de Firestore)
-- Se guarda como un blob jsonb por fila para no tener que declarar una
-- columna por cada campo de configuración/texto editable del sitio.
-- ----------------------------------------------------------------------------
create table if not exists settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

alter table settings enable row level security;
create policy "settings_select_public" on settings for select using (true);
create policy "settings_write_public" on settings for all using (true) with check (true);

insert into settings (id, data) values
  ('store', '{}'::jsonb),
  ('content', '{}'::jsonb)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- STORAGE — bucket para imágenes de productos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

-- Lectura pública, escritura abierta (mismo trade-off que storage.rules en
-- Firebase: el admin sube imágenes sin autenticación real).
create policy "products_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'products');

create policy "products_bucket_write_public"
  on storage.objects for insert
  with check (bucket_id = 'products');

create policy "products_bucket_update_public"
  on storage.objects for update
  using (bucket_id = 'products');

create policy "products_bucket_delete_public"
  on storage.objects for delete
  using (bucket_id = 'products');
