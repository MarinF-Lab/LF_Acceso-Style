-- Códigos de descuento únicos por usuario, de un solo uso, válidos a partir
-- de la segunda compra (la validación de "segunda compra" se hace en el
-- checkout contando los pedidos previos del usuario).
create table if not exists discount_codes (
  code text primary key,
  "userId" uuid references auth.users(id),
  percent numeric not null default 10,
  used boolean not null default false,
  "createdAt" bigint
);

alter table discount_codes enable row level security;

-- El cliente solo puede ver/crear/actualizar su propio código.
create policy "discount_codes_select_own" on discount_codes
  for select using (auth.uid() = "userId");
create policy "discount_codes_insert_own" on discount_codes
  for insert with check (auth.uid() = "userId");
create policy "discount_codes_update_own" on discount_codes
  for update using (auth.uid() = "userId") with check (auth.uid() = "userId");

-- El pedido guarda qué código se usó y cuánto se descontó.
alter table orders add column if not exists "discountCode" text;
alter table orders add column if not exists "discountAmount" numeric;
