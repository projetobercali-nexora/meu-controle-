import React, { useEffect, useMemo, useState } from 'react';
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
  const unreadRealtimeCount = hasOrdersAccess ? unreadOrderNotifs : 0;
  const totalBellUnreadCount = unreadRealtimeCount + alertCount;

  useEffect(() => {
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    setGlobalSearch('');
  }, [activeModule, setGlobalSearch]);

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
    setGlobalSearch('');
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handleToggleNotifications = () => {
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (next && hasOrdersAccess) {
        if (unreadOrderNotifs > 0) {
          setBellTab('realtime');
        } else if (alertCount > 0 && orderNotifications.length === 0) {
          setBellTab('alerts');
        } else if (alertCount > 0 && unreadOrderNotifs === 0) {
          setBellTab('alerts');
        }
      }
      return next;
    });
    setProfileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0A0A0A] text-white select-none pt-safe pb-safe pl-safe">
      {/* Brand Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1F1F1F]">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo variant="sidebar" />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu lateral"
            className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-[#8A8A8A] hover:text-white hover:bg-[#1A1A1A]"
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
              className={`w-full min-h-[44px] lg:min-h-[38px] flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-xs font-medium ${
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
          onClick={() => {
            setMobileMenuOpen(false);
            setLogoutConfirmOpen(true);
          }}
          className="w-full min-h-[44px] lg:min-h-[38px] flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-xs font-medium text-[#E5E5E5] hover:bg-[#1A1A1A] hover:text-[#FF8A00] transition-colors"
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
        <header className="sticky top-0 z-30 pt-safe bg-white border-b border-[#E5E5E5] pl-safe pr-safe">
          <div className="h-14 lg:h-16 px-3 sm:px-4 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
            {/* Zone 1: Mobile Trigger + Global Search */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-xl relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  setProfileMenuOpen(false);
                  setMobileMenuOpen(true);
                }}
                aria-label="Abrir menu de navegação"
                className="lg:hidden min-h-[44px] min-w-[44px] shrink-0 inline-flex items-center justify-center rounded-[10px] border border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F4]"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setNotificationsOpen(false);
                      setProfileMenuOpen(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setGlobalSearch('');
                    }
                  }}
                  aria-label="Pesquisar produtos, encomendas ou clientes"
                  placeholder="Pesquisar SKU, produto, encomenda ou cliente..."
                  className={`w-full min-h-[44px] sm:min-h-[38px] pl-9 ${
                    globalSearch ? 'pr-9' : 'pr-3'
                  } py-2 text-xs bg-[#F4F4F4] border border-transparent focus:bg-white focus:border-[#FF8A00] focus:outline-none rounded-[10px] text-[#0A0A0A] placeholder:text-[#737373]`}
                />
                {globalSearch.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setGlobalSearch('')}
                    aria-label="Limpar pesquisa global"
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#737373] hover:text-[#0A0A0A]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {quickSearchResults && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent"
                      onClick={() => setGlobalSearch('')}
                      aria-hidden="true"
                    />
                    <div className="fixed left-[4vw] right-[4vw] w-[92vw] max-w-[460px] mx-auto top-below-header-mobile max-h-[65vh] overflow-y-auto sm:absolute sm:left-0 sm:right-0 sm:w-auto sm:max-w-none sm:mx-0 sm:top-full sm:mt-1.5 bg-white border border-[#E5E5E5] rounded-xl shadow-lg p-3 z-50">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E5E5E5] sm:hidden">
                        <span className="font-brand font-bold text-xs text-[#0A0A0A]">
                          Resultados da pesquisa ({quickSearchResults.total})
                        </span>
                        <button
                          type="button"
                          onClick={() => setGlobalSearch('')}
                          className="text-[11px] font-semibold text-[#525252] px-2 py-1 rounded hover:bg-[#F4F4F4]"
                        >
                          Fechar
                        </button>
                      </div>
                      {quickSearchResults.total === 0 ? (
                        <p className="text-xs text-[#525252] py-2 text-center break-words">
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
                                    handleSelectModule('products');
                                  }}
                                  className="w-full min-h-[44px] sm:min-h-0 flex items-center justify-between gap-2 py-2 sm:py-1.5 px-2.5 rounded-lg hover:bg-[#F4F4F4] text-left"
                                >
                                  <span className="font-medium text-[#0A0A0A] break-words min-w-0">
                                    {p.name}
                                  </span>
                                  <span className="metric-num text-[#525252] shrink-0 ml-2 whitespace-nowrap">
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
                                    handleSelectModule('orders');
                                  }}
                                  className="w-full min-h-[44px] sm:min-h-0 flex items-center justify-between gap-2 py-2 sm:py-1.5 px-2.5 rounded-lg hover:bg-[#F4F4F4] text-left"
                                >
                                  <span className="font-medium text-[#0A0A0A] break-words min-w-0">
                                    {o.code} · {o.customerName}
                                  </span>
                                  <span className="metric-num text-[#525252] shrink-0 ml-2 whitespace-nowrap">
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
                                    handleSelectModule('customers');
                                  }}
                                  className="w-full min-h-[44px] sm:min-h-0 flex items-center justify-between gap-2 py-2 sm:py-1.5 px-2.5 rounded-lg hover:bg-[#F4F4F4] text-left"
                                >
                                  <span className="font-medium text-[#0A0A0A] break-words min-w-0">
                                    {c.name}
                                  </span>
                                  <span className="font-mono text-[11px] text-[#525252] shrink-0 ml-2 whitespace-nowrap">
                                    {c.phoneNormalized}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Zone 2: Refresh + Operational Alerts + Authenticated Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void reloadData()}
                disabled={isDataLoading}
                aria-label="Sincronizar dados com o Supabase"
                title="Atualizar dados"
                className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] inline-flex items-center justify-center rounded-[10px] border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] text-[#0A0A0A] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isDataLoading ? 'animate-spin text-[#FF8A00]' : ''}`} />
              </button>

              {/* Notifications (Realtime Orders + Operational Alerts) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleToggleNotifications}
                  aria-label={
                    hasOrdersAccess
                      ? `Notificações (${totalBellUnreadCount} por ler: ${unreadOrderNotifs} encomendas, ${alertCount} alertas)`
                      : `Alertas operacionais (${alertCount})`
                  }
                  aria-expanded={notificationsOpen}
                  className="relative min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] inline-flex items-center justify-center rounded-[10px] border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] text-[#0A0A0A] transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  {totalBellUnreadCount > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full font-brand font-bold text-[10px] flex items-center justify-center tabular-data ${
                        unreadRealtimeCount > 0
                          ? 'bg-[#FF8A00] text-[#0A0A0A]'
                          : 'bg-[#1A1A1A] text-white'
                      }`}
                    >
                      {totalBellUnreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    {/* Escurecimento de fundo + toque fora para fechar */}
                    <div
                      className="fixed inset-0 z-40 bg-black/45 sm:bg-black/20"
                      onClick={() => setNotificationsOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Painel de notificações: máx. 92vw com margens laterais iguais (4vw) e máx. 70vh com scroll interno */}
                    <div
                      role="dialog"
                      aria-label="Painel de notificações"
                      className="fixed left-[4vw] right-[4vw] w-[92vw] max-w-[400px] mx-auto top-below-header-mobile max-h-[70vh] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mx-0 sm:mt-2 sm:w-[384px] sm:max-w-[92vw] bg-white border border-[#E5E5E5] rounded-xl shadow-xl z-50 flex flex-col overflow-hidden"
                    >
                      {/* Cabeçalho fixo do painel */}
                      <div className="p-3.5 pb-3 border-b border-[#E5E5E5] shrink-0 space-y-2.5">
                        {hasOrdersAccess ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="grid grid-cols-2 gap-1 p-1 bg-[#F4F4F4] rounded-lg flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setBellTab('realtime')}
                                  className={`min-h-[38px] px-2.5 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
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
                                  className={`min-h-[38px] px-2.5 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
                                    bellTab === 'alerts'
                                      ? 'bg-[#0A0A0A] text-white'
                                      : 'text-[#525252] hover:text-[#0A0A0A]'
                                  }`}
                                >
                                  Alertas ({alertCount})
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => setNotificationsOpen(false)}
                                aria-label="Fechar notificações"
                                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F4F4F4] shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {bellTab === 'realtime' && orderNotifications.length > 0 && (
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <span className="text-[#525252] tabular-data">
                                  {unreadOrderNotifs > 0
                                    ? `${unreadOrderNotifs} por ler · ${orderNotifications.length} no histórico`
                                    : `0 por ler · ${orderNotifications.length} lida(s)`}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {unreadOrderNotifs > 0 && (
                                    <button
                                      type="button"
                                      onClick={markAllAsRead}
                                      title="Marcar todas como lidas"
                                      className="min-h-[36px] px-2.5 py-1 rounded-md text-[11px] font-medium text-[#0A0A0A] bg-[#F4F4F4] hover:bg-[#E5E5E5] inline-flex items-center gap-1 whitespace-nowrap"
                                    >
                                      <CheckCheck className="w-3.5 h-3.5 text-[#FF8A00]" />
                                      <span>Ler todas</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={clearNotifications}
                                    className="min-h-[36px] px-2.5 py-1 rounded-md text-[11px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Limpar</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-brand font-bold text-xs text-[#0A0A0A] block">
                                Alertas Operacionais
                              </span>
                              <span className="text-[11px] text-[#525252] tabular-data">
                                {alertCount} pendente(s)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setNotificationsOpen(false)}
                              aria-label="Fechar alertas"
                              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F4F4F4] shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Corpo com scroll interno */}
                      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 text-xs space-y-2.5">
                        {hasOrdersAccess && bellTab === 'realtime' ? (
                          <>
                            {notifPrefs.enabled && notifPrefs.soundEnabled && audioState === 'locked' && (
                              <div className="p-3 rounded-lg bg-[#FFF9F0] border border-[#FDE68A] flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] text-[#92400E] leading-snug">
                                  Som bloqueado pelo navegador.
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void activateSoundAndPermissions()}
                                  className="min-h-[38px] px-3 py-1.5 rounded-md bg-[#FF8A00] text-[#0A0A0A] font-bold text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Ativar som</span>
                                </button>
                              </div>
                            )}

                            {orderNotifications.length === 0 ? (
                              <p className="text-xs text-[#525252] py-6 text-center leading-relaxed">
                                Sem novas notificações de encomendas em tempo real.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {orderNotifications.map((item) => (
                                  <div
                                    key={item.id}
                                    className={`p-3 rounded-lg border transition-colors ${
                                      item.read
                                        ? 'bg-white border-[#E5E5E5]'
                                        : 'bg-[#FFF9F0] border-[#FDBA74]'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        markAsRead(item.id);
                                        if (!item.isTest) {
                                          setFocusedEntityId(item.orderId);
                                        }
                                        handleSelectModule('orders');
                                      }}
                                      className="w-full text-left block space-y-1"
                                    >
                                      <p className="font-semibold text-[#0A0A0A] break-words whitespace-normal leading-snug">
                                        <span className="font-mono">{item.orderCode}</span>
                                        {' · '}
                                        <span>{item.customerName}</span>
                                      </p>
                                      <p className="text-[11px] text-[#525252] tabular-data break-words whitespace-normal leading-snug">
                                        <strong className="text-[#0A0A0A] font-semibold">
                                          {formatKwanza(item.totalKz)}
                                        </strong>
                                        {' · '}
                                        <span>{formatDateTimePt(item.createdAt)}</span>
                                      </p>
                                    </button>

                                    <div className="mt-2 pt-2 border-t border-[#E5E5E5]/70 flex items-center justify-between gap-2">
                                      <span className="text-[10px] text-[#737373]">
                                        {item.read ? 'Notificação lida' : 'Por ler'}
                                      </span>
                                      {!item.read && (
                                        <button
                                          type="button"
                                          onClick={() => markAsRead(item.id)}
                                          className="min-h-[36px] px-2.5 py-1 rounded-md bg-white border border-[#D4D4D4] hover:bg-[#F4F4F4] text-[11px] font-semibold text-[#0A0A0A] whitespace-nowrap"
                                        >
                                          Marcar como lida
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : alertCount === 0 ? (
                          <p className="text-xs text-[#525252] py-6 text-center leading-relaxed">
                            Sem encomendas pendentes, tarefas atrasadas ou alertas de stock neste momento.
                          </p>
                        ) : (
                          <div className="space-y-2 text-xs">
                            {overdueTasks.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setFocusedEntityId(t.customerId);
                                  handleSelectModule('crm');
                                }}
                                className="w-full text-left p-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2]/60 hover:bg-[#FEF2F2] transition-colors space-y-0.5"
                              >
                                <p className="font-semibold text-[#B91C1C] break-words whitespace-normal leading-snug">
                                  Follow-up atrasado: {t.title}
                                </p>
                                <p className="text-[11px] text-[#525252] break-words whitespace-normal">
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
                                className="w-full text-left p-3 rounded-lg border border-[#E5E5E5] hover:bg-[#F4F4F4] transition-colors space-y-0.5"
                              >
                                <p className="font-semibold text-[#0A0A0A] break-words whitespace-normal leading-snug">
                                  Encomenda por confirmar: <span className="font-mono">{o.code}</span>
                                </p>
                                <p className="text-[11px] text-[#525252] break-words whitespace-normal tabular-data">
                                  {o.customerName} · <strong className="text-[#0A0A0A]">{formatKwanza(o.totalKz)}</strong>
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
                                className="w-full text-left p-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2]/60 hover:bg-[#FEF2F2] transition-colors space-y-0.5"
                              >
                                <p className="font-semibold text-[#B91C1C] break-words whitespace-normal leading-snug">
                                  Stock baixo: {p.name}
                                </p>
                                <p className="text-[11px] text-[#525252] tabular-data break-words whitespace-normal">
                                  Restam {p.stockQuantity} un. (mínimo {p.lowStockThreshold})
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Rodapé fixo do painel */}
                      {hasOrdersAccess && canOpenModule('settings') && (
                        <div className="px-3.5 py-2.5 border-t border-[#E5E5E5] bg-[#FAFAFA] shrink-0 flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[#737373] truncate">
                            {notifPrefs.enabled ? 'Alertas ativos neste aparelho' : 'Alertas desativados'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectModule('settings')}
                            className="min-h-[36px] px-2 font-semibold text-[#FF8A00] hover:underline whitespace-nowrap shrink-0"
                          >
                            Configurar som
                          </button>
                        </div>
                      )}
                    </div>
                  </>
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
                  aria-label={`Menu da conta de ${session.userName || session.userEmail}`}
                  aria-expanded={profileMenuOpen}
                  className="min-h-[44px] sm:min-h-[38px] flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-[10px] border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] transition-colors"
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
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
                      onClick={() => setProfileMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="fixed right-[4vw] top-below-header-mobile w-[min(17rem,92vw)] sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-64 bg-white border border-[#E5E5E5] rounded-xl shadow-lg p-3 z-50">
                      <div className="pb-2.5 mb-2.5 border-b border-[#E5E5E5]">
                        <p className="font-brand font-bold text-xs text-[#0A0A0A] break-words">
                          {session.userName}
                        </p>
                        <p className="text-[11px] text-[#525252] font-mono break-all">
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
                        className="w-full min-h-[44px] sm:min-h-[36px] flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2]"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Terminar sessão</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
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
            className="fixed bottom-safe-toast left-[4vw] right-[4vw] sm:left-auto sm:right-4 z-50 flex flex-col gap-2 sm:max-w-sm sm:w-full pointer-events-none"
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
                <span className="leading-relaxed break-words min-w-0">{n.message}</span>
                <button
                  type="button"
                  onClick={() => dismissNotice(n.id)}
                  aria-label="Fechar aviso"
                  className="min-h-[36px] min-w-[36px] -mr-2 -my-1.5 inline-flex items-center justify-center opacity-70 hover:opacity-100 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 px-4 lg:px-8 pt-5 pb-safe-main max-w-[1440px] w-full mx-auto min-w-0">
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
