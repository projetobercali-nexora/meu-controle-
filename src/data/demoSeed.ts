import { MarketingSettings, StoreSettings } from '../types/domain';

/**
 * Valores estruturais iniciais limpos (sem registos fictícios nem dados falsos da empresa).
 * Usados apenas enquanto as tabelas `marketing_settings` e `store_settings` ainda não têm linha guardada no Supabase.
 */
export const INITIAL_MARKETING_SETTINGS: MarketingSettings = {
  provider: 'meta_pixel',
  pixelId: '',
  isActive: false,
  requireCookieConsent: true,
  strictPurchaseConfirmation: true,
  events: [
    {
      eventName: 'PageView',
      description: 'Carregamento de páginas públicas da loja online (nunca disparado neste painel administrativo).',
      enabled: true,
      triggerRule: 'Automático na loja pública após consentimento.',
    },
    {
      eventName: 'ViewContent',
      description: 'Visualização da página de detalhe de um produto ativo no catálogo.',
      enabled: true,
      triggerRule: 'Abertura da ficha de produto com SKU e preço em Kz.',
    },
    {
      eventName: 'Search',
      description: 'Pesquisa realizada por visitantes no catálogo público da loja.',
      enabled: true,
      triggerRule: 'Submissão de termo de pesquisa na loja.',
    },
    {
      eventName: 'AddToCart',
      description: 'Adição de um artigo à lista/saco de encomenda na loja.',
      enabled: true,
      triggerRule: 'Clique no botão de adicionar produto na loja.',
    },
    {
      eventName: 'InitiateCheckout',
      description: 'Início do resumo de encomenda antes do envio para atendimento.',
      enabled: true,
      triggerRule: 'Abertura do passo final de revisão do pedido.',
    },
    {
      eventName: 'Contact',
      description: 'Clique para iniciar conversa com o atendimento no WhatsApp.',
      enabled: true,
      triggerRule: 'Abertura intencional do canal WhatsApp (distinto de compra confirmada).',
    },
    {
      eventName: 'Purchase',
      description: 'Conversão real de compra confirmada com valor validado em Kwanzas (Kz).',
      enabled: true,
      triggerRule: 'Exclusivamente quando existir confirmação real da compra — nunca num simples clique para o WhatsApp.',
      requiresRealConfirmation: true,
    },
  ],
  updatedAt: null,
  updatedBy: null,
};

/**
 * Contactos oficiais deixados vazios intencionalmente até serem preenchidos pelo administrador no Supabase.
 */
export const INITIAL_STORE_SETTINGS: StoreSettings = {
  commercialName: 'Bercali Store',
  slogan: 'O futuro das compras começa aqui.',
  storeDescription: '',
  officialPhone: '',
  officialWhatsApp: '',
  commercialEmail: '',
  instagramUrl: '',
  facebookUrl: '',
  tiktokUrl: '',
  isStoreActive: true,
  closedMessage:
    'A Bercali Store encontra-se temporariamente encerrada para atualização de catálogo. Voltamos em breve.',
  promotionalBannerActive: false,
  promotionalBannerText: '',
  deliveryGeneralInfo: '',
  whatsappOrderMessageTemplate:
    'Olá Bercali Store! Gostaria de encomendar o produto *{produto}* (Ref.: {sku}) pelo valor de *{preco}*.',
  currency: 'Kz',
  defaultLowStockThreshold: 5,
  orderCodePrefix: 'BRC-2026-',
  requireWhatsAppManualVerification: true,
  deliveryZones: [],
  updatedAt: null,
};
