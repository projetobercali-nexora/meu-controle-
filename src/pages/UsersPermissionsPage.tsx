import React, { useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Info,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { getRoleLabel, ROLE_DEFINITIONS } from '../auth/permissions';
import { AccessDeniedState, LoadingBlock } from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { AdminProfile, UserRole } from '../types/domain';
import { formatDateTimePt } from '../utils/formatters';

export const UsersPermissionsPage: React.FC = () => {
  const {
    snapshot,
    session,
    isDataLoading,
    isMutating,
    can,
    canOpenModule,
    updateAdminProfile,
  } = useAdmin();

  const canManageUsers = can('users:manage');

  const [modalOpen, setModalOpen] = useState(false);
  const [inviteGuideOpen, setInviteGuideOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AdminProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('crm_agent');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [logEntityFilter, setLogEntityFilter] = useState('all');

  if (!canOpenModule('users')) {
    return (
      <AccessDeniedState
        moduleTitle="Utilizadores e Permissões"
        requiredNote="Apenas Superadministrador e Administrador podem consultar utilizadores; apenas o Superadministrador pode gerir perfis e permissões."
      />
    );
  }

  const openEdit = (p: AdminProfile) => {
    setEditingProfile(p);
    setFullName(p.fullName);
    setPhone(p.phone || '');
    setRole(p.role);
    setIsActive(p.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile || isSubmitting) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await updateAdminProfile({
        id: editingProfile.id,
        fullName,
        phone,
        role,
        isActive,
      });
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao atualizar perfil administrativo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLogs = snapshot.activityLogs.filter((l) =>
    logEntityFilter === 'all' ? true : l.entityType === logEntityFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Utilizadores e Permissões
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Controlo de acesso RBAC validado em <span className="font-mono text-xs">public.profiles</span>, triggers PostgreSQL e Row Level Security
          </p>
        </div>

        {canManageUsers && (
          <button
            type="button"
            onClick={() => setInviteGuideOpen(true)}
            className="btn-bercali-primary px-4 py-2.5 rounded-[10px] text-xs inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Adicionar Membro da Equipa</span>
          </button>
        )}
      </div>

      {/* Security Architecture Notice */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 text-xs text-[#525252] leading-relaxed">
        <strong className="text-[#0A0A0A]">Segurança e Princípio do Menor Privilégio:</strong>{' '}
        Novos utilizadores criados em <span className="font-mono">Supabase Auth</span> recebem automaticamente um perfil bloqueado (<span className="font-mono">is_active = false</span>, função <span className="font-mono">crm_agent</span>) através do trigger <span className="font-mono">handle_new_auth_user()</span> até que um Superadministrador valide e ative a conta abaixo. O trigger <span className="font-mono">guard_profile_privilege_changes()</span> impede auto-escalonamento de privilégios e protege o último Superadministrador ativo.
      </div>

      {/* 6 Official Profiles Matrix */}
      <section aria-label="Perfis administrativos e permissões" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(Object.keys(ROLE_DEFINITIONS) as UserRole[]).map((roleKey) => {
          const def = ROLE_DEFINITIONS[roleKey];
          const isCurrent = session.role === roleKey;
          const assignedCount = snapshot.profiles.filter((p) => p.role === roleKey && p.isActive).length;
          return (
            <div
              key={roleKey}
              className={`bg-white rounded-xl p-5 border flex flex-col justify-between gap-3 ${
                isCurrent ? 'border-[#FF8A00]' : 'border-[#E5E5E5]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-brand font-bold text-sm text-[#0A0A0A]">
                    {def.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[11px] font-semibold text-[#FF8A00]">
                      A tua função atual
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#525252] leading-relaxed">
                  {def.shortDescription}
                </p>
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] flex items-center justify-between text-[11px] text-[#737373] font-mono">
                <span>{def.permissions.length} permissões</span>
                <span>{assignedCount} ativo(s)</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* Team Profiles Table */}
      {isDataLoading && snapshot.profiles.length === 0 ? (
        <LoadingBlock label="A carregar contas administrativas..." />
      ) : (
        <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#E5E5E5] flex items-center justify-between">
            <div>
              <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                Contas Administrativas Registadas ({snapshot.profiles.length})
              </h2>
              <p className="text-xs text-[#525252]">
                Sincronizadas com <span className="font-mono">auth.users</span> · Apenas o Superadministrador pode alterar funções ou ativar acessos
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-[#FF8A00]" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                  <th className="py-3 px-4">Nome</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Última atividade</th>
                  <th className="py-3 px-4 text-right">Gestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5] text-xs">
                {snapshot.profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAFAFA]">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[#0A0A0A]">{p.fullName}</p>
                      {p.phone && <p className="text-[11px] font-mono text-[#737373]">{p.phone}</p>}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#525252]">{p.email}</td>
                    <td className="py-3 px-4 text-[#0A0A0A]">{getRoleLabel(p.role)}</td>
                    <td className="py-3 px-4">
                      {p.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[#15803D] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ativo</span>
                        </span>
                      ) : (
                        <span className="text-[#B91C1C] font-medium">Pendente / Suspenso</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#525252] tabular-data">
                      {formatDateTimePt(p.lastActiveAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canManageUsers ? (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => openEdit(p)}
                          aria-label={`Editar perfil de ${p.fullName}`}
                          className="p-1.5 rounded-lg border border-[#E5E5E5] hover:bg-[#F4F4F4] disabled:opacity-40"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#737373]">Reservado Superadmin</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity Logs */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
              Registo Imutável de Auditoria (<span className="font-mono text-sm">activity_logs</span>)
            </h2>
            <p className="text-xs text-[#525252]">
              Histórico protegido contra edição ou eliminação pelas políticas RLS
            </p>
          </div>
          <select
            aria-label="Filtrar registo de auditoria por módulo"
            value={logEntityFilter}
            onChange={(e) => setLogEntityFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#D4D4D4] rounded-[10px] bg-white"
          >
            <option value="all">Todas as áreas</option>
            <option value="product">Produtos</option>
            <option value="category">Categorias</option>
            <option value="order">Encomendas</option>
            <option value="customer">Clientes</option>
            <option value="crm">CRM</option>
            <option value="marketing">Marketing</option>
            <option value="settings">Configurações</option>
            <option value="user">Utilizadores</option>
            <option value="auth">Autenticação</option>
          </select>
        </div>

        {filteredLogs.length === 0 ? (
          <p className="text-xs text-[#737373] py-4">Sem registos para o filtro selecionado.</p>
        ) : (
          <div className="divide-y divide-[#E5E5E5] text-xs max-h-80 overflow-y-auto">
            {filteredLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#0A0A0A]">
                    {log.action} · <span className="font-mono text-[#525252]">{log.entityRef}</span>
                  </p>
                  <p className="text-[#525252] mt-0.5">{log.details}</p>
                </div>
                <div className="sm:text-right text-[11px] text-[#737373] shrink-0 tabular-data">
                  <p>{formatDateTimePt(log.createdAt)}</p>
                  <p>
                    {log.actorName} ({getRoleLabel(log.actorRole)})
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Admin User Modal */}
      {modalOpen && editingProfile && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usr-modal-title"
        >
          <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E5E5E5]">
              <h2 id="usr-modal-title" className="font-brand font-bold text-lg text-[#0A0A0A]">
                Editar Perfil Administrativo
              </h2>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setModalOpen(false)}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg hover:bg-[#F4F4F4]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} noValidate className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[#525252] mb-1">
                  Email autenticado (Supabase Auth)
                </label>
                <input
                  type="email"
                  disabled
                  value={editingProfile.email}
                  className="w-full px-3 py-2 font-mono bg-[#F4F4F4] border border-[#E5E5E5] rounded-[10px] text-[#525252]"
                />
              </div>

              <div>
                <label htmlFor="usr-name" className="block font-medium text-[#0A0A0A] mb-1">
                  Nome completo *
                </label>
                <input
                  id="usr-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                />
              </div>

              <div>
                <label htmlFor="usr-phone" className="block font-medium text-[#0A0A0A] mb-1">
                  Telefone institucional (opcional)
                </label>
                <input
                  id="usr-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+244 9XX XXX XXX"
                  className="w-full px-3 py-2 font-mono border border-[#D4D4D4] rounded-[10px]"
                />
              </div>

              <div>
                <label htmlFor="usr-role" className="block font-medium text-[#0A0A0A] mb-1">
                  Função administrativa (RBAC)
                </label>
                <select
                  id="usr-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] bg-white"
                >
                  {(Object.keys(ROLE_DEFINITIONS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_DEFINITIONS[r].label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="inline-flex items-center gap-2 font-medium text-[#0A0A0A]">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Conta ativa (autorizada a entrar no painel)</span>
              </label>

              {formError && (
                <div role="alert" className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-[#D4D4D4] rounded-[10px] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-bercali-primary px-4 py-2 rounded-[10px] disabled:opacity-50"
                >
                  {isSubmitting ? 'A guardar...' : 'Guardar Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Invite User Guide Modal (Zero service_role in frontend) */}
      {inviteGuideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-guide-title"
        >
          <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <h2 id="invite-guide-title" className="font-brand font-bold text-lg text-[#0A0A0A]">
                Adicionar Novo Membro sem Expor Chave Privada
              </h2>
              <button
                type="button"
                onClick={() => setInviteGuideOpen(false)}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg hover:bg-[#F4F4F4]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-[10px] bg-[#F4F4F4] flex items-start gap-2.5 text-[#525252]">
              <Info className="w-4 h-4 text-[#FF8A00] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Por segurança, este painel não inclui a chave privilegiada <span className="font-mono">service_role</span> no navegador. A criação de credenciais é feita diretamente no Supabase Auth e ativada aqui.
              </p>
            </div>

            <ol className="space-y-2.5 text-[#525252] list-decimal list-inside leading-relaxed">
              <li>
                No painel do projeto <strong>Supabase</strong>, acede a <strong>Authentication → Users</strong> e clica em <strong>Invite user</strong> ou <strong>Add user</strong>.
              </li>
              <li>
                O trigger automático PostgreSQL (<span className="font-mono">handle_new_auth_user</span>) criará imediatamente o registo correspondente na tabela <span className="font-mono">profiles</span> com <span className="font-mono">is_active = false</span> (bloqueado por defeito).
              </li>
              <li>
                Atualiza esta página, clica em <strong>Editar</strong> junto ao novo colaborador, escolhe a função adequada (ex.: <em>Gestor de Encomendas</em> ou <em>Atendimento / CRM</em>) e marca <strong>Conta ativa</strong>.
              </li>
            </ol>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInviteGuideOpen(false)}
                className="btn-bercali-primary px-4 py-2 rounded-[10px]"
              >
                Compreendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
