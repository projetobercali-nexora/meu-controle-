export type BackendHealthState =
  | 'checking'
  | 'missing_env'
  | 'security_blocked'
  | 'connection_error'
  | 'schema_missing'
  | 'ready';

export interface BackendConnectionStatus {
  state: BackendHealthState;
  isDatabaseConnected: boolean;
  supabaseUrlConfigured: boolean;
  supabaseAnonKeyConfigured: boolean;
  summaryLabel: string;
  detailMessage: string;
}

export interface PlannedTableSpec {
  tableName: string;
  responsibility: string;
  rlsPolicySummary: string;
  sharedWithPublicStore: boolean;
}

export const SQL_MIGRATION_FILES = [
  'supabase/setup_completo_bercali_admin.sql (Script único consolidado — Admin + Loja + Realtime)',
  'supabase/migrations/20261024000001_core_tables_and_constraints.sql',
  'supabase/migrations/20261024000002_functions_triggers_and_crm_automation.sql',
  'supabase/migrations/20261024000003_rls_and_storage_policies.sql',
  'supabase/migrations/20261025000004_storefront_integration.sql (Integração Loja Online + Checkout RPC)',
  'supabase/migrations/20261028000005_enable_orders_realtime.sql (Notificações Realtime em orders)',
];

export const PLANNED_SHARED_SCHEMA: PlannedTableSpec[] = [
  {
    tableName: 'profiles',
    responsibility: 'Perfis administrativos vinculados a auth.users com função e estado ativo.',
    rlsPolicySummary: 'Leitura própria ou Admin; ativação e promoção exclusivas a super_admin.',
    sharedWithPublicStore: false,
  },
  {
    tableName: 'categories',
    responsibility: 'Categorias do catálogo com proteção de integridade antes de eliminar.',
    rlsPolicySummary: 'Leitura pública apenas se is_active = true; escrita restrita ao catálogo.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'products',
    responsibility: 'Catálogo de produtos, preços em Kz, SKU único, destaques, ordem e stock.',
    rlsPolicySummary: 'Leitura pública apenas se status = active e categoria ativa; escrita restrita.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'product_media',
    responsibility: 'Imagens e vídeos no bucket público Supabase Storage (product-media).',
    rlsPolicySummary: 'Leitura pública de produtos publicados; upload/remoção restritos ao catálogo.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'customers',
    responsibility: 'Base unificada de clientes com telefone angolano normalizado único (+244...).',
    rlsPolicySummary: 'Sem leitura pública; associação segura via RPC create_storefront_order.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'orders',
    responsibility: 'Encomendas da loja e manuais com cálculo e validação de loja aberta no servidor.',
    rlsPolicySummary: 'Sem leitura pública; registo público validado via RPC SECURITY DEFINER.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'order_items',
    responsibility: 'Itens históricos com preço unitário e subtotal congelados no momento da compra.',
    rlsPolicySummary: 'Sem leitura pública; inserido atomicamente no registo da encomenda.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'customer_notes',
    responsibility: 'Histórico cronológico de acompanhamento comercial no CRM.',
    rlsPolicySummary: 'Acesso exclusivo a super_admin, admin e crm_agent.',
    sharedWithPublicStore: false,
  },
  {
    tableName: 'customer_tags',
    responsibility: 'Etiquetas personalizadas para segmentação comercial no CRM.',
    rlsPolicySummary: 'Gestão exclusiva para perfis de CRM e Administração.',
    sharedWithPublicStore: false,
  },
  {
    tableName: 'customer_tag_assignments',
    responsibility: 'Associação N:N sem duplicados entre clientes e etiquetas.',
    rlsPolicySummary: 'Gestão exclusiva para perfis de CRM e Administração.',
    sharedWithPublicStore: false,
  },
  {
    tableName: 'crm_tasks',
    responsibility: 'Tarefas automatizadas e manuais de follow-up comercial com controlo de prazo.',
    rlsPolicySummary: 'Acesso exclusivo a super_admin, admin e crm_agent.',
    sharedWithPublicStore: false,
  },
  {
    tableName: 'marketing_settings',
    responsibility: 'Configuração única por fornecedor (meta_pixel), consentimento e eventos.',
    rlsPolicySummary: 'Edição restrita a super_admin, admin e marketing_manager (Pixel adiado).',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'store_settings',
    responsibility: 'Identidade, contactos oficiais, estado da loja (ativa/encerrada) e zonas de entrega.',
    rlsPolicySummary: 'Leitura pública apenas de chaves comerciais públicas; edição exclusiva Admin.',
    sharedWithPublicStore: true,
  },
  {
    tableName: 'activity_logs',
    responsibility: 'Registo imutável (append-only) de auditoria administrativa.',
    rlsPolicySummary: 'Apenas INSERT autenticado; sem políticas UPDATE ou DELETE.',
    sharedWithPublicStore: false,
  },
];
