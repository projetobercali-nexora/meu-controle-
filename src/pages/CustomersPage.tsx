import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Edit3,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  AccessDeniedState,
  CRM_STAGE_LABELS,
  EmptyDataState,
  LoadingBlock,
  ORDER_ORIGIN_LABELS,
  OrderStatusInline,
  PaymentStatusInline,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { CrmStage, Customer } from '../types/domain';
import {
  formatDatePt,
  formatKwanza,
  isConfirmedOrder,
} from '../utils/formatters';

const SOURCE_LABELS: Record<Customer['source'], string> = {
  ...ORDER_ORIGIN_LABELS,
  website: 'Loja Online',
};

export const CustomersPage: React.FC = () => {
  const {
    snapshot,
    isDataLoading,
    isMutating,
    can,
    canOpenModule,
    focusedEntityId,
    setFocusedEntityId,
    setActiveModule,
    upsertCustomer,
  } = useAdmin();

  const canWrite = can('customers:write');
  const canViewPii = can('customers:view_contact_pii');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    snapshot.customers[0]?.id || null
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [name, setName] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Luanda');
  const [crmStage, setCrmStage] = useState<CrmStage>('new_contact');
  const [summary, setSummary] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (focusedEntityId) {
      const target = snapshot.customers.find((c) => c.id === focusedEntityId);
      if (target) setSelectedId(target.id);
      setFocusedEntityId(null);
    }
  }, [focusedEntityId, snapshot.customers, setFocusedEntityId]);

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      { totalOrders: number; confirmedSpendKz: number; pendingCount: number }
    >();
    for (const o of snapshot.orders) {
      const cur = map.get(o.customerId) || {
        totalOrders: 0,
        confirmedSpendKz: 0,
        pendingCount: 0,
      };
      cur.totalOrders += 1;
      if (isConfirmedOrder(o.status)) {
        cur.confirmedSpendKz += o.totalKz;
      } else if (o.status !== 'cancelled') {
        cur.pendingCount += 1;
      }
      map.set(o.customerId, cur);
    }
    return map;
  }, [snapshot.orders]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.customers.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phoneNormalized.includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    });
  }, [snapshot.customers, search]);

  const selectedCustomer = useMemo(
    () =>
      snapshot.customers.find((c) => c.id === selectedId) ||
      filteredCustomers[0] ||
      null,
    [snapshot.customers, selectedId, filteredCustomers]
  );

  const selectedCustomerOrders = useMemo(
    () =>
      selectedCustomer
        ? snapshot.orders.filter((o) => o.customerId === selectedCustomer.id)
        : [],
    [snapshot.orders, selectedCustomer]
  );

  if (!canOpenModule('customers')) {
    return <AccessDeniedState moduleTitle="Gestão de Clientes" />;
  }

  const maskPhone = (phone: string) =>
    canViewPii ? phone : `${phone.slice(0, 7)}•••••`;

  const openCreate = () => {
    setEditingCustomer(null);
    setName('');
    setPhoneRaw('+244 ');
    setEmail('');
    setCity('Luanda');
    setCrmStage('new_contact');
    setSummary('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhoneRaw(c.phoneRaw);
    setEmail(c.email);
    setCity(c.city);
    setCrmStage(c.crmStage);
    setSummary(c.internalSummary);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await upsertCustomer({
        id: editingCustomer?.id,
        name,
        phoneRaw,
        email,
        city,
        source: editingCustomer?.source || 'manual_admin',
        crmStage,
        tagIds: editingCustomer?.tagIds || [],
        internalSummary: summary,
      });
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao guardar cliente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Diretório de Clientes
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Base unificada na tabela <span className="font-mono text-xs">customers</span> com normalização telefónica única (<span className="font-mono text-xs">normalized_phone</span>)
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            disabled={isMutating}
            onClick={openCreate}
            className="btn-bercali-primary min-h-[44px] sm:min-h-0 px-4 py-2.5 rounded-[10px] text-xs inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 w-full sm:w-auto disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Registar Cliente</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4">
        <div className="relative sm:max-w-md">
          <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Pesquisar clientes"
            placeholder="Pesquisar por nome, telefone (+244...), email ou cidade..."
            className="w-full min-h-[44px] sm:min-h-0 pl-9 pr-3 py-2 text-xs bg-[#F4F4F4] border border-transparent focus:bg-white focus:border-[#FF8A00] focus:outline-none rounded-[10px]"
          />
        </div>
      </div>

      {isDataLoading && snapshot.customers.length === 0 ? (
        <LoadingBlock label="A carregar diretório de clientes..." />
      ) : snapshot.customers.length === 0 ? (
        <EmptyDataState
          title="Ainda não existem clientes"
          description="Os clientes são criados automaticamente ao registar encomendas ou podem ser adicionados manualmente pela equipa."
          actionLabel={canWrite ? 'Registar Primeiro Cliente' : undefined}
          onAction={canWrite ? openCreate : undefined}
        />
      ) : filteredCustomers.length === 0 ? (
        <EmptyDataState
          title="Nenhum cliente corresponde à pesquisa"
          description="Altera os termos de pesquisa para localizar outros contactos registados."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
            {/* Mobile Stacked Cards (< md) */}
            <div className="md:hidden divide-y divide-[#E5E5E5] text-xs">
              {filteredCustomers.map((c) => {
                const st = customerStats.get(c.id) || {
                  totalOrders: 0,
                  confirmedSpendKz: 0,
                  pendingCount: 0,
                };
                const active = selectedCustomer?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-4 space-y-2 transition-colors ${
                      active ? 'bg-[#FFF8EB]' : 'hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0A0A0A] break-words leading-snug">
                          {c.name}
                        </p>
                        <p className="font-mono text-[11px] text-[#525252] mt-0.5">
                          {maskPhone(c.phoneNormalized)}
                        </p>
                      </div>
                      <span className="metric-num font-bold text-[#0A0A0A] shrink-0">
                        {formatKwanza(st.confirmedSpendKz)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#F4F4F4] text-[11px] text-[#525252]">
                      <span>
                        {CRM_STAGE_LABELS[c.crmStage]} · {c.city || '—'} ·{' '}
                        {SOURCE_LABELS[c.source] || c.source}
                      </span>
                      <span className="tabular-data text-[#737373]">
                        {st.totalOrders} enc.
                        {st.pendingCount > 0 ? ` · ${st.pendingCount} pend.` : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                    <th className="py-3 px-4">Cliente & Origem</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4">Relacionamento</th>
                    <th className="py-3 px-4 text-right">Compras Confirmadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] text-xs">
                  {filteredCustomers.map((c) => {
                    const st = customerStats.get(c.id) || {
                      totalOrders: 0,
                      confirmedSpendKz: 0,
                      pendingCount: 0,
                    };
                    const active = selectedCustomer?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className={`cursor-pointer transition-colors ${
                          active ? 'bg-[#FFF8EB]' : 'hover:bg-[#FAFAFA]'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-[#0A0A0A]">{c.name}</p>
                          <p className="text-[11px] text-[#525252]">
                            {c.city || '—'} · {SOURCE_LABELS[c.source] || c.source}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-[#0A0A0A] whitespace-nowrap">
                          {maskPhone(c.phoneNormalized)}
                        </td>
                        <td className="py-3.5 px-4 text-[#525252]">
                          {CRM_STAGE_LABELS[c.crmStage]}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <p className="metric-num font-bold text-[#0A0A0A]">
                            {formatKwanza(st.confirmedSpendKz)}
                          </p>
                          <p className="text-[11px] text-[#737373] tabular-data">
                            {st.totalOrders} encomenda(s)
                            {st.pendingCount > 0 ? ` · ${st.pendingCount} pend.` : ''}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Customer Detail Inspector */}
          {selectedCustomer && (
            <div className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E5E5E5]">
                <div className="min-w-0">
                  <h2 className="font-brand font-bold text-lg text-[#0A0A0A] break-words">
                    {selectedCustomer.name}
                  </h2>
                  <p className="text-[#525252] mt-0.5 break-words">
                    {CRM_STAGE_LABELS[selectedCustomer.crmStage]} · {selectedCustomer.city}
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => openEdit(selectedCustomer)}
                    aria-label={`Editar cliente ${selectedCustomer.name}`}
                    className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 rounded-lg border border-[#E5E5E5] hover:bg-[#F4F4F4] inline-flex items-center justify-center shrink-0"
                  >
                    <Edit3 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F4F4F4] rounded-[10px] p-3.5">
                <div>
                  <p className="text-[11px] text-[#525252]">Telefone normalizado</p>
                  <p className="font-mono font-semibold text-[#0A0A0A] break-all">
                    {maskPhone(selectedCustomer.phoneNormalized)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#525252]">Email</p>
                  <p className="font-medium text-[#0A0A0A] break-all">
                    {canViewPii ? selectedCustomer.email || 'Não indicado' : 'Protegido'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#525252]">Total confirmado</p>
                  <p className="metric-num font-bold text-sm text-[#15803D]">
                    {formatKwanza(
                      customerStats.get(selectedCustomer.id)?.confirmedSpendKz || 0
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#525252]">Último contacto</p>
                  <p className="font-medium text-[#0A0A0A] tabular-data">
                    {formatDatePt(selectedCustomer.lastContactAt)}
                  </p>
                </div>
              </div>

              {selectedCustomer.internalSummary && (
                <div>
                  <p className="font-semibold text-[#0A0A0A] mb-1">Observações internas</p>
                  <p className="text-[#525252] leading-relaxed break-words">
                    {selectedCustomer.internalSummary}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E5E5]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="font-brand font-bold text-xs text-[#0A0A0A]">
                    Histórico de Encomendas ({selectedCustomerOrders.length})
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusedEntityId(selectedCustomer.id);
                      setActiveModule('crm');
                    }}
                    className="min-h-[44px] sm:min-h-0 text-xs font-semibold text-[#FF8A00] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <span>Abrir ficha no CRM</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {selectedCustomerOrders.length === 0 ? (
                  <p className="text-[#737373] py-3">
                    Ainda sem encomendas registadas para este cliente.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E5E5]">
                    {selectedCustomerOrders.map((o) => (
                      <div key={o.id} className="py-2.5 flex items-start sm:items-center justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-mono font-semibold text-[#0A0A0A] break-words">{o.code}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <OrderStatusInline status={o.status} />
                            <span className="text-[#D4D4D4]">·</span>
                            <PaymentStatusInline status={o.paymentStatus} />
                          </div>
                        </div>
                        <span className="metric-num font-bold text-[#0A0A0A] shrink-0">
                          {formatKwanza(o.totalKz)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Customer Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cust-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#E5E5E5]">
              <h2 id="cust-modal-title" className="font-brand font-bold text-base sm:text-lg text-[#0A0A0A]">
                {editingCustomer ? 'Editar Cliente' : 'Registar Novo Cliente'}
              </h2>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setModalOpen(false)}
                aria-label="Fechar janela"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 rounded-lg hover:bg-[#F4F4F4] inline-flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSave(e)}
              noValidate
              className="flex flex-col flex-1 min-h-0 text-xs"
            >
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3.5">
                <div>
                  <label htmlFor="cust-name" className="block font-medium text-[#0A0A0A] mb-1">
                    Nome completo *
                  </label>
                  <input
                    id="cust-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Joana Manuel"
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cust-phone" className="block font-medium text-[#0A0A0A] mb-1">
                      Telefone / WhatsApp *
                    </label>
                    <input
                      id="cust-phone"
                      type="tel"
                      value={phoneRaw}
                      onChange={(e) => setPhoneRaw(e.target.value)}
                      placeholder="+244 923 000 000"
                      className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 font-mono border border-[#D4D4D4] rounded-[10px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-email" className="block font-medium text-[#0A0A0A] mb-1">
                      Email (opcional)
                    </label>
                    <input
                      id="cust-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="cliente@exemplo.ao"
                      className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cust-city" className="block font-medium text-[#0A0A0A] mb-1">
                      Cidade / Bairro
                    </label>
                    <input
                      id="cust-city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex.: Luanda · Kilamba"
                      className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-stage" className="block font-medium text-[#0A0A0A] mb-1">
                      Estado inicial CRM
                    </label>
                    <select
                      id="cust-stage"
                      value={crmStage}
                      onChange={(e) => setCrmStage(e.target.value as CrmStage)}
                      className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px] bg-white"
                    >
                      {(Object.keys(CRM_STAGE_LABELS) as CrmStage[]).map((st) => (
                        <option key={st} value={st}>
                          {CRM_STAGE_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="cust-sum" className="block font-medium text-[#0A0A0A] mb-1">
                    Observações internas
                  </label>
                  <textarea
                    id="cust-sum"
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px]"
                  />
                </div>

                {formError && (
                  <div role="alert" className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] break-words">
                    {formError}
                  </div>
                )}
              </div>

              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-[#E5E5E5] bg-[#FAFAFA] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-white border border-[#D4D4D4] rounded-[10px] font-medium hover:bg-[#F4F4F4] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-bercali-primary min-h-[44px] sm:min-h-0 px-4 py-2 rounded-[10px] disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'A guardar...'
                    : editingCustomer
                      ? 'Guardar alterações'
                      : 'Registar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
