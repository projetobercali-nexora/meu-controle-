import React, { useMemo } from 'react';
import {
  Download,
  Megaphone,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  AccessDeniedState,
  CRM_STAGE_LABELS,
  EmptyDataState,
  LoadingBlock,
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
  PeriodFilterBar,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { CrmStage, OrderStatus } from '../types/domain';
import {
  calculateDashboardMetrics,
  formatDatePt,
  formatKwanza,
  generateCsvContent,
  isConfirmedOrder,
  isIsoWithinPeriod,
} from '../utils/formatters';

export const ReportsPage: React.FC = () => {
  const {
    session,
    snapshot,
    isDataLoading,
    periodFilter,
    setPeriodFilter,
    can,
    canOpenModule,
    notify,
  } = useAdmin();

  const canExport = session.isAuthenticated && can('reports:export');

  const filteredOrders = useMemo(
    () =>
      snapshot.orders.filter((o) =>
        isIsoWithinPeriod(o.createdAt, periodFilter)
      ),
    [snapshot.orders, periodFilter]
  );

  const metrics = useMemo(
    () =>
      calculateDashboardMetrics(
        snapshot.orders,
        snapshot.products,
        snapshot.customers,
        periodFilter
      ),
    [snapshot.orders, snapshot.products, snapshot.customers, periodFilter]
  );

  const productPerformance = useMemo(() => {
    return snapshot.products.map((prod) => {
      let confirmedUnits = 0;
      let confirmedRevenueKz = 0;
      let pendingUnits = 0;

      for (const ord of filteredOrders) {
        for (const it of ord.items) {
          if (it.productId === prod.id) {
            if (isConfirmedOrder(ord.status)) {
              confirmedUnits += it.quantity;
              confirmedRevenueKz += it.lineTotalKz ?? it.quantity * it.unitPriceKz;
            } else if (ord.status !== 'cancelled') {
              pendingUnits += it.quantity;
            }
          }
        }
      }

      return {
        product: prod,
        confirmedUnits,
        confirmedRevenueKz,
        pendingUnits,
      };
    });
  }, [snapshot.products, filteredOrders]);

  const customerCohort = useMemo(() => {
    let newCustomers = 0;
    let recurringCustomers = 0;

    for (const c of snapshot.customers) {
      const confirmedCount = snapshot.orders.filter(
        (o) => o.customerId === c.id && isConfirmedOrder(o.status)
      ).length;
      if (confirmedCount > 1 || c.crmStage === 'recurring') {
        recurringCustomers += 1;
      } else {
        newCustomers += 1;
      }
    }

    return { newCustomers, recurringCustomers };
  }, [snapshot.customers, snapshot.orders]);

  if (!canOpenModule('reports')) {
    return <AccessDeniedState moduleTitle="Relatórios Operacionais" />;
  }

  const triggerCsvDownload = (filename: string, csvContent: string) => {
    if (!canExport) {
      notify('error', 'Sessão ou permissão insuficiente para exportar relatórios CSV.');
      return;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('success', `Ficheiro CSV "${filename}" exportado com sucesso.`);
  };

  const handleExportOrdersCsv = () => {
    const headers = [
      'Código',
      'Data',
      'Cliente',
      'Telefone',
      'Estado Logístico',
      'Estado Pagamento',
      'Contabilizada em Vendas Confirmadas',
      'Subtotal (Kz)',
      'Entrega (Kz)',
      'Desconto (Kz)',
      'Total (Kz)',
    ];
    const rows = filteredOrders.map((o) => [
      o.code,
      formatDatePt(o.createdAt),
      o.customerName,
      o.customerPhone,
      ORDER_STATUS_META[o.status]?.label || o.status,
      PAYMENT_STATUS_META[o.paymentStatus]?.label || o.paymentStatus,
      isConfirmedOrder(o.status) ? 'Sim' : 'Não (Pendente/Cancelada)',
      o.subtotalKz,
      o.deliveryFeeKz,
      o.discountKz,
      o.totalKz,
    ]);
    triggerCsvDownload(
      `bercali-encomendas-${new Date().toISOString().slice(0, 10)}.csv`,
      generateCsvContent(headers, rows)
    );
  };

  const handleExportProductsCsv = () => {
    const headers = [
      'SKU',
      'Produto',
      'Estado',
      'Preço Base (Kz)',
      'Unidades Confirmadas',
      'Receita Confirmada (Kz)',
      'Unidades Pendentes',
      'Stock Atual',
    ];
    const rows = productPerformance.map((row) => [
      row.product.sku,
      row.product.name,
      row.product.status,
      row.product.priceKz,
      row.confirmedUnits,
      row.confirmedRevenueKz,
      row.pendingUnits,
      row.product.trackStock ? (row.product.stockQuantity ?? 0) : 'Livre',
    ]);
    triggerCsvDownload(
      `bercali-desempenho-produtos-${new Date().toISOString().slice(0, 10)}.csv`,
      generateCsvContent(headers, rows)
    );
  };

  const isEmpty =
    snapshot.orders.length === 0 &&
    snapshot.products.length === 0 &&
    snapshot.customers.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Relatórios e Análise
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Indicadores reais separados entre encomendas pendentes e vendas confirmadas em Kwanzas (Kz)
          </p>
        </div>
        <PeriodFilterBar value={periodFilter} onChange={setPeriodFilter} />
      </div>

      {/* Export Bar */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <p className="text-[#525252]">
          Exportação CSV protegida por sessão autenticada e permissões RBAC (codificação UTF-8 compatível com Excel).
        </p>
        {canExport ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={filteredOrders.length === 0}
              onClick={handleExportOrdersCsv}
              className="px-3.5 py-2 rounded-[10px] border border-[#0A0A0A] font-semibold text-[#0A0A0A] hover:bg-[#F4F4F4] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span>Exportar Encomendas (CSV)</span>
            </button>
            <button
              type="button"
              disabled={productPerformance.length === 0}
              onClick={handleExportProductsCsv}
              className="btn-bercali-primary px-3.5 py-2 rounded-[10px] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Produtos (CSV)</span>
            </button>
          </div>
        ) : (
          <span className="text-[#737373]">Exportação CSV reservada a perfis autorizados</span>
        )}
      </div>

      {isDataLoading && isEmpty ? (
        <LoadingBlock label="A consolidar relatórios a partir do Supabase..." />
      ) : isEmpty ? (
        <EmptyDataState
          title="Sem registos para gerar relatórios"
          description="Quando existirem produtos, clientes e encomendas na base de dados, os relatórios financeiros e operacionais aparecerão consolidados nesta página."
        />
      ) : (
        <>
          {/* Summary Separation: Confirmed Sales vs Pending Orders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0A0A0A] text-white rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-[#A3A3A3] mb-2">
                <span>Vendas Confirmadas no Período</span>
                <TrendingUp className="w-4 h-4 text-[#FF8A00]" />
              </div>
              <p className="metric-num font-extrabold text-2xl text-[#FFC400]">
                {formatKwanza(metrics.confirmedSalesKz)}
              </p>
              <p className="text-xs text-[#A3A3A3] mt-1.5 tabular-data">
                {metrics.confirmedOrdersCount} confirmada(s) · {metrics.deliveredOrders} entregue(s) · {metrics.paidOrdersCount} paga(s)
              </p>
            </div>

            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
              <p className="text-xs text-[#525252] mb-2">
                Encomendas Pendentes (Excluídas de Vendas)
              </p>
              <p className="metric-num font-bold text-2xl text-[#0A0A0A]">
                {formatKwanza(metrics.pendingValueKz)}
              </p>
              <p className="text-xs text-[#B45309] mt-1.5 tabular-data">
                {metrics.pendingOrders} pedido(s) a aguardar confirmação manual de atendimento
              </p>
            </div>

            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-[#525252] mb-2">
                <span>Clientes Novos vs Recorrentes</span>
                <Users className="w-4 h-4 text-[#FF8A00]" />
              </div>
              <p className="metric-num font-bold text-2xl text-[#0A0A0A]">
                {customerCohort.newCustomers} novos · {customerCohort.recurringCustomers} recorrentes
              </p>
              <p className="text-xs text-[#525252] mt-1.5 tabular-data">
                Total de {snapshot.customers.length} clientes registados
              </p>
            </div>
          </div>

          {/* Desempenho de Produtos */}
          <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
            <div className="p-5 border-b border-[#E5E5E5]">
              <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                Desempenho dos Produtos
              </h2>
              <p className="text-xs text-[#525252]">
                Comparação entre unidades efetivamente vendidas (confirmadas) e intenções pendentes
              </p>
            </div>
            {productPerformance.length === 0 ? (
              <p className="p-6 text-xs text-[#737373]">Ainda não existem produtos registados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                      <th className="py-3 px-4">Produto</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4 text-right">Unid. Confirmadas</th>
                      <th className="py-3 px-4 text-right">Receita Confirmada (Kz)</th>
                      <th className="py-3 px-4 text-right">Unid. Pendentes</th>
                      <th className="py-3 px-4 text-right">Stock Atual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5] text-xs">
                    {productPerformance.map((row) => (
                      <tr key={row.product.id} className="hover:bg-[#FAFAFA]">
                        <td className="py-3 px-4 font-medium text-[#0A0A0A]">
                          {row.product.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#525252]">{row.product.sku}</td>
                        <td className="py-3 px-4 text-right metric-num font-bold text-[#0A0A0A]">
                          {row.confirmedUnits}
                        </td>
                        <td className="py-3 px-4 text-right metric-num font-bold text-[#15803D]">
                          {formatKwanza(row.confirmedRevenueKz)}
                        </td>
                        <td className="py-3 px-4 text-right tabular-data text-[#B45309]">
                          {row.pendingUnits}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#0A0A0A]">
                          {row.product.trackStock ? `${row.product.stockQuantity} un.` : 'Livre'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Estados das Encomendas + Evolução do CRM + Indicadores de Marketing */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
              <h2 className="font-brand font-bold text-base text-[#0A0A0A] mb-3">
                Estados das Encomendas
              </h2>
              <div className="divide-y divide-[#E5E5E5]">
                {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((st) => {
                  const count = filteredOrders.filter((o) => o.status === st).length;
                  return (
                    <div key={st} className="py-2.5 flex items-center justify-between">
                      <span className="text-[#525252]">{ORDER_STATUS_META[st].label}</span>
                      <span className="metric-num font-bold text-[#0A0A0A]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
              <h2 className="font-brand font-bold text-base text-[#0A0A0A] mb-3">
                Evolução do CRM
              </h2>
              <div className="divide-y divide-[#E5E5E5]">
                {(Object.keys(CRM_STAGE_LABELS) as CrmStage[]).map((stage) => {
                  const count = snapshot.customers.filter((c) => c.crmStage === stage).length;
                  return (
                    <div key={stage} className="py-2.5 flex items-center justify-between">
                      <span className="text-[#525252]">{CRM_STAGE_LABELS[stage]}</span>
                      <span className="metric-num font-bold text-[#0A0A0A]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#FF8A00]" />
                <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                  Estado do Meta Pixel
                </h2>
              </div>
              <p className="text-[#525252] leading-relaxed">
                O painel não inventa métricas de campanhas, cliques ou ROAS. Os resultados publicitários reais dependem da ligação da loja pública e consulta no Gestor de Anúncios da Meta.
              </p>
              <div className="p-3.5 rounded-[10px] bg-[#F4F4F4] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#525252]">Meta Pixel ID</span>
                  <span className="font-mono font-semibold text-[#0A0A0A]">
                    {snapshot.marketingSettings.pixelId || 'Não configurado'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#525252]">Estado do Pixel</span>
                  <span className="font-semibold text-[#0A0A0A]">
                    {snapshot.marketingSettings.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#525252]">Eventos configurados</span>
                  <span className="metric-num font-bold text-[#0A0A0A]">
                    {snapshot.marketingSettings.events.filter((e) => e.enabled).length} / 7
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
