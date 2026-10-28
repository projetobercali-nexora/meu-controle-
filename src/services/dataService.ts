import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission } from '../auth/permissions';
import { INITIAL_MARKETING_SETTINGS, INITIAL_STORE_SETTINGS } from '../data/demoSeed';
import {
  ActivityLog,
  AdminProfile,
  Category,
  CrmStage,
  CrmTask,
  CrmTaskStatus,
  Customer,
  CustomerNote,
  CustomerTag,
  MarketingSettings,
  Order,
  OrderItem,
  OrderOrigin,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentStatus,
  PermissionKey,
  Product,
  ProductMedia,
  ProductStatus,
  StoreSettings,
  UserRole,
  WhatsAppAttendanceOutcome,
} from '../types/domain';
import {
  isValidAngolaPhone,
  mapSupabaseErrorPt,
  normalizeAngolaPhone,
  slugifyText,
  validatePixelId,
  validateProductInput,
  validateStoreContactsInput,
} from '../utils/formatters';

export interface ServiceActor {
  id: string;
  name: string;
  role: UserRole;
}

export interface AdminSnapshot {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  customerTags: CustomerTag[];
  customerNotes: CustomerNote[];
  crmTasks: CrmTask[];
  orders: Order[];
  marketingSettings: MarketingSettings;
  marketingLoadError: string | null;
  storeSettings: StoreSettings;
  profiles: AdminProfile[];
  activityLogs: ActivityLog[];
}

export interface UpsertProductPayload {
  id?: string;
  sku: string;
  name: string;
  slug?: string;
  description: string;
  categoryId: string;
  priceKz: number;
  promoPriceKz: number | null;
  trackStock: boolean;
  stockQuantity: number | null;
  lowStockThreshold: number;
  isAvailable: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  status: ProductStatus;
  visualPreset: Product['visualPreset'];
  media: ProductMedia[];
}

export interface UpsertCategoryPayload {
  id?: string;
  name: string;
  slug?: string;
  description: string;
  isActive: boolean;
}

export interface UpsertCustomerPayload {
  id?: string;
  name: string;
  phoneRaw: string;
  email: string;
  city: string;
  source?: OrderOrigin | 'website';
  crmStage: CrmStage;
  tagIds: string[];
  internalSummary: string;
}

export interface CreateOrderPayload {
  customerId?: string;
  newCustomer?: {
    name: string;
    phoneRaw: string;
    email?: string;
    city?: string;
  };
  origin: OrderOrigin;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  whatsappOutcome: WhatsAppAttendanceOutcome;
  deliveryAddress: string;
  deliveryFeeKz: number;
  discountKz?: number;
  internalNotes: string;
  orderPrefix?: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface CreateCrmTaskPayload {
  customerId: string;
  orderId?: string | null;
  assignedTo?: string | null;
  title: string;
  description: string;
  dueAt: string | null;
}

export function createEmptyAdminSnapshot(): AdminSnapshot {
  return {
    categories: [],
    products: [],
    customers: [],
    customerTags: [],
    customerNotes: [],
    crmTasks: [],
    orders: [],
    marketingSettings: structuredClone(INITIAL_MARKETING_SETTINGS),
    marketingLoadError: null,
    storeSettings: structuredClone(INITIAL_STORE_SETTINGS),
    profiles: [],
    activityLogs: [],
  };
}

export function assertActorPermission(actor: ServiceActor, permission: PermissionKey): void {
  if (!hasPermission(actor.role, permission)) {
    throw new Error('Sem permissão administrativa para executar esta operação.');
  }
}

async function appendAuditLog(
  client: SupabaseClient,
  actor: ServiceActor,
  action: string,
  entityType: ActivityLog['entityType'],
  entityRef: string,
  details: Record<string, unknown>
): Promise<void> {
  await client.from('activity_logs').insert({
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action,
    entity_type: entityType,
    entity_id: entityRef,
    details,
  });
}

// =============================================================================
// Carregamento completo e consistente do Snapshot a partir do Supabase
// =============================================================================
export async function fetchAdminSnapshot(
  client: SupabaseClient,
  actor: ServiceActor
): Promise<AdminSnapshot> {
  const canReadCustomers = hasPermission(actor.role, 'customers:view');
  const canReadCrm = hasPermission(actor.role, 'crm:view');
  const canReadUsers = hasPermission(actor.role, 'users:view');

  const [
    catRes,
    prodRes,
    mediaRes,
    ordRes,
    ordItemsRes,
    mktRes,
    storeRes,
    logsRes,
    custRes,
    tagsRes,
    tagAssignRes,
    notesRes,
    tasksRes,
    profilesRes,
  ] = await Promise.all([
    client.from('categories').select('*').order('name', { ascending: true }),
    client.from('products').select('*').order('created_at', { ascending: false }),
    client.from('product_media').select('*').order('sort_order', { ascending: true }),
    client.from('orders').select('*').order('created_at', { ascending: false }),
    client.from('order_items').select('*').order('created_at', { ascending: true }),
    client.from('marketing_settings').select('*').eq('provider', 'meta_pixel').maybeSingle(),
    client.from('store_settings').select('*'),
    client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(80),
    canReadCustomers
      ? client.from('customers').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canReadCustomers || canReadCrm
      ? client.from('customer_tags').select('*').order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    canReadCustomers || canReadCrm
      ? client.from('customer_tag_assignments').select('*')
      : Promise.resolve({ data: [], error: null }),
    canReadCrm
      ? client.from('customer_notes').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canReadCrm
      ? client.from('crm_tasks').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canReadUsers
      ? client.from('profiles').select('*').order('created_at', { ascending: true })
      : client.from('profiles').select('*').eq('id', actor.id),
  ]);

  if (catRes.error) throw new Error(mapSupabaseErrorPt(catRes.error));
  if (prodRes.error) throw new Error(mapSupabaseErrorPt(prodRes.error));
  if (ordRes.error) throw new Error(mapSupabaseErrorPt(ordRes.error));

  const categories: Category[] = (catRes.data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name || ''),
    slug: String(row.slug || ''),
    description: String(row.description || ''),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }));

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
      storageRef: String(row.storage_path || row.media_url || ''),
      sortOrder: Number(row.sort_order ?? list.length),
    });
    mediaByProduct.set(pid, list);
  }

  const products: Product[] = (prodRes.data || []).map((row: Record<string, unknown>) => {
    const id = String(row.id);
    return {
      id,
      slug: String(row.slug || ''),
      sku: String(row.sku || ''),
      name: String(row.name || ''),
      description: String(row.description || ''),
      categoryId: String(row.category_id || ''),
      priceKz: Math.round(Number(row.price || 0)),
      promoPriceKz: row.sale_price !== null && row.sale_price !== undefined ? Math.round(Number(row.sale_price)) : null,
      trackStock: Boolean(row.manage_stock),
      stockQuantity: row.stock_quantity !== null && row.stock_quantity !== undefined ? Number(row.stock_quantity) : null,
      lowStockThreshold: Number(row.low_stock_threshold ?? 5),
      isAvailable: Boolean(row.is_available ?? true),
      isFeatured: Boolean(row.is_featured ?? false),
      sortOrder: Number(row.sort_order ?? 0),
      status: (row.status as ProductStatus) || 'active',
      visualPreset: (row.visual_preset as Product['visualPreset']) || 'tech',
      media: mediaByProduct.get(id) || [],
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  });

  products.sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const tagMapByCustomer = new Map<string, string[]>();
  for (const ta of tagAssignRes.data || []) {
    const row = ta as Record<string, unknown>;
    const cid = String(row.customer_id);
    const list = tagMapByCustomer.get(cid) || [];
    list.push(String(row.tag_id));
    tagMapByCustomer.set(cid, list);
  }

  const customers: Customer[] = (custRes.data || []).map((row: Record<string, unknown>) => {
    const id = String(row.id);
    return {
      id,
      name: String(row.full_name || ''),
      phoneRaw: String(row.phone || ''),
      phoneNormalized: String(row.normalized_phone || ''),
      email: String(row.email || ''),
      city: String(row.city || 'Luanda'),
      source: ((row.source as Customer['source']) || 'manual_admin'),
      crmStage: ((row.status as CrmStage) || 'new_contact'),
      tagIds: tagMapByCustomer.get(id) || [],
      internalSummary: String(row.notes || ''),
      lastContactAt: row.last_contact_at ? String(row.last_contact_at) : null,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  });

  const customerMap = new Map<string, Customer>();
  for (const c of customers) customerMap.set(c.id, c);

  const customerTags: CustomerTag[] = (tagsRes.data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name || ''),
    tone: ((row.color as CustomerTag['tone']) || 'orange'),
  }));

  const profiles: AdminProfile[] = (profilesRes.data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    fullName: String(row.full_name || ''),
    email: String(row.email || ''),
    phone: row.phone ? String(row.phone) : null,
    role: ((row.role as UserRole) || 'crm_agent'),
    isActive: Boolean(row.is_active),
    lastActiveAt: row.last_active_at ? String(row.last_active_at) : null,
    createdAt: String(row.created_at || ''),
  }));

  const profileMap = new Map<string, AdminProfile>();
  for (const p of profiles) profileMap.set(p.id, p);

  const customerNotes: CustomerNote[] = (notesRes.data || []).map((row: Record<string, unknown>) => {
    const authorId = row.created_by ? String(row.created_by) : '';
    const authorName =
      String(row.author_name || '').trim() ||
      profileMap.get(authorId)?.fullName ||
      'Equipa Bercali';
    return {
      id: String(row.id),
      customerId: String(row.customer_id),
      authorName,
      channel: ((row.note_type as CustomerNote['channel']) || 'nota_interna'),
      content: String(row.content || ''),
      createdAt: String(row.created_at || ''),
    };
  });

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of ordItemsRes.data || []) {
    const row = item as Record<string, unknown>;
    const oid = String(row.order_id);
    const list = itemsByOrder.get(oid) || [];
    list.push({
      id: String(row.id),
      orderId: oid,
      productId: row.product_id ? String(row.product_id) : null,
      productName: String(row.product_name || ''),
      sku: String(row.product_sku || ''),
      quantity: Number(row.quantity || 1),
      unitPriceKz: Math.round(Number(row.unit_price || 0)),
      lineTotalKz: Math.round(Number(row.line_total ?? Number(row.quantity || 1) * Number(row.unit_price || 0))),
    });
    itemsByOrder.set(oid, list);
  }

  const orders: Order[] = (ordRes.data || []).map((row: Record<string, unknown>) => {
    const id = String(row.id);
    const cid = String(row.customer_id || '');
    const cust = customerMap.get(cid);
    const rawHistory = Array.isArray(row.status_history) ? row.status_history : [];
    const statusHistory: OrderStatusHistoryEntry[] = rawHistory.map((h: unknown, idx: number) => {
      const obj = (h && typeof h === 'object' ? h : {}) as Record<string, unknown>;
      return {
        id: String(obj.id || `${id}-h-${idx}`),
        orderId: id,
        fromStatus: (obj.fromStatus as OrderStatus | null) || null,
        toStatus: ((obj.toStatus as OrderStatus) || (row.status as OrderStatus) || 'received'),
        changedBy: String(obj.changedBy || 'Sistema'),
        note: String(obj.note || ''),
        changedAt: String(obj.changedAt || row.updated_at || row.created_at || ''),
      };
    });

    return {
      id,
      code: String(row.order_number || ''),
      customerId: cid,
      customerName: cust?.name || 'Cliente Registado',
      customerPhone: cust?.phoneNormalized || 'Contacto reservado',
      items: itemsByOrder.get(id) || [],
      subtotalKz: Math.round(Number(row.subtotal || 0)),
      deliveryFeeKz: Math.round(Number(row.delivery_fee || 0)),
      discountKz: Math.round(Number(row.discount_amount || 0)),
      totalKz: Math.round(Number(row.total_amount || 0)),
      currency: 'AOA',
      origin: ((row.source as OrderOrigin) || 'manual_admin'),
      status: ((row.status as OrderStatus) || 'received'),
      paymentStatus: ((row.payment_status as PaymentStatus) || 'pending'),
      whatsappOutcome: ((row.whatsapp_outcome as WhatsAppAttendanceOutcome) || 'unverified'),
      deliveryAddress: String(row.delivery_address || ''),
      internalNotes: String(row.internal_notes || ''),
      confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
      deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
      statusHistory,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  });

  const orderMap = new Map<string, Order>();
  for (const o of orders) orderMap.set(o.id, o);

  const crmTasks: CrmTask[] = (tasksRes.data || []).map((row: Record<string, unknown>) => {
    const cid = String(row.customer_id || '');
    const cust = customerMap.get(cid);
    const oid = row.order_id ? String(row.order_id) : null;
    const assignedTo = row.assigned_to ? String(row.assigned_to) : null;
    return {
      id: String(row.id),
      customerId: cid,
      customerName: cust?.name || 'Cliente',
      customerPhone: cust?.phoneNormalized || '',
      orderId: oid,
      orderCode: oid ? orderMap.get(oid)?.code || null : null,
      assignedTo,
      assigneeName: assignedTo ? profileMap.get(assignedTo)?.fullName || null : null,
      title: String(row.title || ''),
      description: String(row.description || ''),
      dueAt: row.due_at ? String(row.due_at) : null,
      status: ((row.status as CrmTaskStatus) || 'pending'),
      completedAt: row.completed_at ? String(row.completed_at) : null,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  });

  // Marketing settings
  let marketingSettings = structuredClone(INITIAL_MARKETING_SETTINGS);
  const marketingLoadError = mktRes.error ? mapSupabaseErrorPt(mktRes.error) : null;
  if (mktRes.data) {
    const m = mktRes.data as Record<string, unknown>;
    const savedEvents = Array.isArray(m.events_config) && m.events_config.length > 0
      ? (m.events_config as MarketingSettings['events'])
      : INITIAL_MARKETING_SETTINGS.events;
    marketingSettings = {
      provider: String(m.provider || 'meta_pixel'),
      pixelId: String(m.pixel_id || ''),
      isActive: Boolean(m.is_enabled),
      requireCookieConsent: Boolean(m.consent_required ?? true),
      strictPurchaseConfirmation: true,
      events: savedEvents.map((ev) =>
        ev.eventName === 'Purchase' ? { ...ev, requiresRealConfirmation: true } : ev
      ),
      updatedAt: m.updated_at ? String(m.updated_at) : null,
      updatedBy: m.updated_by ? profileMap.get(String(m.updated_by))?.fullName || null : null,
    };
  }

  // Store settings (key-value)
  const storeSettings = structuredClone(INITIAL_STORE_SETTINGS);
  let latestStoreUpdate: string | null = null;
  for (const item of storeRes.data || []) {
    const row = item as Record<string, unknown>;
    const key = String(row.setting_key || '');
    const val = (row.setting_value && typeof row.setting_value === 'object'
      ? row.setting_value
      : {}) as Record<string, unknown>;
    const rowUpdated = row.updated_at ? String(row.updated_at) : null;
    if (rowUpdated && (!latestStoreUpdate || rowUpdated > latestStoreUpdate)) {
      latestStoreUpdate = rowUpdated;
    }

    if (key === 'company_profile') {
      if (typeof val.commercialName === 'string' && val.commercialName.trim()) {
        storeSettings.commercialName = val.commercialName;
      }
      if (typeof val.slogan === 'string') storeSettings.slogan = val.slogan;
      if (typeof val.storeDescription === 'string') storeSettings.storeDescription = val.storeDescription;
      if (typeof val.officialPhone === 'string') storeSettings.officialPhone = val.officialPhone;
      if (typeof val.officialWhatsApp === 'string') storeSettings.officialWhatsApp = val.officialWhatsApp;
      if (typeof val.commercialEmail === 'string') storeSettings.commercialEmail = val.commercialEmail;
      if (typeof val.instagramUrl === 'string') storeSettings.instagramUrl = val.instagramUrl;
      if (typeof val.facebookUrl === 'string') storeSettings.facebookUrl = val.facebookUrl;
      if (typeof val.tiktokUrl === 'string') storeSettings.tiktokUrl = val.tiktokUrl;
    } else if (key === 'operations_preferences') {
      if (typeof val.defaultLowStockThreshold === 'number') {
        storeSettings.defaultLowStockThreshold = val.defaultLowStockThreshold;
      }
      if (typeof val.orderCodePrefix === 'string' && val.orderCodePrefix.trim()) {
        storeSettings.orderCodePrefix = val.orderCodePrefix;
      }
      if (typeof val.requireWhatsAppManualVerification === 'boolean') {
        storeSettings.requireWhatsAppManualVerification = val.requireWhatsAppManualVerification;
      }
    } else if (key === 'delivery_zones') {
      if (Array.isArray(val.zones)) {
        storeSettings.deliveryZones = val.zones as StoreSettings['deliveryZones'];
      }
      if (typeof val.generalInfo === 'string') {
        storeSettings.deliveryGeneralInfo = val.generalInfo;
      }
    } else if (key === 'storefront_config') {
      if (typeof val.isStoreActive === 'boolean') {
        storeSettings.isStoreActive = val.isStoreActive;
      }
      if (typeof val.closedMessage === 'string') {
        storeSettings.closedMessage = val.closedMessage;
      }
      if (typeof val.promotionalBannerActive === 'boolean') {
        storeSettings.promotionalBannerActive = val.promotionalBannerActive;
      }
      if (typeof val.promotionalBannerText === 'string') {
        storeSettings.promotionalBannerText = val.promotionalBannerText;
      }
      if (typeof val.whatsappOrderMessageTemplate === 'string') {
        storeSettings.whatsappOrderMessageTemplate = val.whatsappOrderMessageTemplate;
      }
    }
  }
  storeSettings.updatedAt = latestStoreUpdate;

  const activityLogs: ActivityLog[] = (logsRes.data || []).map((row: Record<string, unknown>) => {
    const detailsObj = row.details && typeof row.details === 'object'
      ? (row.details as Record<string, unknown>)
      : {};
    const summaryText =
      typeof detailsObj.summary === 'string'
        ? detailsObj.summary
        : Object.keys(detailsObj).length > 0
          ? JSON.stringify(detailsObj)
          : '';
    return {
      id: String(row.id),
      actorName: String(row.actor_name || 'Administrador'),
      actorRole: ((row.actor_role as UserRole) || 'admin'),
      action: String(row.action || ''),
      entityType: ((row.entity_type as ActivityLog['entityType']) || 'settings'),
      entityRef: String(row.entity_id || '—'),
      details: summaryText,
      createdAt: String(row.created_at || ''),
    };
  });

  return {
    categories,
    products,
    customers,
    customerTags,
    customerNotes,
    crmTasks,
    orders,
    marketingSettings,
    marketingLoadError,
    storeSettings,
    profiles,
    activityLogs,
  };
}

// =============================================================================
// Operações de Escrita Reais no Supabase
// =============================================================================

export async function uploadProductMediaToStorage(
  client: SupabaseClient,
  file: File,
  productSkuOrDraft: string,
  actor: ServiceActor
): Promise<ProductMedia> {
  assertActorPermission(actor, 'products:write');

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
  ];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato não suportado. Usa imagens (JPG, PNG, WEBP, GIF) ou vídeo (MP4, WEBM).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('O ficheiro excede o limite máximo de 15 MB.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const safePrefix = slugifyText(productSkuOrDraft || 'produto') || 'produto';
  const storagePath = `products/${safePrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error: uploadErr } = await client.storage
    .from('product-media')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (uploadErr) {
    throw new Error(mapSupabaseErrorPt(uploadErr));
  }

  const { data: pubData } = client.storage.from('product-media').getPublicUrl(storagePath);
  const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

  return {
    id: `temp-${Date.now()}`,
    productId: '',
    type: mediaType,
    url: pubData.publicUrl,
    altText: file.name,
    isPrimary: false,
    storageRef: storagePath,
  };
}

export async function upsertProductDb(
  client: SupabaseClient,
  payload: UpsertProductPayload,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'products:write');

  const validationError = validateProductInput({
    name: payload.name,
    sku: payload.sku,
    categoryId: payload.categoryId,
    priceKz: payload.priceKz,
    promoPriceKz: payload.promoPriceKz,
    trackStock: payload.trackStock,
    stockQuantity: payload.stockQuantity,
  });
  if (validationError) throw new Error(validationError);

  const normalizedSku = payload.sku.trim().toUpperCase();
  const baseSlug = slugifyText(payload.slug || `${payload.name}-${normalizedSku}`);

  const baseRowPayload: Record<string, unknown> = {
    name: payload.name.trim(),
    slug: baseSlug,
    sku: normalizedSku,
    description: payload.description.trim(),
    price: Math.round(payload.priceKz),
    sale_price: payload.promoPriceKz !== null ? Math.round(payload.promoPriceKz) : null,
    category_id: payload.categoryId,
    manage_stock: payload.trackStock,
    stock_quantity: payload.trackStock ? Math.max(0, Math.round(payload.stockQuantity ?? 0)) : null,
    low_stock_threshold: Math.max(0, Math.round(payload.lowStockThreshold ?? 5)),
    is_available: payload.status === 'active' ? payload.isAvailable : false,
    status: payload.status,
    visual_preset: payload.visualPreset,
  };

  const hasOrderingFields =
    payload.isFeatured !== undefined || payload.sortOrder !== undefined;
  const fullRowPayload: Record<string, unknown> = hasOrderingFields
    ? {
        ...baseRowPayload,
        is_featured: Boolean(payload.isFeatured),
        sort_order: Math.round(payload.sortOrder ?? 0),
      }
    : baseRowPayload;

  const isMissingOptionalColumnError = (err: unknown): boolean => {
    if (!err || typeof err !== 'object') return false;
    const code = String((err as { code?: unknown }).code || '');
    const msg = String((err as { message?: unknown }).message || '').toLowerCase();
    return (
      code === 'PGRST204' &&
      (msg.includes('is_featured') || msg.includes('sort_order'))
    );
  };

  let productId = payload.id;

  if (productId) {
    let { error } = await client.from('products').update(fullRowPayload).eq('id', productId);
    if (error && hasOrderingFields && isMissingOptionalColumnError(error)) {
      ({ error } = await client.from('products').update(baseRowPayload).eq('id', productId));
    }
    if (error) throw new Error(mapSupabaseErrorPt(error));
  } else {
    let { data, error } = await client
      .from('products')
      .insert(fullRowPayload)
      .select('id')
      .single();
    if (error && hasOrderingFields && isMissingOptionalColumnError(error)) {
      ({ data, error } = await client
        .from('products')
        .insert(baseRowPayload)
        .select('id')
        .single());
    }
    if (error) throw new Error(mapSupabaseErrorPt(error));
    productId = String((data as { id: string }).id);
  }

  // Sincroniza product_media de forma ordenada
  const { error: delMediaErr } = await client
    .from('product_media')
    .delete()
    .eq('product_id', productId);
  if (delMediaErr) throw new Error(mapSupabaseErrorPt(delMediaErr));

  if (payload.media.length > 0) {
    const mediaRows = payload.media.map((m, idx) => ({
      product_id: productId,
      media_type: m.type,
      storage_path: m.storageRef || '',
      media_url: m.url,
      alt_text: m.altText || payload.name.trim(),
      sort_order: idx,
    }));
    const { error: insMediaErr } = await client.from('product_media').insert(mediaRows);
    if (insMediaErr) throw new Error(mapSupabaseErrorPt(insMediaErr));
  }

  await appendAuditLog(
    client,
    actor,
    payload.id ? 'Produto atualizado' : 'Produto criado',
    'product',
    normalizedSku,
    { summary: `Produto "${payload.name.trim()}" (${normalizedSku}) guardado no catálogo.` }
  );
}

export async function setProductStatusDb(
  client: SupabaseClient,
  productId: string,
  sku: string,
  status: ProductStatus,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'products:write');
  const updateBody: Record<string, unknown> = { status };
  if (status !== 'active') {
    updateBody.is_available = false;
  }
  const { error } = await client.from('products').update(updateBody).eq('id', productId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  const label = status === 'active' ? 'ativado' : status === 'inactive' ? 'desativado' : 'arquivado';
  await appendAuditLog(client, actor, `Produto ${label}`, 'product', sku, {
    summary: `Estado alterado para ${label} preservando o histórico de encomendas.`,
  });
}

export async function deleteProductDb(
  client: SupabaseClient,
  productId: string,
  productName: string,
  sku: string,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'products:write');

  const { count, error: countErr } = await client
    .from('order_items')
    .select('id', { head: true, count: 'exact' })
    .eq('product_id', productId);
  if (countErr) throw new Error(mapSupabaseErrorPt(countErr));

  if ((count ?? 0) > 0) {
    throw new Error(
      `Não é possível eliminar definitivamente "${productName}" (${sku}) porque está registado em ${count} item(ns) de encomenda. Utiliza "Desativar" ou "Arquivar" para retirá-lo da loja preservando o histórico comercial.`
    );
  }

  const { data: mediaRows } = await client
    .from('product_media')
    .select('storage_path')
    .eq('product_id', productId);

  const storagePaths = (mediaRows || [])
    .map((r: Record<string, unknown>) => String(r.storage_path || '').trim())
    .filter((p) => p.length > 0 && !p.startsWith('http://') && !p.startsWith('https://'));

  if (storagePaths.length > 0 && client.storage) {
    try {
      await client.storage.from('product-media').remove(storagePaths);
    } catch {
      // Prossegue com a remoção da linha caso algum objeto de Storage já não exista
    }
  }

  const { error } = await client.from('products').delete().eq('id', productId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Produto eliminado', 'product', sku, {
    summary: `Produto "${productName}" (${sku}) eliminado sem histórico de encomendas.`,
  });
}

export async function assignProductToCategoryDb(
  client: SupabaseClient,
  productId: string,
  categoryId: string,
  categoryName: string,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'categories:write');
  const { error } = await client
    .from('products')
    .update({ category_id: categoryId })
    .eq('id', productId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Produto associado a categoria', 'category', categoryName, {
    summary: `Produto reatribuído à categoria "${categoryName}".`,
  });
}

export async function upsertCategoryDb(
  client: SupabaseClient,
  payload: UpsertCategoryPayload,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'categories:write');
  const trimmedName = payload.name.trim();
  if (trimmedName.length < 2) {
    throw new Error('Indica um nome válido para a categoria (mínimo 2 caracteres).');
  }

  const slug = slugifyText(payload.slug || trimmedName);
  if (slug.length < 2) {
    throw new Error('O identificador (slug) da categoria é inválido.');
  }

  const row = {
    name: trimmedName,
    slug,
    description: payload.description.trim(),
    is_active: payload.isActive,
  };

  if (payload.id) {
    const { error } = await client.from('categories').update(row).eq('id', payload.id);
    if (error) throw new Error(mapSupabaseErrorPt(error));
  } else {
    const { error } = await client.from('categories').insert(row);
    if (error) throw new Error(mapSupabaseErrorPt(error));
  }

  await appendAuditLog(
    client,
    actor,
    payload.id ? 'Categoria atualizada' : 'Categoria criada',
    'category',
    trimmedName,
    { summary: `Categoria "/${slug}" guardada.` }
  );
}

export async function toggleCategoryActiveDb(
  client: SupabaseClient,
  categoryId: string,
  categoryName: string,
  isActive: boolean,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'categories:write');
  const { error } = await client
    .from('categories')
    .update({ is_active: isActive })
    .eq('id', categoryId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(
    client,
    actor,
    isActive ? 'Categoria ativada' : 'Categoria desativada',
    'category',
    categoryName,
    { summary: `Disponibilidade alterada para ${isActive ? 'ativa' : 'inativa'}.` }
  );
}

export async function deleteCategoryDb(
  client: SupabaseClient,
  categoryId: string,
  categoryName: string,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'categories:write');

  const { count, error: countErr } = await client
    .from('products')
    .select('id', { head: true, count: 'exact' })
    .eq('category_id', categoryId);
  if (countErr) throw new Error(mapSupabaseErrorPt(countErr));

  if ((count ?? 0) > 0) {
    throw new Error(
      `Não é possível eliminar "${categoryName}" porque possui ${count} produto(s) associado(s). Reatribui os produtos ou desativa a categoria.`
    );
  }

  const { error } = await client.from('categories').delete().eq('id', categoryId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Categoria vazia removida', 'category', categoryName, {
    summary: `Categoria "${categoryName}" eliminada sem dependências.`,
  });
}

// =============================================================================
// Encomendas Atómicas + Sincronização Automática com CRM
// =============================================================================
export async function createManualOrderDb(
  client: SupabaseClient,
  payload: CreateOrderPayload,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'orders:write');

  if (!payload.items.length) {
    throw new Error('Adiciona pelo menos um produto à encomenda.');
  }

  if (!payload.customerId) {
    if (!payload.newCustomer || payload.newCustomer.name.trim().length < 2) {
      throw new Error('Seleciona um cliente existente ou indica o nome do novo cliente.');
    }
    if (!isValidAngolaPhone(payload.newCustomer.phoneRaw)) {
      throw new Error('Indica um número de telefone válido para o cliente (+244 9XX XXX XXX).');
    }
  }

  const { error } = await client.rpc('create_admin_order', {
    p_customer_id: payload.customerId || null,
    p_customer_name: payload.newCustomer?.name.trim() || null,
    p_customer_phone: payload.newCustomer?.phoneRaw.trim() || null,
    p_customer_email: payload.newCustomer?.email?.trim() || null,
    p_customer_city: payload.newCustomer?.city?.trim() || 'Luanda',
    p_source: payload.origin,
    p_status: payload.status,
    p_payment_status: payload.paymentStatus,
    p_whatsapp_outcome: payload.whatsappOutcome,
    p_delivery_address: payload.deliveryAddress.trim(),
    p_delivery_fee: Math.max(0, Math.round(payload.deliveryFeeKz || 0)),
    p_discount_amount: Math.max(0, Math.round(payload.discountKz || 0)),
    p_internal_notes: payload.internalNotes.trim(),
    p_order_prefix: payload.orderPrefix || 'BRC-2026-',
    p_items: payload.items.map((it) => ({
      productId: it.productId,
      quantity: Math.max(1, Math.round(it.quantity)),
    })),
  });

  if (error) {
    throw new Error(mapSupabaseErrorPt(error));
  }
}

export async function updateOrderStatusAndAttendanceDb(
  client: SupabaseClient,
  orderId: string,
  nextStatus: OrderStatus,
  paymentStatus: PaymentStatus,
  whatsappOutcome: WhatsAppAttendanceOutcome,
  note: string,
  internalNotes: string,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'orders:write');

  const { error } = await client.rpc('update_admin_order_status', {
    p_order_id: orderId,
    p_next_status: nextStatus,
    p_payment_status: paymentStatus,
    p_whatsapp_outcome: whatsappOutcome,
    p_transition_note: note.trim(),
    p_internal_notes: internalNotes.trim(),
  });

  if (error) {
    throw new Error(mapSupabaseErrorPt(error));
  }
}

// =============================================================================
// Clientes e CRM Automatizado (customers, notes, tags, crm_tasks)
// =============================================================================
export async function upsertCustomerDb(
  client: SupabaseClient,
  payload: UpsertCustomerPayload,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'customers:write');

  const trimmedName = payload.name.trim();
  if (trimmedName.length < 2) {
    throw new Error('Indica o nome completo do cliente (mínimo 2 caracteres).');
  }
  if (!isValidAngolaPhone(payload.phoneRaw)) {
    throw new Error('Indica um número de telefone válido (+244 923 000 000 ou 923000000).');
  }

  const normalizedPhone = normalizeAngolaPhone(payload.phoneRaw);
  const trimmedEmail = payload.email.trim();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error('O endereço de email introduzido não tem um formato válido.');
  }

  const row = {
    full_name: trimmedName,
    phone: payload.phoneRaw.trim(),
    normalized_phone: normalizedPhone,
    email: trimmedEmail || null,
    city: payload.city.trim() || 'Luanda',
    source: payload.source || 'manual_admin',
    status: payload.crmStage,
    notes: payload.internalSummary.trim(),
    last_contact_at: new Date().toISOString(),
  };

  let customerId = payload.id;

  if (customerId) {
    const { error } = await client.from('customers').update(row).eq('id', customerId);
    if (error) throw new Error(mapSupabaseErrorPt(error));
  } else {
    const { data, error } = await client
      .from('customers')
      .insert(row)
      .select('id')
      .single();
    if (error) throw new Error(mapSupabaseErrorPt(error));
    customerId = String((data as { id: string }).id);
  }

  // Sincroniza etiquetas sem duplicados
  const uniqueTags = Array.from(new Set(payload.tagIds));
  await client.from('customer_tag_assignments').delete().eq('customer_id', customerId);
  if (uniqueTags.length > 0) {
    const assignRows = uniqueTags.map((tagId) => ({
      customer_id: customerId,
      tag_id: tagId,
    }));
    const { error: tagErr } = await client.from('customer_tag_assignments').insert(assignRows);
    if (tagErr) throw new Error(mapSupabaseErrorPt(tagErr));
  }

  await appendAuditLog(
    client,
    actor,
    payload.id ? 'Ficha de cliente atualizada' : 'Cliente registado',
    'customer',
    trimmedName,
    { summary: `Contacto normalizado: ${normalizedPhone}.` }
  );
}

export async function updateCustomerCrmDb(
  client: SupabaseClient,
  customerId: string,
  customerName: string,
  crmStage: CrmStage,
  tagIds: string[],
  internalSummary: string,
  markContactNow: boolean,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'crm:write');

  const updateBody: Record<string, unknown> = {
    status: crmStage,
    notes: internalSummary.trim(),
  };
  if (markContactNow) {
    updateBody.last_contact_at = new Date().toISOString();
  }

  const { error } = await client.from('customers').update(updateBody).eq('id', customerId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  const uniqueTags = Array.from(new Set(tagIds));
  const { error: delErr } = await client
    .from('customer_tag_assignments')
    .delete()
    .eq('customer_id', customerId);
  if (delErr) throw new Error(mapSupabaseErrorPt(delErr));

  if (uniqueTags.length > 0) {
    const { error: insErr } = await client.from('customer_tag_assignments').insert(
      uniqueTags.map((tagId) => ({ customer_id: customerId, tag_id: tagId }))
    );
    if (insErr) throw new Error(mapSupabaseErrorPt(insErr));
  }

  await appendAuditLog(client, actor, 'Relacionamento CRM atualizado', 'crm', customerName, {
    summary: `Estado comercial atualizado para ${crmStage}.`,
  });
}

export async function addCustomerNoteDb(
  client: SupabaseClient,
  customerId: string,
  customerName: string,
  channel: CustomerNote['channel'],
  content: string,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'crm:write');
  if (!content.trim()) {
    throw new Error('Escreve o conteúdo do registo de acompanhamento antes de guardar.');
  }

  const { error } = await client.from('customer_notes').insert({
    customer_id: customerId,
    created_by: actor.id,
    author_name: actor.name,
    note_type: channel,
    content: content.trim(),
  });
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await client
    .from('customers')
    .update({ last_contact_at: new Date().toISOString() })
    .eq('id', customerId);

  await appendAuditLog(client, actor, 'Nota de acompanhamento CRM', 'crm', customerName, {
    summary: `Registo adicionado no canal ${channel}.`,
  });
}

export async function createCustomerTagDb(
  client: SupabaseClient,
  name: string,
  tone: CustomerTag['tone'],
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'crm:write');
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error('A etiqueta deve ter pelo menos 2 caracteres.');
  }

  const { error } = await client.from('customer_tags').insert({
    name: trimmed,
    color: tone,
  });
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Etiqueta CRM criada', 'crm', trimmed, {
    summary: `Nova etiqueta "${trimmed}" adicionada ao CRM.`,
  });
}

export async function createCrmTaskDb(
  client: SupabaseClient,
  payload: CreateCrmTaskPayload,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'crm:write');
  if (!payload.customerId) {
    throw new Error('Seleciona o cliente associado à tarefa de acompanhamento.');
  }
  if (payload.title.trim().length < 2) {
    throw new Error('Indica um título claro para a tarefa (mínimo 2 caracteres).');
  }

  const { error } = await client.from('crm_tasks').insert({
    customer_id: payload.customerId,
    order_id: payload.orderId || null,
    assigned_to: payload.assignedTo || actor.id,
    title: payload.title.trim(),
    description: payload.description.trim(),
    due_at: payload.dueAt || null,
    status: 'pending',
  });
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Tarefa de follow-up criada', 'crm', payload.title.trim(), {
    summary: `Tarefa agendada no CRM.`,
  });
}

export async function updateCrmTaskStatusDb(
  client: SupabaseClient,
  taskId: string,
  taskTitle: string,
  status: CrmTaskStatus,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'crm:write');
  const { error } = await client
    .from('crm_tasks')
    .update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', taskId);
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Estado de tarefa CRM atualizado', 'crm', taskTitle, {
    summary: `Tarefa marcada como ${status}.`,
  });
}

// =============================================================================
// Marketing (Meta Pixel) & Configurações Gerais & Perfis Administrativos
// =============================================================================
export async function saveMarketingSettingsDb(
  client: SupabaseClient,
  next: Omit<MarketingSettings, 'updatedAt' | 'updatedBy'>,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'marketing:write');
  const trimmedPixel = next.pixelId.trim();

  if (trimmedPixel || next.isActive) {
    const check = validatePixelId(trimmedPixel);
    if (!check.valid) {
      throw new Error(check.error || 'Meta Pixel ID inválido.');
    }
  }

  const enforcedEvents = next.events.map((ev) =>
    ev.eventName === 'Purchase' ? { ...ev, requiresRealConfirmation: true } : ev
  );

  const isEnabled = Boolean(trimmedPixel) && next.isActive;

  const { error } = await client.from('marketing_settings').upsert(
    {
      provider: 'meta_pixel',
      pixel_id: trimmedPixel,
      is_enabled: isEnabled,
      consent_required: next.requireCookieConsent,
      events_config: enforcedEvents,
      updated_by: actor.id,
    },
    { onConflict: 'provider' }
  );
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(
    client,
    actor,
    'Configuração Meta Pixel atualizada',
    'marketing',
    trimmedPixel || 'meta_pixel',
    { summary: `Meta Pixel ${isEnabled ? 'ativado' : 'desativado'} na base de dados.` }
  );
}

export async function saveStoreSettingsDb(
  client: SupabaseClient,
  next: Omit<StoreSettings, 'updatedAt' | 'currency'>,
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'settings:write');
  if (!next.commercialName.trim()) {
    throw new Error('O nome comercial da empresa é obrigatório.');
  }

  const contactErr = validateStoreContactsInput({
    officialPhone: next.officialPhone,
    officialWhatsApp: next.officialWhatsApp,
    commercialEmail: next.commercialEmail,
    instagramUrl: next.instagramUrl,
    facebookUrl: next.facebookUrl,
    tiktokUrl: next.tiktokUrl,
  });
  if (contactErr) {
    throw new Error(contactErr);
  }

  const trimmedPhone = next.officialPhone.trim();
  const trimmedWhatsApp = next.officialWhatsApp.trim();
  const isStoreActive = next.isStoreActive !== false;
  const closedMessage =
    next.closedMessage?.trim() ||
    INITIAL_STORE_SETTINGS.closedMessage ||
    'A Bercali Store encontra-se temporariamente encerrada para atualização de catálogo. Voltamos em breve.';

  const rows = [
    {
      setting_key: 'company_profile',
      setting_value: {
        commercialName: next.commercialName.trim(),
        slogan: next.slogan.trim() || 'O futuro das compras começa aqui.',
        storeDescription: (next.storeDescription || '').trim(),
        officialPhone: trimmedPhone,
        officialPhoneNormalized: trimmedPhone ? normalizeAngolaPhone(trimmedPhone) : '',
        officialWhatsApp: trimmedWhatsApp,
        officialWhatsAppNormalized: trimmedWhatsApp ? normalizeAngolaPhone(trimmedWhatsApp) : '',
        commercialEmail: next.commercialEmail.trim(),
        instagramUrl: (next.instagramUrl || '').trim(),
        facebookUrl: (next.facebookUrl || '').trim(),
        tiktokUrl: (next.tiktokUrl || '').trim(),
        currency: 'AOA',
      },
      updated_by: actor.id,
    },
    {
      setting_key: 'operations_preferences',
      setting_value: {
        defaultLowStockThreshold: Math.max(0, Math.round(next.defaultLowStockThreshold || 5)),
        orderCodePrefix: next.orderCodePrefix.trim() || 'BRC-2026-',
        requireWhatsAppManualVerification: next.requireWhatsAppManualVerification,
      },
      updated_by: actor.id,
    },
    {
      setting_key: 'delivery_zones',
      setting_value: {
        zones: next.deliveryZones,
        generalInfo: (next.deliveryGeneralInfo || '').trim(),
      },
      updated_by: actor.id,
    },
    {
      setting_key: 'storefront_config',
      setting_value: {
        isStoreActive,
        closedMessage,
        promotionalBannerActive: Boolean(next.promotionalBannerActive),
        promotionalBannerText: (next.promotionalBannerText || '').trim(),
        whatsappOrderMessageTemplate:
          next.whatsappOrderMessageTemplate?.trim() ||
          INITIAL_STORE_SETTINGS.whatsappOrderMessageTemplate,
      },
      updated_by: actor.id,
    },
  ];

  const { error } = await client
    .from('store_settings')
    .upsert(rows, { onConflict: 'setting_key' });
  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(
    client,
    actor,
    'Configurações gerais guardadas',
    'settings',
    next.commercialName.trim(),
    {
      summary: `Loja ${isStoreActive ? 'Ativa' : 'Encerrada temporariamente'} · Contactos, entregas e preferências persistidos no Supabase.`,
    }
  );
}

export async function updateAdminProfileDb(
  client: SupabaseClient,
  payload: {
    id: string;
    fullName: string;
    phone?: string;
    role: UserRole;
    isActive: boolean;
  },
  actor: ServiceActor
): Promise<void> {
  assertActorPermission(actor, 'users:manage');
  if (payload.fullName.trim().length < 2) {
    throw new Error('Indica o nome completo do utilizador.');
  }

  const { error } = await client
    .from('profiles')
    .update({
      full_name: payload.fullName.trim(),
      phone: payload.phone?.trim() || null,
      role: payload.role,
      is_active: payload.isActive,
    })
    .eq('id', payload.id);

  if (error) throw new Error(mapSupabaseErrorPt(error));

  await appendAuditLog(client, actor, 'Perfil administrativo atualizado', 'user', payload.fullName.trim(), {
    summary: `Função: ${payload.role} · Estado: ${payload.isActive ? 'Ativo' : 'Suspenso'}.`,
  });
}
