-- =============================================================================
-- BERCALI STORE — PAINEL ADMINISTRATIVO
-- FICHEIRO SQL COMPLETO E CONSOLIDADO (EXECUÇÃO ÚNICA NO SUPABASE SQL EDITOR)
-- =============================================================================
-- Cria de forma idempotente:
--   1. As 14 tabelas obrigatórias:
--      profiles, categories, products, product_media, customers, orders,
--      order_items, customer_notes, customer_tags, customer_tag_assignments,
--      crm_tasks, marketing_settings, store_settings e activity_logs.
--   2. Relações (Foreign Keys), restrições CHECK, índices e triggers updated_at.
--   3. Normalização telefónica angolana (+2449XXXXXXXX) e deduplicação CRM.
--   4. Sincronização automática com auth.users + proteção de privilégios.
--   5. Funções RPC transacionais (create_admin_order, update_admin_order_status)
--      e bootstrap seguro do primeiro super_admin (bootstrap_first_super_admin).
--   6. Políticas Row Level Security (RLS) nas 14 tabelas e bucket product-media.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- =============================================================================
-- PARTE 1: FUNÇÕES UTILITÁRIAS E AS 14 TABELAS PRINCIPAIS
-- =============================================================================

-- 1.1 Atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1.2 Normalização determinística de telefone angolano (+2449XXXXXXXX)
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

-- -----------------------------------------------------------------------------
-- Tabela 1/14: profiles (Perfis administrativos associados a auth.users)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 2/14: categories (Categorias do catálogo)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 3/14: products (Produtos do catálogo partilhado)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 4/14: product_media (Imagens e vídeos associados a produtos no Storage)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 5/14: customers (Clientes e contactos comerciais sem duplicação)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 6/14: orders (Encomendas separando status logístico e payment_status)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 7/14: order_items (Itens históricos por encomenda)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 8/14: customer_notes (Notas cronológicas do CRM)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 9/14: customer_tags (Etiquetas personalizadas do CRM)
-- -----------------------------------------------------------------------------
create table if not exists public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) >= 2),
  color text not null default 'orange' check (
    color in ('neutral', 'orange', 'green', 'amber')
  ),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabela 10/14: customer_tag_assignments (Relação N:N entre clientes e etiquetas)
-- -----------------------------------------------------------------------------
create table if not exists public.customer_tag_assignments (
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create index if not exists idx_customer_tag_assignments_tag_id
  on public.customer_tag_assignments(tag_id);

-- -----------------------------------------------------------------------------
-- Tabela 11/14: crm_tasks (Tarefas de acompanhamento comercial e follow-up)
-- -----------------------------------------------------------------------------
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

create unique index if not exists idx_crm_tasks_unique_open_order
  on public.crm_tasks(order_id)
  where order_id is not null and status in ('pending', 'in_progress');

-- -----------------------------------------------------------------------------
-- Tabela 12/14: marketing_settings (Configuração do Meta Pixel e eventos)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 13/14: store_settings (Configurações gerais chave-valor, sem segredos)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tabela 14/14: activity_logs (Registo de auditoria administrativa append-only)
-- -----------------------------------------------------------------------------
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


-- =============================================================================
-- PARTE 2: FUNÇÕES DE SEGURANÇA, TRIGGERS DE AUTH E AUTOMAÇÃO TRANSACIONAL
-- =============================================================================

-- 2.1 Funções auxiliares de autorização baseadas na sessão real (SECURITY DEFINER)
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function public.has_any_staff_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() = any(allowed_roles), false);
$$;

-- 2.2 Criar perfil inativo por defeito quando uma conta é criada em auth.users
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  extracted_name text;
begin
  extracted_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'utilizador'), '@', 1)
  );
  if char_length(btrim(coalesce(extracted_name, ''))) < 2 then
    extracted_name := 'Utilizador Bercali';
  end if;

  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    extracted_name,
    lower(coalesce(new.email, new.id::text || '@bercali.local')),
    'crm_agent',
    false
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Sincroniza contas que já tenham sido criadas em auth.users antes da migração
insert into public.profiles (id, full_name, email, role, is_active)
select
  u.id,
  case
    when char_length(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', ''))) >= 2
      then btrim(u.raw_user_meta_data ->> 'full_name')
    when char_length(btrim(split_part(coalesce(u.email, ''), '@', 1))) >= 2
      then btrim(split_part(u.email, '@', 1))
    else 'Utilizador Bercali'
  end,
  lower(coalesce(u.email, u.id::text || '@bercali.local')),
  'crm_agent',
  false
from auth.users u
on conflict (id) do nothing;

-- 2.3 Proteção contra escalada de privilégios e auto-bloqueio do último super_admin
create or replace function public.guard_profile_privilege_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  remaining_super_admins integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  caller_role := public.current_staff_role();

  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and caller_role is distinct from 'super_admin' then
    raise exception 'Apenas um Superadministrador ativo pode alterar funções ou ativação de contas.';
  end if;

  if old.role = 'super_admin' and old.is_active = true
     and (new.role <> 'super_admin' or new.is_active = false) then
    select count(*) into remaining_super_admins
    from public.profiles
    where role = 'super_admin'
      and is_active = true
      and id <> old.id;

    if remaining_super_admins = 0 then
      raise exception 'Operação bloqueada: deve existir pelo menos um Superadministrador ativo no painel.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
before update on public.profiles
for each row execute function public.guard_profile_privilege_changes();

-- 2.4 Bootstrap seguro do primeiro super_admin (executável apenas no SQL Editor)
create or replace function public.bootstrap_first_super_admin(target_email text, admin_full_name text default 'Superadministrador Bercali')
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  existing_super_count integer;
  promoted_profile public.profiles;
begin
  if auth.uid() is not null then
    raise exception 'Esta função de bootstrap só pode ser executada diretamente no Supabase SQL Editor.';
  end if;

  select count(*) into existing_super_count
  from public.profiles
  where role = 'super_admin' and is_active = true;

  if existing_super_count > 0 then
    raise exception 'Já existe um Superadministrador ativo configurado neste projeto.';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(btrim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'Utilizador "%" não encontrado em auth.users. Cria primeiro o utilizador em Authentication -> Users.', target_email;
  end if;

  insert into public.profiles (id, full_name, email, role, is_active, last_active_at)
  values (
    target_user_id,
    btrim(admin_full_name),
    lower(btrim(target_email)),
    'super_admin',
    true,
    now()
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        role = 'super_admin',
        is_active = true,
        updated_at = now()
  returning * into promoted_profile;

  return promoted_profile;
end;
$$;

revoke all on function public.bootstrap_first_super_admin(text, text) from public, anon, authenticated;

-- 2.5 Criação atómica de encomenda com cálculo no servidor e automação CRM
create or replace function public.create_admin_order(
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_customer_city text default 'Luanda',
  p_source text default 'manual_admin',
  p_status text default 'pending_confirmation',
  p_payment_status text default 'pending',
  p_whatsapp_outcome text default 'unverified',
  p_delivery_address text default '',
  p_delivery_fee numeric default 0,
  p_discount_amount numeric default 0,
  p_internal_notes text default '',
  p_order_prefix text default 'BRC-2026-',
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_profile public.profiles;
  v_customer_id uuid;
  v_norm_phone text;
  v_order_id uuid;
  v_order_number text;
  v_seq_count bigint;
  v_subtotal numeric(14, 2) := 0;
  v_fee numeric(14, 2) := greatest(0, round(coalesce(p_delivery_fee, 0), 2));
  v_discount numeric(14, 2) := greatest(0, round(coalesce(p_discount_amount, 0), 2));
  v_total numeric(14, 2) := 0;
  v_item jsonb;
  v_prod public.products;
  v_qty integer;
  v_unit_price numeric(14, 2);
  v_line_total numeric(14, 2);
  v_confirmed_orders integer;
  v_history jsonb;
begin
  if not public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']) then
    raise exception 'Sem permissão administrativa para registar encomendas.';
  end if;

  select * into v_actor_profile from public.profiles where id = v_actor_id;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adiciona pelo menos um produto válido à encomenda.';
  end if;

  if p_status in ('confirmed', 'preparing', 'shipped', 'delivered')
     and p_source like 'whatsapp%'
     and p_whatsapp_outcome <> 'confirmed_by_customer' then
    raise exception 'Encomendas iniciadas via WhatsApp exigem confirmação manual do cliente antes de passarem a Confirmada.';
  end if;

  if p_customer_id is not null then
    select id into v_customer_id from public.customers where id = p_customer_id;
    if v_customer_id is null then
      raise exception 'O cliente selecionado não foi encontrado.';
    end if;
    update public.customers
       set last_contact_at = now()
     where id = v_customer_id;
  else
    v_norm_phone := public.normalize_angola_phone(p_customer_phone);
    if v_norm_phone !~ '^\+[0-9]{9,15}$' then
      raise exception 'Indica um número de telefone válido para identificar ou criar o cliente.';
    end if;

    select id into v_customer_id
    from public.customers
    where normalized_phone = v_norm_phone
    limit 1;

    if v_customer_id is not null then
      update public.customers
         set last_contact_at = now(),
             email = case
               when (email is null or email = '') and coalesce(btrim(p_customer_email), '') <> ''
               then btrim(p_customer_email)
               else email
             end
       where id = v_customer_id;
    else
      if char_length(btrim(coalesce(p_customer_name, ''))) < 2 then
        raise exception 'Indica o nome completo do novo cliente (mínimo 2 caracteres).';
      end if;

      insert into public.customers (
        full_name,
        phone,
        normalized_phone,
        email,
        city,
        source,
        status,
        last_contact_at
      ) values (
        btrim(p_customer_name),
        btrim(p_customer_phone),
        v_norm_phone,
        nullif(btrim(coalesce(p_customer_email, '')), ''),
        coalesce(nullif(btrim(p_customer_city), ''), 'Luanda'),
        p_source,
        'awaiting_reply',
        now()
      )
      returning id into v_customer_id;
    end if;
  end if;

  select count(*) + 1 into v_seq_count from public.orders;
  v_order_number := coalesce(nullif(btrim(p_order_prefix), ''), 'BRC-2026-')
    || lpad(v_seq_count::text, 4, '0');
  while exists (select 1 from public.orders where order_number = v_order_number) loop
    v_seq_count := v_seq_count + 1;
    v_order_number := coalesce(nullif(btrim(p_order_prefix), ''), 'BRC-2026-')
      || lpad(v_seq_count::text, 4, '0');
  end loop;

  v_history := jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'fromStatus', null,
      'toStatus', p_status,
      'changedBy', coalesce(v_actor_profile.full_name, 'Administrador'),
      'note', 'Encomenda registada no painel administrativo.',
      'changedAt', now()
    )
  );

  insert into public.orders (
    order_number,
    customer_id,
    status,
    subtotal,
    delivery_fee,
    discount_amount,
    total_amount,
    currency,
    source,
    payment_status,
    whatsapp_outcome,
    delivery_address,
    internal_notes,
    status_history,
    confirmed_at,
    delivered_at,
    created_by
  ) values (
    v_order_number,
    v_customer_id,
    p_status,
    0,
    v_fee,
    v_discount,
    0,
    'AOA',
    p_source,
    p_payment_status,
    p_whatsapp_outcome,
    btrim(coalesce(p_delivery_address, '')),
    btrim(coalesce(p_internal_notes, '')),
    v_history,
    case when p_status in ('confirmed', 'preparing', 'shipped', 'delivered') then now() else null end,
    case when p_status = 'delivered' then now() else null end,
    v_actor_id
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_qty <= 0 then
      raise exception 'A quantidade de cada artigo deve ser superior a zero.';
    end if;

    select * into v_prod
    from public.products
    where id = (v_item ->> 'productId')::uuid
    for update;

    if v_prod.id is null then
      raise exception 'Um dos produtos selecionados não existe.';
    end if;

    if v_prod.status = 'archived' then
      raise exception 'O produto "%" encontra-se arquivado e não pode receber novas encomendas.', v_prod.name;
    end if;

    if v_prod.manage_stock and p_status <> 'cancelled' then
      if coalesce(v_prod.stock_quantity, 0) < v_qty then
        raise exception 'Stock insuficiente para "%": disponível % un., solicitado % un.',
          v_prod.name, coalesce(v_prod.stock_quantity, 0), v_qty;
      end if;

      update public.products
         set stock_quantity = coalesce(stock_quantity, 0) - v_qty
       where id = v_prod.id;
    end if;

    v_unit_price := coalesce(v_prod.sale_price, v_prod.price);
    v_line_total := round(v_unit_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      product_sku,
      quantity,
      unit_price,
      line_total
    ) values (
      v_order_id,
      v_prod.id,
      v_prod.name,
      v_prod.sku,
      v_qty,
      v_unit_price,
      v_line_total
    );
  end loop;

  v_total := greatest(0, round(v_subtotal + v_fee - v_discount, 2));

  update public.orders
     set subtotal = v_subtotal,
         total_amount = v_total
   where id = v_order_id;

  if p_status in ('received', 'pending_confirmation') then
    insert into public.crm_tasks (
      customer_id,
      order_id,
      assigned_to,
      title,
      description,
      due_at,
      status
    ) values (
      v_customer_id,
      v_order_id,
      v_actor_id,
      'Confirmar encomenda ' || v_order_number || ' via WhatsApp',
      'Contactar cliente para validar disponibilidade, morada de entrega e pagamento.',
      now() + interval '4 hours',
      'pending'
    )
    on conflict (order_id) where order_id is not null and status in ('pending', 'in_progress')
    do nothing;

    update public.customers
       set status = case
         when status in ('converted', 'recurring') then status
         else 'awaiting_reply'
       end,
       last_contact_at = now()
     where id = v_customer_id;
  elsif p_status in ('confirmed', 'preparing', 'shipped', 'delivered') then
    select count(*) into v_confirmed_orders
    from public.orders
    where customer_id = v_customer_id
      and status in ('confirmed', 'preparing', 'shipped', 'delivered');

    update public.customers
       set status = case when v_confirmed_orders > 1 then 'recurring' else 'converted' end,
           last_contact_at = now()
     where id = v_customer_id;
  end if;

  insert into public.activity_logs (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    v_actor_id,
    coalesce(v_actor_profile.full_name, 'Administrador'),
    coalesce(v_actor_profile.role, 'crm_agent'),
    'Encomenda criada',
    'order',
    v_order_number,
    jsonb_build_object(
      'order_id', v_order_id,
      'total_amount', v_total,
      'status', p_status,
      'payment_status', p_payment_status
    )
  );

  return v_order_id;
end;
$$;

grant execute on function public.create_admin_order(
  uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, jsonb
) to authenticated;

-- 2.6 Atualização consistente de estado de encomenda, pagamento e CRM
create or replace function public.update_admin_order_status(
  p_order_id uuid,
  p_next_status text,
  p_payment_status text,
  p_whatsapp_outcome text,
  p_transition_note text default '',
  p_internal_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_profile public.profiles;
  v_ord public.orders;
  v_entry jsonb;
  v_confirmed_orders integer;
begin
  if not public.has_any_staff_role(array['super_admin', 'admin', 'order_manager', 'crm_agent']) then
    raise exception 'Sem permissão administrativa para atualizar encomendas.';
  end if;

  select * into v_actor_profile from public.profiles where id = v_actor_id;
  select * into v_ord from public.orders where id = p_order_id for update;

  if v_ord.id is null then
    raise exception 'Encomenda não encontrada.';
  end if;

  if p_next_status in ('confirmed', 'preparing', 'shipped', 'delivered')
     and v_ord.source like 'whatsapp%'
     and p_whatsapp_outcome <> 'confirmed_by_customer' then
    raise exception 'Confirma manualmente o resultado do atendimento WhatsApp antes de confirmar a encomenda.';
  end if;

  v_entry := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'fromStatus', v_ord.status,
    'toStatus', p_next_status,
    'changedBy', coalesce(v_actor_profile.full_name, 'Administrador'),
    'note', coalesce(nullif(btrim(p_transition_note), ''), 'Atualização manual no painel administrativo.'),
    'changedAt', now()
  );

  update public.orders
     set status = p_next_status,
         payment_status = p_payment_status,
         whatsapp_outcome = p_whatsapp_outcome,
         internal_notes = btrim(coalesce(p_internal_notes, '')),
         confirmed_at = case
           when p_next_status in ('confirmed', 'preparing', 'shipped', 'delivered')
           then coalesce(confirmed_at, now())
           else confirmed_at
         end,
         delivered_at = case
           when p_next_status = 'delivered'
           then coalesce(delivered_at, now())
           else delivered_at
         end,
         status_history = case
           when v_ord.status is distinct from p_next_status or btrim(coalesce(p_transition_note, '')) <> ''
           then jsonb_build_array(v_entry) || coalesce(v_ord.status_history, '[]'::jsonb)
           else v_ord.status_history
         end
   where id = p_order_id;

  if p_next_status in ('confirmed', 'preparing', 'shipped', 'delivered', 'cancelled') then
    update public.crm_tasks
       set status = case when p_next_status = 'cancelled' then 'cancelled' else 'completed' end,
           completed_at = now()
     where order_id = p_order_id
       and status in ('pending', 'in_progress');
  end if;

  if p_next_status in ('confirmed', 'preparing', 'shipped', 'delivered') then
    select count(*) into v_confirmed_orders
    from public.orders
    where customer_id = v_ord.customer_id
      and status in ('confirmed', 'preparing', 'shipped', 'delivered');

    update public.customers
       set status = case when v_confirmed_orders > 1 then 'recurring' else 'converted' end,
           last_contact_at = now()
     where id = v_ord.customer_id;
  end if;

  insert into public.activity_logs (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    v_actor_id,
    coalesce(v_actor_profile.full_name, 'Administrador'),
    coalesce(v_actor_profile.role, 'crm_agent'),
    'Estado de encomenda atualizado',
    'order',
    v_ord.order_number,
    jsonb_build_object(
      'from_status', v_ord.status,
      'to_status', p_next_status,
      'payment_status', p_payment_status,
      'whatsapp_outcome', p_whatsapp_outcome
    )
  );
end;
$$;

grant execute on function public.update_admin_order_status(uuid, text, text, text, text, text) to authenticated;


-- =============================================================================
-- PARTE 3: ROW LEVEL SECURITY (RLS) E SUPABASE STORAGE (product-media)
-- =============================================================================

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

-- 3.1 profiles
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

-- 3.2 categories
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

-- 3.3 products & product_media
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

-- 3.4 customers
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

-- 3.5 orders & order_items
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

-- 3.6 CRM: customer_notes, customer_tags, customer_tag_assignments, crm_tasks
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

-- 3.7 marketing_settings & store_settings
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

-- 3.8 activity_logs (Estritamente imutável: apenas INSERT de staff ativo e SELECT admin)
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

-- 3.9 Supabase Storage: Bucket "product-media" e Políticas de Upload Seguro
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

-- =============================================================================
-- 4. INTEGRAÇÃO COM A LOJA ONLINE PÚBLICA (CATÁLOGO, DEFINIÇÕES E CHECKOUT RPC)
-- =============================================================================

alter table public.products
  add column if not exists is_featured boolean not null default false;

alter table public.products
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_products_storefront_order
  on public.products(status, is_featured desc, sort_order asc, created_at desc);

alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists idx_orders_idempotency_key
  on public.orders(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%source%'
  loop
    execute format('alter table public.orders drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.orders
  add constraint orders_source_check check (
    source in ('website', 'whatsapp_store', 'whatsapp_direct', 'instagram', 'manual_admin')
  );

drop policy if exists "categories_select_public_active" on public.categories;
create policy "categories_select_public_active"
  on public.categories for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "products_select_public_published" on public.products;
create policy "products_select_public_published"
  on public.products for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.categories c
      where c.id = products.category_id
        and c.is_active = true
    )
  );

drop policy if exists "product_media_select_public_published" on public.product_media;
create policy "product_media_select_public_published"
  on public.product_media for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.categories c on c.id = p.category_id
      where p.id = product_media.product_id
        and p.status = 'active'
        and c.is_active = true
    )
  );

drop policy if exists "store_settings_select_public" on public.store_settings;
create policy "store_settings_select_public"
  on public.store_settings for select
  to anon, authenticated
  using (
    setting_key in ('company_profile', 'delivery_zones', 'storefront_config')
  );

-- 5. Publicação Supabase Realtime para novas encomendas (public.orders)
do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

-- Nota: Para instalar também a função RPC public.create_storefront_order,
-- executa supabase/migrations/20261025000004_storefront_integration.sql.

commit;

-- Força atualização imediata da cache do PostgREST / Table Editor
notify pgrst, 'reload schema';
