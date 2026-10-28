import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStorefrontWhatsAppUrl,
  calculateDashboardMetrics,
  calculateOrderTotals,
  classifyCrmTaskUrgency,
  detectUnsafeServiceRoleJwt,
  formatKwanza,
  generateCsvContent,
  isValidAngolaPhone,
  isValidAngolaWhatsApp,
  mapSupabaseErrorPt,
  normalizeAngolaPhone,
  slugifyText,
  validatePixelId,
  validateProductInput,
  validateStoreContactsInput,
} from './formatters';
import { canAccessModule, hasPermission } from '../auth/permissions';
import { Customer, Order, Product } from '../types/domain';

test('formatKwanza formats Angolan Kwanzas with dot thousand separators', () => {
  assert.equal(formatKwanza(0), '0 Kz');
  assert.equal(formatKwanza(12500), '12.500 Kz');
  assert.equal(formatKwanza(1450000), '1.450.000 Kz');
});

test('normalizeAngolaPhone, isValidAngolaWhatsApp, and isValidAngolaPhone enforce Angolan +244 + 9 digits format', () => {
  assert.equal(normalizeAngolaPhone('923 456 789'), '+244923456789');
  assert.equal(normalizeAngolaPhone('+244 923-456-789'), '+244923456789');
  assert.equal(normalizeAngolaPhone('00244923456789'), '+244923456789');
  assert.equal(isValidAngolaWhatsApp('+244 923 456 789'), true);
  assert.equal(isValidAngolaWhatsApp('923456789'), true);
  assert.equal(isValidAngolaWhatsApp('00244222123456'), true);
  assert.equal(isValidAngolaWhatsApp('+351 912 345 678'), false);
  assert.equal(isValidAngolaWhatsApp('+244 923 45'), false);
  assert.equal(isValidAngolaWhatsApp('abc'), false);
  assert.equal(validateStoreContactsInput({ officialWhatsApp: '+351 912 345 678' }) !== null, true);
  assert.equal(buildStorefrontWhatsAppUrl({ whatsappRaw: '+351912345678' }), null);
  assert.equal(isValidAngolaPhone('923 456 789'), true);
  assert.equal(isValidAngolaPhone('123'), false);
});

test('slugifyText strips accents and builds clean URL slugs', () => {
  assert.equal(slugifyText('Acessórios & Áudio Pro!'), 'acessorios-audio-pro');
});

test('detectUnsafeServiceRoleJwt blocks service_role JWTs and sb_secret_ keys while allowing anon keys', () => {
  const makeJwt = (role: string) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url');
    return `${header}.${payload}.signature`;
  };

  assert.equal(detectUnsafeServiceRoleJwt(makeJwt('anon')), false);
  assert.equal(detectUnsafeServiceRoleJwt('sb_publishable_abc123'), false);
  assert.equal(detectUnsafeServiceRoleJwt(makeJwt('service_role')), true);
  assert.equal(detectUnsafeServiceRoleJwt('sb_secret_xyz987'), true);
});

test('validatePixelId enforces 15-16 numeric digits for Meta Pixel ID', () => {
  assert.equal(validatePixelId('').valid, false);
  assert.equal(validatePixelId('abc123456789012').valid, false);
  assert.equal(validatePixelId('<script>alert(1)</script>').valid, false);
  assert.equal(validatePixelId('123456789012345').valid, true);
  assert.equal(validatePixelId('1234567890123456').valid, true);
});

test('validateProductInput rejects promo price >= base price and invalid SKUs', () => {
  const validErr = validateProductInput({
    name: 'Smartwatch Bercali',
    sku: 'BRC-SW-01',
    categoryId: 'cat-1',
    priceKz: 35000,
    promoPriceKz: 29500,
    trackStock: true,
    stockQuantity: 12,
  });
  assert.equal(validErr, null);

  const invalidPromoErr = validateProductInput({
    name: 'Smartwatch Bercali',
    sku: 'BRC-SW-01',
    categoryId: 'cat-1',
    priceKz: 35000,
    promoPriceKz: 35000,
    trackStock: false,
    stockQuantity: null,
  });
  assert.notEqual(invalidPromoErr, null);
});

test('calculateOrderTotals computes subtotal, delivery fee, discount, and non-negative total', () => {
  const totals = calculateOrderTotals(
    [
      { quantity: 2, unitPriceKz: 15000 },
      { quantity: 1, unitPriceKz: 8500 },
    ],
    2000,
    500
  );
  assert.equal(totals.subtotalKz, 38500);
  assert.equal(totals.deliveryFeeKz, 2000);
  assert.equal(totals.discountKz, 500);
  assert.equal(totals.totalKz, 40000);
});

test('classifyCrmTaskUrgency distinguishes overdue, pending, and completed tasks', () => {
  const refNow = '2026-10-24T12:00:00.000Z';
  assert.equal(
    classifyCrmTaskUrgency({ status: 'pending', dueAt: '2026-10-23T12:00:00.000Z' }, refNow),
    'overdue'
  );
  assert.equal(
    classifyCrmTaskUrgency({ status: 'pending', dueAt: '2026-10-25T12:00:00.000Z' }, refNow),
    'pending'
  );
  assert.equal(
    classifyCrmTaskUrgency({ status: 'completed', dueAt: '2026-10-20T12:00:00.000Z' }, refNow),
    'completed'
  );
});

test('calculateDashboardMetrics strictly separates pending WhatsApp orders from confirmed sales and delivered orders', () => {
  const products: Product[] = [
    {
      id: 'p1',
      slug: 'produto-real-brc-01',
      sku: 'BRC-01',
      name: 'Produto Teste',
      description: 'Desc',
      categoryId: 'c1',
      priceKz: 20000,
      promoPriceKz: null,
      trackStock: true,
      stockQuantity: 3,
      lowStockThreshold: 5,
      isAvailable: true,
      status: 'active',
      visualPreset: 'audio',
      media: [],
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cust-1',
      name: 'Cliente Teste',
      phoneRaw: '923111222',
      phoneNormalized: '+244923111222',
      email: '',
      city: 'Luanda',
      source: 'whatsapp_store',
      crmStage: 'converted',
      tagIds: [],
      internalSummary: '',
      lastContactAt: '2026-10-24T10:00:00.000Z',
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    },
  ];

  const orders: Order[] = [
    {
      id: 'o1',
      code: 'BRC-1001',
      customerId: 'cust-1',
      customerName: 'Cliente Teste',
      customerPhone: '+244923111222',
      items: [
        {
          id: 'i1',
          orderId: 'o1',
          productId: 'p1',
          productName: 'Produto Teste',
          sku: 'BRC-01',
          quantity: 2,
          unitPriceKz: 20000,
          lineTotalKz: 40000,
        },
      ],
      subtotalKz: 40000,
      deliveryFeeKz: 0,
      discountKz: 0,
      totalKz: 40000,
      currency: 'AOA',
      origin: 'whatsapp_store',
      status: 'pending_confirmation',
      paymentStatus: 'pending',
      whatsappOutcome: 'awaiting_customer_reply',
      deliveryAddress: 'Talatona, Luanda',
      internalNotes: '',
      confirmedAt: null,
      deliveredAt: null,
      statusHistory: [],
      createdAt: '2026-10-24T09:00:00.000Z',
      updatedAt: '2026-10-24T09:00:00.000Z',
    },
    {
      id: 'o2',
      code: 'BRC-1002',
      customerId: 'cust-1',
      customerName: 'Cliente Teste',
      customerPhone: '+244923111222',
      items: [
        {
          id: 'i2',
          orderId: 'o2',
          productId: 'p1',
          productName: 'Produto Teste',
          sku: 'BRC-01',
          quantity: 1,
          unitPriceKz: 20000,
          lineTotalKz: 20000,
        },
      ],
      subtotalKz: 20000,
      deliveryFeeKz: 2000,
      discountKz: 0,
      totalKz: 22000,
      currency: 'AOA',
      origin: 'whatsapp_store',
      status: 'confirmed',
      paymentStatus: 'paid',
      whatsappOutcome: 'confirmed_by_customer',
      deliveryAddress: 'Maianga, Luanda',
      internalNotes: '',
      confirmedAt: '2026-10-24T10:00:00.000Z',
      deliveredAt: null,
      statusHistory: [],
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    },
    {
      id: 'o3',
      code: 'BRC-1003',
      customerId: 'cust-1',
      customerName: 'Cliente Teste',
      customerPhone: '+244923111222',
      items: [
        {
          id: 'i3',
          orderId: 'o3',
          productId: 'p1',
          productName: 'Produto Teste',
          sku: 'BRC-01',
          quantity: 3,
          unitPriceKz: 20000,
          lineTotalKz: 60000,
        },
      ],
      subtotalKz: 60000,
      deliveryFeeKz: 0,
      discountKz: 0,
      totalKz: 60000,
      currency: 'AOA',
      origin: 'whatsapp_direct',
      status: 'delivered',
      paymentStatus: 'paid',
      whatsappOutcome: 'confirmed_by_customer',
      deliveryAddress: 'Alvalade, Luanda',
      internalNotes: '',
      confirmedAt: '2026-10-23T15:00:00.000Z',
      deliveredAt: '2026-10-24T11:00:00.000Z',
      statusHistory: [],
      createdAt: '2026-10-23T15:00:00.000Z',
      updatedAt: '2026-10-24T11:00:00.000Z',
    },
  ];

  const metrics = calculateDashboardMetrics(
    orders,
    products,
    customers,
    { preset: '7d' },
    '2026-10-24T23:59:59.000Z'
  );

  assert.equal(metrics.totalOrders, 3);
  assert.equal(metrics.pendingOrders, 1);
  assert.equal(metrics.confirmedOrdersCount, 2);
  assert.equal(metrics.deliveredOrders, 1);
  assert.equal(metrics.paidOrdersCount, 2);
  assert.equal(metrics.confirmedSalesKz, 82000); // o1 (40.000 Kz pending) excluded!
  assert.equal(metrics.pendingValueKz, 40000);
  assert.equal(metrics.lowStockProducts.length, 1);
  assert.equal(metrics.topProducts[0]?.unitsConfirmed, 4);
});

test('mapSupabaseErrorPt translates Postgres and RLS codes into friendly Portuguese messages', () => {
  assert.match(
    mapSupabaseErrorPt({ code: '42501', message: 'new row violates row-level security policy' }),
    /RLS/
  );
  assert.match(
    mapSupabaseErrorPt({ code: '23505', message: 'duplicate key value violates unique constraint "products_sku_key"' }),
    /SKU/
  );
  assert.match(
    mapSupabaseErrorPt({ code: '42P01', message: 'relation "public.profiles" does not exist' }),
    /migrações/
  );
});

test('RBAC permissions enforce least privilege across roles', () => {
  assert.equal(hasPermission('super_admin', 'users:manage'), true);
  assert.equal(hasPermission('admin', 'users:manage'), false);
  assert.equal(canAccessModule('marketing_manager', 'marketing'), true);
  assert.equal(canAccessModule('marketing_manager', 'users'), false);
  assert.equal(canAccessModule('product_manager', 'products'), true);
  assert.equal(canAccessModule('product_manager', 'crm'), false);
});

test('generateCsvContent produces UTF-8 BOM semicolon CSV suitable for spreadsheet export', () => {
  const csv = generateCsvContent(['Código', 'Total (Kz)'], [['BRC-1002', 22000]]);
  assert.ok(csv.startsWith('\uFEFFCódigo;Total (Kz)\nBRC-1002;22000'));
});

test('validateStoreContactsInput allows empty unconfigured contacts and rejects malformed phones, emails or non-HTTPS URLs', () => {
  assert.equal(validateStoreContactsInput({}), null);
  assert.equal(
    validateStoreContactsInput({
      officialPhone: '+244 923 456 789',
      officialWhatsApp: '923456789',
      commercialEmail: 'contacto@bercali.ao',
      instagramUrl: 'https://instagram.com/bercalistore',
    }),
    null
  );
  assert.match(
    validateStoreContactsInput({ officialWhatsApp: '12345' }) || '',
    /WhatsApp/i
  );
  assert.match(
    validateStoreContactsInput({ commercialEmail: 'email-invalido' }) || '',
    /e-mail/i
  );
  assert.match(
    validateStoreContactsInput({ instagramUrl: 'http://insecure.example.com' }) || '',
    /https:\/\//i
  );
});

test('buildStorefrontWhatsAppUrl returns null when unconfigured and builds interpolated wa.me URL when valid', () => {
  assert.equal(buildStorefrontWhatsAppUrl({ whatsappRaw: '' }), null);
  assert.equal(buildStorefrontWhatsAppUrl({ whatsappRaw: 'invalid' }), null);

  const url = buildStorefrontWhatsAppUrl({
    whatsappRaw: '923 456 789',
    template: 'Olá! Quero *{produto}* (SKU {sku}) por {preco}.',
    productName: 'Closets',
    productSku: '001',
    priceKz: 65000,
    quantity: 2,
  });
  assert.ok(url?.startsWith('https://wa.me/244923456789?text='));
  const decoded = decodeURIComponent(url!.split('?text=')[1]);
  assert.match(decoded, /Closets/);
  assert.match(decoded, /001/);
  assert.match(decoded, /65\.000 Kz/);
  assert.match(decoded, /Quantidade: 2/);
});
