-- =============================================================================
-- BERCALI STORE — PAINEL ADMINISTRATIVO
-- Migração 001: Tabelas Principais, Restrições, Índices e Normalização
-- =============================================================================

create extension if not exists pgcrypto;

-- 1. Função utilitária para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Função determinística de normalização telefónica (+2449XXXXXXXX)
create or replace function public.normalize_angola_phone(raw_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g');
  if digits = '' then
    return '';
  end if;

  if digits like '00244%' and char_length(digits) = 14 then
    return '+244' || substring(digits from 6);
  end if;

  if digits like '244%' and char_length(digits) = 12 then
    return '+' || digits;
  end if;

  if char_length(digits) = 9 and digits like '9%' then
    return '+244' || digits;
  end if;

  return '+' || digits;
end;
$$;

-- =============================================================================
-- A. profiles (Perfis administrativos associados a auth.users)
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) >= 2),
  email text not null unique,
  phone text,
  role text not null default 'crm_agent' check (
    role in (
      'super_admin',
      'admin',
      'product_manager',
      'order_manager',
      'marketing_manager',
      'crm_agent'
    )
  ),
  is_active boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create index if not exists idx_profiles_role_active
  on public.profiles(role, is_active);

-- =============================================================================
-- B. categories (Categorias do catálogo)
-- =============================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) >= 2),
  slug text not null unique check (char_length(btrim(slug)) >= 2),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- =============================================================================
-- C. products (Produtos do catálogo partilhado)
-- =============================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) >= 2),
  slug text not null unique check (char_length(btrim(slug)) >= 2),
  sku text not null unique check (sku ~ '^[A-Za-z0-9_-]{3,32}$'),
  description text not null default '',
  price numeric(14, 2) not null check (price > 0),
  sale_price numeric(14, 2) check (
    sale_price is null or (sale_price > 0 and sale_price < price)
  ),
  category_id uuid not null references public.categories(id) on delete restrict,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  manage_stock boolean not null default true,
  is_available boolean not null default true,
  status text not null default 'active' check (
    status in ('active', 'inactive', 'archived')
  ),
  visual_preset text not null default 'tech' check (
    visual_preset in ('audio', 'watch', 'bag', 'sneaker', 'accessory', 'tech')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_status on public.products(status);

-- =============================================================================
-- D. product_media (Imagens e vídeos associados a produtos no Storage)
-- =============================================================================
create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  media_type text not null default 'image' check (
    media_type in ('image', 'video')
  ),
  storage_path text not null default '',
  media_url text not null check (char_length(btrim(media_url)) > 0),
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_media_product_id
  on public.product_media(product_id, sort_order);

-- =============================================================================
-- E. customers (Clientes e contactos comerciais sem duplicação por telefone)
-- =============================================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) >= 2),
  phone text not null,
  normalized_phone text not null unique check (
    normalized_phone ~ '^\+[0-9]{9,15}$'
  ),
  email text check (
    email is null or email = '' or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  ),
  city text not null default 'Luanda',
  source text not null default 'manual_admin' check (
    source in ('whatsapp_store', 'whatsapp_direct', 'instagram', 'manual_admin', 'website')
  ),
  status text not null default 'new_contact' check (
    status in (
      'new_contact',
      'interested',
      'in_service',
      'awaiting_reply',
      'converted',
      'recurring',
      'not_interested'
    )
  ),
  notes text not null default '',
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create index if not exists idx_customers_status on public.customers(status);
create index if not exists idx_customers_last_contact on public.customers(last_contact_at desc);

-- Garante que normalized_phone é sempre derivado de phone quando omitido/atualizado
create or replace function public.sync_customer_normalized_phone()
returns trigger
language plpgsql
as $$
begin
  new.normalized_phone := public.normalize_angola_phone(new.phone);
  return new;
end;
$$;

drop trigger if exists trg_customers_normalize_phone on public.customers;
create trigger trg_customers_normalize_phone
before insert or update of phone on public.customers
for each row execute function public.sync_customer_normalized_phone();

-- =============================================================================
-- F. orders (Encomendas da loja e manuais, separando status e payment_status)
-- =============================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'received' check (
    status in (
      'received',
      'pending_confirmation',
      'confirmed',
      'preparing',
      'shipped',
      'delivered',
      'cancelled'
    )
  ),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(14, 2) not null default 0 check (delivery_fee >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  currency text not null default 'AOA',
  source text not null default 'manual_admin' check (
    source in ('whatsapp_store', 'whatsapp_direct', 'instagram', 'manual_admin')
  ),
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'paid', 'refunded', 'cancelled')
  ),
  whatsapp_outcome text not null default 'unverified' check (
    whatsapp_outcome in (
      'unverified',
      'awaiting_customer_reply',
      'confirmed_by_customer',
      'cancelled_or_no_response'
    )
  ),
  delivery_address text not null default '',
  internal_notes text not null default '',
  status_history jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create index if not exists idx_orders_customer_id on public.orders(customer_id, created_at desc);
create index if not exists idx_orders_status_created on public.orders(status, created_at desc);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_created_by on public.orders(created_by);

-- =============================================================================
-- G. order_items (Itens históricos por encomenda)
-- =============================================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_sku text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);

-- =============================================================================
-- H. customer_notes (Notas cronológicas do CRM)
-- =============================================================================
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  note_type text not null default 'nota_interna' check (
    note_type in ('nota_interna', 'whatsapp_manual', 'chamada', 'email')
  ),
  content text not null check (char_length(btrim(content)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_notes_customer_id
  on public.customer_notes(customer_id, created_at desc);

-- =============================================================================
-- I. customer_tags (Etiquetas personalizadas do CRM)
-- =============================================================================
create table if not exists public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) >= 2),
  color text not null default 'orange' check (
    color in ('neutral', 'orange', 'green', 'amber')
  ),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- J. customer_tag_assignments (Relação N:N entre clientes e etiquetas)
-- =============================================================================
create table if not exists public.customer_tag_assignments (
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create index if not exists idx_customer_tag_assignments_tag_id
  on public.customer_tag_assignments(tag_id);

-- =============================================================================
-- K. crm_tasks (Tarefas de acompanhamento comercial e follow-up)
-- =============================================================================
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(btrim(title)) >= 2),
  description text not null default '',
  due_at timestamptz,
  status text not null default 'pending' check (
    status in ('pending', 'in_progress', 'completed', 'cancelled')
  ),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_crm_tasks_updated_at on public.crm_tasks;
create trigger trg_crm_tasks_updated_at
before update on public.crm_tasks
for each row execute function public.set_updated_at();

create index if not exists idx_crm_tasks_status_due
  on public.crm_tasks(status, due_at asc);
create index if not exists idx_crm_tasks_customer_id
  on public.crm_tasks(customer_id);
create index if not exists idx_crm_tasks_assigned_to
  on public.crm_tasks(assigned_to, status);

-- Evita duplicação automática de tarefas abertas para a mesma encomenda
create unique index if not exists idx_crm_tasks_unique_open_order
  on public.crm_tasks(order_id)
  where order_id is not null and status in ('pending', 'in_progress');

-- =============================================================================
-- L. marketing_settings (Configuração única por fornecedor, ex.: meta_pixel)
-- =============================================================================
create table if not exists public.marketing_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique default 'meta_pixel',
  pixel_id text not null default '' check (
    pixel_id = '' or pixel_id ~ '^[0-9]{15,16}$'
  ),
  is_enabled boolean not null default false check (
    not is_enabled or pixel_id ~ '^[0-9]{15,16}$'
  ),
  consent_required boolean not null default true,
  events_config jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_marketing_settings_updated_at on public.marketing_settings;
create trigger trg_marketing_settings_updated_at
before update on public.marketing_settings
for each row execute function public.set_updated_at();

-- =============================================================================
-- M. store_settings (Configurações gerais chave-valor da empresa, sem segredos)
-- =============================================================================
create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique check (char_length(btrim(setting_key)) >= 2),
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_store_settings_updated_at on public.store_settings;
create trigger trg_store_settings_updated_at
before update on public.store_settings
for each row execute function public.set_updated_at();

-- =============================================================================
-- N. activity_logs (Registo de auditoria administrativa append-only)
-- =============================================================================
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default 'crm_agent',
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_logs_created_at
  on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_entity_type
  on public.activity_logs(entity_type, created_at desc);
