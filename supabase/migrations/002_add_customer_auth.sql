-- Migración incremental — login de clientes (magic link) + Mis compras.
-- Correr en el SQL Editor de Supabase (proyecto que ya tiene schema.sql
-- ejecutado).

alter table orders add column if not exists "userId" uuid references auth.users(id);

-- El checkout ahora exige iniciar sesión antes de comprar: solo se puede
-- crear un pedido a nombre de la propia cuenta autenticada.
drop policy if exists "orders_insert_public" on orders;
create policy "orders_insert_own" on orders for insert with check (auth.uid() = "userId");

-- No hace falta tocar la política de lectura (orders_select_public): el
-- panel admin sigue sin Supabase Auth (usa contraseña local) y necesita ver
-- todos los pedidos; el filtro por cliente en "Mis compras" se hace en la
-- consulta del lado del cliente (.eq('userId', ...)), no en RLS.
