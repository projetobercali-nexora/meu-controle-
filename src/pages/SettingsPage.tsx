import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { NotificationSettingsPanel } from '../components/NotificationSettingsPanel';
import { AccessDeniedState } from '../components/SharedUI';
import { PLANNED_SHARED_SCHEMA } from '../config/supabaseConfig';
import { useAdmin } from '../context/AdminContext';
import { DeliveryZoneSetting } from '../types/domain';
import {
  buildStorefrontWhatsAppUrl,
  formatDateTimePt,
  formatKwanza,
  isValidAngolaWhatsApp,
  normalizeAngolaPhone,
} from '../utils/formatters';

export const SettingsPage: React.FC = () => {
  const { snapshot, backendStatus, isMutating, can, canOpenModule, saveStoreSettings } = useAdmin();
  const canWrite = can('settings:write');
  const st = snapshot.storeSettings;

  const [commercialName, setCommercialName] = useState(st.commercialName);
  const [slogan, setSlogan] = useState(st.slogan);
  const [storeDescription, setStoreDescription] = useState(st.storeDescription || '');
  const [officialPhone, setOfficialPhone] = useState(st.officialPhone);
  const [officialWhatsApp, setOfficialWhatsApp] = useState(st.officialWhatsApp);
  const [commercialEmail, setCommercialEmail] = useState(st.commercialEmail);
  const [instagramUrl, setInstagramUrl] = useState(st.instagramUrl || '');
  const [facebookUrl, setFacebookUrl] = useState(st.facebookUrl || '');
  const [tiktokUrl, setTiktokUrl] = useState(st.tiktokUrl || '');
  const [isStoreActive, setIsStoreActive] = useState(st.isStoreActive !== false);
  const [closedMessage, setClosedMessage] = useState(
    st.closedMessage ||
      'A Bercali Store encontra-se temporariamente encerrada para atualização de catálogo. Voltamos em breve.'
  );
  const [promotionalBannerActive, setPromotionalBannerActive] = useState(
    Boolean(st.promotionalBannerActive)
  );
  const [promotionalBannerText, setPromotionalBannerText] = useState(
    st.promotionalBannerText || ''
  );
  const [deliveryGeneralInfo, setDeliveryGeneralInfo] = useState(st.deliveryGeneralInfo || '');
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    st.whatsappOrderMessageTemplate ||
      'Olá Bercali Store! Gostaria de encomendar o produto *{produto}* (Ref.: {sku}) pelo valor de *{preco}*.'
  );
  const [defaultLowStock, setDefaultLowStock] = useState(String(st.defaultLowStockThreshold));
  const [orderPrefix, setOrderPrefix] = useState(st.orderCodePrefix);
  const [requireManualWa, setRequireManualWa] = useState(st.requireWhatsAppManualVerification);
  const [zones, setZones] = useState<DeliveryZoneSetting[]>(st.deliveryZones);

  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState('2500');
  const [newZoneTime, setNewZoneTime] = useState('24h a 48h úteis');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCommercialName(st.commercialName);
    setSlogan(st.slogan);
    setStoreDescription(st.storeDescription || '');
    setOfficialPhone(st.officialPhone);
    setOfficialWhatsApp(st.officialWhatsApp);
    setCommercialEmail(st.commercialEmail);
    setInstagramUrl(st.instagramUrl || '');
    setFacebookUrl(st.facebookUrl || '');
    setTiktokUrl(st.tiktokUrl || '');
    setIsStoreActive(st.isStoreActive !== false);
    setClosedMessage(
      st.closedMessage ||
        'A Bercali Store encontra-se temporariamente encerrada para atualização de catálogo. Voltamos em breve.'
    );
    setPromotionalBannerActive(Boolean(st.promotionalBannerActive));
    setPromotionalBannerText(st.promotionalBannerText || '');
    setDeliveryGeneralInfo(st.deliveryGeneralInfo || '');
    setWhatsappTemplate(
      st.whatsappOrderMessageTemplate ||
        'Olá Bercali Store! Gostaria de encomendar o produto *{produto}* (Ref.: {sku}) pelo valor de *{preco}*.'
    );
    setDefaultLowStock(String(st.defaultLowStockThreshold));
    setOrderPrefix(st.orderCodePrefix);
    setRequireManualWa(st.requireWhatsAppManualVerification);
    setZones(st.deliveryZones);
  }, [st]);

  if (!canOpenModule('settings')) {
    return <AccessDeniedState moduleTitle="Configurações Gerais" />;
  }

  const handleAddZone = () => {
    if (!newZoneName.trim()) return;
    setZones((prev) => [
      ...prev,
      {
        id: `zone-${Date.now()}`,
        name: newZoneName.trim(),
        feeKz: Math.max(0, Math.round(Number(newZoneFee || 0))),
        estimatedTime: newZoneTime.trim() || 'A combinar',
        active: true,
      },
    ]);
    setNewZoneName('');
  };

  const toggleZoneActive = (zoneId: string) => {
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, active: !z.active } : z))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError(null);

    if (officialWhatsApp.trim() && !isValidAngolaWhatsApp(officialWhatsApp)) {
      setError(
        'O WhatsApp oficial da loja deve ter o formato angolano (+244 seguido de 9 dígitos, ex.: +244 923 456 789).'
      );
      return;
    }

    setIsSaving(true);
    try {
      await saveStoreSettings({
        commercialName,
        slogan,
        storeDescription,
        officialPhone,
        officialWhatsApp,
        commercialEmail,
        instagramUrl,
        facebookUrl,
        tiktokUrl,
        isStoreActive,
        closedMessage,
        promotionalBannerActive,
        promotionalBannerText,
        deliveryGeneralInfo,
        whatsappOrderMessageTemplate: whatsappTemplate,
        defaultLowStockThreshold: Math.max(0, Number(defaultLowStock || 5)),
        orderCodePrefix: orderPrefix.trim() || 'BRC-2026-',
        requireWhatsAppManualVerification: requireManualWa,
        deliveryZones: zones,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const isReady = backendStatus.state === 'ready';
  const trimmedWa = officialWhatsApp.trim();
  const isWaValidAngola = Boolean(trimmedWa) && isValidAngolaWhatsApp(trimmedWa);
  const waInvalidWarning = Boolean(trimmedWa) && !isWaValidAngola;
  const testWhatsAppDirectUrl = isWaValidAngola
    ? `https://wa.me/${normalizeAngolaPhone(trimmedWa).replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá ${commercialName.trim() || 'Bercali Store'}! Teste de ligação WhatsApp a partir do Painel Administrativo.`
      )}`
    : null;

  const sampleProduct = snapshot.products[0];
  const sampleWaUrl = buildStorefrontWhatsAppUrl({
    whatsappRaw: officialWhatsApp,
    template: whatsappTemplate,
    productName: sampleProduct?.name || 'Produto Bercali',
    productSku: sampleProduct?.sku || '001',
    priceKz: sampleProduct?.promoPriceKz ?? sampleProduct?.priceKz ?? 65000,
    quantity: 1,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
          Configurações Gerais e Loja Online
        </h1>
        <p className="text-sm text-[#525252] mt-1">
          Identidade comercial, estado operacional da Loja Online, contactos oficiais, redes sociais e entregas em Kwanzas (Kz) em <span className="font-mono text-xs">store_settings</span>
        </p>
      </div>

      <form onSubmit={(e) => void handleSave(e)} noValidate className="space-y-6 text-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Brand, Storefront Copy & Official Contacts */}
          <div className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-[#E5E5E5]">
              <BrandLogo variant="card" />
              <div>
                <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                  Identidade Oficial Preservada
                </h2>
                <p className="text-[#525252] mt-1 leading-relaxed">
                  O logótipo oficial da Bercali Store mantém integralmente as suas proporções, cores e área de proteção definidas no Manual de Marca v1.0.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="set-name" className="block font-semibold text-[#0A0A0A] mb-1">
                  Nome comercial *
                </label>
                <input
                  id="set-name"
                  type="text"
                  disabled={!canWrite || isSaving}
                  value={commercialName}
                  onChange={(e) => setCommercialName(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
              <div>
                <label htmlFor="set-currency" className="block font-semibold text-[#0A0A0A] mb-1">
                  Moeda principal (AOA / Kz)
                </label>
                <input
                  id="set-currency"
                  type="text"
                  disabled
                  value="Kz — Kwanza Angolano (AOA)"
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 bg-[#F4F4F4] border border-[#E5E5E5] rounded-[10px] font-semibold text-[#0A0A0A]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="set-slogan" className="block font-semibold text-[#0A0A0A] mb-1">
                Slogan oficial
              </label>
              <input
                id="set-slogan"
                type="text"
                disabled={!canWrite || isSaving}
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
              />
            </div>

            <div>
              <label htmlFor="set-desc" className="block font-semibold text-[#0A0A0A] mb-1">
                Descrição comercial da loja (apresentada na montra pública)
              </label>
              <textarea
                id="set-desc"
                rows={2}
                disabled={!canWrite || isSaving}
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                placeholder="Breve descrição comercial da Bercali Store para o rodapé e secção institucional da loja..."
                className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
              />
            </div>

            <div className="p-3.5 rounded-[10px] bg-[#F4F4F4] text-[#525252]">
              <strong className="text-[#0A0A0A]">Contactos reais e consistentes na loja:</strong> Nunca são gerados números ou e-mails fictícios. Se um contacto ficar em branco, a Loja Online oculta automaticamente o respetivo link até ser configurado aqui.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="set-phone" className="block font-semibold text-[#0A0A0A] mb-1">
                  Telefone comercial
                </label>
                <input
                  id="set-phone"
                  type="tel"
                  disabled={!canWrite || isSaving}
                  value={officialPhone}
                  onChange={(e) => setOfficialPhone(e.target.value)}
                  placeholder="Ex.: +244 9XX XXX XXX"
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 font-mono border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
              <div>
                <label htmlFor="set-wa" className="block font-semibold text-[#0A0A0A] mb-1">
                  WhatsApp oficial da loja (+244)
                </label>
                <div className="space-y-2">
                  <input
                    id="set-wa"
                    type="tel"
                    disabled={!canWrite || isSaving}
                    value={officialWhatsApp}
                    onChange={(e) => setOfficialWhatsApp(e.target.value)}
                    placeholder="+244 923 456 789"
                    className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 font-mono border rounded-[10px] ${
                      waInvalidWarning ? 'border-[#EF4444] bg-[#FEF2F2]' : 'border-[#D4D4D4]'
                    }`}
                  />
                  {waInvalidWarning && (
                    <p className="text-[11px] text-[#B91C1C]">
                      Formato inválido: indica +244 seguido de 9 dígitos (ex.: +244 923 456 789).
                    </p>
                  )}
                  {testWhatsAppDirectUrl ? (
                    <a
                      href={testWhatsAppDirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-[#0A0A0A] bg-white hover:bg-[#F4F4F4] font-semibold text-[11px] text-[#0A0A0A] whitespace-nowrap transition-colors"
                    >
                      <span>Testar WhatsApp</span>
                      <ExternalLink className="w-3 h-3 text-[#FF8A00]" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Introduz um número angolano válido (+244 e 9 dígitos) para testar"
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-[#E5E5E5] bg-[#F4F4F4] font-semibold text-[11px] text-[#8A8A8A] whitespace-nowrap cursor-not-allowed"
                    >
                      <span>Testar WhatsApp</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="set-email" className="block font-semibold text-[#0A0A0A] mb-1">
                  E-mail comercial
                </label>
                <input
                  id="set-email"
                  type="email"
                  disabled={!canWrite || isSaving}
                  value={commercialEmail}
                  onChange={(e) => setCommercialEmail(e.target.value)}
                  placeholder="Ex.: contacto@bercali.ao"
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
            </div>

            {/* Redes Sociais */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="set-ig" className="block font-semibold text-[#0A0A0A] mb-1">
                  Instagram (URL https://)
                </label>
                <input
                  id="set-ig"
                  type="url"
                  disabled={!canWrite || isSaving}
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
              <div>
                <label htmlFor="set-fb" className="block font-semibold text-[#0A0A0A] mb-1">
                  Facebook (URL https://)
                </label>
                <input
                  id="set-fb"
                  type="url"
                  disabled={!canWrite || isSaving}
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/..."
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
              <div>
                <label htmlFor="set-tt" className="block font-semibold text-[#0A0A0A] mb-1">
                  TikTok (URL https://)
                </label>
                <input
                  id="set-tt"
                  type="url"
                  disabled={!canWrite || isSaving}
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="https://tiktok.com/@..."
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
            </div>

            {/* Mensagem pré-preenchida do WhatsApp */}
            <div className="pt-4 border-t border-[#E5E5E5] space-y-2">
              <label htmlFor="set-wa-tpl" className="block font-semibold text-[#0A0A0A]">
                Modelo de mensagem WhatsApp nos produtos (<span className="font-mono">{'{produto}'}</span>, <span className="font-mono">{'{sku}'}</span>, <span className="font-mono">{'{preco}'}</span>)
              </label>
              <textarea
                id="set-wa-tpl"
                rows={2}
                disabled={!canWrite || isSaving}
                value={whatsappTemplate}
                onChange={(e) => setWhatsappTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
              />
              {sampleWaUrl ? (
                <p className="text-[11px] text-[#525252] font-mono break-all bg-[#F4F4F4] p-2.5 rounded-lg">
                  Pré-visualização URL loja: {sampleWaUrl}
                </p>
              ) : (
                <p className="text-[11px] text-[#737373]">
                  WhatsApp comercial ainda não configurado — os botões de pedido via WhatsApp permanecem desativados na loja pública até introduzires um número angolano válido (+244...).
                </p>
              )}
            </div>

            {/* Preferências Operacionais */}
            <div className="pt-4 border-t border-[#E5E5E5] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="set-low-stock" className="block font-semibold text-[#0A0A0A] mb-1">
                  Limiar padrão de stock baixo
                </label>
                <input
                  id="set-low-stock"
                  type="number"
                  min="0"
                  disabled={!canWrite || isSaving}
                  value={defaultLowStock}
                  onChange={(e) => setDefaultLowStock(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px] tabular-data"
                />
              </div>
              <div>
                <label htmlFor="set-prefix" className="block font-semibold text-[#0A0A0A] mb-1">
                  Prefixo de código de encomenda
                </label>
                <input
                  id="set-prefix"
                  type="text"
                  disabled={!canWrite || isSaving}
                  value={orderPrefix}
                  onChange={(e) => setOrderPrefix(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 font-mono border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canWrite || isSaving}
                checked={requireManualWa}
                onChange={(e) => setRequireManualWa(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="block text-[#0A0A0A]">
                  Exigir verificação manual de atendimento WhatsApp antes de confirmar venda
                </strong>
                <span className="text-[#525252]">
                  Garante que pedidos recebidos via WhatsApp só entram nas métricas de vendas após validação explícita.
                </span>
              </span>
            </label>
          </div>

          {/* Storefront Availability, Banner, Delivery Settings & Connected Services Status */}
          <div className="lg:col-span-5 space-y-6">
            {/* Estado Operacional da Loja Online */}
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                  Estado da Loja Online e Avisos
                </h2>
                <span
                  className={`font-semibold text-[11px] whitespace-nowrap ${
                    isStoreActive ? 'text-[#15803D]' : 'text-[#B91C1C]'
                  }`}
                >
                  {isStoreActive ? 'Loja Ativa' : 'Temporariamente Encerrada'}
                </span>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-[10px] bg-[#F4F4F4]">
                <input
                  type="checkbox"
                  disabled={!canWrite || isSaving}
                  checked={isStoreActive}
                  onChange={(e) => setIsStoreActive(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[#0A0A0A]">
                    Manter Loja Online aberta para novas encomendas
                  </strong>
                  <span className="text-[#525252]">
                    Se desmarcares esta opção, a loja apresenta a mensagem de encerramento temporário e o servidor PostgreSQL bloqueia automaticamente novas submissões de checkout.
                  </span>
                </span>
              </label>

              <div>
                <label htmlFor="set-closed-msg" className="block font-semibold text-[#0A0A0A] mb-1">
                  Mensagem quando a loja está temporariamente encerrada
                </label>
                <textarea
                  id="set-closed-msg"
                  rows={2}
                  disabled={!canWrite || isSaving}
                  value={closedMessage}
                  onChange={(e) => setClosedMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] space-y-2.5">
                <label className="inline-flex items-start sm:items-center gap-2 font-semibold text-[#0A0A0A] cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canWrite || isSaving}
                    checked={promotionalBannerActive}
                    onChange={(e) => setPromotionalBannerActive(e.target.checked)}
                    className="mt-0.5 sm:mt-0"
                  />
                  <span>Apresentar barra promocional / aviso no topo da loja</span>
                </label>
                <input
                  type="text"
                  aria-label="Texto promocional ou aviso da loja"
                  disabled={!canWrite || isSaving}
                  value={promotionalBannerText}
                  onChange={(e) => setPromotionalBannerText(e.target.value)}
                  placeholder="Ex.: Entregas rápidas em Luanda · Pagamento na entrega ou transferência"
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>
            </div>

            <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-6 space-y-4">
              <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                Zonas e Taxas de Entrega (Kz)
              </h2>

              <div>
                <label htmlFor="set-deliv-info" className="block font-semibold text-[#0A0A0A] mb-1">
                  Nota geral de entregas na loja
                </label>
                <input
                  id="set-deliv-info"
                  type="text"
                  disabled={!canWrite || isSaving}
                  value={deliveryGeneralInfo}
                  onChange={(e) => setDeliveryGeneralInfo(e.target.value)}
                  placeholder="Ex.: Entregas ao domicílio em Luanda e envio interprovincial sob consulta"
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>

              {zones.length === 0 ? (
                <p className="text-[#737373] py-2">
                  Ainda não existem zonas de entrega personalizadas guardadas.
                </p>
              ) : (
                <div className="divide-y divide-[#E5E5E5]">
                  {zones.map((z) => (
                    <div key={z.id} className="py-2.5 flex items-center justify-between gap-2">
                      <label className="flex items-start gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!canWrite || isSaving}
                          checked={z.active !== false}
                          onChange={() => toggleZoneActive(z.id)}
                          aria-label={`Ativar zona ${z.name}`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="font-semibold text-[#0A0A0A] block break-words">
                            {z.name}
                            {z.active === false && (
                              <span className="font-normal text-[#737373]"> · Oculta na loja</span>
                            )}
                          </span>
                          <span className="text-[11px] text-[#525252]">{z.estimatedTime}</span>
                        </span>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="metric-num font-bold text-[#0A0A0A]">
                          {formatKwanza(z.feeKz)}
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => setZones((prev) => prev.filter((x) => x.id !== z.id))}
                            aria-label={`Remover zona ${z.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[#B91C1C] p-2 sm:p-1 inline-flex items-center justify-center hover:bg-[#FEF2F2] rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canWrite && (
                <div className="pt-3 border-t border-[#E5E5E5] space-y-2.5">
                  <p className="font-semibold text-[#0A0A0A]">Adicionar zona de entrega</p>
                  <input
                    type="text"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    placeholder="Nome da zona (ex.: Talatona / Maianga)"
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-lg"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      value={newZoneFee}
                      onChange={(e) => setNewZoneFee(e.target.value)}
                      placeholder="Taxa (Kz)"
                      className="min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-lg tabular-data"
                    />
                    <input
                      type="text"
                      value={newZoneTime}
                      onChange={(e) => setNewZoneTime(e.target.value)}
                      placeholder="Prazo estimado"
                      className="min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddZone}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg border border-[#0A0A0A] font-medium inline-flex items-center justify-center gap-1 hover:bg-[#F4F4F4]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar zona</span>
                  </button>
                </div>
              )}
            </div>

            {/* Estado Honesto dos Serviços Ligados */}
            <div className="bg-[#0A0A0A] text-white rounded-xl p-4 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-[#FFC400]">
                <Database className="w-4 h-4" />
                <h2 className="font-brand font-bold text-base">
                  Estado Real dos Serviços Ligados
                </h2>
              </div>
              <p className="text-[#A3A3A3] leading-relaxed">
                {backendStatus.detailMessage}
              </p>
              <div className="divide-y divide-[#262626] pt-2">
                {[
                  {
                    name: 'Supabase PostgreSQL (14 tabelas)',
                    ok: isReady,
                    label: isReady ? 'Ativo' : backendStatus.summaryLabel,
                  },
                  {
                    name: 'Supabase Auth + RLS',
                    ok: isReady,
                    label: isReady ? 'Protegido' : 'Aguardando migração/env',
                  },
                  {
                    name: 'Supabase Storage (product-media)',
                    ok: isReady,
                    label: isReady ? 'Configurado' : 'Pendente',
                  },
                  {
                    name: 'Loja Online (Base de Dados Partilhada)',
                    ok: isReady,
                    label: !isReady
                      ? 'Aguardando BD'
                      : isStoreActive
                        ? 'Ativa (Catálogo & Checkout)'
                        : 'Encerrada Temporariamente',
                  },
                  {
                    name: 'Meta Pixel (marketing_settings)',
                    ok: Boolean(
                      snapshot.marketingSettings.pixelId && snapshot.marketingSettings.isActive
                    ),
                    label: snapshot.marketingSettings.pixelId
                      ? snapshot.marketingSettings.isActive
                        ? 'Ativo'
                        : 'Configurado (Inativo)'
                      : 'Não configurado',
                  },
                ].map((srv) => (
                  <div key={srv.name} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[#E5E5E5]">{srv.name}</span>
                    {srv.ok ? (
                      <span className="inline-flex items-center gap-1 text-[#22C55E] whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{srv.label}</span>
                      </span>
                    ) : backendStatus.state === 'connection_error' ||
                      backendStatus.state === 'security_blocked' ? (
                      <span className="inline-flex items-center gap-1 text-[#EF4444] whitespace-nowrap">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{srv.label}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#FFC400] whitespace-nowrap">
                        <Clock className="w-3 h-3" />
                        <span>{srv.label}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {st.updatedAt && (
                <p className="text-[11px] text-[#737373] pt-2 tabular-data">
                  Última gravação em store_settings: {formatDateTimePt(st.updatedAt)}
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
            {error}
          </div>
        )}

        {canWrite && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving || isMutating}
              className="btn-bercali-primary w-full sm:w-auto min-h-[44px] sm:min-h-0 px-6 py-2.5 rounded-[10px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'A guardar...' : 'Guardar Configurações Gerais'}</span>
            </button>
          </div>
        )}
      </form>

      {/* Notificações em Tempo Real, Som Configurável e Instalação PWA */}
      <NotificationSettingsPanel />

      {/* Shared Data Model Blueprint (14 Entities) */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#E5E5E5]">
          <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
            Arquitetura PostgreSQL Implementada (14 Tabelas + RLS)
          </h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Estrutura criada pelas migrações versionadas em <span className="font-mono">/supabase/migrations</span>, preparada para partilha futura segura com a loja online.
          </p>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y divide-[#E5E5E5] text-xs">
          {PLANNED_SHARED_SCHEMA.map((tb) => (
            <div key={tb.tableName} className="p-4 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-bold text-[#0A0A0A]">{tb.tableName}</span>
                <span className="text-[11px] font-medium text-[#525252]">
                  {tb.sharedWithPublicStore ? 'Loja + Painel' : 'Exclusiva Painel'}
                </span>
              </div>
              <p className="text-[#525252] leading-relaxed">{tb.responsibility}</p>
              <p className="text-[11px] text-[#737373] leading-relaxed">
                <strong className="text-[#0A0A0A]">RLS:</strong> {tb.rlsPolicySummary}
              </p>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                <th className="py-2.5 px-4">Tabela PostgreSQL</th>
                <th className="py-2.5 px-4">Partilha Futura c/ Loja</th>
                <th className="py-2.5 px-4">Responsabilidade</th>
                <th className="py-2.5 px-4">Política Row Level Security (RLS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {PLANNED_SHARED_SCHEMA.map((tb) => (
                <tr key={tb.tableName} className="hover:bg-[#FAFAFA]">
                  <td className="py-2.5 px-4 font-mono font-semibold text-[#0A0A0A]">
                    {tb.tableName}
                  </td>
                  <td className="py-2.5 px-4 text-[#0A0A0A]">
                    {tb.sharedWithPublicStore ? 'Sim (Loja + Painel)' : 'Exclusiva Painel'}
                  </td>
                  <td className="py-2.5 px-4 text-[#525252]">{tb.responsibility}</td>
                  <td className="py-2.5 px-4 text-[#525252]">{tb.rlsPolicySummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
