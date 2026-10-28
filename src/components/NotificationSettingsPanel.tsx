import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Download,
  Play,
  RefreshCw,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useOrderNotifications } from '../context/OrderNotificationsContext';
import { usePwaStatus } from '../hooks/usePwaStatus';
import { NOTIFICATION_MELODIES } from '../utils/orderNotifications';

export const NotificationSettingsPanel: React.FC = () => {
  const {
    hasOrdersAccess,
    prefs,
    updatePrefs,
    audioState,
    browserPermission,
    realtimeState,
    activateSoundAndPermissions,
    previewMelody,
    triggerTestNotification,
  } = useOrderNotifications();

  const {
    canInstall,
    isInstalled,
    isIOS,
    updateAvailable,
    promptInstall,
    applyUpdate,
  } = usePwaStatus();

  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [soundFeedback, setSoundFeedback] = useState<string | null>(null);

  const handleInstallClick = async () => {
    setInstallFeedback(null);
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setInstallFeedback('Aplicação instalada com sucesso neste dispositivo.');
      } else if (outcome === 'dismissed') {
        setInstallFeedback('Instalação adiada. Podes instalar a qualquer momento por este botão.');
      }
      return;
    }

    if (isIOS) {
      setInstallFeedback(
        'No Safari (iPhone/iPad): toca no ícone Partilhar na barra do navegador e escolhe "Adicionar ao ecrã principal".'
      );
      return;
    }

    setInstallFeedback(
      'Abre o endereço direto do painel (HTTPS na Vercel) no Chrome ou Edge e utiliza o ícone de instalação na barra de endereços ou o menu "Instalar Bercali Store — Painel".'
    );
  };

  const handleActivateSound = async () => {
    setSoundFeedback(null);
    const res = await activateSoundAndPermissions();
    if (res.audioUnlocked) {
      setSoundFeedback(
        res.permission === 'granted'
          ? 'Som desbloqueado e notificações de segundo plano autorizadas neste navegador.'
          : 'Som Web Audio desbloqueado neste navegador.'
      );
    } else {
      setSoundFeedback(
        'O navegador manteve o áudio suspenso. Verifica se o separador não está silenciado e tenta novamente.'
      );
    }
  };

  const browserPermLabel =
    browserPermission === 'granted'
      ? 'Autorizadas'
      : browserPermission === 'denied'
        ? 'Bloqueadas no navegador'
        : browserPermission === 'default'
          ? 'Por autorizar'
          : 'Não suportadas';

  const realtimeLabel =
    realtimeState === 'subscribed'
      ? 'Ligado a orders (Tempo Real)'
      : realtimeState === 'connecting'
        ? 'A ligar ao canal...'
        : realtimeState === 'reconnecting'
          ? 'A reconectar automaticamente...'
          : 'Inativo';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-xs">
      {/* Preferências de Notificações em Tempo Real + Som Web Audio API */}
      <section
        aria-labelledby="notif-settings-heading"
        className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E5E5E5]">
          <div>
            <h2
              id="notif-settings-heading"
              className="font-brand font-bold text-base text-[#0A0A0A] flex items-center gap-2"
            >
              <Bell className="w-4 h-4 text-[#FF8A00]" />
              <span>Notificações em Tempo Real e Som</span>
            </h2>
            <p className="text-[#525252] mt-1 leading-relaxed">
              Preferências guardadas localmente neste aparelho (<span className="font-mono">localStorage</span>). Melodias geradas via Web Audio API sem ficheiros pesados.
            </p>
          </div>

          {hasOrdersAccess && (
            <span className="text-[11px] font-medium text-[#525252] whitespace-nowrap">
              Canal: <strong className="text-[#0A0A0A]">{realtimeLabel}</strong>
            </span>
          )}
        </div>

        {!hasOrdersAccess ? (
          <div className="p-4 rounded-[10px] bg-[#F4F4F4] text-[#525252]">
            O teu perfil atual não inclui permissão de acesso ao módulo de <strong>Encomendas</strong>, pelo que a subscrição em tempo real a <span className="font-mono">orders</span> permanece desativada por segurança (RBAC/RLS).
          </div>
        ) : (
          <>
            {/* Estado de Desbloqueio de Som e Permissões */}
            <div className="p-4 rounded-[10px] bg-[#F4F4F4] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-[#0A0A0A]">
                  {audioState === 'unlocked' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      <span className="text-[#15803D]">Som ativo e desbloqueado neste navegador</span>
                    </>
                  ) : audioState === 'locked' ? (
                    <>
                      <VolumeX className="w-4 h-4 text-[#B45309] shrink-0" />
                      <span className="text-[#B45309]">Som bloqueado pelo navegador (requer clique)</span>
                    </>
                  ) : (
                    <span>Web Audio API indisponível neste dispositivo</span>
                  )}
                </div>
                <p className="text-[11px] text-[#525252]">
                  Notificações em segundo plano: <strong className="text-[#0A0A0A]">{browserPermLabel}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleActivateSound()}
                  className="btn-bercali-primary px-4 py-2 rounded-[10px] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Ativar som</span>
                </button>
                <button
                  type="button"
                  onClick={() => void triggerTestNotification()}
                  className="px-3.5 py-2 rounded-[10px] border border-[#0A0A0A] bg-white hover:bg-[#FAFAFA] font-semibold text-[#0A0A0A] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Bell className="w-3.5 h-3.5 text-[#FF8A00]" />
                  <span>Testar notificação</span>
                </button>
              </div>
            </div>

            {soundFeedback && (
              <p role="status" className="text-[11px] font-medium text-[#15803D]">
                {soundFeedback}
              </p>
            )}

            {/* Toggles Ativar Notificações / Ativar Som */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-2.5 p-3.5 rounded-[10px] border border-[#E5E5E5] cursor-pointer hover:bg-[#FAFAFA]">
                <input
                  type="checkbox"
                  checked={prefs.enabled}
                  onChange={(e) => updatePrefs({ enabled: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[#0A0A0A]">Ativar notificações de encomendas</strong>
                  <span className="text-[11px] text-[#525252]">
                    Mostra contador no sino, aviso toast e alerta em segundo plano.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-3.5 rounded-[10px] border border-[#E5E5E5] cursor-pointer hover:bg-[#FAFAFA]">
                <input
                  type="checkbox"
                  checked={prefs.soundEnabled}
                  disabled={!prefs.enabled}
                  onChange={(e) => updatePrefs({ soundEnabled: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[#0A0A0A]">Reproduzir som ao entrar encomenda</strong>
                  <span className="text-[11px] text-[#525252]">
                    Toca a melodia escolhida sempre que chegar um novo pedido.
                  </span>
                </span>
              </label>
            </div>

            {/* Volume 0 a 100% */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="notif-volume-range" className="font-semibold text-[#0A0A0A]">
                  Volume do alerta sonoro
                </label>
                <span className="font-mono font-bold text-[#0A0A0A] tabular-data">
                  {prefs.volume}%
                </span>
              </div>
              <input
                id="notif-volume-range"
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={!prefs.enabled || !prefs.soundEnabled}
                value={prefs.volume}
                onChange={(e) => updatePrefs({ volume: Number(e.target.value) })}
                className="w-full accent-[#FF8A00] cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* 5 Melodias com botão Ouvir */}
            <div className="space-y-2">
              <p className="font-semibold text-[#0A0A0A]">
                Melodia de nova encomenda
              </p>
              <div className="border border-[#E5E5E5] rounded-[10px] divide-y divide-[#E5E5E5]">
                {NOTIFICATION_MELODIES.map((m) => {
                  const selected = prefs.melody === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 ${
                        selected ? 'bg-[#FFF9F0]' : 'bg-white'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                        <input
                          type="radio"
                          name="bercali-notif-melody"
                          checked={selected}
                          onChange={() => updatePrefs({ melody: m.id })}
                        />
                        <span className="min-w-0">
                          <strong className="block text-[#0A0A0A]">{m.label}</strong>
                          <span className="text-[11px] text-[#525252]">{m.description}</span>
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => void previewMelody(m.id)}
                        aria-label={`Ouvir melodia ${m.label}`}
                        className="px-3 py-1.5 rounded-lg border border-[#D4D4D4] bg-white hover:bg-[#F4F4F4] font-semibold text-[#0A0A0A] inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
                      >
                        <Play className="w-3 h-3 text-[#FF8A00]" />
                        <span>Ouvir</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Instalação da Aplicação PWA & Atualizações */}
      <section
        aria-labelledby="pwa-settings-heading"
        className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-xl p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E5E5E5]">
          <div>
            <h2
              id="pwa-settings-heading"
              className="font-brand font-bold text-base text-[#0A0A0A] flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4 text-[#FF8A00]" />
              <span>Aplicação Instalável (PWA)</span>
            </h2>
            <p className="text-[#525252] mt-1 leading-relaxed">
              Instala o <strong>Bercali Admin</strong> no ecrã principal ou ambiente de trabalho em modo autónomo (<span className="font-mono">standalone</span>).
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-[10px] bg-[#F4F4F4] space-y-1.5 text-[#525252]">
          <p className="font-semibold text-[#0A0A0A]">Proteção contra dados antigos ativa</p>
          <p className="leading-relaxed">
            O Service Worker guarda apenas o <em>shell</em> visual da aplicação (HTML, CSS, JS e ícones). Todos os pedidos ao Supabase (<span className="font-mono">auth</span>, <span className="font-mono">rest</span>, <span className="font-mono">realtime</span> e <span className="font-mono">storage</span>) vão sempre diretamente à rede.
          </p>
        </div>

        {isInstalled ? (
          <div className="p-3.5 rounded-[10px] bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>A aplicação já está instalada e a correr em modo autónomo neste dispositivo.</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="btn-bercali-primary w-full px-4 py-2.5 rounded-[10px] inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Instalar app</span>
            </button>

            {installFeedback && (
              <p className="text-[11px] text-[#525252] bg-[#F4F4F4] p-3 rounded-lg leading-relaxed">
                {installFeedback}
              </p>
            )}
          </div>
        )}

        {updateAvailable && (
          <div className="p-3.5 rounded-[10px] bg-[#0A0A0A] text-white flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#FFC400]">Nova versão disponível</p>
              <p className="text-[11px] text-[#D4D4D4]">
                Atualiza para carregar a versão mais recente do painel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void applyUpdate()}
              className="btn-bercali-primary px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
