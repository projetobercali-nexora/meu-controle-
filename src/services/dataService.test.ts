import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addCustomerNoteDb,
  assertActorPermission,
  createCrmTaskDb,
  createEmptyAdminSnapshot,
  createManualOrderDb,
  deleteCategoryDb,
  deleteProductDb,
  fetchAdminSnapshot,
  saveMarketingSettingsDb,
  saveStoreSettingsDb,
  setProductStatusDb,
  updateAdminProfileDb,
  updateCrmTaskStatusDb,
  upsertCategoryDb,
  upsertCustomerDb,
  upsertProductDb,
} from './dataService';
import { INITIAL_MARKETING_SETTINGS, INITIAL_STORE_SETTINGS } from '../data/demoSeed';

test('createEmptyAdminSnapshot initializes with zero operational records and no fake demo arrays', () => {
  const snap = createEmptyAdminSnapshot();
  assert.equal(snap.products.length, 0);
  assert.equal(snap.categories.length, 0);
  assert.equal(snap.orders.length, 0);
  assert.equal(snap.customers.length, 0);
  assert.equal(snap.crmTasks.length, 0);
  assert.equal(snap.marketingSettings.pixelId, '');
  assert.equal(snap.marketingSettings.isActive, false);
});

test('assertActorPermission and repository functions reject unauthorized roles before touching Supabase', async () => {
  const marketingActor = { id: 'u-mkt', name: 'Gestor Marketing', role: 'marketing_manager' as const };
  const productActor = { id: 'u-prd', name: 'Gestor Produtos', role: 'product_manager' as const };
  const fakeClient = {} as unknown as SupabaseClient;

  assert.throws(
    () => assertActorPermission(marketingActor, 'products:write'),
    /Sem permissão/i
  );

  await assert.rejects(
    () => setProductStatusDb(fakeClient, 'prod-1', 'BRC-01', 'archived', marketingActor),
    /Sem permissão/i
  );

  await assert.rejects(
    () =>
      updateAdminProfileDb(
        fakeClient,
        { id: 'u-2', fullName: 'Outro User', role: 'admin', isActive: true },
        marketingActor
      ),
    /Sem permissão/i
  );

  await assert.rejects(
    () =>
      saveStoreSettingsDb(
        fakeClient,
        {
          commercialName: 'Bercali Store',
          slogan: 'O futuro das compras começa aqui.',
          officialPhone: '+244923000000',
          officialWhatsApp: '+244923000000',
          commercialEmail: 'geral@bercalistore.ao',
          defaultLowStockThreshold: 5,
          orderCodePrefix: 'BRC-2026-',
          requireWhatsAppManualVerification: true,
          deliveryZones: [],
        },
        productActor
      ),
    /Sem permissão/i
  );
});

test('deleteCategoryDb blocks deletion when products depend on the category and deletes when count is 0', async () => {
  const superAdmin = { id: 'u-1', name: 'Super Admin', role: 'super_admin' as const };
  let deletedId: string | null = null;

  const makeMockClient = (dependentCount: number) =>
    ({
      from: (table: string) => {
        if (table === 'products') {
          return {
            select: () => ({
              eq: async () => ({ count: dependentCount, error: null }),
            }),
          };
        }
        if (table === 'categories') {
          return {
            delete: () => ({
              eq: async (_col: string, val: string) => {
                deletedId = val;
                return { error: null };
              },
            }),
          };
        }
        return {
          insert: async () => ({ error: null }),
        };
      },
    }) as unknown as SupabaseClient;

  await assert.rejects(
    () => deleteCategoryDb(makeMockClient(3), 'cat-busy', 'Áudio', superAdmin),
    /possui 3 produto\(s\) associado\(s\)/i
  );
  assert.equal(deletedId, null);

  await deleteCategoryDb(makeMockClient(0), 'cat-empty', 'Vazia', superAdmin);
  assert.equal(deletedId, 'cat-empty');
});

test('upsertCategoryDb and upsertProductDb persist catalog records and product_media cleanly', async () => {
  const catalogActor = { id: 'u-cat', name: 'Gestor Catálogo', role: 'product_manager' as const };
  const insertedCategories: Array<Record<string, unknown>> = [];
  const insertedProducts: Array<Record<string, unknown>> = [];
  const insertedMedia: Array<Array<Record<string, unknown>>> = [];

  const mockClient = {
    from: (table: string) => {
      if (table === 'categories') {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertedCategories.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'products') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedProducts.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'prod-101' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'product_media') {
        return {
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async (rows: Array<Record<string, unknown>>) => {
            insertedMedia.push(rows);
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  } as unknown as SupabaseClient;

  await upsertCategoryDb(
    mockClient,
    { name: 'Áudio & Som', description: 'Auriculares e colunas', isActive: true },
    catalogActor
  );
  assert.equal(insertedCategories.length, 1);
  assert.equal(insertedCategories[0].slug, 'audio-som');

  await upsertProductDb(
    mockClient,
    {
      name: 'Auriculares Bercali Pro',
      sku: 'brc-aud-01',
      categoryId: 'cat-1',
      priceKz: 25000,
      promoPriceKz: 19500,
      description: 'Cancelamento de ruído ativo',
      trackStock: true,
      stockQuantity: 15,
      lowStockThreshold: 4,
      isAvailable: true,
      status: 'active',
      visualPreset: 'audio',
      media: [
        {
          id: 'm1',
          productId: '',
          type: 'image',
          url: 'https://cdn.exemplo.ao/img1.webp',
          altText: 'Frente',
          isPrimary: true,
          storageRef: 'products/brc-aud-01/img1.webp',
        },
      ],
    },
    catalogActor
  );

  assert.equal(insertedProducts.length, 1);
  assert.equal(insertedProducts[0].sku, 'BRC-AUD-01');
  assert.equal(insertedProducts[0].price, 25000);
  assert.equal(insertedProducts[0].sale_price, 19500);
  assert.equal(insertedMedia.length, 1);
  assert.equal(insertedMedia[0][0].product_id, 'prod-101');
});

test('createManualOrderDb validates items and customer phone before invoking PostgreSQL RPC create_admin_order', async () => {
  const orderActor = { id: 'u-ord', name: 'Gestor Encomendas', role: 'order_manager' as const };
  const capturedRpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const mockClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      capturedRpcs.push({ fn, args });
      return { data: { orderId: 'ord-new' }, error: null };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    () =>
      createManualOrderDb(
        mockClient,
        {
          newCustomer: { name: 'Ana', phoneRaw: '123' },
          origin: 'whatsapp_direct',
          status: 'pending_confirmation',
          paymentStatus: 'pending',
          whatsappOutcome: 'awaiting_customer_reply',
          deliveryAddress: 'Luanda',
          deliveryFeeKz: 2000,
          internalNotes: '',
          items: [{ productId: 'p1', quantity: 1 }],
        },
        orderActor
      ),
    /telefone válido/i
  );

  await createManualOrderDb(
    mockClient,
    {
      newCustomer: { name: 'Ana Silva', phoneRaw: '923 888 777', city: 'Luanda' },
      origin: 'whatsapp_direct',
      status: 'pending_confirmation',
      paymentStatus: 'pending',
      whatsappOutcome: 'awaiting_customer_reply',
      deliveryAddress: 'Maianga',
      deliveryFeeKz: 2000,
      discountKz: 500,
      internalNotes: 'Entregar de tarde',
      items: [{ productId: 'p1', quantity: 2 }],
    },
    orderActor
  );

  assert.equal(capturedRpcs.length, 1);
  assert.equal(capturedRpcs[0].fn, 'create_admin_order');
  assert.equal(capturedRpcs[0].args.p_customer_phone, '923 888 777');
  assert.equal(capturedRpcs[0].args.p_payment_status, 'pending');
  assert.equal(capturedRpcs[0].args.p_discount_amount, 500);
});

test('upsertCustomerDb, addCustomerNoteDb, createCrmTaskDb and updateCrmTaskStatusDb persist CRM records cleanly', async () => {
  const crmActor = { id: 'u-crm', name: 'Agente CRM', role: 'crm_agent' as const };
  const insertedCustomers: Array<Record<string, unknown>> = [];
  const insertedNotes: Array<Record<string, unknown>> = [];
  const insertedTasks: Array<Record<string, unknown>> = [];
  const updatedTasks: Array<Record<string, unknown>> = [];

  const mockClient = {
    from: (table: string) => {
      if (table === 'customers') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedCustomers.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'cust-99' }, error: null }),
              }),
            };
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'customer_tag_assignments') {
        return {
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'customer_notes') {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertedNotes.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'crm_tasks') {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertedTasks.push(row);
            return { error: null };
          },
          update: (row: Record<string, unknown>) => {
            updatedTasks.push(row);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  } as unknown as SupabaseClient;

  await upsertCustomerDb(
    mockClient,
    {
      name: 'Paulo Neto',
      phoneRaw: '924 111 333',
      email: 'paulo@exemplo.ao',
      city: 'Luanda',
      crmStage: 'interested',
      tagIds: [],
      internalSummary: 'Interessado em relógio',
    },
    crmActor
  );

  await addCustomerNoteDb(mockClient, 'cust-99', 'Paulo Neto', 'whatsapp_manual', 'Confirmou interesse via WhatsApp', crmActor);
  await createCrmTaskDb(
    mockClient,
    { customerId: 'cust-99', title: 'Ligar amanhã', description: 'Validar morada', dueAt: '2026-10-26T17:00:00.000Z' },
    crmActor
  );
  await updateCrmTaskStatusDb(mockClient, 'task-1', 'Ligar amanhã', 'completed', crmActor);

  assert.equal(insertedCustomers.length, 1);
  assert.equal(insertedCustomers[0].normalized_phone, '+244924111333');
  assert.equal(insertedCustomers[0].status, 'interested');
  assert.equal(insertedNotes.length, 1);
  assert.equal(insertedNotes[0].note_type, 'whatsapp_manual');
  assert.equal(insertedTasks.length, 1);
  assert.equal(insertedTasks[0].status, 'pending');
  assert.equal(updatedTasks.length, 1);
  assert.equal(updatedTasks[0].status, 'completed');
  assert.ok(typeof updatedTasks[0].completed_at === 'string');
});

test('saveMarketingSettingsDb and saveStoreSettingsDb validate and upsert settings without secrets', async () => {
  const adminActor = { id: 'u-adm', name: 'Admin Bercali', role: 'admin' as const };
  const upsertedMarketing: Array<Record<string, unknown>> = [];
  const upsertedStore: Array<Array<Record<string, unknown>>> = [];

  const mockClient = {
    from: (table: string) => {
      if (table === 'marketing_settings') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            upsertedMarketing.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'store_settings') {
        return {
          upsert: async (rows: Array<Record<string, unknown>>) => {
            upsertedStore.push(rows);
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    () =>
      saveMarketingSettingsDb(
        mockClient,
        {
          provider: 'meta_pixel',
          pixelId: 'invalid-pixel',
          isActive: true,
          requireCookieConsent: true,
          strictPurchaseConfirmation: true,
          events: INITIAL_MARKETING_SETTINGS.events,
        },
        adminActor
      ),
    /15 ou 16 dígitos/i
  );

  await saveMarketingSettingsDb(
    mockClient,
    {
      provider: 'meta_pixel',
      pixelId: '104928374650192',
      isActive: true,
      requireCookieConsent: true,
      strictPurchaseConfirmation: true,
      events: INITIAL_MARKETING_SETTINGS.events,
    },
    adminActor
  );

  await saveStoreSettingsDb(
    mockClient,
    {
      commercialName: INITIAL_STORE_SETTINGS.commercialName,
      slogan: INITIAL_STORE_SETTINGS.slogan,
      officialPhone: '+244 923 000 000',
      officialWhatsApp: '+244 923 000 000',
      commercialEmail: 'apoio@bercalistore.ao',
      defaultLowStockThreshold: 5,
      orderCodePrefix: 'BRC-2026-',
      requireWhatsAppManualVerification: true,
      deliveryZones: [{ id: 'z1', name: 'Luanda Centro', feeKz: 2000, estimatedTime: '24h', active: true }],
    },
    adminActor
  );

  assert.equal(upsertedMarketing.length, 1);
  assert.equal(upsertedMarketing[0].provider, 'meta_pixel');
  assert.equal(upsertedMarketing[0].pixel_id, '104928374650192');
  assert.equal(upsertedMarketing[0].is_enabled, true);
  assert.equal(upsertedStore.length, 1);
  assert.equal(upsertedStore[0].length, 4);
  const keys = upsertedStore[0].map((r) => r.setting_key);
  assert.deepEqual(keys, [
    'company_profile',
    'operations_preferences',
    'delivery_zones',
    'storefront_config',
  ]);
});

test('deleteProductDb blocks deletion if order_items exist and removes Storage files + row when unused', async () => {
  const adminActor = { id: 'u-adm', name: 'Admin', role: 'admin' as const };
  let deletedProdId: string | null = null;
  let removedStoragePaths: string[] = [];

  const makeClient = (orderItemCount: number) =>
    ({
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            removedStoragePaths = paths;
            return { data: [], error: null };
          },
        }),
      },
      from: (table: string) => {
        if (table === 'order_items') {
          return {
            select: () => ({
              eq: async () => ({ count: orderItemCount, error: null }),
            }),
          };
        }
        if (table === 'product_media') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { storage_path: 'products/001/photo1.jpg' },
                  { storage_path: 'https://external.example.com/photo2.jpg' },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'products') {
          return {
            delete: () => ({
              eq: async (_c: string, val: string) => {
                deletedProdId = val;
                return { error: null };
              },
            }),
          };
        }
        return { insert: async () => ({ error: null }) };
      },
    }) as unknown as SupabaseClient;

  await assert.rejects(
    () => deleteProductDb(makeClient(2), 'prod-used', 'Closets', '001', adminActor),
    /registado em 2 item\(ns\) de encomenda/i
  );
  assert.equal(deletedProdId, null);

  await deleteProductDb(makeClient(0), 'prod-unused', 'Produto Sem Vendas', 'BRC-99', adminActor);
  assert.equal(deletedProdId, 'prod-unused');
  assert.deepEqual(removedStoragePaths, ['products/001/photo1.jpg']);
});

test('upsertProductDb retries cleanly without is_featured/sort_order when PostgREST returns PGRST204 pre-migration', async () => {
  const catalogActor = { id: 'u-cat', name: 'Gestor Catálogo', role: 'product_manager' as const };
  const attempts: Array<Record<string, unknown>> = [];

  const mockClient = {
    from: (table: string) => {
      if (table === 'products') {
        return {
          update: (row: Record<string, unknown>) => {
            attempts.push(row);
            return {
              eq: async () => {
                if ('is_featured' in row) {
                  return {
                    error: {
                      code: 'PGRST204',
                      message: "Could not find the 'is_featured' column of 'products' in the schema cache",
                    },
                  };
                }
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'product_media') {
        return {
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  } as unknown as SupabaseClient;

  await upsertProductDb(
    mockClient,
    {
      id: 'prod-existing',
      name: 'Closets',
      sku: '001',
      categoryId: 'cat-1',
      priceKz: 80000,
      promoPriceKz: 65000,
      description: 'Closet personalizado',
      trackStock: true,
      stockQuantity: 80,
      lowStockThreshold: 5,
      isAvailable: true,
      isFeatured: true,
      sortOrder: 1,
      status: 'active',
      visualPreset: 'tech',
      media: [],
    },
    catalogActor
  );

  assert.equal(attempts.length, 2);
  assert.equal('is_featured' in attempts[0], true);
  assert.equal('is_featured' in attempts[1], false);
});

test('fetchAdminSnapshot skips restricted tables when role lacks customers/crm/users permissions', async () => {
  const mktActor = { id: 'u-mkt', name: 'Gestor Marketing', role: 'marketing_manager' as const };
  const queriedTables: string[] = [];

  const makeChain = (rows: unknown[] = []) => ({
    order: () => ({
      limit: async () => ({ data: rows, error: null }),
      then: (resolve: (val: unknown) => void) => resolve({ data: rows, error: null }),
    }),
    eq: () => ({
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (val: unknown) => void) => resolve({ data: rows, error: null }),
    }),
    then: (resolve: (val: unknown) => void) => resolve({ data: rows, error: null }),
  });

  const mockClient = {
    from: (table: string) => {
      queriedTables.push(table);
      return {
        select: () => makeChain([]),
      };
    },
  } as unknown as SupabaseClient;

  const snap = await fetchAdminSnapshot(mockClient, mktActor);
  assert.equal(snap.customers.length, 0);
  assert.equal(snap.crmTasks.length, 0);
  assert.ok(!queriedTables.includes('customers'));
  assert.ok(!queriedTables.includes('customer_notes'));
  assert.ok(!queriedTables.includes('crm_tasks'));
  assert.ok(queriedTables.includes('marketing_settings'));
  assert.ok(queriedTables.includes('products'));
});
