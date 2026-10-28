export type AdminModuleId =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'crm'
  | 'marketing'
  | 'reports'
  | 'users'
  | 'settings'
  | 'help';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'product_manager'
  | 'order_manager'
  | 'marketing_manager'
  | 'crm_agent';

export type PermissionKey =
  | 'dashboard:view'
  | 'products:view'
  | 'products:write'
  | 'categories:view'
  | 'categories:write'
  | 'orders:view'
  | 'orders:write'
  | 'customers:view'
  | 'customers:view_contact_pii'
  | 'customers:write'
  | 'crm:view'
  | 'crm:write'
  | 'marketing:view'
  | 'marketing:write'
  | 'reports:view'
  | 'reports:export'
  | 'users:view'
  | 'users:manage'
  | 'settings:view'
  | 'settings:write';

export type ProductStatus = 'active' | 'inactive' | 'archived';

export type OrderStatus =
  | 'received'
  | 'pending_confirmation'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

export type OrderOrigin =
  | 'whatsapp_store'
  | 'whatsapp_direct'
  | 'instagram'
  | 'manual_admin'
  | 'website';

export type WhatsAppAttendanceOutcome =
  | 'unverified'
  | 'awaiting_customer_reply'
  | 'confirmed_by_customer'
  | 'cancelled_or_no_response';

export type CrmStage =
  | 'new_contact'
  | 'interested'
  | 'in_service'
  | 'awaiting_reply'
  | 'converted'
  | 'recurring'
  | 'not_interested';

export type CrmTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type DatePeriodPreset = 'today' | '7d' | '30d' | 'all' | 'custom';

export interface DatePeriodFilter {
  preset: DatePeriodPreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMedia {
  id: string;
  productId: string;
  type: 'image' | 'video';
  url: string;
  altText: string;
  isPrimary: boolean;
  storageRef: string;
  sortOrder?: number;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
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
  visualPreset: 'audio' | 'watch' | 'bag' | 'sneaker' | 'accessory' | 'tech';
  media: ProductMedia[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTag {
  id: string;
  name: string;
  tone: 'neutral' | 'orange' | 'green' | 'amber';
}

export interface CustomerNote {
  id: string;
  customerId: string;
  authorName: string;
  channel: 'nota_interna' | 'whatsapp_manual' | 'chamada' | 'email';
  content: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phoneRaw: string;
  phoneNormalized: string;
  email: string;
  city: string;
  source: OrderOrigin | 'website';
  crmStage: CrmStage;
  tagIds: string[];
  internalSummary: string;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmTask {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  orderId: string | null;
  orderCode: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  title: string;
  description: string;
  dueAt: string | null;
  status: CrmTaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceKz: number;
  lineTotalKz?: number;
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string;
  note: string;
  changedAt: string;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  subtotalKz: number;
  deliveryFeeKz: number;
  discountKz: number;
  totalKz: number;
  currency: 'AOA';
  origin: OrderOrigin;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  whatsappOutcome: WhatsAppAttendanceOutcome;
  deliveryAddress: string;
  internalNotes: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  statusHistory: OrderStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PixelEventConfig {
  eventName:
    | 'PageView'
    | 'ViewContent'
    | 'Search'
    | 'AddToCart'
    | 'InitiateCheckout'
    | 'Contact'
    | 'Purchase';
  description: string;
  enabled: boolean;
  triggerRule: string;
  requiresRealConfirmation?: boolean;
}

export interface MarketingSettings {
  provider?: string;
  pixelId: string;
  isActive: boolean;
  requireCookieConsent: boolean;
  strictPurchaseConfirmation: boolean;
  events: PixelEventConfig[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export type IntegrationConfigStatus = 'unconfigured' | 'configured' | 'error';

export interface PluginIntegrationCard {
  id: string;
  name: string;
  category: string;
  status: IntegrationConfigStatus;
  statusLabel: string;
  description: string;
  securityNote: string;
}

export interface DeliveryZoneSetting {
  id: string;
  name: string;
  feeKz: number;
  estimatedTime: string;
  active: boolean;
}

export interface StoreSettings {
  commercialName: string;
  slogan: string;
  storeDescription?: string;
  officialPhone: string;
  officialWhatsApp: string;
  commercialEmail: string;
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  isStoreActive?: boolean;
  closedMessage?: string;
  promotionalBannerActive?: boolean;
  promotionalBannerText?: string;
  deliveryGeneralInfo?: string;
  whatsappOrderMessageTemplate?: string;
  currency: 'Kz';
  defaultLowStockThreshold: number;
  orderCodePrefix: string;
  requireWhatsAppManualVerification: boolean;
  deliveryZones: DeliveryZoneSetting[];
  updatedAt: string | null;
}

export interface AdminProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType:
    | 'product'
    | 'category'
    | 'order'
    | 'customer'
    | 'crm'
    | 'marketing'
    | 'settings'
    | 'user'
    | 'auth';
  entityRef: string;
  details: string;
  createdAt: string;
}
