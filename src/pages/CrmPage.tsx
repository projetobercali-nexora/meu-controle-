import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Columns3,
  List,
  MessageSquare,
  Plus,
  Send,
  Tag,
} from 'lucide-react';
import {
  AccessDeniedState,
  CRM_STAGE_LABELS,
  EmptyDataState,
  LoadingBlock,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { CrmStage, CustomerNote } from '../types/domain';
import {
  classifyCrmTaskUrgency,
  formatDateTimePt,
  formatKwanza,
  isConfirmedOrder,
  PENDING_ORDER_STATUSES,
} from '../utils/formatters';

const CHANNEL_LABELS: Record<CustomerNote['channel'], string> = {
  nota_interna: 'Nota interna',
  whatsapp_manual: 'Registo manual WhatsApp',
  chamada: 'Chamada telefónica',
  email: 'Email comercial',
};

type TaskFilterTab = 'pending' | 'overdue' | 'completed' | 'all';

export const CrmPage: React.FC = () => {
  const {
    snapshot,
    isDataLoading,
    isMutating,
    can,
    canOpenModule,
    focusedEntityId,
    setFocusedEntityId,
    updateCustomerCrm,
    addCustomerNote,
    createCustomerTag,
    createCrmTask,
    updateCrmTaskStatus,
    notify,
  } = useAdmin();

  const canWrite = can('crm:write');
  const canViewPii = can('customers:view_contact_pii');

  const [viewMode, setViewMode] = useState<'list' | 'tasks' | 'board'>('list');
  const [stageFilter, setStageFilter] = useState<'all' | CrmStage>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [onlyPendingOrdersFilter, setOnlyPendingOrdersFilter] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    snapshot.customers[0]?.id || null
  );

  // Follow-up note states
  const [noteChannel, setNoteChannel] = useState<CustomerNote['channel']>('whatsapp_manual');
  const [noteContent, setNoteContent] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);

  // New tag states
  const [newTagName, setNewTagName] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // CRM Follow-up Tasks states
  const [taskFilter, setTaskFilter] = useState<TaskFilterTab>('pending');
  const [taskCustomerId, setTaskCustomerId] = useState('');
  const [taskOrderId, setTaskOrderId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  useEffect(() => {
    if (focusedEntityId) {
      const target = snapshot.customers.find((c) => c.id === focusedEntityId);
      if (target) {
        setSelectedId(target.id);
        setViewMode('list');
      }
      setFocusedEntityId(null);
    }
  }, [focusedEntityId, snapshot.customers, setFocusedEntityId]);

  const customerOrderAgg = useMemo(() => {
    const confirmedMap = new Map<string, number>();
    const pendingOrderIdsByCustomer = new Map<string, string[]>();

    for (const o of snapshot.orders) {
      if (isConfirmedOrder(o.status)) {
        confirmedMap.set(o.customerId, (confirmedMap.get(o.customerId) || 0) + o.totalKz);
      }
      if (PENDING_ORDER_STATUSES.includes(o.status)) {
        const list = pendingOrderIdsByCustomer.get(o.customerId) || [];
        list.push(o.code);
        pendingOrderIdsByCustomer.set(o.customerId, list);
      }
    }
    return { confirmedMap, pendingOrderIdsByCustomer };
  }, [snapshot.orders]);

  const filteredCustomers = useMemo(() => {
    return snapshot.customers.filter((c) => {
      if (stageFilter !== 'all' && c.crmStage !== stageFilter) return false;
      if (tagFilter !== 'all' && !c.tagIds.includes(tagFilter)) return false;
      if (onlyPendingOrdersFilter) {
        const pendingCodes = customerOrderAgg.pendingOrderIdsByCustomer.get(c.id) || [];
        if (pendingCodes.length === 0) return false;
      }
      return true;
    });
  }, [snapshot.customers, stageFilter, tagFilter, onlyPendingOrdersFilter, customerOrderAgg]);

  const activeCustomer = useMemo(
    () =>
      snapshot.customers.find((c) => c.id === selectedId) ||
      filteredCustomers[0] ||
      null,
    [snapshot.customers, selectedId, filteredCustomers]
  );

  useEffect(() => {
    if (activeCustomer && !taskCustomerId) {
      setTaskCustomerId(activeCustomer.id);
    }
  }, [activeCustomer, taskCustomerId]);

  const activeNotes = useMemo(
    () =>
      activeCustomer
        ? snapshot.customerNotes.filter((n) => n.customerId === activeCustomer.id)
        : [],
    [snapshot.customerNotes, activeCustomer]
  );

  const activeCustomerTasks = useMemo(
    () =>
      activeCustomer
        ? snapshot.crmTasks.filter((t) => t.customerId === activeCustomer.id)
        : [],
    [snapshot.crmTasks, activeCustomer]
  );

  const taskCounts = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let completed = 0;
    for (const t of snapshot.crmTasks) {
      const urg = classifyCrmTaskUrgency(t);
      if (urg === 'overdue') overdue += 1;
      else if (urg === 'pending') pending += 1;
      else if (urg === 'completed') completed += 1;
    }
    return { pending, overdue, completed, all: snapshot.crmTasks.length };
  }, [snapshot.crmTasks]);

  const filteredTasks = useMemo(() => {
    return snapshot.crmTasks.filter((t) => {
      const urg = classifyCrmTaskUrgency(t);
      if (taskFilter === 'all') return true;
      if (taskFilter === 'overdue') return urg === 'overdue';
      if (taskFilter === 'pending') return urg === 'pending' || urg === 'overdue';
      if (taskFilter === 'completed') return urg === 'completed';
      return true;
    });
  }, [snapshot.crmTasks, taskFilter]);

  if (!canOpenModule('crm')) {
    return <AccessDeniedState moduleTitle="CRM — Relacionamento com Clientes" />;
  }

  const handleToggleCustomerTag = async (tagId: string) => {
    if (!activeCustomer || !canWrite || isMutating) return;
    const exists = activeCustomer.tagIds.includes(tagId);
    const nextTags = exists
      ? activeCustomer.tagIds.filter((id) => id !== tagId)
      : [...activeCustomer.tagIds, tagId];
    try {
      await updateCustomerCrm(
        activeCustomer.id,
        activeCustomer.crmStage,
        nextTags,
        activeCustomer.internalSummary,
        false
      );
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Erro ao atualizar etiquetas.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer || isAddingNote) return;
    setNoteError(null);
    setIsAddingNote(true);
    try {
      await addCustomerNote(activeCustomer.id, noteChannel, noteContent);
      setNoteContent('');
    } catch (err: unknown) {
      setNoteError(err instanceof Error ? err.message : 'Erro ao registar nota.');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingTag) return;
    setTagError(null);
    setIsCreatingTag(true);
    try {
      await createCustomerTag(newTagName, 'orange');
      setNewTagName('');
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : 'Erro ao criar etiqueta.');
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingTask) return;
    setTaskError(null);
    setIsCreatingTask(true);
    try {
      const dueIso = taskDueDate ? new Date(`${taskDueDate}T17:00:00.000Z`).toISOString() : null;
      await createCrmTask({
        customerId: taskCustomerId || activeCustomer?.id || '',
        orderId: taskOrderId || null,
        title: taskTitle,
        description: taskDescription,
        dueAt: dueIso,
      });
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setTaskOrderId('');
    } catch (err: unknown) {
      setTaskError(err instanceof Error ? err.message : 'Erro ao agendar tarefa de follow-up.');
    } finally {
      setIsCreatingTask(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            CRM Automatizado e Follow-up
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Sincronização automática com encomendas, tarefas de acompanhamento (<span className="font-mono text-xs">crm_tasks</span>), etiquetas e notas
          </p>
        </div>

        <div
          role="group"
          aria-label="Modo de visualização do CRM"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E5E5E5] rounded-[10px] self-start"
        >
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'list' ? 'bg-[#0A0A0A] text-white' : 'text-[#525252]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Lista & Ficha</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tasks')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'tasks' ? 'bg-[#0A0A0A] text-white' : 'text-[#525252]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-[#FF8A00]" />
            <span>
              Tarefas & Follow-up ({taskCounts.pending + taskCounts.overdue})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'board' ? 'bg-[#0A0A0A] text-white' : 'text-[#525252]'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Funil por Estado</span>
          </button>
        </div>
      </div>

      {/* Transparency Banner on WhatsApp */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex items-start gap-3 text-xs">
        <MessageSquare className="w-4 h-4 text-[#FF8A00] shrink-0 mt-0.5" />
        <p className="text-[#525252] leading-relaxed">
          <strong className="text-[#0A0A0A]">Automação limpa e privacidade:</strong> Cada nova encomenda cria ou atualiza o cliente pelo telefone normalizado sem apagar histórico, e agenda uma única tarefa aberta em <span className="font-mono">crm_tasks</span> para pedidos pendentes. O sistema não lê conversas privadas do WhatsApp sem registo do operador.
        </p>
      </div>

      {viewMode === 'tasks' ? (
        /* =====================================================================
           CRM TASKS & FOLLOW-UP VIEW (Pending, Overdue, Completed)
           ===================================================================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-xs">
          <div className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E5E5]">
              <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                Fila de Tarefas Comerciais (<span className="font-mono text-sm">crm_tasks</span>)
              </h2>
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F4F4F4] rounded-lg">
                {(
                  [
                    { id: 'pending', label: `Em aberto (${taskCounts.pending + taskCounts.overdue})` },
                    { id: 'overdue', label: `Atrasadas (${taskCounts.overdue})` },
                    { id: 'completed', label: `Concluídas (${taskCounts.completed})` },
                    { id: 'all', label: `Todas (${taskCounts.all})` },
                  ] as Array<{ id: TaskFilterTab; label: string }>
                ).map((tb) => (
                  <button
                    key={tb.id}
                    type="button"
                    onClick={() => setTaskFilter(tb.id)}
                    className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap ${
                      taskFilter === tb.id
                        ? 'bg-white text-[#0A0A0A] shadow-xs'
                        : 'text-[#525252]'
                    }`}
                  >
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <p className="text-[#737373] py-8 text-center">
                Não existem tarefas de acompanhamento neste filtro.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E5E5]">
                {filteredTasks.map((t) => {
                  const urgency = classifyCrmTaskUrgency(t);
                  return (
                    <div key={t.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {urgency === 'overdue' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#B91C1C]">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Atrasada</span>
                            </span>
                          ) : urgency === 'completed' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#15803D]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Concluída</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#B45309]">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pendente</span>
                            </span>
                          )}
                          <span className="text-[#D4D4D4]">·</span>
                          <span className="font-semibold text-[#0A0A0A]">{t.title}</span>
                        </div>
                        <p className="text-[#525252]">
                          Cliente: <strong className="text-[#0A0A0A]">{t.customerName}</strong>
                          {canViewPii && t.customerPhone ? ` (${t.customerPhone})` : ''}
                          {t.orderCode ? ` · Encomenda ${t.orderCode}` : ''}
                        </p>
                        {t.description && (
                          <p className="text-[#525252] leading-relaxed">{t.description}</p>
                        )}
                        <p className="text-[11px] text-[#737373] tabular-data">
                          Prazo: {t.dueAt ? formatDateTimePt(t.dueAt) : 'Sem prazo limite'}
                          {t.completedAt ? ` · Concluída em ${formatDateTimePt(t.completedAt)}` : ''}
                        </p>
                      </div>

                      {canWrite && (
                        <div className="shrink-0">
                          {t.status !== 'completed' ? (
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() =>
                                void updateCrmTaskStatus(t.id, 'completed').catch((err) =>
                                  notify(
                                    'error',
                                    err instanceof Error ? err.message : 'Erro ao concluir tarefa.'
                                  )
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#0A0A0A] text-white font-semibold hover:opacity-90 whitespace-nowrap disabled:opacity-40"
                            >
                              Concluir
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() =>
                                void updateCrmTaskStatus(t.id, 'pending').catch((err) =>
                                  notify(
                                    'error',
                                    err instanceof Error ? err.message : 'Erro ao reabrir tarefa.'
                                  )
                                )
                              }
                              className="px-3 py-1.5 rounded-lg border border-[#D4D4D4] text-[#0A0A0A] hover:bg-[#F4F4F4] whitespace-nowrap disabled:opacity-40"
                            >
                              Reabrir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schedule New Follow-up Task */}
          <div className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-xl p-5">
            <h2 className="font-brand font-bold text-base text-[#0A0A0A] mb-1">
              Agendar Nova Tarefa de Follow-up
            </h2>
            <p className="text-[#525252] mb-4">
              Cria lembretes de contacto para confirmação de encomenda, pós-venda ou reativação.
            </p>

            {!canWrite ? (
              <p className="text-[#737373]">Perfil em modo de consulta para tarefas CRM.</p>
            ) : snapshot.customers.length === 0 ? (
              <p className="text-[#737373]">
                Regista primeiro um cliente ou encomenda antes de agendar tarefas de follow-up.
              </p>
            ) : (
              <form onSubmit={(e) => void handleCreateTask(e)} className="space-y-3">
                <div>
                  <label htmlFor="task-cust" className="block font-medium text-[#0A0A0A] mb-1">
                    Cliente *
                  </label>
                  <select
                    id="task-cust"
                    value={taskCustomerId}
                    onChange={(e) => setTaskCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                  >
                    {snapshot.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phoneNormalized})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="task-order" className="block font-medium text-[#0A0A0A] mb-1">
                    Encomenda relacionada (opcional)
                  </label>
                  <select
                    id="task-order"
                    value={taskOrderId}
                    onChange={(e) => setTaskOrderId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                  >
                    <option value="">Sem encomenda específica</option>
                    {snapshot.orders
                      .filter((o) => !taskCustomerId || o.customerId === taskCustomerId)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.code} — {formatKwanza(o.totalKz)}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="task-title" className="block font-medium text-[#0A0A0A] mb-1">
                    Título da tarefa *
                  </label>
                  <input
                    id="task-title"
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Ex.: Confirmar disponibilidade para entrega amanhã"
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="task-due" className="block font-medium text-[#0A0A0A] mb-1">
                    Data limite
                  </label>
                  <input
                    id="task-due"
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg tabular-data"
                  />
                </div>

                <div>
                  <label htmlFor="task-desc" className="block font-medium text-[#0A0A0A] mb-1">
                    Notas da tarefa
                  </label>
                  <textarea
                    id="task-desc"
                    rows={2}
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg"
                  />
                </div>

                {taskError && (
                  <p role="alert" className="text-[#B91C1C]">
                    {taskError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isCreatingTask || isMutating}
                  className="btn-bercali-primary w-full py-2.5 px-4 rounded-[10px] disabled:opacity-50"
                >
                  {isCreatingTask ? 'A agendar...' : 'Agendar Tarefa CRM'}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Filters & Tag Creator */}
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Filtrar CRM por estado de relacionamento"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as 'all' | CrmStage)}
                className="px-3 py-2 text-xs bg-white border border-[#D4D4D4] rounded-[10px]"
              >
                <option value="all">Todos os estados de relacionamento</option>
                {(Object.keys(CRM_STAGE_LABELS) as CrmStage[]).map((st) => (
                  <option key={st} value={st}>
                    {CRM_STAGE_LABELS[st]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtrar CRM por etiqueta"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-[#D4D4D4] rounded-[10px]"
              >
                <option value="all">Todas as etiquetas</option>
                {snapshot.customerTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] border border-[#D4D4D4] text-xs font-medium text-[#0A0A0A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyPendingOrdersFilter}
                  onChange={(e) => setOnlyPendingOrdersFilter(e.target.checked)}
                />
                <span>Com encomendas pendentes de confirmação</span>
              </label>
            </div>

            {canWrite && (
              <form onSubmit={(e) => void handleCreateTag(e)} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  aria-label="Nome da nova etiqueta CRM"
                  placeholder="Nova etiqueta (ex.: VIP)"
                  className="px-3 py-2 text-xs border border-[#D4D4D4] rounded-[10px] w-48"
                />
                <button
                  type="submit"
                  disabled={isCreatingTag || isMutating}
                  className="px-3 py-2 text-xs font-semibold bg-[#0A0A0A] text-white rounded-[10px] inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5 text-[#FF8A00]" />
                  <span>{isCreatingTag ? 'A criar...' : 'Criar etiqueta'}</span>
                </button>
              </form>
            )}
          </div>
          {tagError && (
            <p role="alert" className="text-xs text-[#B91C1C]">
              {tagError}
            </p>
          )}

          {isDataLoading && snapshot.customers.length === 0 ? (
            <LoadingBlock label="A carregar contactos e histórico CRM..." />
          ) : snapshot.customers.length === 0 ? (
            <EmptyDataState
              title="Ainda não existem clientes no CRM"
              description="Assim que um cliente for registado ou uma encomenda for criada, a ficha de relacionamento ficará disponível automaticamente."
            />
          ) : filteredCustomers.length === 0 ? (
            <EmptyDataState
              title="Sem contactos para os filtros selecionados"
              description="Ajusta os filtros de estado, etiqueta ou encomendas pendentes."
            />
          ) : viewMode === 'board' ? (
            /* Pipeline Board View */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {(Object.keys(CRM_STAGE_LABELS) as CrmStage[]).map((stageKey) => {
                const items = filteredCustomers.filter((c) => c.crmStage === stageKey);
                return (
                  <div
                    key={stageKey}
                    className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[#E5E5E5]">
                      <span className="font-brand font-bold text-xs text-[#0A0A0A]">
                        {CRM_STAGE_LABELS[stageKey]}
                      </span>
                      <span className="metric-num font-bold text-xs text-[#525252]">
                        {items.length}
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-[11px] text-[#737373] py-3">Sem contactos neste estado.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {items.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedId(c.id);
                              setViewMode('list');
                            }}
                            className="w-full text-left p-3 rounded-[10px] bg-[#F4F4F4] hover:bg-[#FFF8EB] transition-colors text-xs"
                          >
                            <p className="font-semibold text-[#0A0A0A]">{c.name}</p>
                            <p className="font-mono text-[11px] text-[#525252] mt-0.5">
                              {canViewPii ? c.phoneNormalized : 'Contacto protegido'}
                            </p>
                            <p className="metric-num font-bold text-[11px] text-[#15803D] mt-1">
                              {formatKwanza(customerOrderAgg.confirmedMap.get(c.id) || 0)} confirmados
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* List + Detailed CRM Follow-up View */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-xl divide-y divide-[#E5E5E5]">
                {filteredCustomers.map((c) => {
                  const selected = activeCustomer?.id === c.id;
                  const tagNames = snapshot.customerTags
                    .filter((t) => c.tagIds.includes(t.id))
                    .map((t) => t.name);
                  const pendingCodes = customerOrderAgg.pendingOrderIdsByCustomer.get(c.id) || [];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left p-4 transition-colors text-xs ${
                        selected ? 'bg-[#FFF8EB]' : 'hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#0A0A0A]">{c.name}</p>
                          <p className="font-mono text-[11px] text-[#525252] mt-0.5">
                            {canViewPii ? c.phoneNormalized : 'Contacto protegido'}
                          </p>
                        </div>
                        <span className="text-[11px] font-medium text-[#0A0A0A] shrink-0">
                          {CRM_STAGE_LABELS[c.crmStage]}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-[#737373]">
                        <span className="truncate">
                          {pendingCodes.length > 0
                            ? `${pendingCodes.length} pend. (${pendingCodes[0]})`
                            : tagNames.length > 0
                              ? tagNames.join(' · ')
                              : 'Sem etiquetas'}
                        </span>
                        <span className="metric-num font-semibold text-[#0A0A0A] shrink-0 ml-2">
                          {formatKwanza(customerOrderAgg.confirmedMap.get(c.id) || 0)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeCustomer && (
                <div className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E5E5]">
                    <div>
                      <h2 className="font-brand font-bold text-lg text-[#0A0A0A]">
                        {activeCustomer.name}
                      </h2>
                      <p className="text-[#525252]">
                        {canViewPii ? activeCustomer.phoneNormalized : 'Contacto protegido'} · Último contacto:{' '}
                        {formatDateTimePt(activeCustomer.lastContactAt)}
                      </p>
                    </div>

                    {canWrite && (
                      <div>
                        <label htmlFor="crm-stage-change" className="sr-only">
                          Alterar estado de relacionamento
                        </label>
                        <select
                          id="crm-stage-change"
                          disabled={isMutating}
                          value={activeCustomer.crmStage}
                          onChange={(e) =>
                            void updateCustomerCrm(
                              activeCustomer.id,
                              e.target.value as CrmStage,
                              activeCustomer.tagIds,
                              activeCustomer.internalSummary,
                              true
                            ).catch((err) =>
                              notify(
                                'error',
                                err instanceof Error ? err.message : 'Erro ao atualizar estado CRM.'
                              )
                            )
                          }
                          className="px-3 py-2 border border-[#FF8A00] rounded-[10px] font-semibold text-[#0A0A0A] bg-white disabled:opacity-50"
                        >
                          {(Object.keys(CRM_STAGE_LABELS) as CrmStage[]).map((st) => (
                            <option key={st} value={st}>
                              {CRM_STAGE_LABELS[st]}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Custom Tags Assignment */}
                  <div>
                    <p className="font-semibold text-[#0A0A0A] flex items-center gap-1.5 mb-2">
                      <Tag className="w-3.5 h-3.5 text-[#FF8A00]" />
                      <span>Etiquetas atribuídas (clica para ativar/desativar)</span>
                    </p>
                    {snapshot.customerTags.length === 0 ? (
                      <p className="text-[#737373]">
                        Ainda não existem etiquetas personalizadas. Cria uma etiqueta na barra superior.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {snapshot.customerTags.map((t) => {
                          const assigned = activeCustomer.tagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={!canWrite || isMutating}
                              onClick={() => void handleToggleCustomerTag(t.id)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                                assigned
                                  ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                                  : 'bg-white text-[#525252] border-[#D4D4D4] hover:border-[#0A0A0A]'
                              }`}
                            >
                              {assigned && <Check className="w-3 h-3 text-[#FF8A00]" />}
                              <span>{t.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Open Follow-up Tasks for this customer */}
                  {activeCustomerTasks.length > 0 && (
                    <div className="p-3.5 rounded-[10px] border border-[#E5E5E5] space-y-2">
                      <p className="font-brand font-bold text-xs text-[#0A0A0A]">
                        Tarefas de Follow-up deste cliente ({activeCustomerTasks.length})
                      </p>
                      <div className="divide-y divide-[#E5E5E5]">
                        {activeCustomerTasks.slice(0, 4).map((t) => (
                          <div key={t.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium text-[#0A0A0A]">{t.title}</p>
                              <p className="text-[11px] text-[#737373] tabular-data">
                                {t.status === 'completed'
                                  ? 'Concluída'
                                  : t.dueAt
                                    ? `Prazo: ${formatDateTimePt(t.dueAt)}`
                                    : 'Em aberto'}
                              </p>
                            </div>
                            {canWrite && t.status !== 'completed' && (
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => void updateCrmTaskStatus(t.id, 'completed')}
                                className="px-2.5 py-1 rounded bg-[#0A0A0A] text-white text-[11px] font-semibold"
                              >
                                Concluir
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add Follow-up Note */}
                  {canWrite && (
                    <form
                      onSubmit={(e) => void handleAddNote(e)}
                      className="p-4 rounded-[10px] bg-[#F4F4F4] space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label htmlFor="crm-note-input" className="font-semibold text-[#0A0A0A]">
                          Registar novo acompanhamento
                        </label>
                        <select
                          aria-label="Canal de acompanhamento"
                          value={noteChannel}
                          onChange={(e) =>
                            setNoteChannel(e.target.value as CustomerNote['channel'])
                          }
                          className="px-2.5 py-1.5 bg-white border border-[#D4D4D4] rounded-lg text-xs"
                        >
                          {(Object.keys(CHANNEL_LABELS) as CustomerNote['channel'][]).map((ch) => (
                            <option key={ch} value={ch}>
                              {CHANNEL_LABELS[ch]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        id="crm-note-input"
                        rows={2}
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Descreve o contacto realizado, preferências do cliente ou próximo passo acordado..."
                        className="w-full px-3 py-2 bg-white border border-[#D4D4D4] rounded-lg focus:border-[#FF8A00] focus:outline-none"
                      />
                      {noteError && (
                        <p role="alert" className="text-[#B91C1C]">
                          {noteError}
                        </p>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isAddingNote || isMutating}
                          className="btn-bercali-primary px-4 py-2 rounded-[10px] inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isAddingNote ? 'A guardar...' : 'Adicionar ao Histórico'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Chronological Follow-up Timeline */}
                  <div>
                    <p className="font-brand font-bold text-xs text-[#0A0A0A] mb-3">
                      Histórico de Acompanhamento ({activeNotes.length})
                    </p>
                    {activeNotes.length === 0 ? (
                      <p className="text-[#737373] py-4">
                        Ainda não existem registos de acompanhamento para este cliente.
                      </p>
                    ) : (
                      <div className="space-y-2.5 max-h-64 overflow-y-auto">
                        {activeNotes.map((n) => (
                          <div key={n.id} className="p-3 rounded-[10px] border border-[#E5E5E5]">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-[#525252] mb-1">
                              <span className="font-semibold text-[#0A0A0A]">
                                {CHANNEL_LABELS[n.channel]} · {n.authorName}
                              </span>
                              <span className="tabular-data">{formatDateTimePt(n.createdAt)}</span>
                            </div>
                            <p className="text-[#0A0A0A] leading-relaxed">{n.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
