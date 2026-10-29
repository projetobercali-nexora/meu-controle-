import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  Megaphone,
  Power,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { AccessDeniedState } from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { PixelEventConfig, PluginIntegrationCard } from '../types/domain';
import { formatDateTimePt, validatePixelId } from '../utils/formatters';

export const MarketingPixelPage: React.FC = () => {
  const {
    snapshot,
    backendStatus,
    isMutating,
    can,
    canOpenModule,
    saveMarketingSettings,
  } = useAdmin();
  const canWrite = can('marketing:write');

  const ms = snapshot.marketingSettings;

  const [activeTab, setActiveTab] = useState<'pixel' | 'plugins'>('pixel');
  const [pixelId, setPixelId] = useState(ms.pixelId);
  const [isActive, setIsActive] = useState(ms.isActive);
  const [requireConsent, setRequireConsent] = useState(ms.requireCookieConsent);
  const [events, setEvents] = useState<PixelEventConfig[]>(ms.events);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    setPixelId(ms.pixelId);
    setIsActive(ms.isActive);
    setRequireConsent(ms.requireCookieConsent);
    setEvents(ms.events);
  }, [ms]);

  const integrationsCatalog: PluginIntegrationCard[] = useMemo(() => {
    const pixelStatus = snapshot.marketingLoadError
      ? { status: 'error' as const, label: 'Com erro' }
      : ms.pixelId
        ? {
            status: 'configured' as const,
            label: ms.isActive ? 'Ativo' : 'Configurado (Inativo)',
          }
        : { status: 'unconfigured' as const, label: 'Não configurado' };

    const supabaseIntegrationStatus =
      backendStatus.state === 'ready'
        ? { status: 'configured' as const, label: 'Configurado' }
        : backendStatus.state === 'connection_error' || backendStatus.state === 'security_blocked'
          ? { status: 'error' as const, label: 'Com erro' }
          : { status: 'unconfigured' as const, label: 'Não configurado' };

    return [
      {
        id: 'meta-pixel',
        name: 'Meta Pixel (marketing_settings)',
        category: 'Rastreamento Publicitário',
        status: pixelStatus.status,
        statusLabel: pixelStatus.label,
        description:
          'Identificador numérico público (15–16 dígitos) e estado ativo/inativo persistidos em marketing_settings no Supabase.',
        securityNote:
          'Este painel administrativo nunca dispara eventos de navegação; apenas a loja pública consome o Pixel ID.',
      },
      {
        id: 'supabase-shared-db',
        name: 'Supabase PostgreSQL, Auth & Storage',
        category: 'Infraestrutura Base',
        status: supabaseIntegrationStatus.status,
        statusLabel: supabaseIntegrationStatus.label,
        description:
          'Persistência relacional, autenticação administrativa, políticas Row Level Security (RLS) e bucket product-media.',
        securityNote:
          'Utiliza apenas chave pública anon/publishable com RLS ativo. A chave service_role é bloqueada no cliente.',
      },
      {
        id: 'public-storefront-sync',
        name: 'Sincronização com a Loja Online Bercali Store',
        category: 'Canal de Vendas',
        status: supabaseIntegrationStatus.status,
        statusLabel:
          backendStatus.state === 'ready' ? 'Base de Dados Partilhada' : 'Aguardando BD',
        description:
          'Catálogo publicado (products, categories, product_media), definições comerciais (store_settings) e submissão validada de encomendas (create_storefront_order) partilhados no mesmo Supabase.',
        securityNote:
          'Leitura pública restrita a itens ativos; clientes, encomendas e CRM protegidos por RLS e RPC SECURITY DEFINER.',
      },
      {
        id: 'meta-capi',
        name: 'Meta Conversions API (Server-Side CAPI)',
        category: 'Conversões Server-Side',
        status: 'unconfigured',
        statusLabel: 'Não configurado',
        description:
          'Envio seguro de eventos Purchase confirmados diretamente a partir do servidor (Edge Function) após validação da venda.',
        securityNote:
          'O Access Token privado da Meta nunca deve ser guardado em tabelas públicas nem no frontend.',
      },
      {
        id: 'whatsapp-cloud-api',
        name: 'WhatsApp Business Cloud API',
        category: 'Atendimento Comercial',
        status: 'unconfigured',
        statusLabel: 'Não configurado',
        description:
          'Atualmente o acompanhamento WhatsApp funciona por registo manual verificado no módulo de Encomendas e CRM.',
        securityNote:
          'Webhooks futuros exigirão validação de assinatura HMAC no backend antes de criar tarefas CRM.',
      },
    ];
  }, [ms.pixelId, ms.isActive, snapshot.marketingLoadError, backendStatus.state]);

  if (!canOpenModule('marketing')) {
    return <AccessDeniedState moduleTitle="Marketing, Meta Pixel e Integrações" />;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError(null);
    setSavedBanner(null);

    const trimmed = pixelId.trim();
    if (trimmed || isActive) {
      const check = validatePixelId(trimmed);
      if (!check.valid) {
        setError(check.error || 'Meta Pixel ID inválido (15 ou 16 dígitos numéricos).');
        return;
      }
    }

    setIsSaving(true);
    try {
      await saveMarketingSettings({
        provider: 'meta_pixel',
        pixelId: trimmed,
        isActive,
        requireCookieConsent: requireConsent,
        strictPurchaseConfirmation: true,
        events,
      });
      setSavedBanner(
        isActive && trimmed
          ? `Configuração guardada em marketing_settings · Estado atual: Ativo (ID ${trimmed}).`
          : 'Configuração validada e guardada na tabela marketing_settings do Supabase.'
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar Meta Pixel.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePixelPower = async () => {
    if (isSaving) return;
    setError(null);
    setSavedBanner(null);
    const nextActive = !ms.isActive;
    const trimmed = pixelId.trim();

    if (nextActive) {
      const check = validatePixelId(trimmed);
      if (!check.valid) {
        setError(
          check.error || 'Introduz um Meta Pixel ID válido (15 ou 16 dígitos numéricos) antes de ativar.'
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      await saveMarketingSettings({
        provider: 'meta_pixel',
        pixelId: trimmed,
        isActive: nextActive,
        requireCookieConsent: requireConsent,
        strictPurchaseConfirmation: true,
        events,
      });
      setIsActive(nextActive);
      setSavedBanner(
        nextActive
          ? `Meta Pixel ativado com sucesso em marketing_settings (ID ${trimmed}).`
          : 'Meta Pixel desativado em marketing_settings.'
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Introduz e guarda um Meta Pixel ID válido (15–16 dígitos) antes de ativar.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEvent = (eventName: PixelEventConfig['eventName']) => {
    if (!canWrite) return;
    setEvents((prev) =>
      prev.map((ev) =>
        ev.eventName === eventName ? { ...ev, enabled: !ev.enabled } : ev
      )
    );
  };

  const livePixelInvalid =
    Boolean(pixelId.trim()) && !validatePixelId(pixelId.trim()).valid;

  const statusLabel = snapshot.marketingLoadError
    ? 'Com erro ao ler configuração'
    : !ms.pixelId
      ? 'Não configurado'
      : ms.isActive
        ? 'Ativo'
        : 'Inativo (Configurado)';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Marketing, Pixel e Integrações
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Gestão segura da tabela <span className="font-mono text-xs">marketing_settings</span> e estado transparente de plugins externos
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div
            role="group"
            aria-label="Secção de Marketing e Integrações"
            className="w-full sm:w-auto flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E5E5E5] rounded-[10px]"
          >
            <button
              type="button"
              onClick={() => setActiveTab('pixel')}
              className={`min-h-[44px] sm:min-h-0 flex-1 sm:flex-initial justify-center px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'pixel' ? 'bg-[#0A0A0A] text-white' : 'text-[#525252]'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span>Meta Pixel</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plugins')}
              className={`min-h-[44px] sm:min-h-0 flex-1 sm:flex-initial justify-center px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'plugins' ? 'bg-[#0A0A0A] text-white' : 'text-[#525252]'
              }`}
            >
              <Blocks className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span>Plugins e Integrações</span>
            </button>
          </div>

          {canWrite && activeTab === 'pixel' && (
            <button
              type="button"
              disabled={isSaving || isMutating}
              onClick={() => void handleTogglePixelPower()}
              className={`min-h-[44px] sm:min-h-0 justify-center px-4 py-2.5 sm:py-2 rounded-[10px] text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 border disabled:opacity-50 ${
                ms.isActive
                  ? 'bg-white border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#F4F4F4]'
                  : 'btn-bercali-primary border-transparent'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{ms.isActive ? 'Desativar Pixel' : 'Ativar Pixel'}</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'plugins' ? (
        /* =====================================================================
           DEDICATED PLUGINS & INTEGRATIONS SECTION
           ===================================================================== */
        <div className="space-y-4">
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 text-xs text-[#525252] leading-relaxed">
            <strong className="text-[#0A0A0A]">Política de segurança para Plugins:</strong> Esta área impede a injeção de código arbitrário HTML/JavaScript. Cada conector utiliza apenas parâmetros estruturados validados e credenciais privadas residem exclusivamente no servidor.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {integrationsCatalog.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#737373]">{item.category}</p>
                      <h2 className="font-brand font-bold text-sm text-[#0A0A0A] mt-0.5 break-words">
                        {item.name}
                      </h2>
                    </div>

                    {item.status === 'configured' ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#15803D] whitespace-nowrap shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{item.statusLabel}</span>
                      </span>
                    ) : item.status === 'error' ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#B91C1C] whitespace-nowrap shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{item.statusLabel}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#525252] whitespace-nowrap shrink-0">
                        <Clock className="w-3.5 h-3.5 text-[#B45309]" />
                        <span>{item.statusLabel}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[#525252] leading-relaxed">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-[#E5E5E5] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#737373]">
                  <span>{item.securityNote}</span>
                  {item.id === 'meta-pixel' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('pixel')}
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center self-start sm:self-auto font-semibold text-[#FF8A00] hover:underline whitespace-nowrap shrink-0"
                    >
                      Gerir Pixel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* =====================================================================
           META PIXEL CONFIGURATION SECTION
           ===================================================================== */
        <>
          <div className="bg-[#0A0A0A] text-white rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-brand font-bold text-[#FFC400] mb-1">
                Estado real em marketing_settings
              </p>
              <p className="flex items-center gap-1.5 font-medium text-white">
                {snapshot.marketingLoadError ? (
                  <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                ) : ms.isActive ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                ) : (
                  <Clock className="w-4 h-4 text-[#FF8A00]" />
                )}
                <span>{statusLabel}</span>
              </p>
              <p className="text-[11px] text-[#A3A3A3] mt-1 tabular-data">
                Última atualização: {ms.updatedAt ? formatDateTimePt(ms.updatedAt) : 'Ainda não guardado'}
                {ms.updatedBy ? ` · por ${ms.updatedBy}` : ''}
              </p>
            </div>

            <div className="md:border-l md:border-[#262626] md:pl-4">
              <p className="font-brand font-bold text-white mb-1">
                Isolamento administrativo
              </p>
              <p className="text-[#A3A3A3] leading-relaxed">
                Este painel administrativo <strong className="text-white">nunca dispara eventos de navegação</strong> como se fosse um visitante. Apenas a loja pública lerá e executará o Pixel.
              </p>
            </div>

            <div className="md:border-l md:border-[#262626] md:pl-4">
              <p className="font-brand font-bold text-white mb-1">
                Regra estrita de Purchase
              </p>
              <p className="text-[#A3A3A3] leading-relaxed">
                Um clique para o WhatsApp dispara apenas <span className="font-mono text-white">Contact</span>. O evento <span className="font-mono text-[#FFC400]">Purchase</span> exige confirmação real da venda.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={(e) => void handleSave(e)}
              noValidate
              className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-6 space-y-5 text-xs"
            >
              <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                Configuração do Identificador Meta Pixel
              </h2>

              <div>
                <label htmlFor="pixel-id-input" className="block font-semibold text-[#0A0A0A] mb-1.5">
                  Meta Pixel ID (15 ou 16 dígitos numéricos)
                </label>
                <input
                  id="pixel-id-input"
                  type="text"
                  inputMode="numeric"
                  disabled={!canWrite || isSaving}
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  placeholder="Ex.: 123456789012345"
                  className={`w-full min-h-[44px] px-3.5 py-2.5 font-mono text-sm border rounded-[10px] focus:border-[#FF8A00] focus:outline-none disabled:bg-[#F4F4F4] ${
                    livePixelInvalid ? 'border-[#EF4444] bg-[#FEF2F2]' : 'border-[#D4D4D4]'
                  }`}
                />
                {livePixelInvalid ? (
                  <p className="text-[11px] text-[#B91C1C] mt-1">
                    O ID deve conter apenas 15 ou 16 dígitos numéricos (sem espaços nem letras).
                  </p>
                ) : (
                  <p className="text-[11px] text-[#525252] mt-1">
                    O Pixel ID é um identificador público lido pela loja online. Nunca introduzas tokens secretos da API de Conversões (CAPI) neste campo.
                  </p>
                )}
              </div>

              <div className="p-4 rounded-[10px] bg-[#F4F4F4] space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canWrite || isSaving}
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-[#0A0A0A]">Ativar carregamento do Pixel na loja pública</strong>
                    <span className="text-[#525252]">
                      Quando ativo na base de dados, a loja online pode inicializar automaticamente este Pixel ID.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canWrite || isSaving}
                    checked={requireConsent}
                    onChange={(e) => setRequireConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-[#0A0A0A]">Exigir consentimento de privacidade e cookies</strong>
                    <span className="text-[#525252]">
                      Aguardar aceite do cliente visitante na loja antes de iniciar cookies publicitários.
                    </span>
                  </span>
                </label>
              </div>

              {/* Prepared Store Events */}
              <div>
                <h3 className="font-brand font-bold text-sm text-[#0A0A0A] mb-2.5">
                  Eventos preparados para a loja pública (<span className="font-mono text-xs">events_config</span>)
                </h3>
                <div className="border border-[#E5E5E5] rounded-[10px] divide-y divide-[#E5E5E5]">
                  {events.map((ev) => (
                    <div
                      key={ev.eventName}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-[#0A0A0A]">{ev.eventName}</span>
                          {ev.requiresRealConfirmation && (
                            <span className="text-[11px] font-semibold text-[#B45309]">
                              · Exige venda confirmada
                            </span>
                          )}
                        </div>
                        <p className="text-[#525252] mt-0.5 leading-relaxed">{ev.description}</p>
                        <p className="text-[11px] text-[#737373] mt-0.5">Regra: {ev.triggerRule}</p>
                      </div>
                      <label className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 shrink-0 cursor-pointer self-start">
                        <input
                          type="checkbox"
                          disabled={!canWrite || isSaving}
                          checked={ev.enabled}
                          onChange={() => toggleEvent(ev.eventName)}
                        />
                        <span className="font-medium text-[#0A0A0A]">
                          {ev.enabled ? 'Ativo' : 'Inativo'}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div role="alert" className="p-3.5 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                  {error}
                </div>
              )}

              {savedBanner && (
                <div role="status" className="p-3.5 rounded-[10px] bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534]">
                  {savedBanner}
                </div>
              )}

              {canWrite && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving || isMutating}
                    className="btn-bercali-primary w-full sm:w-auto min-h-[44px] sm:min-h-0 px-5 py-2.5 rounded-[10px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'A guardar...' : 'Guardar configuração'}</span>
                  </button>
                </div>
              )}
            </form>

            {/* Instructions for Testing & Security */}
            <div className="lg:col-span-5 space-y-5 text-xs">
              <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-5 space-y-3">
                <h2 className="font-brand font-bold text-base text-[#0A0A0A] flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-[#FF8A00] shrink-0" />
                  <span>Instruções para testar na loja pública</span>
                </h2>
                <ol className="space-y-2.5 text-[#525252] leading-relaxed list-decimal list-inside">
                  <li>
                    Copia o <strong>Meta Pixel ID</strong> de 15–16 dígitos no Gestor de Eventos da Meta Business Suite e guarda-o nesta página.
                  </li>
                  <li>
                    Quando a <strong>loja pública Bercali Store</strong> for ligada a esta tabela <span className="font-mono">marketing_settings</span>, abre-a num navegador com <em>Meta Pixel Helper</em>.
                  </li>
                  <li>
                    No Gestor de Eventos da Meta, utiliza <strong>Testar Eventos</strong> para verificar <span className="font-mono">PageView</span>, <span className="font-mono">ViewContent</span> e <span className="font-mono">AddToCart</span>.
                  </li>
                  <li>
                    Confirma que cliques de WhatsApp na loja disparam <span className="font-mono">Contact</span> e nunca <span className="font-mono">Purchase</span> sem pagamento/venda validada.
                  </li>
                </ol>
              </div>

              <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-5 space-y-3">
                <h2 className="font-brand font-bold text-base text-[#0A0A0A] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                  <span>Segurança e Zero Métricas Fictícias</span>
                </h2>
                <p className="text-[#525252] leading-relaxed">
                  Este painel não apresenta gráficos simulados de cliques, impressões ou ROAS. Qualquer token privado da <strong>Conversions API (CAPI)</strong> deverá residir exclusivamente em segredos de servidor (Supabase Edge Functions), nunca no cliente.
                </p>
                <div className="p-3 rounded-lg bg-[#F4F4F4] flex items-center gap-2 text-[#0A0A0A] font-medium">
                  <Lock className="w-4 h-4 text-[#FF8A00] shrink-0" />
                  <span>Validação estrita sem injeção de scripts arbitrários</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
