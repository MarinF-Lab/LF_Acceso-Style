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
  season text,
  price numeric not null default 0,
  tag text,
  description text,
  "imageUrl" text default '', -- portada = images[0], se mantiene por compatibilidad
  images jsonb not null default '[]'::jsonb, -- galería completa (hasta 6 fotos)
  colors jsonb not null default '[]'::jsonb,
  "sizeStock" jsonb not null default '{}'::jsonb,
  stock integer not null default 0,
  "mpLink" text, -- link de pago de Mercado Pago para este producto (monto fijo)
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
-- TIPOS DE PRODUCTO (usados como filtros del catálogo, ej. Polera/Chaqueta)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- ESTACIONES (sub-categorías por temporada, filtro adicional del catálogo)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- PEDIDOS (orders)
-- ----------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  "orderNumber" text,
  "userId" uuid references auth.users(id),
  "customerName" text,
  "customerPhone" text,
  "customerEmail" text,
  "customerRut" text,
  region text,
  comuna text,
  "shippingType" text, -- 'domicilio' | 'sucursal'
  "shippingDetail" text, -- calle+número+descripción, o el nombre de la sucursal Starken
  address text, -- formato antiguo, se mantiene solo para pedidos ya creados
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  "paymentMethod" text,
  "mpLinkType" text, -- 'individual' (link fijo del producto) | 'general' (monto manual) — solo si paymentMethod='mercadopago'
  "receiptUrl" text default '',
  "discountCode" text,
  "discountAmount" numeric,
  status text not null default 'nuevo',
  "createdAt" bigint,
  "updatedAt" bigint
);

alter table orders enable row level security;

-- Lectura/actualización/eliminación: el admin lee/actualiza/elimina desde el
-- panel con contraseña local (no Supabase Auth), así que quedan abiertas por
-- el mismo motivo ya documentado arriba (NOTA DE SEGURIDAD: para blindar esto,
-- el admin debería migrar también a Supabase Auth con un custom claim).
-- Creación: el checkout ahora exige que el cliente inicie sesión (magic link),
-- así que solo se puede crear un pedido a nombre de la propia cuenta.
create policy "orders_select_public" on orders for select using (true);
create policy "orders_insert_own" on orders for insert with check (auth.uid() = "userId");
create policy "orders_update_public" on orders for update using (true) with check (true);
create policy "orders_delete_public" on orders for delete using (true);

-- Habilita Realtime en orders para que el panel admin se refresque y
-- muestre una notificación apenas llega un pedido nuevo.
alter publication supabase_realtime add table orders;

-- ----------------------------------------------------------------------------
-- CÓDIGOS DE DESCUENTO (únicos por usuario, un solo uso, desde la 2ª compra)
-- ----------------------------------------------------------------------------
create table if not exists discount_codes (
  code text primary key,
  "userId" uuid references auth.users(id),
  percent numeric not null default 10,
  used boolean not null default false,
  "createdAt" bigint
);

alter table discount_codes enable row level security;
create policy "discount_codes_select_own" on discount_codes
  for select using (auth.uid() = "userId");
create policy "discount_codes_insert_own" on discount_codes
  for insert with check (auth.uid() = "userId");
create policy "discount_codes_update_own" on discount_codes
  for update using (auth.uid() = "userId") with check (auth.uid() = "userId");

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

-- ----------------------------------------------------------------------------
-- STORAGE — bucket para comprobantes de transferencia
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Lectura pública (el admin necesita poder ver el comprobante desde el link
-- guardado en el pedido), escritura abierta (el cliente sube sin autenticarse
-- desde el checkout — mismo trade-off documentado arriba).
create policy "receipts_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'receipts');

create policy "receipts_bucket_write_public"
  on storage.objects for insert
  with check (bucket_id = 'receipts');
