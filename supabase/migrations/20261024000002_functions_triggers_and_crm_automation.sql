-- =============================================================================
-- BERCALI STORE — PAINEL ADMINISTRATIVO
-- Migração 002: Funções de Segurança, Triggers de Auth, Encomendas Atómicas e CRM
-- =============================================================================

-- 1. Funções auxiliares de autorização baseadas na sessão real (SECURITY DEFINER)
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

-- 2. Criar perfil inativo por defeito quando uma conta é criada em auth.users
-- Impede auto-atribuição de permissões administrativas por registo público.
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

-- 3. Proteção contra escalada de privilégios no próprio perfil e auto-bloqueio do último super_admin
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
  -- Permite operações de administração direta no SQL Editor (auth.uid() is null)
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

-- 4. Função de bootstrap seguro para o PRIMEIRO super_admin (executável apenas no SQL Editor)
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

-- 5. Criação atómica de encomenda com cálculo no servidor e deduplicação automática de CRM
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

  -- A. Resolver ou criar cliente no CRM sem duplicar telefone normalizado
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
      -- Cliente existente: associa encomenda sem sobrescrever histórico nem notas
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

  -- B. Gerar número único de encomenda
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

  -- C. Criar cabeçalho da encomenda
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

  -- D. Validar produtos, calcular preços reais no servidor e inserir itens históricos
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

  -- E. Automação CRM: criar tarefa de follow-up se pendente ou atualizar estágio se confirmada
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

  -- F. Registar auditoria
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

-- 6. Atualização consistente de estado de encomenda, pagamento e CRM
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

  -- Se a encomenda deixou de estar pendente, conclui tarefas automáticas abertas associadas
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
