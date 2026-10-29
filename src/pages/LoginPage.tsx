import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { BercaliSpeedLines, BrandLogo } from '../components/BrandLogo';
import { SQL_MIGRATION_FILES } from '../config/supabaseConfig';
import { useAdmin } from '../context/AdminContext';

export const LoginPage: React.FC = () => {
  const {
    session,
    backendStatus,
    recheckBackendConnection,
    signInWithPassword,
    requestPasswordReset,
    completePasswordRecovery,
  } = useAdmin();

  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);

  const handleRecheck = async () => {
    setIsCheckingConn(true);
    setError(null);
    try {
      await recheckBackendConnection();
    } finally {
      setIsCheckingConn(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Introduz um endereço de email institucional válido.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Introduz a tua palavra-passe (mínimo 6 caracteres).');
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithPassword(cleanEmail, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar sessão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecoveryNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Indica um endereço de email válido para enviar as instruções.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(cleanEmail);
      setRecoveryNotice(
        'Se este email corresponder a uma conta administrativa registada no Supabase Auth, receberás em instantes uma ligação segura para redefinir a palavra-passe.'
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar recuperação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('A nova palavra-passe deve conter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('A confirmação da palavra-passe não coincide.');
      return;
    }

    setIsSubmitting(true);
    try {
      await completePasswordRecovery(newPassword);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar palavra-passe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBackendReady = backendStatus.state === 'ready';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-center items-center p-4 pt-safe pb-safe pl-safe pr-safe">
      <div className="w-full max-w-md bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <BrandLogo variant="login" className="mb-4" />
          <BercaliSpeedLines className="mb-3" />
          <h1 className="font-brand font-extrabold text-xl text-white">
            Painel Administrativo
          </h1>
          <p className="text-xs text-[#A3A3A3] mt-1">
            Acesso autenticado exclusivo da equipa Bercali Store
          </p>
        </div>

        {/* Estado real da comunicação com o Supabase */}
        <div
          className={`rounded-[10px] p-3.5 mb-5 text-xs border ${
            isBackendReady
              ? 'bg-[#0A0A0A] border-[#262626] text-[#D4D4D4]'
              : 'bg-[#0A0A0A] border-[#FFC400]/50 text-[#E5E5E5]'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              {backendStatus.state === 'checking' ? (
                <Loader2 className="w-4 h-4 text-[#FF8A00] animate-spin shrink-0 mt-0.5" />
              ) : isBackendReady ? (
                <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#FFC400] shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-white">{backendStatus.summaryLabel}</p>
                <p className="text-[11px] text-[#A3A3A3] leading-relaxed mt-0.5 break-words">
                  {backendStatus.detailMessage}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleRecheck()}
              disabled={isCheckingConn}
              aria-label="Verificar novamente ligação ao Supabase"
              title="Testar ligação novamente"
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg border border-[#333333] hover:border-[#FF8A00] text-[#D4D4D4] shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingConn ? 'animate-spin text-[#FF8A00]' : ''}`} />
            </button>
          </div>

          {(!isBackendReady || session.inactiveProfileEmail) && (
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] text-[#A3A3A3]">
                Precisas de aplicar as migrações ou ativar o primeiro super_admin?
              </span>
              <button
                type="button"
                onClick={() => setSetupGuideOpen(true)}
                className="min-h-[44px] sm:min-h-0 inline-flex items-center self-start sm:self-auto text-[11px] font-semibold text-[#FFC400] hover:underline whitespace-nowrap"
              >
                Ver guia SQL
              </button>
            </div>
          )}
        </div>

        {/* Aviso de sessão expirada ou perfil inativo */}
        {session.sessionNotice && (
          <div
            role="alert"
            className="bg-[#0A0A0A] border border-[#FF8A00]/60 rounded-[10px] p-3.5 mb-5 text-xs text-[#E5E5E5] flex items-start gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 text-[#FF8A00] shrink-0 mt-0.5" />
            <p className="leading-relaxed">{session.sessionNotice}</p>
          </div>
        )}

        {session.isPasswordRecoveryMode ? (
          <form onSubmit={handleUpdatePasswordSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-[#E5E5E5] mb-1.5">
                Nova palavra-passe (mín. 8 caracteres)
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#0A0A0A] border border-[#333333] focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-white"
              />
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-xs font-medium text-[#E5E5E5] mb-1.5">
                Confirmar nova palavra-passe
              </label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#0A0A0A] border border-[#333333] focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-white"
              />
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-[10px] bg-[#EF4444]/15 border border-[#EF4444]/40 text-xs text-[#FCA5A5]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-bercali-primary w-full min-h-[44px] py-2.5 px-4 rounded-[10px] text-xs uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isSubmitting ? 'A guardar...' : 'Definir Nova Palavra-passe'}</span>
            </button>
          </form>
        ) : mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-[#E5E5E5] mb-1.5">
                Email institucional
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@bercalistore.ao"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#0A0A0A] border border-[#333333] focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-white"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <label htmlFor="login-password" className="text-xs font-medium text-[#E5E5E5]">
                  Palavra-passe
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setRecoveryNotice(null);
                    setMode('recover');
                  }}
                  className="min-h-[44px] sm:min-h-0 px-1 inline-flex items-center text-[11px] text-[#FF8A00] hover:underline"
                >
                  Recuperar palavra-passe
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#0A0A0A] border border-[#333333] focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-white"
              />
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-[10px] bg-[#EF4444]/15 border border-[#EF4444]/40 text-xs text-[#FCA5A5]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-bercali-primary w-full min-h-[44px] py-2.5 px-4 rounded-[10px] text-xs uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>{isSubmitting ? 'A autenticar...' : 'Iniciar Sessão'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecoverySubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="recover-email" className="block text-xs font-medium text-[#E5E5E5] mb-1.5">
                Email da conta administrativa
              </label>
              <input
                id="recover-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@bercalistore.ao"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#0A0A0A] border border-[#333333] focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-white"
              />
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-[10px] bg-[#EF4444]/15 border border-[#EF4444]/40 text-xs text-[#FCA5A5]">
                {error}
              </div>
            )}

            {recoveryNotice && (
              <div role="status" className="p-3 rounded-[10px] bg-[#0A0A0A] border border-[#22C55E]/50 text-xs text-[#E5E5E5] leading-relaxed">
                {recoveryNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-bercali-primary w-full min-h-[44px] py-2.5 px-4 rounded-[10px] text-xs uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              <span>{isSubmitting ? 'A enviar...' : 'Enviar ligação de recuperação'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setRecoveryNotice(null);
                setMode('login');
              }}
              className="w-full min-h-[44px] py-2 text-xs text-[#A3A3A3] hover:text-white flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao início de sessão</span>
            </button>
          </form>
        )}

        <p className="text-[11px] text-[#737373] text-center mt-6">
          Bercali Store · O futuro das compras começa aqui.
        </p>
      </div>

      {/* Modal de Instruções SQL & Bootstrap do Primeiro Superadministrador */}
      {setupGuideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sql-setup-guide-title"
        >
          <div className="bg-[#1A1A1A] border border-[#333333] rounded-xl max-w-xl w-full max-h-[90dvh] flex flex-col overflow-hidden text-xs text-[#E5E5E5]">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-2 text-[#FFC400] min-w-0">
                <Database className="w-4 h-4 shrink-0" />
                <h2 id="sql-setup-guide-title" className="font-brand font-bold text-sm sm:text-base text-white">
                  Configuração Inicial do Projeto Supabase
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSetupGuideOpen(false)}
                aria-label="Fechar guia de configuração"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-[#262626] text-[#A3A3A3] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <p className="font-semibold text-white">
                  1. Variáveis de Ambiente Públicas
                </p>
                <p className="text-[#A3A3A3] leading-relaxed">
                  Confirma que <span className="font-mono text-white">VITE_SUPABASE_URL</span> e{' '}
                  <span className="font-mono text-white">VITE_SUPABASE_ANON_KEY</span> apontam para o teu projeto Supabase (nunca uses a chave <span className="font-mono text-[#FCA5A5]">service_role</span>).
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-white">
                  2. Executar Migrações Versionadas no Supabase SQL Editor
                </p>
                <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg p-3 space-y-1.5 font-mono text-[11px] text-[#FFC400]">
                  {SQL_MIGRATION_FILES.map((file, idx) => (
                    <p key={file} className="break-all">
                      {idx + 1}. {file}
                    </p>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-white">
                  3. Ativar o Primeiro Superadministrador com Segurança
                </p>
                <p className="text-[#A3A3A3] leading-relaxed">
                  Cria o utilizador em <strong>Authentication &rarr; Users</strong> no painel do Supabase e executa no <strong>SQL Editor</strong>:
                </p>
                <pre className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg p-3 font-mono text-[11px] text-[#E5E5E5] overflow-x-auto">
{`select public.bootstrap_first_super_admin(
  '${session.inactiveProfileEmail || 'direcao@bercalistore.ao'}',
  'Direção Bercali Store'
);`}
                </pre>
              </div>
            </div>

            <div className="shrink-0 flex justify-end px-4 py-3 sm:px-6 sm:py-4 border-t border-[#2A2A2A] bg-[#1A1A1A]">
              <button
                type="button"
                onClick={() => setSetupGuideOpen(false)}
                className="btn-bercali-primary w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-[10px]"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
