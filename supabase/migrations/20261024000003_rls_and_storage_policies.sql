-- =============================================================================
-- BERCALI STORE — PAINEL ADMINISTRATIVO
-- Migração 003: Row Level Security (RLS) e Políticas do Supabase Storage
-- =============================================================================

-- Ativar RLS em todas as tabelas
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_media enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.customer_notes enable row level security;
alter table public.customer_tags enable row level security;
alter table public.customer_tag_assignments enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.marketing_settings enable row level security;
alter table public.store_settings enable row level security;
alter table public.activity_logs enable row level security;

-- -----------------------------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.has_any_staff_role(array['super_admin', 'admin'])
  );

drop policy if exists "profiles_update_super_admin_or_self_basic" on public.profiles;
create policy "profiles_update_super_admin_or_self_basic"
  on public.profiles for update
  to authenticated
  using (
    public.has_any_staff_role(array['super_admin'])
    or (id = auth.uid() and is_active = true)
  )
  with check (
    public.has_any_staff_role(array['super_admin'])
    or (id = auth.uid() and is_active = true)
  );

drop policy if exists "profiles_insert_super_admin" on public.profiles;
create policy "profiles_insert_super_admin"
  on public.profiles for insert
  to authenticated
  with check (public.has_any_staff_role(array['super_admin']));

-- -----------------------------------------------------------------------------
-- 2. categories
-- -----------------------------------------------------------------------------
drop policy if exists "categories_select_staff" on public.categories;
create policy "categories_select_staff"
  on public.categories for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'product_manager', 'order_manager', 'marketing_manager', 'crm_agent'
    ])
  );

drop policy if exists "categories_write_catalog_managers" on public.categories;
create policy "categories_write_catalog_managers"
  on public.categories for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'product_manager']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'product_manager']));

-- -----------------------------------------------------------------------------
-- 3. products & product_media
-- -----------------------------------------------------------------------------
drop policy if exists "products_select_staff" on public.products;
create policy "products_select_staff"
  on public.products for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'product_manager', 'order_manager', 'marketing_manager', 'crm_agent'
    ])
  );

drop policy if exists "products_write_catalog_managers" on public.products;
create policy "products_write_catalog_managers"
  on public.products for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'product_manager']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'product_manager']));

drop policy if exists "product_media_select_staff" on public.product_media;
create policy "product_media_select_staff"
  on public.product_media for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'product_manager', 'order_manager', 'marketing_manager', 'crm_agent'
    ])
  );

drop policy if exists "product_media_write_catalog_managers" on public.product_media;
create policy "product_media_write_catalog_managers"
  on public.product_media for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'product_manager']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'product_manager']));

-- -----------------------------------------------------------------------------
-- 4. customers (Sem acesso público; bloqueado para perfis sem permissão de clientes)
-- -----------------------------------------------------------------------------
drop policy if exists "customers_select_authorized" on public.customers;
create policy "customers_select_authorized"
  on public.customers for select
  to authenticated
  using (
    public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent'])
  );

drop policy if exists "customers_write_authorized" on public.customers;
create policy "customers_write_authorized"
  on public.customers for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']));

-- -----------------------------------------------------------------------------
-- 5. orders & order_items
-- -----------------------------------------------------------------------------
drop policy if exists "orders_select_authorized" on public.orders;
create policy "orders_select_authorized"
  on public.orders for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'order_manager', 'crm_agent', 'product_manager', 'marketing_manager'
    ])
  );

drop policy if exists "orders_write_authorized" on public.orders;
create policy "orders_write_authorized"
  on public.orders for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']));

drop policy if exists "order_items_select_authorized" on public.order_items;
create policy "order_items_select_authorized"
  on public.order_items for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'order_manager', 'crm_agent', 'product_manager', 'marketing_manager'
    ])
  );

drop policy if exists "order_items_write_authorized" on public.order_items;
create policy "order_items_write_authorized"
  on public.order_items for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']));

-- -----------------------------------------------------------------------------
-- 6. CRM: customer_notes, customer_tags, customer_tag_assignments, crm_tasks
-- -----------------------------------------------------------------------------
drop policy if exists "customer_notes_crm_access" on public.customer_notes;
create policy "customer_notes_crm_access"
  on public.customer_notes for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']));

drop policy if exists "customer_tags_select_staff" on public.customer_tags;
create policy "customer_tags_select_staff"
  on public.customer_tags for select
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']));

drop policy if exists "customer_tags_write_crm" on public.customer_tags;
create policy "customer_tags_write_crm"
  on public.customer_tags for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']));

drop policy if exists "customer_tag_assignments_select" on public.customer_tag_assignments;
create policy "customer_tag_assignments_select"
  on public.customer_tag_assignments for select
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']));

drop policy if exists "customer_tag_assignments_write" on public.customer_tag_assignments;
create policy "customer_tag_assignments_write"
  on public.customer_tag_assignments for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']));

drop policy if exists "crm_tasks_access" on public.crm_tasks;
create policy "crm_tasks_access"
  on public.crm_tasks for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'crm_agent']));

-- -----------------------------------------------------------------------------
-- 7. marketing_settings & store_settings
-- -----------------------------------------------------------------------------
drop policy if exists "marketing_settings_select" on public.marketing_settings;
create policy "marketing_settings_select"
  on public.marketing_settings for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'marketing_manager', 'product_manager', 'order_manager', 'crm_agent'
    ])
  );

drop policy if exists "marketing_settings_write" on public.marketing_settings;
create policy "marketing_settings_write"
  on public.marketing_settings for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin', 'marketing_manager']))
  with check (public.has_any_staff_role(array['super_admin', 'admin', 'marketing_manager']));

drop policy if exists "store_settings_select" on public.store_settings;
create policy "store_settings_select"
  on public.store_settings for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'product_manager', 'order_manager', 'marketing_manager', 'crm_agent'
    ])
  );

drop policy if exists "store_settings_write" on public.store_settings;
create policy "store_settings_write"
  on public.store_settings for all
  to authenticated
  using (public.has_any_staff_role(array['super_admin', 'admin']))
  with check (public.has_any_staff_role(array['super_admin', 'admin']));

-- -----------------------------------------------------------------------------
-- 8. activity_logs (Estritamente imutável: apenas INSERT de staff ativo e SELECT admin)
-- Sem políticas de UPDATE ou DELETE para impedir manipulação de logs!
-- -----------------------------------------------------------------------------
drop policy if exists "activity_logs_select_admins" on public.activity_logs;
create policy "activity_logs_select_admins"
  on public.activity_logs for select
  to authenticated
  using (
    public.has_any_staff_role(array[
      'super_admin', 'admin', 'product_manager', 'order_manager', 'marketing_manager', 'crm_agent'
    ])
  );

drop policy if exists "activity_logs_insert_active_staff" on public.activity_logs;
create policy "activity_logs_insert_active_staff"
  on public.activity_logs for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and public.has_any_staff_role(array[
      'super_admin', 'admin', 'product_manager', 'order_manager', 'marketing_manager', 'crm_agent'
    ])
  );

-- -----------------------------------------------------------------------------
-- 9. Supabase Storage: Bucket "product-media" e Políticas de Upload Seguro
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_media_storage_public_read" on storage.objects;
create policy "product_media_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'product-media');

drop policy if exists "product_media_storage_staff_insert" on storage.objects;
create policy "product_media_storage_staff_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-media'
    and public.has_any_staff_role(array['super_admin', 'admin', 'product_manager'])
  );

drop policy if exists "product_media_storage_staff_update" on storage.objects;
create policy "product_media_storage_staff_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-media'
    and public.has_any_staff_role(array['super_admin', 'admin', 'product_manager'])
  );

drop policy if exists "product_media_storage_staff_delete" on storage.objects;
create policy "product_media_storage_staff_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-media'
    and public.has_any_staff_role(array['super_admin', 'admin', 'product_manager'])
  );

-- Força atualização imediata da cache do PostgREST / Table Editor
notify pgrst, 'reload schema';
