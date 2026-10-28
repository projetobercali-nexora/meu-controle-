import React, { useEffect, useMemo, useState } from 'react';
import {
  History,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  AccessDeniedState,
  EmptyDataState,
  LoadingBlock,
  ORDER_ORIGIN_LABELS,
  ORDER_STATUS_META,
  OrderStatusInline,
  PAYMENT_STATUS_META,
  PaymentStatusInline,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import {
  Order,
  OrderOrigin,
  OrderStatus,
  PaymentStatus,
  WhatsAppAttendanceOutcome,
} from '../types/domain';
import {
  calculateOrderTotals,
  formatDateTimePt,
  formatKwanza,
  isConfirmedOrder,
} from '../utils/formatters';

const PAGE_SIZE = 7;

const WHATSAPP_OUTCOME_LABELS: Record<WhatsAppAttendanceOutcome, string> = {
  unverified: 'Por verificar no atendimento',
  awaiting_customer_reply: 'Mensagem enviada · Aguardando resposta do cliente',
  confirmed_by_customer: 'Confirmado manualmente pelo cliente no WhatsApp',
  cancelled_or_no_response: 'Sem resposta / Desistência confirmada',
};

interface DraftOrderLine {
  lineId: string;
  productId: string;
  quantity: string;
}

export const OrdersPage: React.FC = () => {
  const {
    snapshot,
    isDataLoading,
    isMutating,
    can,
    canOpenModule,
    focusedEntityId,
    setFocusedEntityId,
    setActiveModule,
    updateOrderStatusAndAttendance,
    createManualOrder,
  } = useAdmin();

  const canWrite = can('orders:write');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentStatus>('all');
  const [originFilter, setOriginFilter] = useState<'all' | OrderOrigin>('all');
  const [page, setPage] = useState(1);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    snapshot.orders[0]?.id || null
  );

  // Selected order update form
  const [editStatus, setEditStatus] = useState<OrderStatus>('received');
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatus>('pending');
  const [editOutcome, setEditOutcome] = useState<WhatsAppAttendanceOutcome>('unverified');
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);

  // Manual order creation modal (supports existing customer OR automatic phone deduplication/creation)
  const [createOpen, setCreateOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('new');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+244 ');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustCity, setNewCustCity] = useState('Luanda');
  const [draftLines, setDraftLines] = useState<DraftOrderLine[]>([]);
  const [newOrigin, setNewOrigin] = useState<OrderOrigin>('whatsapp_direct');
  const [newStatus, setNewStatus] = useState<OrderStatus>('pending_confirmation');
  const [newPaymentStatus, setNewPaymentStatus] = useState<PaymentStatus>('pending');
  const [newAddress, setNewAddress] = useState('');
  const [newFeeKz, setNewFeeKz] = useState('2000');
  const [newDiscountKz, setNewDiscountKz] = useState('0');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const availableProducts = useMemo(
    () => snapshot.products.filter((p) => p.status !== 'archived'),
    [snapshot.products]
  );

  useEffect(() => {
    if (focusedEntityId) {
      const target = snapshot.orders.find((o) => o.id === focusedEntityId);
      if (target) {
        setSelectedOrderId(target.id);
      }
      setFocusedEntityId(null);
    }
  }, [focusedEntityId, snapshot.orders, setFocusedEntityId]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.orders.filter((o) => {
      if (
        q &&
        !o.code.toLowerCase().includes(q) &&
        !o.customerName.toLowerCase().includes(q) &&
        !o.customerPhone.includes(q)
      ) {
        return false;
      }
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) return false;
      if (originFilter !== 'all' && o.origin !== originFilter) return false;
      return true;
    });
  }, [snapshot.orders, search, statusFilter, paymentFilter, originFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedOrder: Order | null = useMemo(
    () =>
      snapshot.orders.find((o) => o.id === selectedOrderId) ||
      filteredOrders[0] ||
      null,
    [snapshot.orders, selectedOrderId, filteredOrders]
  );

  useEffect(() => {
    if (selectedOrder) {
      setEditStatus(selectedOrder.status);
      setEditPaymentStatus(selectedOrder.paymentStatus);
      setEditOutcome(selectedOrder.whatsappOutcome);
      setEditInternalNotes(selectedOrder.internalNotes);
      setTransitionNote('');
      setDetailError(null);
    }
  }, [selectedOrder?.id, selectedOrder?.updatedAt]);

  const draftPreviewTotals = useMemo(() => {
    const mapped = draftLines.map((ln) => {
      const prod = availableProducts.find((p) => p.id === ln.productId);
      const unitPriceKz = prod ? (prod.promoPriceKz ?? prod.priceKz) : 0;
      return {
        quantity: Math.max(1, Number(ln.quantity || 1)),
        unitPriceKz,
      };
    });
    return calculateOrderTotals(
      mapped,
      Number(newFeeKz || 0),
      Number(newDiscountKz || 0)
    );
  }, [draftLines, availableProducts, newFeeKz, newDiscountKz]);

  if (!canOpenModule('orders')) {
    return <AccessDeniedState moduleTitle="Gestão de Encomendas" />;
  }

  const openCreateModal = () => {
    setCreateError(null);
    const hasCustomers = snapshot.customers.length > 0;
    setCustomerMode(hasCustomers ? 'existing' : 'new');
    setNewCustomerId(snapshot.customers[0]?.id || '');
    setNewCustName('');
    setNewCustPhone('+244 ');
    setNewCustEmail('');
    setNewCustCity('Luanda');
    setDraftLines([
      {
        lineId: `ln-${Date.now()}`,
        productId: availableProducts[0]?.id || '',
        quantity: '1',
      },
    ]);
    setNewOrigin('whatsapp_direct');
    setNewStatus('pending_confirmation');
    setNewPaymentStatus('pending');
    setNewAddress('');
    setNewFeeKz(String(snapshot.storeSettings.deliveryZones[0]?.feeKz ?? 2000));
    setNewDiscountKz('0');
    setNewNotes('');
    setCreateOpen(true);
  };

  const handleSaveOrderUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || isUpdatingOrder) return;
    setDetailError(null);

    if (
      snapshot.storeSettings.requireWhatsAppManualVerification &&
      isConfirmedOrder(editStatus) &&
      editOutcome !== 'confirmed_by_customer' &&
      selectedOrder.origin.startsWith('whatsapp')
    ) {
      setDetailError(
        'Para marcar uma encomenda de WhatsApp como Confirmada, seleciona "Confirmado manualmente pelo cliente no WhatsApp" no resultado do atendimento.'
      );
      return;
    }

    setIsUpdatingOrder(true);
    try {
      await updateOrderStatusAndAttendance(
        selectedOrder.id,
        editStatus,
        editPaymentStatus,
        editOutcome,
        transitionNote,
        editInternalNotes
      );
      setTransitionNote('');
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Erro ao atualizar encomenda.');
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingOrder) return;
    setCreateError(null);

    const validLines = draftLines.filter(
      (ln) => ln.productId && Number(ln.quantity) >= 1
    );
    if (validLines.length === 0) {
      setCreateError('Seleciona pelo menos um produto com quantidade válida.');
      return;
    }

    setIsCreatingOrder(true);
    try {
      const createdOutcome: WhatsAppAttendanceOutcome = isConfirmedOrder(newStatus)
        ? 'confirmed_by_customer'
        : 'awaiting_customer_reply';

      await createManualOrder({
        customerId: customerMode === 'existing' ? newCustomerId : undefined,
        newCustomer:
          customerMode === 'new'
            ? {
                name: newCustName,
                phoneRaw: newCustPhone,
                email: newCustEmail,
                city: newCustCity,
              }
            : undefined,
        origin: newOrigin,
        status: newStatus,
        paymentStatus: newPaymentStatus,
        whatsappOutcome: createdOutcome,
        deliveryAddress: newAddress,
        deliveryFeeKz: Number(newFeeKz || 0),
        discountKz: Number(newDiscountKz || 0),
        internalNotes: newNotes,
        items: validLines.map((ln) => ({
          productId: ln.productId,
          quantity: Math.max(1, Math.round(Number(ln.quantity || 1))),
        })),
      });
      setCreateOpen(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao registar encomenda.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Gestão de Encomendas
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Transações atómicas com cálculo no servidor, separação de estado logístico e estado de pagamento
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            disabled={availableProducts.length === 0 || isMutating}
            title={
              availableProducts.length === 0
                ? 'Cria primeiro pelo menos um produto ativo em Produtos'
                : undefined
            }
            onClick={openCreateModal}
            className="btn-bercali-primary px-4 py-2.5 rounded-[10px] text-xs inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Registar Encomenda</span>
          </button>
        )}
      </div>

      {/* Regra operacional de WhatsApp */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex items-start gap-3 text-xs">
        <MessageSquare className="w-4 h-4 text-[#FF8A00] shrink-0 mt-0.5" />
        <p className="text-[#525252] leading-relaxed">
          <strong className="text-[#0A0A0A]">Disciplina comercial e CRM automático:</strong> Ao registar uma encomenda, o PostgreSQL associa ou cria automaticamente o cliente pelo telefone normalizado (<span className="font-mono">+244</span>) e agenda tarefa de follow-up em <span className="font-mono">crm_tasks</span> quando fica pendente de confirmação.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Pesquisar encomendas por código, cliente ou telefone"
            placeholder="Código (BRC...), cliente ou telefone..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F4F4F4] border border-transparent focus:bg-white focus:border-[#FF8A00] focus:outline-none rounded-[10px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filtrar por estado da encomenda"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | OrderStatus);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-white border border-[#D4D4D4] rounded-[10px]"
          >
            <option value="all">Todos os estados</option>
            {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((st) => (
              <option key={st} value={st}>
                {ORDER_STATUS_META[st].label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por estado de pagamento"
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value as 'all' | PaymentStatus);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-white border border-[#D4D4D4] rounded-[10px]"
          >
            <option value="all">Todos os pagamentos</option>
            {(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map((ps) => (
              <option key={ps} value={ps}>
                {PAYMENT_STATUS_META[ps].label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por origem"
            value={originFilter}
            onChange={(e) => {
              setOriginFilter(e.target.value as 'all' | OrderOrigin);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-white border border-[#D4D4D4] rounded-[10px]"
          >
            <option value="all">Todas as origens</option>
            {(Object.keys(ORDER_ORIGIN_LABELS) as OrderOrigin[]).map((orig) => (
              <option key={orig} value={orig}>
                {ORDER_ORIGIN_LABELS[orig]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isDataLoading && snapshot.orders.length === 0 ? (
        <LoadingBlock label="A carregar encomendas..." />
      ) : snapshot.orders.length === 0 ? (
        <EmptyDataState
          title="Ainda não existem encomendas"
          description={
            availableProducts.length === 0
              ? 'Regista primeiro produtos no catálogo para poder criar e acompanhar encomendas.'
              : 'Ainda não existem encomendas registadas na base de dados. Podes registar uma encomenda recebida no atendimento WhatsApp ou telefone.'
          }
          actionLabel={
            canWrite
              ? availableProducts.length === 0
                ? 'Ir para Produtos'
                : 'Registar Primeira Encomenda'
              : undefined
          }
          onAction={
            canWrite
              ? availableProducts.length === 0
                ? () => setActiveModule('products')
                : openCreateModal
              : undefined
          }
        />
      ) : filteredOrders.length === 0 ? (
        <EmptyDataState
          title="Nenhuma encomenda corresponde aos filtros"
          description="Altera os filtros de estado, pagamento ou pesquisa para visualizar outros pedidos."
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Orders Table */}
          <div className="xl:col-span-7 bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                    <th className="py-3 px-3.5">Código & Data</th>
                    <th className="py-3 px-3.5">Cliente</th>
                    <th className="py-3 px-3.5">Estado & Pagamento</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Total (Kz)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] text-xs">
                  {paginated.map((ord) => {
                    const active = selectedOrder?.id === ord.id;
                    return (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedOrderId(ord.id)}
                        className={`cursor-pointer transition-colors ${
                          active ? 'bg-[#FFF8EB]' : 'hover:bg-[#FAFAFA]'
                        }`}
                      >
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <p className="font-mono font-semibold text-[#0A0A0A]">{ord.code}</p>
                          <p className="text-[11px] text-[#737373] tabular-data">
                            {formatDateTimePt(ord.createdAt)}
                          </p>
                          <p className="text-[10px] text-[#737373]">
                            {ORDER_ORIGIN_LABELS[ord.origin]}
                          </p>
                        </td>
                        <td className="py-3 px-3.5">
                          <p className="font-medium text-[#0A0A0A] leading-snug">{ord.customerName}</p>
                          <p className="font-mono text-[11px] text-[#525252]">
                            {ord.customerPhone}
                          </p>
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <OrderStatusInline status={ord.status} />
                            <PaymentStatusInline status={ord.paymentStatus} />
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-right metric-num font-bold text-[#0A0A0A] whitespace-nowrap">
                          {formatKwanza(ord.totalKz)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-[#E5E5E5] flex items-center justify-between text-xs text-[#525252]">
              <span className="tabular-data">
                Página {safePage} de {totalPages} ({filteredOrders.length} encomenda(s))
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg border border-[#D4D4D4] disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded-lg border border-[#D4D4D4] disabled:opacity-40"
                >
                  Seguinte
                </button>
              </div>
            </div>
          </div>

          {/* Order Detail & Manual Attendance Panel */}
          {selectedOrder && (
            <div className="xl:col-span-5 bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-5 text-xs">
              <div className="flex items-start justify-between gap-2 pb-4 border-b border-[#E5E5E5]">
                <div>
                  <span className="font-mono font-bold text-sm text-[#0A0A0A]">
                    {selectedOrder.code}
                  </span>
                  <p className="text-[#525252] mt-0.5">
                    {selectedOrder.customerName} ·{' '}
                    <span className="font-mono">{selectedOrder.customerPhone}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <OrderStatusInline status={selectedOrder.status} />
                  <PaymentStatusInline status={selectedOrder.paymentStatus} />
                </div>
              </div>

              {/* Delivery & Origin Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F4F4F4] rounded-[10px] p-3.5">
                <div>
                  <p className="text-[11px] text-[#525252]">Origem / Canal</p>
                  <p className="font-medium text-[#0A0A0A]">
                    {ORDER_ORIGIN_LABELS[selectedOrder.origin]}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#525252]">Contabilização financeira</p>
                  <p className="font-medium text-[#0A0A0A]">
                    {isConfirmedOrder(selectedOrder.status)
                      ? 'Incluída em Vendas Confirmadas'
                      : 'Não contabilizada em Vendas'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] text-[#525252]">Endereço / Informações de entrega</p>
                  <p className="font-medium text-[#0A0A0A] mt-0.5">
                    {selectedOrder.deliveryAddress || 'Morada não indicada'}
                  </p>
                </div>
              </div>

              {/* Ordered Items */}
              <div>
                <p className="font-brand font-bold text-xs text-[#0A0A0A] mb-2">
                  Produtos encomendados ({selectedOrder.items.length})
                </p>
                <div className="border border-[#E5E5E5] rounded-[10px] divide-y divide-[#E5E5E5]">
                  {selectedOrder.items.map((it) => (
                    <div key={it.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[#0A0A0A] truncate">{it.productName}</p>
                        <p className="text-[11px] text-[#525252] font-mono">
                          {it.sku} · {it.quantity} × {formatKwanza(it.unitPriceKz)}
                        </p>
                      </div>
                      <span className="metric-num font-bold text-[#0A0A0A] shrink-0">
                        {formatKwanza(it.lineTotalKz ?? it.quantity * it.unitPriceKz)}
                      </span>
                    </div>
                  ))}
                  <div className="p-3 bg-[#FAFAFA] space-y-1">
                    <div className="flex justify-between text-[#525252]">
                      <span>Subtotal</span>
                      <span className="tabular-data">{formatKwanza(selectedOrder.subtotalKz)}</span>
                    </div>
                    <div className="flex justify-between text-[#525252]">
                      <span>Taxa de entrega</span>
                      <span className="tabular-data">{formatKwanza(selectedOrder.deliveryFeeKz)}</span>
                    </div>
                    {selectedOrder.discountKz > 0 && (
                      <div className="flex justify-between text-[#15803D]">
                        <span>Desconto comercial</span>
                        <span className="tabular-data">-{formatKwanza(selectedOrder.discountKz)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-brand font-bold text-sm text-[#0A0A0A] pt-1 border-t border-[#E5E5E5]">
                      <span>Total da encomenda</span>
                      <span className="metric-num">{formatKwanza(selectedOrder.totalKz)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Manual Attendance, Order Status & Payment Status Form */}
              {canWrite ? (
                <form
                  onSubmit={(e) => void handleSaveOrderUpdate(e)}
                  className="space-y-3 pt-2 border-t border-[#E5E5E5]"
                >
                  <p className="font-brand font-bold text-xs text-[#0A0A0A]">
                    Atualizar Atendimento, Estado e Pagamento
                  </p>

                  <div>
                    <label htmlFor="ord-wa-outcome" className="block text-[#525252] mb-1">
                      Resultado manual do atendimento WhatsApp
                    </label>
                    <select
                      id="ord-wa-outcome"
                      value={editOutcome}
                      onChange={(e) =>
                        setEditOutcome(e.target.value as WhatsAppAttendanceOutcome)
                      }
                      className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                    >
                      {(Object.keys(WHATSAPP_OUTCOME_LABELS) as WhatsAppAttendanceOutcome[]).map(
                        (k) => (
                          <option key={k} value={k}>
                            {WHATSAPP_OUTCOME_LABELS[k]}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ord-status-select" className="block text-[#525252] mb-1">
                        Estado logístico
                      </label>
                      <select
                        id="ord-status-select"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as OrderStatus)}
                        className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                      >
                        {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {ORDER_STATUS_META[st].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="ord-payment-select" className="block text-[#525252] mb-1">
                        Estado de pagamento
                      </label>
                      <select
                        id="ord-payment-select"
                        value={editPaymentStatus}
                        onChange={(e) => setEditPaymentStatus(e.target.value as PaymentStatus)}
                        className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                      >
                        {(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map((ps) => (
                          <option key={ps} value={ps}>
                            {PAYMENT_STATUS_META[ps].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ord-trans-note" className="block text-[#525252] mb-1">
                      Nota para o histórico desta alteração
                    </label>
                    <input
                      id="ord-trans-note"
                      type="text"
                      value={transitionNote}
                      onChange={(e) => setTransitionNote(e.target.value)}
                      placeholder="Ex.: Pagamento por transferência validado e entrega agendada"
                      className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg"
                    />
                  </div>

                  <div>
                    <label htmlFor="ord-internal-notes" className="block text-[#525252] mb-1">
                      Observações internas da encomenda
                    </label>
                    <textarea
                      id="ord-internal-notes"
                      rows={2}
                      value={editInternalNotes}
                      onChange={(e) => setEditInternalNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg"
                    />
                  </div>

                  {detailError && (
                    <div role="alert" className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                      {detailError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isUpdatingOrder || isMutating}
                    className="btn-bercali-primary w-full py-2.5 px-4 rounded-[10px] text-xs disabled:opacity-50"
                  >
                    {isUpdatingOrder ? 'A guardar...' : 'Guardar Estado, Pagamento e CRM'}
                  </button>
                </form>
              ) : (
                <p className="text-[#737373] italic">
                  Perfil em modo de leitura para encomendas.
                </p>
              )}

              {/* Status History */}
              <div className="pt-3 border-t border-[#E5E5E5]">
                <p className="font-brand font-bold text-xs text-[#0A0A0A] flex items-center gap-1.5 mb-2.5">
                  <History className="w-3.5 h-3.5 text-[#FF8A00]" />
                  <span>Histórico de alterações de estado</span>
                </p>
                <div className="space-y-2.5 max-h-48 overflow-y-auto">
                  {selectedOrder.statusHistory.map((h) => (
                    <div key={h.id} className="p-2.5 rounded-lg bg-[#F4F4F4]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0A0A0A]">
                          {h.fromStatus && ORDER_STATUS_META[h.fromStatus]
                            ? `${ORDER_STATUS_META[h.fromStatus].label} -> `
                            : ''}
                          {ORDER_STATUS_META[h.toStatus]?.label || h.toStatus}
                        </span>
                        <span className="text-[10px] text-[#737373] tabular-data">
                          {formatDateTimePt(h.changedAt)}
                        </span>
                      </div>
                      <p className="text-[#525252] mt-0.5">{h.note}</p>
                      <p className="text-[10px] text-[#737373] mt-0.5">Por: {h.changedBy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Order Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-order-title"
        >
          <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-xl w-full p-6 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E5E5E5]">
              <div>
                <h2 id="manual-order-title" className="font-brand font-bold text-lg text-[#0A0A0A]">
                  Registar Encomenda
                </h2>
                <p className="text-xs text-[#525252]">
                  O total oficial e a deduplicação do cliente são processados na função transacional PostgreSQL.
                </p>
              </div>
              <button
                type="button"
                disabled={isCreatingOrder}
                onClick={() => setCreateOpen(false)}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg hover:bg-[#F4F4F4]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateOrder(e)} className="space-y-4 text-xs">
              {/* Customer mode switch */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0A0A0A]">Identificação do Cliente *</span>
                  {snapshot.customers.length > 0 && (
                    <div className="inline-flex p-0.5 bg-[#F4F4F4] rounded-lg">
                      <button
                        type="button"
                        onClick={() => setCustomerMode('existing')}
                        className={`px-2.5 py-1 rounded-md font-medium ${
                          customerMode === 'existing'
                            ? 'bg-white text-[#0A0A0A] shadow-xs'
                            : 'text-[#525252]'
                        }`}
                      >
                        Cliente existente
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomerMode('new')}
                        className={`px-2.5 py-1 rounded-md font-medium ${
                          customerMode === 'new'
                            ? 'bg-white text-[#0A0A0A] shadow-xs'
                            : 'text-[#525252]'
                        }`}
                      >
                        Novo contacto / Telefone
                      </button>
                    </div>
                  )}
                </div>

                {customerMode === 'existing' && snapshot.customers.length > 0 ? (
                  <div>
                    <label htmlFor="mo-cust" className="sr-only">
                      Selecionar cliente existente
                    </label>
                    <select
                      id="mo-cust"
                      value={newCustomerId}
                      onChange={(e) => setNewCustomerId(e.target.value)}
                      className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                    >
                      {snapshot.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phoneNormalized})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-[10px] bg-[#F4F4F4] grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="mo-cust-name" className="block text-[#525252] mb-1">
                        Nome completo *
                      </label>
                      <input
                        id="mo-cust-name"
                        type="text"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        placeholder="Ex.: Mateus Kiala"
                        className="w-full px-3 py-2 bg-white border border-[#D4D4D4] rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="mo-cust-phone" className="block text-[#525252] mb-1">
                        Telefone / WhatsApp *
                      </label>
                      <input
                        id="mo-cust-phone"
                        type="tel"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        placeholder="+244 923 000 000"
                        className="w-full px-3 py-2 bg-white font-mono border border-[#D4D4D4] rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="mo-cust-city" className="block text-[#525252] mb-1">
                        Cidade / Bairro
                      </label>
                      <input
                        id="mo-cust-city"
                        type="text"
                        value={newCustCity}
                        onChange={(e) => setNewCustCity(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#D4D4D4] rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="mo-cust-email" className="block text-[#525252] mb-1">
                        Email (opcional)
                      </label>
                      <input
                        id="mo-cust-email"
                        type="email"
                        value={newCustEmail}
                        onChange={(e) => setNewCustEmail(e.target.value)}
                        placeholder="cliente@exemplo.ao"
                        className="w-full px-3 py-2 bg-white border border-[#D4D4D4] rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-item lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0A0A0A]">Itens da Encomenda *</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftLines((prev) => [
                        ...prev,
                        {
                          lineId: `ln-${Date.now()}-${prev.length}`,
                          productId: availableProducts[0]?.id || '',
                          quantity: '1',
                        },
                      ])
                    }
                    className="text-xs font-semibold text-[#FF8A00] hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar artigo</span>
                  </button>
                </div>

                {draftLines.map((ln, idx) => (
                  <div key={ln.lineId} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-8">
                      <select
                        aria-label={`Produto da linha ${idx + 1}`}
                        value={ln.productId}
                        onChange={(e) =>
                          setDraftLines((prev) =>
                            prev.map((x) =>
                              x.lineId === ln.lineId ? { ...x, productId: e.target.value } : x
                            )
                          )
                        }
                        className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                      >
                        {availableProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatKwanza(p.promoPriceKz ?? p.priceKz)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input
                        aria-label={`Quantidade da linha ${idx + 1}`}
                        type="number"
                        min="1"
                        value={ln.quantity}
                        onChange={(e) =>
                          setDraftLines((prev) =>
                            prev.map((x) =>
                              x.lineId === ln.lineId ? { ...x, quantity: e.target.value } : x
                            )
                          )
                        }
                        className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg tabular-data"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      {draftLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftLines((prev) => prev.filter((x) => x.lineId !== ln.lineId))
                          }
                          aria-label={`Remover linha ${idx + 1}`}
                          className="p-1.5 text-[#B91C1C] hover:bg-[#FEF2F2] rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="mo-origin" className="block font-medium text-[#0A0A0A] mb-1">
                    Origem
                  </label>
                  <select
                    id="mo-origin"
                    value={newOrigin}
                    onChange={(e) => setNewOrigin(e.target.value as OrderOrigin)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                  >
                    {(Object.keys(ORDER_ORIGIN_LABELS) as OrderOrigin[]).map((o) => (
                      <option key={o} value={o}>
                        {ORDER_ORIGIN_LABELS[o]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="mo-status" className="block font-medium text-[#0A0A0A] mb-1">
                    Estado inicial
                  </label>
                  <select
                    id="mo-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                  >
                    <option value="received">Recebida</option>
                    <option value="pending_confirmation">Pendente de confirmação</option>
                    <option value="confirmed">Confirmada</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="mo-payment" className="block font-medium text-[#0A0A0A] mb-1">
                    Pagamento
                  </label>
                  <select
                    id="mo-payment"
                    value={newPaymentStatus}
                    onChange={(e) => setNewPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                  >
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="mo-addr" className="block font-medium text-[#0A0A0A] mb-1">
                    Morada de entrega
                  </label>
                  <input
                    id="mo-addr"
                    type="text"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Bairro, rua, ponto de referência..."
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="mo-fee" className="block font-medium text-[#0A0A0A] mb-1">
                    Entrega (Kz)
                  </label>
                  <input
                    id="mo-fee"
                    type="number"
                    min="0"
                    value={newFeeKz}
                    onChange={(e) => setNewFeeKz(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg tabular-data"
                  />
                </div>
                <div>
                  <label htmlFor="mo-disc" className="block font-medium text-[#0A0A0A] mb-1">
                    Desconto (Kz)
                  </label>
                  <input
                    id="mo-disc"
                    type="number"
                    min="0"
                    value={newDiscountKz}
                    onChange={(e) => setNewDiscountKz(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg tabular-data"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="mo-notes" className="block font-medium text-[#0A0A0A] mb-1">
                  Observações internas
                </label>
                <input
                  id="mo-notes"
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D4D4D4] rounded-lg"
                />
              </div>

              {/* Estimated Server Summary */}
              <div className="p-3.5 rounded-[10px] bg-[#0A0A0A] text-white flex items-center justify-between">
                <span className="text-[#A3A3A3]">
                  Subtotal {formatKwanza(draftPreviewTotals.subtotalKz)} + Entrega{' '}
                  {formatKwanza(draftPreviewTotals.deliveryFeeKz)}
                </span>
                <span className="metric-num font-bold text-sm text-[#FFC400]">
                  Total: {formatKwanza(draftPreviewTotals.totalKz)}
                </span>
              </div>

              {createError && (
                <div role="alert" className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={isCreatingOrder}
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 border border-[#D4D4D4] rounded-[10px] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOrder}
                  className="btn-bercali-primary px-4 py-2 rounded-[10px] disabled:opacity-50"
                >
                  {isCreatingOrder ? 'A registar...' : 'Registar Encomenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
