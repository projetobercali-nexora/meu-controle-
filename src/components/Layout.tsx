import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Boxes,
  CheckCheck,
  ChevronDown,
  FolderTree,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Users,
  UserSquare2,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { getRoleLabel } from '../auth/permissions';
import { useAdmin } from '../context/AdminContext';
import { useOrderNotifications } from '../context/OrderNotificationsContext';
import { usePwaStatus } from '../hooks/usePwaStatus';
import { AdminModuleId } from '../types/domain';
import { classifyCrmTaskUrgency, formatDateTimePt, formatKwanza } from '../utils/formatters';
import { BrandLogo } from './BrandLogo';
import { ConfirmDialog } from './SharedUI';

interface NavItemConfig {
  id: AdminModuleId;
  label: string;
  Icon: React.FC<{ className?: string }>;
}

const SIDEBAR_MODULES: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'products', label: 'Produtos', Icon: Boxes },
  { id: 'categories', label: 'Categorias', Icon: FolderTree },
  { id: 'orders', label: 'Encomendas', Icon: ShoppingCart },
  { id: 'customers', label: 'Clientes', Icon: Users },
  { id: 'crm', label: 'CRM', Icon: UserSquare2 },
  { id: 'marketing', label: 'Marketing e Pixel', Icon: Megaphone },
  { id: 'reports', label: 'Relatórios', Icon: BarChart3 },
  { id: 'users', label: 'Utilizadores e permissões', Icon: ShieldCheck },
  { id: 'settings', label: 'Configurações', Icon: Settings },
  { id: 'help', label: 'Ajuda e suporte', Icon: HelpCircle },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    session,
    isDataLoading,
    dataError,
    activeModule,
    setActiveModule,
    globalSearch,
    setGlobalSearch,
    setFocusedEntityId,
    snapshot,
    notices,
    dismissNotice,
    canOpenModule,
    reloadData,
    signOut,
  } = useAdmin();

  const {
    hasOrdersAccess,
    prefs: notifPrefs,
    audioState,
    notifications: orderNotifications,
    unreadCount: unreadOrderNotifs,
    activateSoundAndPermissions,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useOrderNotifications();

  const { isOnline, updateAvailable, applyUpdate, dismissUpdate } = usePwaStatus();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [bellTab, setBellTab] = useState<'realtime' | 'alerts'>('realtime');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const pendingOrders = useMemo(
    () =>
      snapshot.orders.filter(
        (o) => o.status === 'received' || o.status === 'pending_confirmation'
      ),
    [snapshot.orders]
  );

  const lowStockProducts = useMemo(
    () =>
      snapshot.products.filter(
        (p) =>
          p.status === 'active' &&
          p.trackStock &&
          p.stockQuantity !== null &&
          p.stockQuantity <= p.lowStockThreshold
      ),
    [snapshot.products]
  );

  const overdueTasks = useMemo(
    () => snapshot.crmTasks.filter((t) => classifyCrmTaskUrgency(t) === 'overdue'),
    [snapshot.crmTasks]
  );

  const alertCount = pendingOrders.length + lowStockProducts.length + overdueTasks.length;

  const quickSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (q.length < 2) return null;

    const matchingProducts = snapshot.products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      )
      .slice(0, 3);

    const matchingOrders = snapshot.orders
      .filter(
        (o) =>
          o.code.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.includes(q)
      )
      .slice(0, 3);

    const matchingCustomers = snapshot.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phoneNormalized.includes(q) ||
          c.email.toLowerCase().includes(q)
      )
      .slice(0, 3);

    return {
      products: matchingProducts,
      orders: matchingOrders,
      customers: matchingCustomers,
      total:
        matchingProducts.length +
        matchingOrders.length +
        matchingCustomers.length,
    };
  }, [globalSearch, snapshot.products, snapshot.orders, snapshot.customers]);

  const handleSelectModule = (id: AdminModuleId) => {
    setActiveModule(id);
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0A0A0A] text-white select-none">
      {/* Brand Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1F1F1F]">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo variant="sidebar" />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu lateral"
            className="lg:hidden p-2 rounded-lg text-[#8A8A8A] hover:text-white hover:bg-[#1A1A1A]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-3">
          <p className="font-brand font-semibold text-xs text-white tracking-wide">
            Painel Administrativo
          </p>
          <p className="text-[11px] text-[#A3A3A3] mt-0.5">
            Centro de controlo independente
          </p>
        </div>
      </div>

      {/* Navigation Modules 1..11 */}
      <nav aria-label="Menu administrativo principal" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {SIDEBAR_MODULES.map((item) => {
          const Icon = item.Icon;
          const isActive = activeModule === item.id;
          const allowed = canOpenModule(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectModule(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-xs font-medium ${
                isActive
                  ? 'bg-[#FF8A00] text-[#0A0A0A] font-semibold'
                  : allowed
                    ? 'text-[#E5E5E5] hover:bg-[#1A1A1A] hover:text-white'
                    : 'text-[#737373] hover:bg-[#1A1A1A]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#0A0A0A]' : 'text-[#FF8A00]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {!allowed && (
                <span className="text-[10px] text-[#737373] shrink-0">Restrito</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Module 12: Terminar sessão */}
      <div className="p-3 border-t border-[#1F1F1F]">
        <button
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-xs font-medium text-[#E5E5E5] hover:bg-[#1A1A1A] hover:text-[#FF8A00] transition-colors"
        >
          <LogOut className="w-4 h-4 text-[#FF8A00] shrink-0" />
          <span>Terminar sessão</span>
        </button>
      </div>
    </div>
  );

  const initials = (session.userName || session.userEmail || 'AD')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2);

  return (
    <div className="min-h-screen flex bg-[#F4F4F4] text-[#0A0A0A]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[272px] max-w-[85vw] h-full">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 bg-white border-b border-[#E5E5E5] px-4 lg:px-8 flex items-center justify-between gap-4">
          {/* Zone 1: Mobile Trigger + Global Search */}
          <div className="flex items-center gap-3 flex-1 max-w-xl relative">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de navegação"
              className="lg:hidden p-2 rounded-lg border border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F4]"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                aria-label="Pesquisar produtos, encomendas ou clientes"
                placeholder="Pesquisar SKU, produto, código de encomenda ou cliente..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F4F4F4] border border-transparent focus:bg-white focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-[#0A0A0A] placeholder:text-[#737373]"
              />

              {quickSearchResults && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#E5E5E5] rounded-xl shadow-lg p-3 z-40">
                  {quickSearchResults.total === 0 ? (
                    <p className="text-xs text-[#525252] py-2 text-center">
                      Nenhum registo encontrado para "{globalSearch}".
                    </p>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {quickSearchResults.products.length > 0 && (
                        <div>
                          <p className="font-semibold text-[#525252] mb-1">Produtos</p>
                          {quickSearchResults.products.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setFocusedEntityId(p.id);
                                setActiveModule('products');
                                setGlobalSearch('');
                              }}
                              className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F4F4F4] text-left"
                            >
                              <span className="truncate font-medium text-[#0A0A0A]">{p.name}</span>
                              <span className="metric-num text-[#525252] shrink-0 ml-2">
                                {formatKwanza(p.promoPriceKz ?? p.priceKz)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {quickSearchResults.orders.length > 0 && (
                        <div>
                          <p className="font-semibold text-[#525252] mb-1">Encomendas</p>
                          {quickSearchResults.orders.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                setFocusedEntityId(o.id);
                                setActiveModule('orders');
                                setGlobalSearch('');
                              }}
                              className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F4F4F4] text-left"
                            >
                              <span className="truncate font-medium text-[#0A0A0A]">
                                {o.code} · {o.customerName}
                              </span>
                              <span className="metric-num text-[#525252] shrink-0 ml-2">
                                {formatKwanza(o.totalKz)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {quickSearchResults.customers.length > 0 && (
                        <div>
                          <p className="font-semibold text-[#525252] mb-1">Clientes</p>
                          {quickSearchResults.customers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setFocusedEntityId(c.id);
                                setActiveModule('customers');
                                setGlobalSearch('');
                              }}
                              className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F4F4F4] text-left"
                            >
                              <span className="truncate font-medium text-[#0A0A0A]">{c.name}</span>
                              <span className="font-mono text-[11px] text-[#525252] shrink-0 ml-2">
                                {c.phoneNormalized}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Zone 2: Refresh + Operational Alerts + Authenticated Profile */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void reloadData()}
              disabled={isDataLoading}
              aria-label="Sincronizar dados com o Supabase"
              title="Atualizar dados"
              className="p-2 rounded-[10px] border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] text-[#0A0A0A] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isDataLoading ? 'animate-spin text-[#FF8A00]' : ''}`} />
            </button>

            {/* Notifications (Realtime Orders + Operational Alerts) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((v) => !v);
                  setProfileMenuOpen(false);
                }}
                aria-label={
                  hasOrdersAccess
                    ? `Notificações (${unreadOrderNotifs} novas encomendas, ${alertCount} alertas)`
                    : `Alertas operacionais (${alertCount})`
                }
                aria-expanded={notificationsOpen}
                className="relative p-2 rounded-[10px] border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] text-[#0A0A0A] transition-colors"
              >
                <Bell className="w-4 h-4" />
                {hasOrdersAccess && unreadOrderNotifs > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF8A00] text-[#0A0A0A] font-brand font-bold text-[10px] flex items-center justify-center tabular-data">
                    {unreadOrderNotifs}
                  </span>
                ) : alertCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#1A1A1A] text-white font-brand font-bold text-[10px] flex items-center justify-center tabular-data">
                    {alertCount}
                  </span>
                ) : null}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-[340px] sm:w-[376px] max-w-[92vw] bg-white border border-[#E5E5E5] rounded-xl shadow-lg p-4 z-40">
                  {hasOrdersAccess ? (
                    <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#E5E5E5]">
                      <div className="inline-flex items-center gap-1 p-1 bg-[#F4F4F4] rounded-lg">
                        <button
                          type="button"
                          onClick={() => setBellTab('realtime')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
                            bellTab === 'realtime'
                              ? 'bg-[#0A0A0A] text-white'
                              : 'text-[#525252] hover:text-[#0A0A0A]'
                          }`}
                        >
                          Encomendas ({unreadOrderNotifs})
                        </button>
                        <button
                          type="button"
                          onClick={() => setBellTab('alerts')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
                            bellTab === 'alerts'
                              ? 'bg-[#0A0A0A] text-white'
                              : 'text-[#525252] hover:text-[#0A0A0A]'
                          }`}
                        >
                          Alertas ({alertCount})
                        </button>
                      </div>

                      {bellTab === 'realtime' && orderNotifications.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {unreadOrderNotifs > 0 && (
                            <button
                              type="button"
                              onClick={markAllAsRead}
                              title="Marcar todas como lidas"
                              className="px-2 py-1 rounded-md text-[11px] font-medium text-[#0A0A0A] hover:bg-[#F4F4F4] inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <CheckCheck className="w-3 h-3 text-[#FF8A00]" />
                              <span>Ler todas</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={clearNotifications}
                            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Limpar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#E5E5E5]">
                      <span className="font-brand font-bold text-xs text-[#0A0A0A]">
                        Alertas Operacionais
                      </span>
                      <span className="text-[11px] text-[#525252] tabular-data">
                        {alertCount} pendente(s)
                      </span>
                    </div>
                  )}

                  {hasOrdersAccess && bellTab === 'realtime' ? (
                    <div className="space-y-2.5 text-xs">
                      {notifPrefs.enabled && notifPrefs.soundEnabled && audioState === 'locked' && (
                        <div className="p-2.5 rounded-lg bg-[#FFF9F0] border border-[#FDE68A] flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#92400E]">
                            Som bloqueado pelo navegador.
                          </span>
                          <button
                            type="button"
                            onClick={() => void activateSoundAndPermissions()}
                            className="px-2.5 py-1 rounded-md bg-[#FF8A00] text-[#0A0A0A] font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>Ativar som</span>
                          </button>
                        </div>
                      )}

                      {orderNotifications.length === 0 ? (
                        <p className="text-xs text-[#525252] py-4 text-center">
                          Sem novas notificações de encomendas em tempo real.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                          {orderNotifications.map((item) => (
                            <div
                              key={item.id}
                              className={`p-2.5 rounded-lg border transition-colors ${
                                item.read
                                  ? 'bg-white border-[#E5E5E5]'
                                  : 'bg-[#FFF9F0] border-[#FDBA74]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    markAsRead(item.id);
                                    if (!item.isTest) {
                                      setFocusedEntityId(item.orderId);
                                    }
                                    handleSelectModule('orders');
                                  }}
                                  className="text-left min-w-0 flex-1"
                                >
                                  <p className="font-semibold text-[#0A0A0A] truncate">
                                    {item.orderCode} · {item.customerName}
                                  </p>
                                  <p className="text-[11px] text-[#525252] mt-0.5 tabular-data">
                                    {formatKwanza(item.totalKz)} · {formatDateTimePt(item.createdAt)}
                                  </p>
                                </button>

                                {!item.read ? (
                                  <button
                                    type="button"
                                    onClick={() => markAsRead(item.id)}
                                    className="px-2 py-1 rounded-md bg-white border border-[#D4D4D4] hover:bg-[#F4F4F4] text-[10px] font-semibold text-[#0A0A0A] shrink-0 whitespace-nowrap"
                                  >
                                    Marcar como lida
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-[#737373] shrink-0 whitespace-nowrap">
                                    Lida
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {canOpenModule('settings') && (
                        <div className="pt-2.5 border-t border-[#E5E5E5] flex items-center justify-between text-[11px]">
                          <span className="text-[#737373]">
                            {notifPrefs.enabled ? 'Alertas ativos neste aparelho' : 'Alertas desativados'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectModule('settings')}
                            className="font-semibold text-[#FF8A00] hover:underline whitespace-nowrap"
                          >
                            Configurar som
                          </button>
                        </div>
                      )}
                    </div>
                  ) : alertCount === 0 ? (
                    <p className="text-xs text-[#525252] py-3">
                      Sem encomendas pendentes, tarefas atrasadas ou alertas de stock neste momento.
                    </p>
                  ) : (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto text-xs">
                      {overdueTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setFocusedEntityId(t.customerId);
                            handleSelectModule('crm');
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-[#F4F4F4] transition-colors"
                        >
                          <p className="font-medium text-[#B91C1C]">
                            Follow-up atrasado: {t.title}
                          </p>
                          <p className="text-[11px] text-[#525252]">
                            Cliente: {t.customerName}
                          </p>
                        </button>
                      ))}
                      {pendingOrders.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setFocusedEntityId(o.id);
                            handleSelectModule('orders');
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-[#F4F4F4] transition-colors"
                        >
                          <p className="font-medium text-[#0A0A0A]">
                            Encomenda por confirmar: {o.code}
                          </p>
                          <p className="text-[11px] text-[#525252]">
                            {o.customerName} · {formatKwanza(o.totalKz)}
                          </p>
                        </button>
                      ))}
                      {lowStockProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFocusedEntityId(p.id);
                            handleSelectModule('products');
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-[#F4F4F4] transition-colors"
                        >
                          <p className="font-medium text-[#B91C1C]">
                            Stock baixo: {p.name}
                          </p>
                          <p className="text-[11px] text-[#525252] tabular-data">
                            Restam {p.stockQuantity} un. (mínimo {p.lowStockThreshold})
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Authenticated Admin Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotificationsOpen(false);
                }}
                aria-expanded={profileMenuOpen}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-[#0A0A0A] text-[#FF8A00] font-brand font-bold text-xs flex items-center justify-center shrink-0">
                  {initials || 'AD'}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-xs font-semibold text-[#0A0A0A] leading-tight whitespace-nowrap max-w-[140px] truncate">
                    {session.userName}
                  </span>
                  <span className="block text-[10px] text-[#525252] leading-tight whitespace-nowrap">
                    {getRoleLabel(session.role)}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#525252] shrink-0" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-[#E5E5E5] rounded-xl shadow-lg p-3 z-40">
                  <div className="pb-2.5 mb-2.5 border-b border-[#E5E5E5]">
                    <p className="font-brand font-bold text-xs text-[#0A0A0A] truncate">
                      {session.userName}
                    </p>
                    <p className="text-[11px] text-[#525252] font-mono truncate">
                      {session.userEmail}
                    </p>
                    <p className="text-[11px] font-medium text-[#FF8A00] mt-1">
                      {getRoleLabel(session.role)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setLogoutConfirmOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Terminar sessão</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PWA Update Available Banner */}
        {updateAvailable && (
          <div
            role="status"
            className="bg-[#0A0A0A] text-white border-b border-[#262626] px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <span className="text-[#E5E5E5]">
              Está disponível uma nova versão do <strong className="text-white">Bercali Store — Painel</strong>.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void applyUpdate()}
                className="btn-bercali-primary px-3.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar</span>
              </button>
              <button
                type="button"
                onClick={dismissUpdate}
                aria-label="Ocultar aviso de atualização"
                className="p-1 text-[#A3A3A3] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Offline Connectivity Warning */}
        {!isOnline && (
          <div
            role="status"
            className="bg-[#FFFBEB] border-b border-[#FDE68A] px-4 lg:px-8 py-2 flex items-center gap-2 text-xs text-[#92400E]"
          >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              Sem ligação à rede. Os dados do Supabase não são guardados em cache para evitar informação desatualizada; a sincronização retomará automaticamente ao voltar online.
            </span>
          </div>
        )}

        {/* Data Load Error Banner (if query fails) */}
        {dataError && (
          <div
            role="alert"
            className="bg-[#FEF2F2] border-b border-[#FECACA] px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#991B1B]"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{dataError}</span>
            </div>
            <button
              type="button"
              onClick={() => void reloadData()}
              className="px-3 py-1 rounded-lg bg-white border border-[#FCA5A5] font-semibold text-[#991B1B] hover:bg-[#FEE2E2]"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Toast Feedback Notifications */}
        {notices.length > 0 && (
          <div
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none"
          >
            {notices.map((n) => (
              <div
                key={n.id}
                className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 rounded-[10px] border shadow-md text-xs ${
                  n.type === 'error'
                    ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                    : n.type === 'success'
                      ? 'bg-[#0A0A0A] border-[#262626] text-white'
                      : 'bg-white border-[#E5E5E5] text-[#0A0A0A]'
                }`}
              >
                <span className="leading-relaxed">{n.message}</span>
                <button
                  type="button"
                  onClick={() => dismissNotice(n.id)}
                  aria-label="Fechar aviso"
                  className="opacity-70 hover:opacity-100 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Terminar sessão administrativa?"
        description="A tua sessão autenticada no Supabase Auth será encerrada neste navegador."
        confirmLabel="Terminar sessão"
        isBusy={isLoggingOut}
        onConfirm={async () => {
          setIsLoggingOut(true);
          try {
            await signOut();
          } finally {
            setIsLoggingOut(false);
            setLogoutConfirmOpen(false);
          }
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </div>
  );
};
