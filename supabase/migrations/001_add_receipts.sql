-- Migración incremental — comprobante de transferencia subido desde la página.
-- Correr en el SQL Editor de Supabase (proyecto que ya tiene schema.sql
-- ejecutado). No vuelvas a correr schema.sql completo: ya creaste esas
-- políticas antes y create policy fallaría por duplicado.

alter table orders add column if not exists "receiptUrl" text default '';

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

create policy "receipts_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'receipts');

create policy "receipts_bucket_write_public"
  on storage.objects for insert
  with check (bucket_id = 'receipts');
