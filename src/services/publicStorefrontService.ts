import type { SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_STORE_SETTINGS } from '../data/demoSeed';
import {
  Category,
  DeliveryZoneSetting,
  Product,
  ProductMedia,
} from '../types/domain';
import {
  buildStorefrontWhatsAppUrl,
  isValidAngolaPhone,
  isValidEmailFormat,
  isValidHttpsUrl,
  mapSupabaseErrorPt,
  normalizeAngolaPhone,
} from '../utils/formatters';

export interface PublicStorefrontContacts {
  officialPhone: string;
  officialPhoneNormalized: string;
  telHref: string | null;
  officialWhatsApp: string;
  officialWhatsAppNormalized: string;
  whatsappWaMeUrl: string | null;
  commercialEmail: string;
  mailtoHref: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
}

export interface PublicStorefrontConfig {
  commercialName: string;
  slogan: string;
  storeDescription: string;
  currency: 'Kz';
  isStoreActive: boolean;
  closedMessage: string;
  promotionalBannerActive: boolean;
  promotionalBannerText: string;
  deliveryGeneralInfo: string;
  deliveryZones: DeliveryZoneSetting[];
  whatsappOrderMessageTemplate: string;
  contacts: PublicStorefrontContacts;
  updatedAt: string | null;
}

export interface PublicCatalogProduct extends Product {
  categoryName: string;
  categorySlug: string;
  effectivePriceKz: number;
  inStock: boolean;
  primaryImageUrl: string | null;
}

export interface PublicCatalogSnapshot {
  categories: Category[];
  products: PublicCatalogProduct[];
  featuredProducts: PublicCatalogProduct[];
}

export interface SubmitPublicOrderPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerCity?: string;
  deliveryAddress: string;
  deliveryZoneId?: string | null;
  deliveryFeeKz?: number;
  customerNotes?: string;
  source?: 'website' | 'whatsapp_store';
  idempotencyKey?: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface PublicOrderConfirmation {
  orderNumber: string;
  subtotalKz: number;
  deliveryFeeKz: number;
  totalKz: number;
  currency: 'AOA';
  status: 'received' | 'pending_confirmation';
  createdAt: string;
}

/**
 * Converte linhas públicas de `store_settings` num objeto seguro e tipado para a Loja Online,
 * sem nunca inventar contactos quando não estiverem configurados no Painel Administrativo.
 */
export function parsePublicStoreSettingsRows(
  rows: Array<Record<string, unknown>>
): PublicStorefrontConfig {
  let commercialName = INITIAL_STORE_SETTINGS.commercialName;
  let slogan = INITIAL_STORE_SETTINGS.slogan;
  let storeDescription = INITIAL_STORE_SETTINGS.storeDescription || '';
  let officialPhone = '';
  let officialWhatsApp = '';
  let commercialEmail = '';
  let instagramUrl = '';
  let facebookUrl = '';
  let tiktokUrl = '';
  let isStoreActive = true;
  let closedMessage =
    INITIAL_STORE_SETTINGS.closedMessage ||
    'A Bercali Store encontra-se temporariamente encerrada para atualização de catálogo. Voltamos em breve.';
  let promotionalBannerActive = false;
  let promotionalBannerText = '';
  let deliveryGeneralInfo = '';
  let deliveryZones: DeliveryZoneSetting[] = [];
  let whatsappOrderMessageTemplate =
    INITIAL_STORE_SETTINGS.whatsappOrderMessageTemplate ||
    'Olá Bercali Store! Gostaria de encomendar o produto *{produto}* (Ref.: {sku}) pelo valor de *{preco}*.';
  let latestUpdate: string | null = null;

  for (const row of rows) {
    const key = String(row.setting_key || '');
    const val = (row.setting_value && typeof row.setting_value === 'object'
      ? row.setting_value
      : {}) as Record<string, unknown>;
    const updated = row.updated_at ? String(row.updated_at) : null;
    if (updated && (!latestUpdate || updated > latestUpdate)) {
      latestUpdate = updated;
    }

    if (key === 'company_profile') {
      if (typeof val.commercialName === 'string' && val.commercialName.trim()) {
        commercialName = val.commercialName.trim();
      }
      if (typeof val.slogan === 'string') slogan = val.slogan.trim();
      if (typeof val.storeDescription === 'string') storeDescription = val.storeDescription.trim();
      if (typeof val.officialPhone === 'string') officialPhone = val.officialPhone.trim();
      if (typeof val.officialWhatsApp === 'string') officialWhatsApp = val.officialWhatsApp.trim();
      if (typeof val.commercialEmail === 'string') commercialEmail = val.commercialEmail.trim();
      if (typeof val.instagramUrl === 'string') instagramUrl = val.instagramUrl.trim();
      if (typeof val.facebookUrl === 'string') facebookUrl = val.facebookUrl.trim();
      if (typeof val.tiktokUrl === 'string') tiktokUrl = val.tiktokUrl.trim();
    } else if (key === 'storefront_config') {
      if (typeof val.isStoreActive === 'boolean') isStoreActive = val.isStoreActive;
      if (typeof val.closedMessage === 'string' && val.closedMessage.trim()) {
        closedMessage = val.closedMessage.trim();
      }
      if (typeof val.promotionalBannerActive === 'boolean') {
        promotionalBannerActive = val.promotionalBannerActive;
      }
      if (typeof val.promotionalBannerText === 'string') {
        promotionalBannerText = val.promotionalBannerText.trim();
      }
      if (
        typeof val.whatsappOrderMessageTemplate === 'string' &&
        val.whatsappOrderMessageTemplate.trim()
      ) {
        whatsappOrderMessageTemplate = val.whatsappOrderMessageTemplate.trim();
      }
    } else if (key === 'delivery_zones') {
      if (Array.isArray(val.zones)) {
        deliveryZones = (val.zones as DeliveryZoneSetting[]).filter(
          (z) => z && typeof z.name === 'string' && z.active !== false
        );
      }
      if (typeof val.generalInfo === 'string') {
        deliveryGeneralInfo = val.generalInfo.trim();
      }
    }
  }

  const validPhone = officialPhone && isValidAngolaPhone(officialPhone);
  const officialPhoneNormalized = validPhone ? normalizeAngolaPhone(officialPhone) : '';
  const validWa = officialWhatsApp && isValidAngolaPhone(officialWhatsApp);
  const officialWhatsAppNormalized = validWa ? normalizeAngolaPhone(officialWhatsApp) : '';
  const validEmail = commercialEmail && isValidEmailFormat(commercialEmail);

  return {
    commercialName,
    slogan,
    storeDescription,
    currency: 'Kz',
    isStoreActive,
    closedMessage,
    promotionalBannerActive: promotionalBannerActive && Boolean(promotionalBannerText),
    promotionalBannerText,
    deliveryGeneralInfo,
    deliveryZones,
    whatsappOrderMessageTemplate,
    contacts: {
      officialPhone: validPhone ? officialPhone : '',
      officialPhoneNormalized,
      telHref: officialPhoneNormalized ? `tel:${officialPhoneNormalized}` : null,
      officialWhatsApp: validWa ? officialWhatsApp : '',
      officialWhatsAppNormalized,
      whatsappWaMeUrl: validWa
        ? buildStorefrontWhatsAppUrl({
            whatsappRaw: officialWhatsApp,
            template: whatsappOrderMessageTemplate,
          })
        : null,
      commercialEmail: validEmail ? commercialEmail : '',
      mailtoHref: validEmail ? `mailto:${commercialEmail}` : null,
      instagramUrl: instagramUrl && isValidHttpsUrl(instagramUrl) ? instagramUrl : null,
      facebookUrl: facebookUrl && isValidHttpsUrl(facebookUrl) ? facebookUrl : null,
      tiktokUrl: tiktokUrl && isValidHttpsUrl(tiktokUrl) ? tiktokUrl : null,
    },
    updatedAt: latestUpdate,
  };
}

/**
 * Consulta pública (`anon`) das definições gerais da Bercali Store.
 * Exclui automaticamente chaves operacionais internas.
 */
export async function fetchPublicStoreConfig(
  client: SupabaseClient
): Promise<PublicStorefrontConfig> {
  const { data, error } = await client
    .from('store_settings')
    .select('setting_key, setting_value, updated_at')
    .in('setting_key', ['company_profile', 'delivery_zones', 'storefront_config']);

  if (error) {
    throw new Error(mapSupabaseErrorPt(error));
  }

  return parsePublicStoreSettingsRows((data || []) as Array<Record<string, unknown>>);
}

/**
 * Consulta pública (`anon`) do catálogo publicado na Bercali Store.
 * Aplica filtragem dupla (RLS no PostgreSQL + defesa em profundidade no cliente) para
 * garantir que categorias inativas e produtos inativos/arquivados nunca são expostos.
 */
export async function fetchPublicCatalog(
  client: SupabaseClient
): Promise<PublicCatalogSnapshot> {
  const [catRes, prodRes, mediaRes] = await Promise.all([
    client
      .from('categories')
      .select('id, name, slug, description, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    client
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    client
      .from('product_media')
      .select('id, product_id, media_type, storage_path, media_url, alt_text, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  if (catRes.error) throw new Error(mapSupabaseErrorPt(catRes.error));
  if (prodRes.error) throw new Error(mapSupabaseErrorPt(prodRes.error));
  if (mediaRes.error) throw new Error(mapSupabaseErrorPt(mediaRes.error));

  const categories: Category[] = (catRes.data || [])
    .filter((row: Record<string, unknown>) => Boolean(row.is_active))
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name || ''),
      slug: String(row.slug || ''),
      description: String(row.description || ''),
      isActive: true,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    }));

  const activeCategoryMap = new Map<string, Category>();
  for (const cat of categories) {
    activeCategoryMap.set(cat.id, cat);
  }

  const mediaByProduct = new Map<string, ProductMedia[]>();
  for (const m of mediaRes.data || []) {
    const row = m as Record<string, unknown>;
    const pid = String(row.product_id);
    const list = mediaByProduct.get(pid) || [];
    list.push({
      id: String(row.id),
      productId: pid,
      type: row.media_type === 'video' ? 'video' : 'image',
      url: String(row.media_url || ''),
      altText: String(row.alt_text || ''),
      isPrimary: list.length === 0,
      storageRef: String(row.storage_path || ''),
      sortOrder: Number(row.sort_order ?? list.length),
    });
    mediaByProduct.set(pid, list);
  }

  const products: PublicCatalogProduct[] = [];
  for (const p of prodRes.data || []) {
    const row = p as Record<string, unknown>;
    if (String(row.status) !== 'active') continue;
    const cat = activeCategoryMap.get(String(row.category_id || ''));
    if (!cat) continue;

    const id = String(row.id);
    const priceKz = Math.round(Number(row.price || 0));
    const promoPriceKz =
      row.sale_price !== null && row.sale_price !== undefined
        ? Math.round(Number(row.sale_price))
        : null;
    const effectivePriceKz = promoPriceKz !== null && promoPriceKz > 0 ? promoPriceKz : priceKz;
    const trackStock = Boolean(row.manage_stock);
    const stockQuantity =
      row.stock_quantity !== null && row.stock_quantity !== undefined
        ? Number(row.stock_quantity)
        : null;
    const isAvailable = Boolean(row.is_available ?? true);
    const inStock = isAvailable && (!trackStock || (stockQuantity ?? 0) > 0);
    const media = mediaByProduct.get(id) || [];
    const primaryImageUrl = media.find((m) => m.type === 'image')?.url || null;

    products.push({
      id,
      slug: String(row.slug || ''),
      sku: String(row.sku || ''),
      name: String(row.name || ''),
      description: String(row.description || ''),
      categoryId: cat.id,
      categoryName: cat.name,
      categorySlug: cat.slug,
      priceKz,
      promoPriceKz,
      effectivePriceKz,
      trackStock,
      stockQuantity,
      lowStockThreshold: Number(row.low_stock_threshold ?? 5),
      isAvailable,
      inStock,
      isFeatured: Boolean(row.is_featured ?? false),
      sortOrder: Number(row.sort_order ?? 0),
      status: 'active',
      visualPreset: (row.visual_preset as Product['visualPreset']) || 'tech',
      media,
      primaryImageUrl,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    });
  }

  products.sort((a, b) => {
    const featDiff = Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
    if (featDiff !== 0) return featDiff;
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return {
    categories,
    products,
    featuredProducts: products.filter((p) => Boolean(p.isFeatured)),
  };
}

/**
 * Regista uma encomenda pública da Loja Online usando a função RPC `create_storefront_order`
 * com validação no servidor (estado da loja aberta/fechada, preços reais, stock, deduplicação
 * de cliente por telefone +244 e proteção idempotente contra duplo clique).
 */
export async function submitPublicStoreOrder(
  client: SupabaseClient,
  payload: SubmitPublicOrderPayload
): Promise<PublicOrderConfirmation> {
  const trimmedName = payload.customerName.trim();
  if (trimmedName.length < 2) {
    throw new Error('Indica o teu nome completo (mínimo 2 caracteres).');
  }
  if (!isValidAngolaPhone(payload.customerPhone)) {
    throw new Error('Indica um número de telefone/WhatsApp válido (+244 9XX XXX XXX).');
  }
  if (payload.customerEmail?.trim() && !isValidEmailFormat(payload.customerEmail)) {
    throw new Error('O endereço de e-mail indicado não é válido.');
  }
  if (payload.deliveryAddress.trim().length < 3) {
    throw new Error('Indica a morada ou referência de entrega.');
  }
  if (!payload.items.length || payload.items.some((it) => !it.productId || it.quantity < 1)) {
    throw new Error('Adiciona pelo menos um produto válido ao teu pedido.');
  }

  // Verifica estado público da loja antes de enviar (além da validação obrigatória no PostgreSQL)
  const storeCfg = await fetchPublicStoreConfig(client);
  if (!storeCfg.isStoreActive) {
    throw new Error(storeCfg.closedMessage);
  }

  const idempotencyKey =
    payload.idempotencyKey?.trim() ||
    `stf-${normalizeAngolaPhone(payload.customerPhone)}-${Date.now()}`;

  const { data, error } = await client.rpc('create_storefront_order', {
    p_customer_name: trimmedName,
    p_customer_phone: payload.customerPhone.trim(),
    p_customer_email: payload.customerEmail?.trim() || null,
    p_customer_city: payload.customerCity?.trim() || 'Luanda',
    p_delivery_address: payload.deliveryAddress.trim(),
    p_delivery_zone_id: payload.deliveryZoneId || null,
    p_delivery_fee: Math.max(0, Math.round(payload.deliveryFeeKz || 0)),
    p_customer_notes: payload.customerNotes?.trim() || '',
    p_source: payload.source || 'website',
    p_idempotency_key: idempotencyKey,
    p_items: payload.items.map((it) => ({
      productId: it.productId,
      quantity: Math.max(1, Math.round(it.quantity)),
    })),
  });

  if (error) {
    const code = String((error as { code?: string }).code || '');
    if (code === 'PGRST202') {
      throw new Error(
        'A função de checkout público (create_storefront_order) ainda não foi ativada no Supabase. Executa a migração 20261025000004_storefront_integration.sql no SQL Editor.'
      );
    }
    throw new Error(mapSupabaseErrorPt(error));
  }

  const res = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    orderNumber: String(res.order_number || ''),
    subtotalKz: Math.round(Number(res.subtotal || 0)),
    deliveryFeeKz: Math.round(Number(res.delivery_fee || 0)),
    totalKz: Math.round(Number(res.total_amount || 0)),
    currency: 'AOA',
    status: (res.status as 'received' | 'pending_confirmation') || 'received',
    createdAt: String(res.created_at || new Date().toISOString()),
  };
}

export { buildStorefrontWhatsAppUrl };
