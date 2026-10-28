# Guia Técnico de Integração — Painel Administrativo ↔ Loja Online Bercali Store

Ambos os projetos independentes (**Painel Administrativo** e **Loja Online**) utilizam o mesmo projeto Supabase (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`) e partilham a mesma base de dados PostgreSQL + Storage (`product-media`), sem nunca expor chaves privadas (`service_role`).

---

## 1. Passo Único no Supabase SQL Editor

Antes de ativar o checkout público e a leitura de definições gerais na Loja Online, abre o **Supabase SQL Editor** e executa o ficheiro:

- `supabase/migrations/20261025000004_storefront_integration.sql`

> **Garantia de integridade:** A migração é 100% idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`) e **não elimina nem altera** produtos, categorias, imagens ou encomendas já existentes (incluindo a categoria `"Imobiliária"` e o produto `"Closets"`).

O que esta migração ativa:
1. `products.is_featured` (`boolean`) e `products.sort_order` (`integer`) para controlar destaques e ordem na montra.
2. `orders.idempotency_key` (`text` único parcial) e suporte à origem `'website'` em `orders.source`.
3. Políticas **Row Level Security (RLS)** estritas para visitantes (`anon`):
   - `categories`: leitura apenas quando `is_active = true`.
   - `products`: leitura apenas quando `status = 'active'` **e** a respetiva categoria está `is_active = true` (produtos inativos ou arquivados ficam invisíveis na API pública).
   - `product_media`: leitura apenas para produtos publicados em categorias ativas.
   - `store_settings`: leitura apenas das chaves públicas `company_profile`, `delivery_zones` e `storefront_config` (a chave interna `operations_preferences` permanece restrita à equipa administrativa).
   - `customers`, `orders`, `order_items`, `customer_notes`, `customer_tags`, `crm_tasks`, `profiles`, `marketing_settings`, `activity_logs`: **sem leitura pública (`anon`)**.
4. Função RPC `public.create_storefront_order(...)` (`SECURITY DEFINER`) para registar encomendas da Loja Online com validação no servidor.

---

## 2. Contrato de Consumo na Loja Online

O módulo tipado de referência está pronto e testado em [`src/services/publicStorefrontService.ts`](../src/services/publicStorefrontService.ts) e pode ser copiado diretamente para o projeto separado da **Loja Online**.

### 2.1 Ler Definições Gerais, Contactos e Estado da Loja (`store_settings`)

```ts
const storeConfig = await fetchPublicStoreConfig(supabase);

if (!storeConfig.isStoreActive) {
  // Apresentar aviso storeConfig.closedMessage e desativar botões de checkout
}
```

Campos devolvidos:
- **Identidade e Textos**: `commercialName`, `slogan`, `storeDescription`, `currency` (`'Kz'`), `promotionalBannerActive`, `promotionalBannerText`.
- **Estado da Loja**: `isStoreActive` (`boolean`), `closedMessage` (`string`).
- **Contactos Oficiais Validados** (`contacts`):
  - `telHref` (`tel:+244...` ou `null` quando não configurado — ocultar botão se `null`).
  - `whatsappWaMeUrl` (`https://wa.me/244...` ou `null` quando não configurado — ocultar botão se `null`).
  - `mailtoHref` (`mailto:...` ou `null` quando não configurado).
  - `instagramUrl`, `facebookUrl`, `tiktokUrl` (URLs `https://` validados ou `null`).
- **Entregas**: `deliveryGeneralInfo` e `deliveryZones` (apenas zonas com `active !== false`, com `feeKz` e `estimatedTime`).

### 2.2 Gerar Links de Encomenda via WhatsApp por Produto

```ts
const waUrl = buildStorefrontWhatsAppUrl({
  whatsappRaw: storeConfig.contacts.officialWhatsApp,
  template: storeConfig.whatsappOrderMessageTemplate,
  productName: product.name,
  productSku: product.sku,
  priceKz: product.effectivePriceKz,
  quantity: 1,
});
// Se waUrl === null, o WhatsApp comercial ainda não está configurado no Painel.
```

### 2.3 Consultar Catálogo Público (`categories`, `products`, `product_media`)

```ts
const { categories, products, featuredProducts } = await fetchPublicCatalog(supabase);
```

- Lista apenas categorias `is_active = true` e produtos `status = 'active'`.
- Ordena automaticamente por `isFeatured DESC`, `sortOrder ASC`, `createdAt DESC`.
- Calcula `effectivePriceKz` (`promoPriceKz ?? priceKz`), `inStock` e `primaryImageUrl` (a partir de `product_media` ordenado por `sort_order ASC`).

### 2.4 Submeter Encomenda no Checkout (`create_storefront_order`)

```ts
const confirmation = await submitPublicStoreOrder(supabase, {
  customerName: 'Nome do Cliente',
  customerPhone: '+244 923 000 000',
  customerEmail: 'cliente@exemplo.ao', // opcional
  customerCity: 'Luanda',
  deliveryAddress: 'Talatona, Rua X, Casa Y',
  deliveryZoneId: selectedZone?.id ?? null,
  deliveryFeeKz: selectedZone?.feeKz ?? 0,
  customerNotes: 'Entregar no período da tarde',
  source: 'website', // ou 'whatsapp_store'
  idempotencyKey: checkoutSessionUuid, // evita encomendas duplicadas em duplo clique
  items: cartItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  })),
});
```

O que acontece automaticamente no Supabase e reflete-se no Painel Administrativo:
1. Bloqueia a encomenda no servidor se `isStoreActive = false`.
2. Valida que todos os produtos e categorias estão ativos e disponíveis, bloqueando a linha com `FOR UPDATE` e descontando `stock_quantity` quando `manage_stock = true`.
3. Ignora preços manipulados no browser e grava em `order_items` o preço real (`coalesce(sale_price, price)`).
4. Normaliza o telefone angolano (`+244...`) e associa a encomenda ao cliente existente em `customers` (ou cria um novo registo sem duplicados e sem apagar notas/etiquetas do CRM).
5. Cria automaticamente uma tarefa pendente em `crm_tasks` e um registo em `activity_logs` visíveis no Dashboard, Encomendas e CRM do Painel Administrativo.

---

## 3. Meta Pixel (Adiado Conforme Instrução)

As configurações de `marketing_settings` continuam guardadas e geríveis no Painel Administrativo, mas **nenhum script do Meta Pixel (`fbevents.js`) deve ser instalado ou ativado na Loja Online nesta fase**.
