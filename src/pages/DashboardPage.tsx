import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { getRoleLabel } from '../auth/permissions';
import {
  EmptyDataState,
  LoadingBlock,
  PeriodFilterBar,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import {
  calculateDashboardMetrics,
  classifyCrmTaskUrgency,
  formatDateTimePt,
  formatKwanza,
  isConfirmedOrder,
  isIsoWithinPeriod,
} from '../utils/formatters';

export const DashboardPage: React.FC = () => {
  const {
    snapshot,
    isDataLoading,
    dataError,
    reloadData,
    periodFilter,
    setPeriodFilter,
    setActiveModule,
    setFocusedEntityId,
  } = useAdmin();

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

  const crmTaskSummary = useMemo(() => {
    let overdue = 0;
    let pending = 0;
    for (const t of snapshot.crmTasks) {
      const urgency = classifyCrmTaskUrgency(t);
      if (urgency === 'overdue') overdue += 1;
      else if (urgency === 'pending') pending += 1;
    }
    return { overdue, pending };
  }, [snapshot.crmTasks]);

  const chartSeries = useMemo(() => {
    const filtered = snapshot.orders.filter((o) =>
      isIsoWithinPeriod(o.createdAt, periodFilter)
    );
    const dayMap = new Map<
      string,
      { label: string; confirmedKz: number; pendingCount: number; confirmedCount: number }
    >();

    const sorted = [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const o of sorted) {
      const dayKey = o.createdAt.slice(0, 10);
      const label = `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;
      const cur = dayMap.get(dayKey) || {
        label,
        confirmedKz: 0,
        pendingCount: 0,
        confirmedCount: 0,
      };
      if (isConfirmedOrder(o.status)) {
        cur.confirmedKz += o.totalKz;
        cur.confirmedCount += 1;
      } else if (o.status === 'received' || o.status === 'pending_confirmation') {
        cur.pendingCount += 1;
      }
      dayMap.set(dayKey, cur);
    }

    return Array.from(dayMap.values());
  }, [snapshot.orders, periodFilter]);

  const maxChartKz = Math.max(1, ...chartSeries.map((d) => d.confirmedKz));
  const isDatabaseEmpty =
    snapshot.orders.length === 0 &&
    snapshot.products.length === 0 &&
    snapshot.customers.length === 0;

  return (
    <div className="space-y-6">
      {/* Header & Period Filter */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Visão Geral da Operação
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Indicadores reais sincronizados com PostgreSQL no Supabase em Kwanzas (Kz)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilterBar value={periodFilter} onChange={setPeriodFilter} />
          <button
            type="button"
            onClick={() => void reloadData()}
            disabled={isDataLoading}
            aria-label="Atualizar dados do painel"
            className="px-3 py-2 bg-white border border-[#E5E5E5] rounded-[10px] text-xs font-medium text-[#0A0A0A] hover:bg-[#F4F4F4] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#FF8A00] ${isDataLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {dataError && (
        <div
          role="alert"
          className="bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <span>{dataError}</span>
          <button
            type="button"
            onClick={() => void reloadData()}
            className="px-3 py-1.5 bg-white border border-[#FECACA] rounded-lg font-semibold text-[#B91C1C] whitespace-nowrap self-start sm:self-auto"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Regra contabilística clara: Encomendas recebidas vs Vendas confirmadas vs Entregues */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <p className="font-brand font-bold text-[#0A0A0A] mb-0.5">
            1. Encomendas recebidas / pendentes
          </p>
          <p className="text-[#525252] leading-relaxed">
            Intenções iniciadas na loja ou WhatsApp sem validação final. Não são contabilizadas como vendas confirmadas.
          </p>
        </div>
        <div className="md:border-l md:border-[#E5E5E5] md:pl-4">
          <p className="font-brand font-bold text-[#0A0A0A] mb-0.5">
            2. Vendas confirmadas (Kz)
          </p>
          <p className="text-[#525252] leading-relaxed">
            Encomendas validadas pela equipa (Confirmada, Em preparação, Enviada ou Entregue).
          </p>
        </div>
        <div className="md:border-l md:border-[#E5E5E5] md:pl-4">
          <p className="font-brand font-bold text-[#0A0A0A] mb-0.5">
            3. Encomendas entregues
          </p>
          <p className="text-[#525252] leading-relaxed">
            Pedidos cujo ciclo logístico foi integralmente concluído junto do cliente.
          </p>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <section aria-label="Indicadores principais" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#0A0A0A] text-white rounded-xl p-5 border border-[#1F1F1F]">
          <div className="flex items-center justify-between text-xs text-[#A3A3A3] mb-3">
            <span>Vendas confirmadas</span>
            <TrendingUp className="w-4 h-4 text-[#FF8A00]" />
          </div>
          <p className="metric-num font-extrabold text-2xl text-[#FFC400]">
            {formatKwanza(metrics.confirmedSalesKz)}
          </p>
          <p className="text-xs text-[#A3A3A3] mt-2 tabular-data">
            {metrics.confirmedOrdersCount} confirmada(s) · {metrics.paidOrdersCount} paga(s) · Exclui{' '}
            {formatKwanza(metrics.pendingValueKz)} pendentes
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-[#E5E5E5]">
          <div className="flex items-center justify-between text-xs text-[#525252] mb-3">
            <span>Total de encomendas</span>
            <ShoppingCart className="w-4 h-4 text-[#FF8A00]" />
          </div>
          <p className="metric-num font-bold text-2xl text-[#0A0A0A]">
            {metrics.totalOrders}
          </p>
          <p className="text-xs text-[#525252] mt-2 tabular-data">
            <span className="text-[#B45309] font-medium">{metrics.pendingOrders} pendentes</span>
            {' · '}
            <span className="text-[#15803D] font-medium">{metrics.confirmedOrdersCount} confirmadas</span>
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-[#E5E5E5]">
          <div className="flex items-center justify-between text-xs text-[#525252] mb-3">
            <span>Encomendas entregues</span>
            <Truck className="w-4 h-4 text-[#15803D]" />
          </div>
          <p className="metric-num font-bold text-2xl text-[#0A0A0A]">
            {metrics.deliveredOrders}
          </p>
          <p className="text-xs text-[#525252] mt-2 tabular-data">
            Clientes registados: <strong className="text-[#0A0A0A]">{metrics.totalCustomers}</strong>
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-[#E5E5E5]">
          <div className="flex items-center justify-between text-xs text-[#525252] mb-3">
            <span>Catálogo & Stock</span>
            <Boxes className="w-4 h-4 text-[#FF8A00]" />
          </div>
          <p className="metric-num font-bold text-2xl text-[#0A0A0A]">
            {metrics.activeProducts} <span className="text-sm font-medium text-[#525252]">ativos</span>
          </p>
          <p className="text-xs mt-2 tabular-data">
            {metrics.lowStockProducts.length > 0 ? (
              <span className="text-[#B91C1C] font-medium">
                {metrics.lowStockProducts.length} produto(s) com stock baixo
              </span>
            ) : (
              <span className="text-[#15803D]">Sem alertas de stock baixo</span>
            )}
          </p>
        </div>
      </section>

      {isDataLoading && isDatabaseEmpty ? (
        <LoadingBlock label="A carregar métricas reais da base de dados Supabase..." />
      ) : isDatabaseEmpty ? (
        <EmptyDataState
          title="Base de dados pronta e sem registos operacionais"
          description="Ainda não existem produtos, encomendas ou clientes registados no projeto Supabase. Começa por criar categorias e produtos para iniciar a operação comercial."
          actionLabel="Criar Categorias"
          onAction={() => setActiveModule('categories')}
        />
      ) : (
        <>
          {/* CRM Follow-up Alert Bar when open tasks exist */}
          {(crmTaskSummary.overdue > 0 || crmTaskSummary.pending > 0) && (
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <CalendarClock
                  className={`w-4 h-4 shrink-0 ${
                    crmTaskSummary.overdue > 0 ? 'text-[#B91C1C]' : 'text-[#FF8A00]'
                  }`}
                />
                <p className="text-[#525252]">
                  <strong className="text-[#0A0A0A]">Acompanhamento CRM ativo:</strong>{' '}
                  {crmTaskSummary.overdue > 0 && (
                    <span className="text-[#B91C1C] font-semibold">
                      {crmTaskSummary.overdue} tarefa(s) em atraso ·{' '}
                    </span>
                  )}
                  <span>{crmTaskSummary.pending} tarefa(s) pendente(s) de follow-up comercial.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModule('crm')}
                className="text-xs font-semibold text-[#0A0A0A] hover:text-[#FF8A00] inline-flex items-center gap-1 whitespace-nowrap self-start sm:self-auto"
              >
                <span>Abrir tarefas no CRM</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Charts: Sales by Period + Order Evolution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-[#E5E5E5] rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                    Vendas Confirmadas por Data
                  </h2>
                  <p className="text-xs text-[#525252]">
                    Valores em Kwanzas (Kz) calculados exclusivamente sobre pedidos confirmados
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModule('reports')}
                  className="text-xs font-medium text-[#0A0A0A] hover:text-[#FF8A00] inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span>Relatórios detalhados</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {chartSeries.length === 0 ? (
                <p className="text-xs text-[#525252] py-12 text-center">
                  Sem encomendas registadas no intervalo de datas selecionado.
                </p>
              ) : (
                <div className="pt-2">
                  <svg
                    viewBox="0 0 640 210"
                    role="img"
                    aria-label="Gráfico de barras de vendas confirmadas por data em Kwanzas"
                    className="w-full h-52 overflow-visible"
                  >
                    {[0, 0.5, 1].map((ratio, idx) => {
                      const y = 170 - ratio * 140;
                      const labelVal = formatKwanza(Math.round(maxChartKz * ratio));
                      return (
                        <g key={idx}>
                          <line
                            x1={90}
                            x2={620}
                            y1={y}
                            y2={y}
                            stroke="#E5E5E5"
                            strokeDasharray={idx === 0 ? undefined : '4 4'}
                          />
                          <text
                            x={82}
                            y={y + 4}
                            textAnchor="end"
                            className="fill-[#737373] text-[10px] font-mono"
                          >
                            {labelVal}
                          </text>
                        </g>
                      );
                    })}

                    {chartSeries.map((pt, i) => {
                      const slotWidth = 520 / Math.max(chartSeries.length, 1);
                      const barWidth = Math.min(48, slotWidth * 0.55);
                      const x = 96 + i * slotWidth + (slotWidth - barWidth) / 2;
                      const barHeight = Math.max(
                        pt.confirmedKz > 0 ? 6 : 2,
                        (pt.confirmedKz / maxChartKz) * 140
                      );
                      const y = 170 - barHeight;

                      return (
                        <g key={pt.label}>
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx={6}
                            fill={pt.confirmedKz > 0 ? '#FF8A00' : '#D4D4D4'}
                          />
                          <text
                            x={x + barWidth / 2}
                            y={190}
                            textAnchor="middle"
                            className="fill-[#525252] text-[11px] font-mono"
                          >
                            {pt.label}
                          </text>
                          {pt.confirmedKz > 0 && (
                            <text
                              x={x + barWidth / 2}
                              y={y - 6}
                              textAnchor="middle"
                              className="fill-[#0A0A0A] text-[10px] font-bold font-mono"
                            >
                              {formatKwanza(pt.confirmedKz)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* Evolução dos Estados das Encomendas */}
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                  Evolução das Encomendas
                </h2>
                <p className="text-xs text-[#525252] mb-5">
                  Distribuição operacional no período selecionado
                </p>

                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="inline-flex items-center gap-1.5 text-[#525252]">
                        <Clock className="w-3.5 h-3.5 text-[#B45309]" />
                        <span>Pendentes de confirmação</span>
                      </span>
                      <span className="metric-num font-bold text-[#0A0A0A]">
                        {metrics.pendingOrders}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F4F4F4] overflow-hidden">
                      <div
                        className="h-full bg-[#FFC400] rounded-full"
                        style={{
                          width: `${
                            metrics.totalOrders
                              ? Math.round((metrics.pendingOrders / metrics.totalOrders) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="inline-flex items-center gap-1.5 text-[#525252]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#FF8A00]" />
                        <span>Confirmadas / Em expedição</span>
                      </span>
                      <span className="metric-num font-bold text-[#0A0A0A]">
                        {Math.max(0, metrics.confirmedOrdersCount - metrics.deliveredOrders)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F4F4F4] overflow-hidden">
                      <div
                        className="h-full bg-[#FF8A00] rounded-full"
                        style={{
                          width: `${
                            metrics.totalOrders
                              ? Math.round(
                                  ((metrics.confirmedOrdersCount - metrics.deliveredOrders) /
                                    metrics.totalOrders) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="inline-flex items-center gap-1.5 text-[#525252]">
                        <Truck className="w-3.5 h-3.5 text-[#15803D]" />
                        <span>Entregues ao cliente</span>
                      </span>
                      <span className="metric-num font-bold text-[#0A0A0A]">
                        {metrics.deliveredOrders}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F4F4F4] overflow-hidden">
                      <div
                        className="h-full bg-[#22C55E] rounded-full"
                        style={{
                          width: `${
                            metrics.totalOrders
                              ? Math.round((metrics.deliveredOrders / metrics.totalOrders) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-5 border-t border-[#E5E5E5] flex items-center justify-between text-xs">
                <span className="text-[#525252]">Clientes registados</span>
                <button
                  type="button"
                  onClick={() => setActiveModule('customers')}
                  className="font-semibold text-[#0A0A0A] hover:text-[#FF8A00] inline-flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5 text-[#FF8A00]" />
                  <span>{metrics.totalCustomers} contactos</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Top Products + Low Stock & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                    Produtos Mais Vendidos (Confirmados)
                  </h2>
                  <p className="text-xs text-[#525252]">
                    Calculado apenas a partir de vendas confirmadas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModule('products')}
                  className="text-xs font-medium text-[#0A0A0A] hover:text-[#FF8A00]"
                >
                  Gerir produtos
                </button>
              </div>

              {metrics.topProducts.length === 0 ? (
                <p className="text-xs text-[#525252] py-4">
                  Ainda não existem produtos com vendas confirmadas neste período.
                </p>
              ) : (
                <div className="divide-y divide-[#E5E5E5]">
                  {metrics.topProducts.slice(0, 4).map((tp) => (
                    <div key={tp.productId} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0A0A0A] truncate">{tp.productName}</p>
                        <p className="text-[#525252] font-mono text-[11px]">{tp.sku}</p>
                      </div>
                      <div className="text-right shrink-0 tabular-data">
                        <p className="metric-num font-bold text-[#0A0A0A]">
                          {formatKwanza(tp.revenueConfirmedKz)}
                        </p>
                        <p className="text-[#525252]">{tp.unitsConfirmed} un. vendidas</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {metrics.lowStockProducts.length > 0 && (
                <div className="pt-4 border-t border-[#E5E5E5]">
                  <p className="font-brand font-bold text-xs text-[#B91C1C] flex items-center gap-1.5 mb-2.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Produtos ativos com stock baixo</span>
                  </p>
                  <div className="space-y-2">
                    {metrics.lowStockProducts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedEntityId(p.id);
                            setActiveModule('products');
                          }}
                          className="text-left font-medium text-[#0A0A0A] hover:text-[#FF8A00] truncate"
                        >
                          {p.name}
                        </button>
                        <span className="font-mono text-[11px] text-[#B91C1C] shrink-0 ml-2">
                          {p.stockQuantity} un. / mín. {p.lowStockThreshold}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Atividades administrativas recentes */}
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
                    Atividades Administrativas Recentes
                  </h2>
                  <p className="text-xs text-[#525252]">
                    Registos gravados em <span className="font-mono text-[11px]">activity_logs</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModule('users')}
                  className="text-xs font-medium text-[#0A0A0A] hover:text-[#FF8A00]"
                >
                  Ver auditoria
                </button>
              </div>

              {snapshot.activityLogs.length === 0 ? (
                <p className="text-xs text-[#525252] py-6">
                  Sem ações administrativas registadas até ao momento.
                </p>
              ) : (
                <div className="divide-y divide-[#E5E5E5]">
                  {snapshot.activityLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0A0A0A]">{log.action}</span>
                        <span className="text-[11px] text-[#737373] tabular-data shrink-0">
                          {formatDateTimePt(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-[#525252] mt-0.5 leading-relaxed">{log.details}</p>
                      <p className="text-[11px] text-[#737373] mt-1">
                        {log.actorName} · {getRoleLabel(log.actorRole)} · Ref: {log.entityRef}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
