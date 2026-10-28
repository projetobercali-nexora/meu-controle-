-- =============================================================================
-- BERCALI STORE — INTEGRAÇÃO PAINEL ADMINISTRATIVO <-> LOJA ONLINE
-- Migração 004: Colunas de Montra, RLS Público Seguro e Checkout RPC Validado
-- =============================================================================
-- NOTA DE SEGURANÇA E INTEGRIDADE:
-- Este script é 100% idempotente e NÃO apaga tabelas, produtos, categorias,
-- imagens do Supabase Storage nem encomendas existentes.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Campos de destaque e ordenação na montra pública (products)
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists is_featured boolean not null default false;

alter table public.products
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_products_storefront_order
  on public.products(status, is_featured desc, sort_order asc, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Suporte à origem 'website' e proteção contra duplicação por duplo clique (orders)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3. Políticas RLS Públicas Estritas para a Loja Online (anon + authenticated)
-- Remove políticas SELECT genéricas ("USING (true)") caso tenham sido criadas
-- manualmente, garantindo que produtos/categorias inativos nunca ficam visíveis.
-- -----------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and tablename in ('categories', 'products', 'product_media', 'store_settings')
      and policyname not in (
        'categories_select_staff',
        'products_select_staff',
        'product_media_select_staff',
        'store_settings_select'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end;
$$;

-- 3.1 Categorias: leitura pública APENAS de categorias ativas
create policy "categories_select_public_active"
  on public.categories for select
  to anon, authenticated
  using (is_active = true);

-- 3.2 Produtos: leitura pública APENAS de produtos publicados ('active') em categorias ativas
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

-- 3.3 Media de Produtos: leitura pública APENAS de produtos publicados em categorias ativas
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

-- 3.4 Definições Gerais: leitura pública APENAS das chaves públicas da loja
-- ('operations_preferences' permanece privada para a equipa administrativa)
create policy "store_settings_select_public"
  on public.store_settings for select
  to anon, authenticated
  using (
    setting_key in ('company_profile', 'delivery_zones', 'storefront_config')
  );

-- -----------------------------------------------------------------------------
-- 4. Checkout Público Seguro (SECURITY DEFINER): create_storefront_order
-- Valida estado da loja (ativa/encerrada), preços reais no servidor, stock,
-- deduplicação de cliente por telefone +244 e criação automática de tarefa CRM.
-- Não expõe dados privados de clientes, encomendas ou CRM ao cliente público.
-- -----------------------------------------------------------------------------
create or replace function public.create_storefront_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_city text default 'Luanda',
  p_delivery_address text default '',
  p_delivery_zone_id text default null,
  p_delivery_fee numeric default 0,
  p_customer_notes text default '',
  p_source text default 'website',
  p_idempotency_key text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_storefront_cfg jsonb := '{}'::jsonb;
  v_ops_cfg jsonb := '{}'::jsonb;
  v_delivery_cfg jsonb := '{}'::jsonb;
  v_is_store_active boolean := true;
  v_closed_msg text := 'A Bercali Store encontra-se temporariamente encerrada para novas encomendas.';
  v_order_prefix text := 'BRC-2026-';
  v_clean_idem text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing_order public.orders;
  v_source text := case
    when p_source in ('website', 'whatsapp_store') then p_source
    else 'website'
  end;
  v_initial_status text := case
    when p_source = 'whatsapp_store' then 'pending_confirmation'
    else 'received'
  end;
  v_initial_wa text := case
    when p_source = 'whatsapp_store' then 'awaiting_customer_reply'
    else 'unverified'
  end;
  v_norm_phone text;
  v_clean_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_seq_count bigint;
  v_zone jsonb;
  v_fee numeric(14, 2) := greatest(0, round(coalesce(p_delivery_fee, 0), 2));
  v_subtotal numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_item jsonb;
  v_prod public.products;
  v_cat_active boolean;
  v_qty integer;
  v_unit_price numeric(14, 2);
  v_line_total numeric(14, 2);
  v_history jsonb;
begin
  -- A. Verificar se já existe encomenda com a mesma chave de idempotência (duplo clique / reenvio)
  if v_clean_idem is not null then
    select * into v_existing_order
    from public.orders
    where idempotency_key = v_clean_idem
    limit 1;

    if v_existing_order.id is not null then
      return jsonb_build_object(
        'order_number', v_existing_order.order_number,
        'subtotal', v_existing_order.subtotal,
        'delivery_fee', v_existing_order.delivery_fee,
        'total_amount', v_existing_order.total_amount,
        'currency', v_existing_order.currency,
        'status', v_existing_order.status,
        'created_at', v_existing_order.created_at
      );
    end if;
  end if;

  -- B. Ler estado público e operacional da loja no servidor
  select setting_value into v_storefront_cfg
  from public.store_settings
  where setting_key = 'storefront_config'
  limit 1;

  if v_storefront_cfg is not null then
    if jsonb_typeof(v_storefront_cfg -> 'isStoreActive') = 'boolean' then
      v_is_store_active := (v_storefront_cfg ->> 'isStoreActive')::boolean;
    end if;
    if coalesce(btrim(v_storefront_cfg ->> 'closedMessage'), '') <> '' then
      v_closed_msg := btrim(v_storefront_cfg ->> 'closedMessage');
    end if;
  end if;

  if not v_is_store_active then
    raise exception '%', v_closed_msg;
  end if;

  select setting_value into v_ops_cfg
  from public.store_settings
  where setting_key = 'operations_preferences'
  limit 1;

  if v_ops_cfg is not null and coalesce(btrim(v_ops_cfg ->> 'orderCodePrefix'), '') <> '' then
    v_order_prefix := btrim(v_ops_cfg ->> 'orderCodePrefix');
  end if;

  -- C. Validar dados obrigatórios do cliente e entrega
  if char_length(btrim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Indica o teu nome completo (mínimo 2 caracteres).';
  end if;

  v_norm_phone := public.normalize_angola_phone(p_customer_phone);
  if v_norm_phone !~ '^\+[0-9]{9,15}$' then
    raise exception 'Indica um número de telefone ou WhatsApp válido (+244 9XX XXX XXX).';
  end if;

  if v_clean_email is not null and v_clean_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'O endereço de e-mail indicado não é válido.';
  end if;

  if char_length(btrim(coalesce(p_delivery_address, ''))) < 3 then
    raise exception 'Indica a morada ou referência de entrega.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adiciona pelo menos um produto válido ao pedido.';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'O pedido excede o limite máximo de 50 linhas de produtos.';
  end if;

  -- D. Resolver taxa oficial da zona de entrega, se aplicável
  if coalesce(btrim(p_delivery_zone_id), '') <> '' then
    select setting_value into v_delivery_cfg
    from public.store_settings
    where setting_key = 'delivery_zones'
    limit 1;

    if v_delivery_cfg is not null and jsonb_typeof(v_delivery_cfg -> 'zones') = 'array' then
      for v_zone in select * from jsonb_array_elements(v_delivery_cfg -> 'zones') loop
        if (v_zone ->> 'id') = btrim(p_delivery_zone_id)
           and coalesce((v_zone ->> 'active')::boolean, true) = true then
          v_fee := greatest(0, round(coalesce((v_zone ->> 'feeKz')::numeric, 0), 2));
          exit;
        end if;
      end loop;
    end if;
  end if;

  -- E. Associar ou criar cliente no CRM sem sobrescrever histórico, etiquetas ou notas
  select id into v_customer_id
  from public.customers
  where normalized_phone = v_norm_phone
  limit 1;

  if v_customer_id is not null then
    update public.customers
       set last_contact_at = now(),
           email = case
             when (email is null or email = '') and v_clean_email is not null then v_clean_email
             else email
           end,
           status = case
             when status in ('converted', 'recurring', 'in_service') then status
             else 'awaiting_reply'
           end
     where id = v_customer_id;
  else
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
      v_clean_email,
      coalesce(nullif(btrim(p_customer_city), ''), 'Luanda'),
      v_source,
      'awaiting_reply',
      now()
    )
    returning id into v_customer_id;
  end if;

  -- F. Gerar número único da encomenda
  select count(*) + 1 into v_seq_count from public.orders;
  v_order_number := v_order_prefix || lpad(v_seq_count::text, 4, '0');
  while exists (select 1 from public.orders where order_number = v_order_number) loop
    v_seq_count := v_seq_count + 1;
    v_order_number := v_order_prefix || lpad(v_seq_count::text, 4, '0');
  end loop;

  v_history := jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'fromStatus', null,
      'toStatus', v_initial_status,
      'changedBy', 'Loja Online Bercali Store',
      'note', case
        when coalesce(btrim(p_customer_notes), '') <> ''
          then 'Pedido submetido na Loja Online. Nota do cliente: ' || left(btrim(p_customer_notes), 300)
        else 'Pedido submetido diretamente na Loja Online.'
      end,
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
    idempotency_key
  ) values (
    v_order_number,
    v_customer_id,
    v_initial_status,
    0,
    v_fee,
    0,
    0,
    'AOA',
    v_source,
    'pending',
    v_initial_wa,
    btrim(p_delivery_address),
    left(btrim(coalesce(p_customer_notes, '')), 500),
    v_history,
    v_clean_idem
  )
  returning id into v_order_id;

  -- G. Validar produtos publicados, verificar/reservar stock e congelar preços reais
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_qty <= 0 or v_qty > 500 then
      raise exception 'A quantidade de cada artigo deve estar entre 1 e 500 unidades.';
    end if;

    select * into v_prod
    from public.products
    where id = (v_item ->> 'productId')::uuid
    for update;

    if v_prod.id is null or v_prod.status <> 'active' then
      raise exception 'Um dos artigos selecionados já não se encontra disponível no catálogo público.';
    end if;

    select is_active into v_cat_active
    from public.categories
    where id = v_prod.category_id;

    if coalesce(v_cat_active, false) = false then
      raise exception 'A categoria do artigo "%" não se encontra ativa neste momento.', v_prod.name;
    end if;

    if not v_prod.is_available then
      raise exception 'O artigo "%" está temporariamente indisponível para encomenda.', v_prod.name;
    end if;

    if v_prod.manage_stock then
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

  v_total := greatest(0, round(v_subtotal + v_fee, 2));

  update public.orders
     set subtotal = v_subtotal,
         total_amount = v_total
   where id = v_order_id;

  -- H. Criar tarefa automática de acompanhamento no CRM
  insert into public.crm_tasks (
    customer_id,
    order_id,
    title,
    description,
    due_at,
    status
  ) values (
    v_customer_id,
    v_order_id,
    'Confirmar encomenda ' || v_order_number || ' (Loja Online)',
    'Contactar cliente (' || v_norm_phone || ') para validar pagamento e entrega em ' || btrim(p_delivery_address) || '.',
    now() + interval '2 hours',
    'pending'
  )
  on conflict (order_id) where order_id is not null and status in ('pending', 'in_progress')
  do nothing;

  -- I. Registo de auditoria
  insert into public.activity_logs (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    null,
    'Loja Online Bercali Store',
    'order_manager',
    'Encomenda recebida da Loja Online',
    'order',
    v_order_number,
    jsonb_build_object(
      'summary', 'Nova encomenda ' || v_order_number || ' submetida na Loja Online (' || v_total || ' Kz).',
      'order_id', v_order_id,
      'total_amount', v_total,
      'source', v_source
    )
  );

  return jsonb_build_object(
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total_amount', v_total,
    'currency', 'AOA',
    'status', v_initial_status,
    'created_at', now()
  );
end;
$$;

grant execute on function public.create_storefront_order(
  text, text, text, text, text, text, numeric, text, text, text, jsonb
) to anon, authenticated;

commit;

-- Força atualização imediata da cache de esquema do PostgREST
notify pgrst, 'reload schema';
