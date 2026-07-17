-- Migración incremental — datos de envío para Starken (RUT, región, comuna,
-- domicilio o sucursal). Correr en el SQL Editor de Supabase (proyecto que
-- ya tiene schema.sql ejecutado).

alter table orders add column if not exists "customerRut" text;
alter table orders add column if not exists region text;
alter table orders add column if not exists comuna text;
alter table orders add column if not exists "shippingType" text;
alter table orders add column if not exists "shippingDetail" text;

-- Habilita Realtime en la tabla orders para que el panel admin se actualice
-- solo cuando llega un pedido nuevo (ver "Notificaciones de nuevos pedidos"
-- en supabase/README.md).
alter publication supabase_realtime add table orders;
