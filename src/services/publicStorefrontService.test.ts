import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchPublicCatalog,
  parsePublicStoreSettingsRows,
  submitPublicStoreOrder,
} from './publicStorefrontService';

test('parsePublicStoreSettingsRows never invents fake contacts when empty and parses configured contacts/zones cleanly', () => {
  const emptyCfg = parsePublicStoreSettingsRows([]);
  assert.equal(emptyCfg.commercialName, 'Bercali Store');
  assert.equal(emptyCfg.isStoreActive, true);
  assert.equal(emptyCfg.contacts.telHref, null);
  assert.equal(emptyCfg.contacts.whatsappWaMeUrl, null);
  assert.equal(emptyCfg.contacts.mailtoHref, null);
  assert.equal(emptyCfg.contacts.instagramUrl, null);

  const populatedCfg = parsePublicStoreSettingsRows([
    {
      setting_key: 'company_profile',
      setting_value: {
        commercialName: 'Bercali Store Angola',
        slogan: 'O futuro das compras começa aqui.',
        storeDescription: 'Loja oficial em Luanda.',
        officialPhone: '923 111 222',
        officialWhatsApp: '+244 923 111 222',
        commercialEmail: 'loja@bercali.ao',
        instagramUrl: 'https://instagram.com/bercalistore',
        facebookUrl: 'http://invalid-insecure.com',
      },
      updated_at: '2026-10-25T00:00:00.000Z',
    },
    {
      setting_key: 'delivery_zones',
      setting_value: {
        generalInfo: 'Entregas em 24h em Luanda.',
        zones: [
          { id: 'z1', name: 'Talatona', feeKz: 2500, estimatedTime: '24h', active: true },
          { id: 'z2', name: 'Zona Pausada', feeKz: 5000, estimatedTime: '48h', active: false },
        ],
      },
      updated_at: '2026-10-25T00:05:00.000Z',
    },
    {
      setting_key: 'storefront_config',
      setting_value: {
        isStoreActive: false,
        closedMessage: 'Encerrada para inventário até segunda-feira.',
        promotionalBannerActive: true,
        promotionalBannerText: 'Envio grátis acima de 100.000 Kz',
      },
      updated_at: '2026-10-25T00:10:00.000Z',
    },
  ]);

  assert.equal(populatedCfg.commercialName, 'Bercali Store Angola');
  assert.equal(populatedCfg.isStoreActive, false);
  assert.equal(populatedCfg.closedMessage, 'Encerrada para inventário até segunda-feira.');
  assert.equal(populatedCfg.promotionalBannerActive, true);
  assert.equal(populatedCfg.contacts.telHref, 'tel:+244923111222');
  assert.ok(populatedCfg.contacts.whatsappWaMeUrl?.startsWith('https://wa.me/244923111222'));
  assert.equal(populatedCfg.contacts.mailtoHref, 'mailto:loja@bercali.ao');
  assert.equal(populatedCfg.contacts.instagramUrl, 'https://instagram.com/bercalistore');
  assert.equal(populatedCfg.contacts.facebookUrl, null); // rejected non-HTTPS
  assert.equal(populatedCfg.deliveryZones.length, 1); // filtered out inactive z2
  assert.equal(populatedCfg.deliveryZones[0].name, 'Talatona');
});

test('fetchPublicCatalog excludes unpublished products and inactive categories, and sorts featured + sortOrder', async () => {
  const mockClient = {
    from: (table: string) => {
      if (table === 'categories') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'cat-active',
                    name: 'Imobiliária',
                    slug: 'closet-personalizado',
                    description: 'Closets',
                    is_active: true,
                    created_at: '2026-10-20T00:00:00Z',
                    updated_at: '2026-10-20T00:00:00Z',
                  },
                  {
                    id: 'cat-inactive',
                    name: 'Oculta',
                    slug: 'oculta',
                    description: '',
                    is_active: false,
                    created_at: '2026-10-20T00:00:00Z',
                    updated_at: '2026-10-20T00:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'p-regular',
                    name: 'Armário Simples',
                    slug: 'armario-simples',
                    sku: '002',
                    category_id: 'cat-active',
                    price: 50000,
                    sale_price: null,
                    manage_stock: true,
                    stock_quantity: 5,
                    is_available: true,
                    is_featured: false,
                    sort_order: 2,
                    status: 'active',
                    created_at: '2026-10-24T10:00:00Z',
                    updated_at: '2026-10-24T10:00:00Z',
                  },
                  {
                    id: 'p-featured',
                    name: 'Closets',
                    slug: 'closets-001',
                    sku: '001',
                    category_id: 'cat-active',
                    price: 80,
                    sale_price: 65,
                    manage_stock: true,
                    stock_quantity: 80,
                    is_available: true,
                    is_featured: true,
                    sort_order: 10,
                    status: 'active',
                    created_at: '2026-10-23T10:00:00Z',
                    updated_at: '2026-10-23T10:00:00Z',
                  },
                  {
                    id: 'p-inactive',
                    name: 'Rascunho Oculto',
                    slug: 'rascunho',
                    sku: '003',
                    category_id: 'cat-active',
                    price: 10000,
                    sale_price: null,
                    manage_stock: false,
                    stock_quantity: null,
                    is_available: false,
                    status: 'inactive',
                    created_at: '2026-10-24T12:00:00Z',
                    updated_at: '2026-10-24T12:00:00Z',
                  },
                  {
                    id: 'p-in-hidden-cat',
                    name: 'Produto em Categoria Oculta',
                    slug: 'oculto-cat',
                    sku: '004',
                    category_id: 'cat-inactive',
                    price: 15000,
                    sale_price: null,
                    manage_stock: false,
                    stock_quantity: null,
                    is_available: true,
                    status: 'active',
                    created_at: '2026-10-24T12:00:00Z',
                    updated_at: '2026-10-24T12:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: async () => ({
            data: [
              {
                id: 'm1',
                product_id: 'p-featured',
                media_type: 'image',
                storage_path: 'products/001/main.jpg',
                media_url: 'https://cdn.exemplo.ao/main.jpg',
                alt_text: 'Closets',
                sort_order: 0,
              },
            ],
            error: null,
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;

  const catalog = await fetchPublicCatalog(mockClient);
  assert.equal(catalog.categories.length, 1);
  assert.equal(catalog.products.length, 2); // p-inactive and p-in-hidden-cat excluded!
  assert.equal(catalog.products[0].id, 'p-featured'); // featured comes first
  assert.equal(catalog.products[0].effectivePriceKz, 65);
  assert.equal(catalog.products[0].primaryImageUrl, 'https://cdn.exemplo.ao/main.jpg');
  assert.equal(catalog.featuredProducts.length, 1);
});

test('submitPublicStoreOrder blocks checkout when store is closed and calls create_storefront_order RPC when active', async () => {
  let storeActive = false;
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const mockClient = {
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            {
              setting_key: 'storefront_config',
              setting_value: {
                isStoreActive: storeActive,
                closedMessage: 'Loja temporariamente encerrada para manutenção.',
              },
            },
          ],
          error: null,
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return {
        data: {
          order_number: 'BRC-2026-0009',
          subtotal: 130,
          delivery_fee: 2500,
          total_amount: 2630,
          currency: 'AOA',
          status: 'received',
          created_at: '2026-10-25T00:30:00.000Z',
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    () =>
      submitPublicStoreOrder(mockClient, {
        customerName: 'Marta Domingos',
        customerPhone: '923 555 444',
        deliveryAddress: 'Talatona, Luanda',
        items: [{ productId: '6cfa42de-1bf6-4595-9f2e-73d682bfeecf', quantity: 2 }],
      }),
    /temporariamente encerrada/i
  );
  assert.equal(rpcCalls.length, 0);

  storeActive = true;
  const confirmation = await submitPublicStoreOrder(mockClient, {
    customerName: 'Marta Domingos',
    customerPhone: '923 555 444',
    customerEmail: 'marta@exemplo.ao',
    deliveryAddress: 'Talatona, Luanda',
    deliveryZoneId: 'zone-talatona',
    deliveryFeeKz: 2500,
    idempotencyKey: 'idem-checkout-001',
    items: [{ productId: '6cfa42de-1bf6-4595-9f2e-73d682bfeecf', quantity: 2 }],
  });

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'create_storefront_order');
  assert.equal(rpcCalls[0].args.p_idempotency_key, 'idem-checkout-001');
  assert.equal(confirmation.orderNumber, 'BRC-2026-0009');
  assert.equal(confirmation.totalKz, 2630);
});
