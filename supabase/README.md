# Bercali Store — Migrações SQL e Bootstrap Seguro (Supabase)

Este diretório contém a estrutura completa de PostgreSQL, funções transacionais, automação de CRM, Row Level Security (RLS) e políticas de Supabase Storage para o **Painel Administrativo Bercali Store**.

## Opção Recomendada (Execução Única no Supabase SQL Editor)

1. Acede ao painel do teu projeto em [supabase.com/dashboard](https://supabase.com/dashboard).
2. No menu lateral esquerdo, abre **SQL Editor** e clica em **New query**.
3. Copia todo o conteúdo do ficheiro consolidado **`supabase/setup_completo_bercali_admin.sql`**, cola no editor e clica em **Run**.
4. Acede ao **Table Editor** (esquema `public`) e confirma a criação das **14 tabelas**:
   - `profiles`, `categories`, `products`, `product_media`, `customers`, `orders`, `order_items`, `customer_notes`, `customer_tags`, `customer_tag_assignments`, `crm_tasks`, `marketing_settings`, `store_settings` e `activity_logs`.

## Alternativa Versionada (3 Ficheiros Sequenciais)

Se preferires executar por fases em `supabase/migrations/`:
1. `migrations/20261024000001_core_tables_and_constraints.sql`
2. `migrations/20261024000002_functions_triggers_and_crm_automation.sql`
3. `migrations/20261024000003_rls_and_storage_policies.sql`

---

## Como Criar e Ativar o Primeiro `super_admin`

Por segurança, nenhuma conta criada recebe permissões ativas automaticamente (`is_active = false`).

1. Em **Authentication -> Users -> Add user -> Create new user**, cria a conta do administrador principal (com **Auto Confirm User** ativado).
2. No **SQL Editor**, executa numa nova query:

```sql
select public.bootstrap_first_super_admin(
  'teu-email@bercalistore.ao',
  'Nome do Superadministrador'
);
```
