import {
  CrmTask,
  Customer,
  DatePeriodFilter,
  Order,
  OrderStatus,
  Product,
} from '../types/domain';

export const CONFIRMED_SALE_STATUSES: OrderStatus[] = [
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
];

export const PENDING_ORDER_STATUSES: OrderStatus[] = [
  'received',
  'pending_confirmation',
];

/**
 * Formata valores monetários em Kwanzas (Kz) segundo o Manual de Marca da Bercali Store
 * Exemplo: 12500 -> "12.500 Kz"
 */
export function formatKwanza(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const isNegative = safe < 0;
  const digits = Math.abs(safe).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}${grouped} Kz`;
}

export function formatDatePt(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

export function formatDateTimePt(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} · ${hh}:${mm}`;
}

export function slugifyText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normaliza números de telefone de Angola (+244 + 9 dígitos) para evitar contactos duplicados no CRM.
 */
export function normalizeAngolaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00244') && digits.length === 14) {
    return `+244${digits.slice(5)}`;
  }
  if (digits.startsWith('244') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9 && (digits.startsWith('9') || digits.startsWith('2'))) {
    return `+244${digits}`;
  }
  return `+${digits}`;
}

/**
 * Valida estritamente o formato angolano: indicativo +244 seguido de 9 dígitos (ex.: +244 923 456 789).
 */
export function isValidAngolaWhatsApp(raw: string): boolean {
  const normalized = normalizeAngolaPhone(raw);
  return /^\+244[29]\d{8}$/.test(normalized);
}

export function isValidAngolaPhone(raw: string): boolean {
  const normalized = normalizeAngolaPhone(raw);
  return /^\+244[29]\d{8}$/.test(normalized) || /^\+\d{9,15}$/.test(normalized);
}

export function isValidEmailFormat(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isValidHttpsUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

export interface StoreContactsValidationInput {
  officialPhone?: string;
  officialWhatsApp?: string;
  commercialEmail?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
}

/**
 * Valida contactos institucionais e redes sociais sem obrigar ao preenchimento,
 * exigindo formato angolano (+244 e 9 dígitos) para WhatsApp e telefone da loja.
 */
export function validateStoreContactsInput(input: StoreContactsValidationInput): string | null {
  if (input.officialPhone?.trim() && !isValidAngolaWhatsApp(input.officialPhone)) {
    return 'Indica um número de telefone angolano válido (+244 e 9 dígitos, ex.: +244 923 000 000) ou deixa o campo em branco.';
  }
  if (input.officialWhatsApp?.trim() && !isValidAngolaWhatsApp(input.officialWhatsApp)) {
    return 'Indica um número de WhatsApp angolano válido (+244 e 9 dígitos, ex.: +244 923 000 000) ou deixa o campo em branco.';
  }
  if (input.commercialEmail?.trim() && !isValidEmailFormat(input.commercialEmail)) {
    return 'Indica um e-mail comercial válido (ex.: nome@dominio.ao) ou deixa o campo em branco.';
  }
  if (input.instagramUrl?.trim() && !isValidHttpsUrl(input.instagramUrl)) {
    return 'O link do Instagram deve ser um URL completo iniciado por https://.';
  }
  if (input.facebookUrl?.trim() && !isValidHttpsUrl(input.facebookUrl)) {
    return 'O link do Facebook deve ser um URL completo iniciado por https://.';
  }
  if (input.tiktokUrl?.trim() && !isValidHttpsUrl(input.tiktokUrl)) {
    return 'O link do TikTok deve ser um URL completo iniciado por https://.';
  }
  return null;
}

/**
 * Constrói o link oficial wa.me com mensagem pré-preenchida para a loja online.
 * Devolve null quando o WhatsApp não está configurado ou não respeita +244 + 9 dígitos.
 */
export function buildStorefrontWhatsAppUrl(params: {
  whatsappRaw: string;
  template?: string;
  product?: {
    name: string;
    sku: string;
    effectivePriceKz: number;
  };
  productName?: string;
  productSku?: string;
  priceKz?: number;
  quantity?: number;
  customMessage?: string;
}): string | null {
  const raw = (params.whatsappRaw || '').trim();
  if (!raw || !isValidAngolaWhatsApp(raw)) {
    return null;
  }

  const digits = normalizeAngolaPhone(raw).replace(/\D/g, '');
  if (!digits) return null;

  const resolvedProduct =
    params.product ||
    (params.productName
      ? {
          name: params.productName,
          sku: params.productSku || '',
          effectivePriceKz: params.priceKz ?? 0,
        }
      : null);

  let text = (params.customMessage || '').trim();
  if (!text && resolvedProduct) {
    const baseTemplate =
      params.template?.trim() ||
      'Olá Bercali Store! Gostaria de encomendar o produto *{produto}* (Ref.: {sku}) pelo valor de *{preco}*.';
    const qty = Math.max(1, Math.round(params.quantity || 1));
    text = baseTemplate
      .replace(/\{produto\}/gi, resolvedProduct.name.trim())
      .replace(/\{sku\}/gi, resolvedProduct.sku.trim())
      .replace(/\{preco\}/gi, formatKwanza(resolvedProduct.effectivePriceKz));
    if (qty > 1) {
      text = `${text} Quantidade: ${qty} un.`;
    }
  } else if (!text) {
    text = 'Olá Bercali Store! Gostaria de obter informações sobre os vossos produtos.';
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Valida o formato do Meta Pixel ID (15 ou 16 dígitos numéricos).
 */
export function validatePixelId(pixelId: string): { valid: boolean; error?: string } {
  const trimmed = pixelId.trim();
  if (!trimmed) {
    return { valid: false, error: 'Introduz o identificador numérico do Meta Pixel.' };
  }
  if (!/^\d{15,16}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'O Meta Pixel ID deve conter exatamente 15 ou 16 dígitos numéricos (ex.: 104928374650192).',
    };
  }
  return { valid: true };
}

/**
 * Deteta se uma chave JWT corresponde perigosamente à chave privilegiada `service_role`.
 * Impede uso acidental de credenciais administrativas no browser.
 */
export function detectUnsafeServiceRoleJwt(jwtKey: string): boolean {
  const trimmed = jwtKey.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('sb_secret_')) return true;

  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const jsonStr =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(jsonStr) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export interface ProductValidationInput {
  name: string;
  sku: string;
  categoryId: string;
  priceKz: number;
  promoPriceKz: number | null;
  trackStock: boolean;
  stockQuantity: number | null;
}

export function validateProductInput(input: ProductValidationInput): string | null {
  if (!input.name.trim() || input.name.trim().length < 2) {
    return 'Indica um nome válido para o produto (mínimo 2 caracteres).';
  }
  if (!input.sku.trim() || !/^[A-Za-z0-9_-]{3,32}$/.test(input.sku.trim())) {
    return 'O código SKU deve ter entre 3 e 32 caracteres alfanuméricos, hífen ou underscore.';
  }
  if (!input.categoryId.trim()) {
    return 'Seleciona uma categoria para o produto.';
  }
  if (!Number.isFinite(input.priceKz) || input.priceKz <= 0) {
    return 'O preço base deve ser superior a 0 Kz.';
  }
  if (input.promoPriceKz !== null) {
    if (!Number.isFinite(input.promoPriceKz) || input.promoPriceKz <= 0) {
      return 'O preço promocional deve ser superior a 0 Kz.';
    }
    if (input.promoPriceKz >= input.priceKz) {
      return 'O preço promocional deve ser inferior ao preço base.';
    }
  }
  if (input.trackStock) {
    if (input.stockQuantity === null || !Number.isFinite(input.stockQuantity) || input.stockQuantity < 0) {
      return 'Indica uma quantidade de stock igual ou superior a 0.';
    }
  }
  return null;
}

export function calculateOrderTotals(
  items: Array<{ quantity: number; unitPriceKz: number }>,
  deliveryFeeKz: number,
  discountKz = 0
): {
  subtotalKz: number;
  deliveryFeeKz: number;
  discountKz: number;
  totalKz: number;
} {
  const subtotalKz = items.reduce((sum, item) => {
    const qty = Math.max(0, Math.round(item.quantity || 0));
    const unit = Math.max(0, Math.round(item.unitPriceKz || 0));
    return sum + qty * unit;
  }, 0);
  const safeFee = Math.max(0, Math.round(deliveryFeeKz || 0));
  const safeDiscount = Math.max(0, Math.round(discountKz || 0));
  const totalKz = Math.max(0, subtotalKz + safeFee - safeDiscount);

  return {
    subtotalKz,
    deliveryFeeKz: safeFee,
    discountKz: safeDiscount,
    totalKz,
  };
}

export function classifyCrmTaskUrgency(
  task: Pick<CrmTask, 'status' | 'dueAt'>,
  referenceNowIso?: string
): 'completed' | 'cancelled' | 'overdue' | 'pending' {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'cancelled') return 'cancelled';
  if (task.dueAt) {
    const due = new Date(task.dueAt).getTime();
    const now = referenceNowIso ? new Date(referenceNowIso).getTime() : Date.now();
    if (!Number.isNaN(due) && !Number.isNaN(now) && due < now) {
      return 'overdue';
    }
  }
  return 'pending';
}

export function isIsoWithinPeriod(
  isoDate: string,
  filter: DatePeriodFilter,
  referenceNowIso?: string
): boolean {
  if (filter.preset === 'all') return true;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return false;

  const refEnd = referenceNowIso ? new Date(referenceNowIso) : new Date();
  refEnd.setUTCHours(23, 59, 59, 999);

  if (filter.preset === 'today') {
    const start = new Date(refEnd);
    start.setUTCHours(0, 0, 0, 0);
    return target >= start && target <= refEnd;
  }

  if (filter.preset === '7d' || filter.preset === '30d') {
    const days = filter.preset === '7d' ? 6 : 29;
    const start = new Date(refEnd);
    start.setUTCDate(start.getUTCDate() - days);
    start.setUTCHours(0, 0, 0, 0);
    return target >= start && target <= refEnd;
  }

  if (filter.preset === 'custom') {
    if (filter.startDate) {
      const start = new Date(`${filter.startDate}T00:00:00.000Z`);
      if (!Number.isNaN(start.getTime()) && target < start) return false;
    }
    if (filter.endDate) {
      const end = new Date(`${filter.endDate}T23:59:59.999Z`);
      if (!Number.isNaN(end.getTime()) && target > end) return false;
    }
    return true;
  }

  return true;
}

export function isConfirmedOrder(status: OrderStatus): boolean {
  return CONFIRMED_SALE_STATUSES.includes(status);
}

export interface DashboardMetrics {
  totalOrders: number;
  pendingOrders: number;
  confirmedOrdersCount: number;
  deliveredOrders: number;
  cancelledOrders: number;
  paidOrdersCount: number;
  confirmedSalesKz: number;
  pendingValueKz: number;
  totalCustomers: number;
  activeProducts: number;
  lowStockProducts: Product[];
  topProducts: Array<{
    productId: string;
    productName: string;
    sku: string;
    unitsConfirmed: number;
    revenueConfirmedKz: number;
  }>;
}

/**
 * Calcula métricas operacionais separando rigorosamente:
 * - Encomendas recebidas/pendentes (NÃO contam como vendas confirmadas)
 * - Vendas confirmadas (Confirmada, Em preparação, Enviada, Entregue)
 * - Encomendas entregues (apenas estado Entregue)
 */
export function calculateDashboardMetrics(
  orders: Order[],
  products: Product[],
  customers: Customer[],
  period: DatePeriodFilter,
  referenceNowIso?: string
): DashboardMetrics {
  const filteredOrders = orders.filter((o) =>
    isIsoWithinPeriod(o.createdAt, period, referenceNowIso)
  );

  let pendingOrders = 0;
  let confirmedOrdersCount = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;
  let paidOrdersCount = 0;
  let confirmedSalesKz = 0;
  let pendingValueKz = 0;

  const productAgg = new Map<
    string,
    { productId: string; productName: string; sku: string; unitsConfirmed: number; revenueConfirmedKz: number }
  >();

  for (const order of filteredOrders) {
    if (order.paymentStatus === 'paid') {
      paidOrdersCount += 1;
    }

    if (PENDING_ORDER_STATUSES.includes(order.status)) {
      pendingOrders += 1;
      pendingValueKz += order.totalKz;
    } else if (order.status === 'cancelled') {
      cancelledOrders += 1;
    }

    if (isConfirmedOrder(order.status)) {
      confirmedOrdersCount += 1;
      confirmedSalesKz += order.totalKz;

      if (order.status === 'delivered') {
        deliveredOrders += 1;
      }

      for (const item of order.items) {
        const key = item.productId || item.sku || item.productName;
        const current = productAgg.get(key) ?? {
          productId: key,
          productName: item.productName,
          sku: item.sku,
          unitsConfirmed: 0,
          revenueConfirmedKz: 0,
        };
        current.unitsConfirmed += item.quantity;
        current.revenueConfirmedKz += item.lineTotalKz ?? item.quantity * item.unitPriceKz;
        productAgg.set(key, current);
      }
    }
  }

  const activeProducts = products.filter((p) => p.status === 'active').length;
  const lowStockProducts = products.filter(
    (p) =>
      p.status === 'active' &&
      p.trackStock &&
      p.stockQuantity !== null &&
      p.stockQuantity <= p.lowStockThreshold
  );

  const topProducts = Array.from(productAgg.values()).sort(
    (a, b) => b.revenueConfirmedKz - a.revenueConfirmedKz || b.unitsConfirmed - a.unitsConfirmed
  );

  return {
    totalOrders: filteredOrders.length,
    pendingOrders,
    confirmedOrdersCount,
    deliveredOrders,
    cancelledOrders,
    paidOrdersCount,
    confirmedSalesKz,
    pendingValueKz,
    totalCustomers: customers.length,
    activeProducts,
    lowStockProducts,
    topProducts,
  };
}

export function generateCsvContent(headers: string[], rows: Array<Array<string | number>>): string {
  const escapeCell = (val: string | number): string => {
    const str = String(val ?? '');
    if (/[",;\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((row) => row.map(escapeCell).join(';')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

/**
 * Converte erros do Supabase / PostgreSQL em mensagens claras em português sem expor segredos.
 */
export function mapSupabaseErrorPt(err: unknown): string {
  if (!err) return 'Ocorreu um erro inesperado ao comunicar com o servidor.';

  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message || '')
      : err instanceof Error
        ? err.message
        : String(err);

  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  const lower = rawMessage.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Credenciais inválidas. Verifica o email institucional e a palavra-passe.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Este email ainda não foi confirmado no Supabase Authentication.';
  }
  if (lower.includes('jwt expired') || lower.includes('refresh_token_not_found')) {
    return 'A tua sessão expirou. Inicia sessão novamente para continuar.';
  }
  if (code === '42501' || lower.includes('row-level security')) {
    return 'Operação recusada pelas políticas de segurança (RLS): o teu perfil não tem permissão para esta ação.';
  }
  if (code === '23505' || lower.includes('duplicate key')) {
    if (lower.includes('sku')) {
      return 'Já existe um produto registado com este código SKU.';
    }
    if (lower.includes('normalized_phone')) {
      return 'Já existe um cliente registado com este número de telefone normalizado.';
    }
    if (lower.includes('slug')) {
      return 'Já existe um registo com este identificador (slug).';
    }
    if (lower.includes('email')) {
      return 'Já existe um registo associado a este endereço de email.';
    }
    return 'Já existe um registo duplicado com os mesmos identificadores únicos.';
  }
  if (code === '23503' || lower.includes('foreign key')) {
    return 'Operação bloqueada por integridade referencial: existem registos dependentes associados.';
  }
  if (code === '42P01' || code === 'PGRST205' || lower.includes('could not find the table')) {
    return 'As tabelas PostgreSQL ainda não existem no projeto Supabase. Executa primeiro as migrações em /supabase/migrations no SQL Editor.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Não foi possível contactar o servidor Supabase. Verifica a ligação de rede e o URL configurado.';
  }

  return rawMessage || 'Não foi possível concluir a operação na base de dados.';
}
