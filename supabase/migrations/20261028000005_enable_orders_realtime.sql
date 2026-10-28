-- =============================================================================
-- BERCALI STORE — PAINEL ADMINISTRATIVO
-- Migração 005: Publicação Supabase Realtime na Tabela public.orders
-- =============================================================================
-- NOTA DE SEGURANÇA E INTEGRIDADE:
-- 1. Script 100% idempotente: verifica antes de adicionar se public.orders já
--    pertence à publicação `supabase_realtime`.
-- 2. Não altera tabelas, colunas, triggers nem políticas RLS existentes.
-- 3. As subscrições Realtime continuam protegidas pelas políticas RLS de SELECT
--    em `public.orders` (apenas utilizadores autenticados com acesso autorizado
--    recebem eventos INSERT).
-- =============================================================================

begin;

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

commit;
