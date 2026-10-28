import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessModule, hasPermission } from '../auth/permissions';
import { BackendConnectionStatus } from '../config/supabaseConfig';
import { getSupabaseClient, probeSupabaseConnection } from '../lib/supabaseClient';
import {
  addCustomerNoteDb,
  AdminSnapshot,
  assignProductToCategoryDb,
  createCrmTaskDb,
  CreateCrmTaskPayload,
  createCustomerTagDb,
  createEmptyAdminSnapshot,
  createManualOrderDb,
  CreateOrderPayload,
  deleteCategoryDb,
  deleteProductDb,
  fetchAdminSnapshot,
  saveMarketingSettingsDb,
  saveStoreSettingsDb,
  ServiceActor,
  setProductStatusDb,
  toggleCategoryActiveDb,
  updateAdminProfileDb,
  updateCrmTaskStatusDb,
  updateCustomerCrmDb,
  updateOrderStatusAndAttendanceDb,
  uploadProductMediaToStorage,
  upsertCategoryDb,
  UpsertCategoryPayload,
  upsertCustomerDb,
  UpsertCustomerPayload,
  upsertProductDb,
  UpsertProductPayload,
} from '../services/dataService';
import {
  AdminModuleId,
  CrmStage,
  CrmTaskStatus,
  CustomerNote,
  CustomerTag,
  DatePeriodFilter,
  MarketingSettings,
  OrderStatus,
  PaymentStatus,
  PermissionKey,
  ProductMedia,
  ProductStatus,
  StoreSettings,
  UserRole,
  WhatsAppAttendanceOutcome,
} from '../types/domain';
import { mapSupabaseErrorPt } from '../utils/formatters';

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface AuthSessionState {
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  isPasswordRecoveryMode: boolean;
  inactiveProfileEmail: string | null;
  sessionNotice: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  role: UserRole;
}

interface AdminContextValue {
  session: AuthSessionState;
  backendStatus: BackendConnectionStatus;
  isDataLoading: boolean;
  dataError: string | null;
  isMutating: boolean;
  activeModule: AdminModuleId;
  setActiveModule: (mod: AdminModuleId) => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  focusedEntityId: string | null;
  setFocusedEntityId: (id: string | null) => void;
  periodFilter: DatePeriodFilter;
  setPeriodFilter: (filter: DatePeriodFilter) => void;
  snapshot: AdminSnapshot;
  notices: ToastNotice[];
  dismissNotice: (id: string) => void;
  notify: (type: ToastNotice['type'], message: string) => void;
  can: (permission: PermissionKey) => boolean;
  canOpenModule: (moduleId: AdminModuleId) => boolean;
  recheckBackendConnection: () => Promise<BackendConnectionStatus>;
  reloadData: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordRecovery: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  uploadProductMedia: (file: File, skuOrDraft: string) => Promise<ProductMedia>;
  upsertProduct: (payload: UpsertProductPayload) => Promise<void>;
  setProductStatus: (productId: string, status: ProductStatus) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  assignProductToCategory: (productId: string, categoryId: string) => Promise<void>;
  upsertCategory: (payload: UpsertCategoryPayload) => Promise<void>;
  toggleCategoryActive: (categoryId: string, isActive: boolean) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  updateOrderStatusAndAttendance: (
    orderId: string,
    nextStatus: OrderStatus,
    paymentStatus: PaymentStatus,
    whatsappOutcome: WhatsAppAttendanceOutcome,
    note: string,
    internalNotes: string
  ) => Promise<void>;
  createManualOrder: (payload: CreateOrderPayload) => Promise<void>;
  upsertCustomer: (payload: UpsertCustomerPayload) => Promise<void>;
  updateCustomerCrm: (
    customerId: string,
    crmStage: CrmStage,
    tagIds: string[],
    internalSummary: string,
    markContactNow: boolean
  ) => Promise<void>;
  addCustomerNote: (
    customerId: string,
    channel: CustomerNote['channel'],
    content: string
  ) => Promise<void>;
  createCustomerTag: (name: string, tone: CustomerTag['tone']) => Promise<void>;
  createCrmTask: (payload: CreateCrmTaskPayload) => Promise<void>;
  updateCrmTaskStatus: (taskId: string, status: CrmTaskStatus) => Promise<void>;
  saveMarketingSettings: (next: Omit<MarketingSettings, 'updatedAt' | 'updatedBy'>) => Promise<void>;
  saveStoreSettings: (next: Omit<StoreSettings, 'updatedAt' | 'currency'>) => Promise<void>;
  updateAdminProfile: (payload: {
    id: string;
    fullName: string;
    phone?: string;
    role: UserRole;
    isActive: boolean;
  }) => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const INITIAL_BACKEND_STATUS: BackendConnectionStatus = {
  state: 'checking',
  isDatabaseConnected: false,
  supabaseUrlConfigured: false,
  supabaseAnonKeyConfigured: false,
  summaryLabel: 'A verificar ligação ao Supabase...',
  detailMessage: 'A validar credenciais públicas, serviço de autenticação e estrutura PostgreSQL.',
};

const INITIAL_SESSION: AuthSessionState = {
  isLoadingAuth: true,
  isAuthenticated: false,
  isPasswordRecoveryMode: false,
  inactiveProfileEmail: null,
  sessionNotice: null,
  userId: '',
  userName: '',
  userEmail: '',
  role: 'crm_agent',
};

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backendStatus, setBackendStatus] = useState<BackendConnectionStatus>(INITIAL_BACKEND_STATUS);
  const [session, setSession] = useState<AuthSessionState>(INITIAL_SESSION);
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(() => createEmptyAdminSnapshot());
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [activeModule, setActiveModuleState] = useState<AdminModuleId>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<DatePeriodFilter>({ preset: '30d' });
  const [notices, setNotices] = useState<ToastNotice[]>([]);

  const hadAuthenticatedSessionRef = useRef(false);
  const suppressNextSignOutResetRef = useRef(false);
  const manualSignInInFlightRef = useRef(false);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback((type: ToastNotice['type'], message: string) => {
    const id = `nt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setNotices([{ id, type, message }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, 3400);
  }, []);

  const recheckBackendConnection = useCallback(async () => {
    const status = await probeSupabaseConnection();
    setBackendStatus(status);
    return status;
  }, []);

  const loadSnapshotForActor = useCallback(async (actor: ServiceActor) => {
    const client = await getSupabaseClient();
    if (!client) return;
    setIsDataLoading(true);
    setDataError(null);
    try {
      const next = await fetchAdminSnapshot(client, actor);
      setSnapshot(next);
    } catch (err: unknown) {
      setDataError(mapSupabaseErrorPt(err));
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  const hydrateUserProfile = useCallback(
    async (userId: string, userEmail: string, recoveryMode = false): Promise<boolean> => {
      const client = await getSupabaseClient();
      if (!client) {
        setSession({
          ...INITIAL_SESSION,
          isLoadingAuth: false,
        });
        return false;
      }

      const { data: profileRow, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setSession({
          ...INITIAL_SESSION,
          isLoadingAuth: false,
          sessionNotice: mapSupabaseErrorPt(error),
        });
        return false;
      }

      if (!profileRow || !profileRow.is_active) {
        // Bloqueia contas inativas ou não autorizadas sem escalar privilégios e preserva o aviso na UI
        suppressNextSignOutResetRef.current = true;
        await client.auth.signOut();
        setSnapshot(createEmptyAdminSnapshot());
        setSession({
          ...INITIAL_SESSION,
          isLoadingAuth: false,
          inactiveProfileEmail: userEmail,
          sessionNotice:
            'A tua conta está autenticada, mas ainda não foi ativada por um Superadministrador na tabela profiles (is_active = false).',
        });
        return false;
      }

      const role = (profileRow.role as UserRole) || 'crm_agent';
      const fullName = String(profileRow.full_name || userEmail);

      // Atualiza registo silencioso de última atividade
      void client
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', userId);

      hadAuthenticatedSessionRef.current = true;
      setSession({
        isLoadingAuth: false,
        isAuthenticated: true,
        isPasswordRecoveryMode: recoveryMode,
        inactiveProfileEmail: null,
        sessionNotice: null,
        userId,
        userName: fullName,
        userEmail: String(profileRow.email || userEmail),
        role,
      });

      await loadSnapshotForActor({ id: userId, name: fullName, role });
      return true;
    },
    [loadSnapshotForActor]
  );

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function bootstrap() {
      const status = await probeSupabaseConnection();
      if (!mounted) return;
      setBackendStatus(status);

      const client = await getSupabaseClient();
      if (!client || status.state !== 'ready') {
        if (mounted) {
          setSession((prev) => ({ ...prev, isLoadingAuth: false }));
        }
        return;
      }

      const { data: sessionData } = await client.auth.getSession();
      if (!mounted) return;

      if (sessionData.session?.user) {
        await hydrateUserProfile(
          sessionData.session.user.id,
          sessionData.session.user.email || ''
        );
      } else {
        setSession((prev) => ({ ...prev, isLoadingAuth: false }));
      }

      const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY' && nextSession?.user) {
          setSession((prev) => ({
            ...prev,
            isLoadingAuth: false,
            isPasswordRecoveryMode: true,
            userId: nextSession.user.id,
            userEmail: nextSession.user.email || '',
          }));
          return;
        }

        if (event === 'SIGNED_OUT') {
          if (suppressNextSignOutResetRef.current) {
            suppressNextSignOutResetRef.current = false;
            return;
          }
          const expiredMsg = hadAuthenticatedSessionRef.current
            ? 'Sessão terminada. Inicia sessão novamente para aceder ao painel.'
            : null;
          hadAuthenticatedSessionRef.current = false;
          setSnapshot(createEmptyAdminSnapshot());
          setSession({
            ...INITIAL_SESSION,
            isLoadingAuth: false,
            sessionNotice: expiredMsg,
          });
          return;
        }

        if (event === 'SIGNED_IN' && manualSignInInFlightRef.current) {
          return;
        }

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && nextSession?.user) {
          void hydrateUserProfile(nextSession.user.id, nextSession.user.email || '');
        }
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    }

    void bootstrap();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [hydrateUserProfile]);

  const actor: ServiceActor = {
    id: session.userId,
    name: session.userName,
    role: session.role,
  };

  const reloadData = useCallback(async () => {
    if (!session.isAuthenticated || !session.userId) return;
    await loadSnapshotForActor({
      id: session.userId,
      name: session.userName,
      role: session.role,
    });
  }, [loadSnapshotForActor, session.isAuthenticated, session.role, session.userId, session.userName]);

  const setActiveModule = (mod: AdminModuleId) => {
    setNotices([]);
    setActiveModuleState(mod);
  };

  const signInWithPassword = async (email: string, password: string) => {
    const status = await recheckBackendConnection();
    if (status.state !== 'ready') {
      throw new Error(status.detailMessage);
    }

    const client = await getSupabaseClient();
    if (!client) {
      throw new Error('Cliente Supabase não configurado. Define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
    }

    manualSignInInFlightRef.current = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw new Error(mapSupabaseErrorPt(error));
      }

      if (data.user) {
        const activated = await hydrateUserProfile(
          data.user.id,
          data.user.email || email.trim().toLowerCase()
        );
        if (activated) {
          setActiveModuleState('dashboard');
        }
      }
    } finally {
      manualSignInInFlightRef.current = false;
    }
  };

  const requestPasswordReset = async (email: string) => {
    const status = await recheckBackendConnection();
    if (status.state === 'missing_env' || status.state === 'security_blocked') {
      throw new Error(status.detailMessage);
    }

    const client = await getSupabaseClient();
    if (!client) {
      throw new Error('Cliente Supabase não configurado.');
    }

    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });
    if (error) {
      throw new Error(mapSupabaseErrorPt(error));
    }
  };

  const completePasswordRecovery = async (newPassword: string) => {
    if (newPassword.length < 8) {
      throw new Error('A nova palavra-passe deve ter pelo menos 8 caracteres.');
    }
    const client = await getSupabaseClient();
    if (!client) throw new Error('Cliente Supabase indisponível.');

    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw new Error(mapSupabaseErrorPt(error));

    setSession((prev) => ({ ...prev, isPasswordRecoveryMode: false }));
    if (data.user) {
      await hydrateUserProfile(data.user.id, data.user.email || '');
      notify('success', 'Palavra-passe atualizada com sucesso.');
    }
  };

  const signOut = async () => {
    hadAuthenticatedSessionRef.current = false;
    const client = await getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
    setSnapshot(createEmptyAdminSnapshot());
    setSession({
      ...INITIAL_SESSION,
      isLoadingAuth: false,
    });
  };

  const runMutation = async <T,>(
    work: (client: SupabaseClient) => Promise<T>,
    successMsg?: string
  ): Promise<T> => {
    if (!session.isAuthenticated || !session.userId) {
      throw new Error('Sessão inválida ou expirada. Inicia sessão novamente.');
    }
    const client = await getSupabaseClient();
    if (!client) {
      throw new Error('Ligação ao Supabase indisponível.');
    }

    setIsMutating(true);
    try {
      const result = await work(client);
      await loadSnapshotForActor(actor);
      if (successMsg) notify('success', successMsg);
      return result;
    } finally {
      setIsMutating(false);
    }
  };

  const value: AdminContextValue = {
    session,
    backendStatus,
    isDataLoading,
    dataError,
    isMutating,
    activeModule,
    setActiveModule,
    globalSearch,
    setGlobalSearch,
    focusedEntityId,
    setFocusedEntityId,
    periodFilter,
    setPeriodFilter,
    snapshot,
    notices,
    dismissNotice,
    notify,
    can: (permission) => session.isAuthenticated && hasPermission(session.role, permission),
    canOpenModule: (moduleId) => session.isAuthenticated && canAccessModule(session.role, moduleId),
    recheckBackendConnection,
    reloadData,
    signInWithPassword,
    requestPasswordReset,
    completePasswordRecovery,
    signOut,
    uploadProductMedia: async (file, skuOrDraft) => {
      const client = await getSupabaseClient();
      if (!client || !session.isAuthenticated) {
        throw new Error('Sessão administrativa necessária para enviar ficheiros para o Storage.');
      }
      return uploadProductMediaToStorage(client, file, skuOrDraft, actor);
    },
    upsertProduct: (payload) =>
      runMutation(
        (client) => upsertProductDb(client, payload, actor),
        payload.id ? 'Produto atualizado no Supabase.' : 'Produto criado no catálogo.'
      ),
    setProductStatus: (productId, status) => {
      const target = snapshot.products.find((p) => p.id === productId);
      const label = status === 'active' ? 'ativado' : status === 'inactive' ? 'desativado' : 'arquivado';
      return runMutation(
        (client) => setProductStatusDb(client, productId, target?.sku || productId, status, actor),
        `Produto ${label} com sucesso.`
      );
    },
    deleteProduct: (productId) => {
      const target = snapshot.products.find((p) => p.id === productId);
      return runMutation(
        (client) =>
          deleteProductDb(
            client,
            productId,
            target?.name || 'Produto',
            target?.sku || productId,
            actor
          ),
        'Produto eliminado definitivamente do catálogo.'
      );
    },
    assignProductToCategory: (productId, categoryId) => {
      const cat = snapshot.categories.find((c) => c.id === categoryId);
      return runMutation(
        (client) => assignProductToCategoryDb(client, productId, categoryId, cat?.name || categoryId, actor),
        'Produto associado à categoria.'
      );
    },
    upsertCategory: (payload) =>
      runMutation(
        (client) => upsertCategoryDb(client, payload, actor),
        payload.id ? 'Categoria atualizada.' : 'Categoria criada.'
      ),
    toggleCategoryActive: (categoryId, isActive) => {
      const cat = snapshot.categories.find((c) => c.id === categoryId);
      return runMutation(
        (client) => toggleCategoryActiveDb(client, categoryId, cat?.name || categoryId, isActive, actor),
        isActive ? 'Categoria ativada.' : 'Categoria desativada.'
      );
    },
    deleteCategory: (categoryId) => {
      const cat = snapshot.categories.find((c) => c.id === categoryId);
      return runMutation(
        (client) => deleteCategoryDb(client, categoryId, cat?.name || categoryId, actor),
        'Categoria vazia eliminada.'
      );
    },
    updateOrderStatusAndAttendance: (
      orderId,
      nextStatus,
      paymentStatus,
      whatsappOutcome,
      note,
      internalNotes
    ) =>
      runMutation(
        (client) =>
          updateOrderStatusAndAttendanceDb(
            client,
            orderId,
            nextStatus,
            paymentStatus,
            whatsappOutcome,
            note,
            internalNotes,
            actor
          ),
        'Encomenda, pagamento e CRM atualizados.'
      ),
    createManualOrder: (payload) =>
      runMutation(
        (client) =>
          createManualOrderDb(
            client,
            {
              ...payload,
              orderPrefix: snapshot.storeSettings.orderCodePrefix || 'BRC-2026-',
            },
            actor
          ),
        'Encomenda registada e cliente sincronizado no CRM.'
      ),
    upsertCustomer: (payload) =>
      runMutation(
        (client) => upsertCustomerDb(client, payload, actor),
        payload.id ? 'Dados do cliente atualizados.' : 'Cliente registado sem duplicação.'
      ),
    updateCustomerCrm: (customerId, crmStage, tagIds, internalSummary, markContactNow) => {
      const cust = snapshot.customers.find((c) => c.id === customerId);
      return runMutation(
        (client) =>
          updateCustomerCrmDb(
            client,
            customerId,
            cust?.name || customerId,
            crmStage,
            tagIds,
            internalSummary,
            markContactNow,
            actor
          ),
        'Estado de relacionamento CRM atualizado.'
      );
    },
    addCustomerNote: (customerId, channel, content) => {
      const cust = snapshot.customers.find((c) => c.id === customerId);
      return runMutation(
        (client) => addCustomerNoteDb(client, customerId, cust?.name || customerId, channel, content, actor),
        'Nota de acompanhamento guardada no histórico.'
      );
    },
    createCustomerTag: (name, tone) =>
      runMutation(
        (client) => createCustomerTagDb(client, name, tone, actor),
        'Nova etiqueta personalizada criada.'
      ),
    createCrmTask: (payload) =>
      runMutation(
        (client) => createCrmTaskDb(client, payload, actor),
        'Tarefa de acompanhamento agendada.'
      ),
    updateCrmTaskStatus: (taskId, status) => {
      const task = snapshot.crmTasks.find((t) => t.id === taskId);
      return runMutation(
        (client) => updateCrmTaskStatusDb(client, taskId, task?.title || taskId, status, actor),
        status === 'completed' ? 'Tarefa marcada como concluída.' : 'Estado da tarefa atualizado.'
      );
    },
    saveMarketingSettings: (next) =>
      runMutation(
        (client) => saveMarketingSettingsDb(client, next, actor),
        'Configuração do Meta Pixel guardada no Supabase.'
      ),
    saveStoreSettings: (next) =>
      runMutation(
        (client) => saveStoreSettingsDb(client, next, actor),
        'Configurações gerais guardadas no Supabase.'
      ),
    updateAdminProfile: (payload) =>
      runMutation(
        (client) => updateAdminProfileDb(client, payload, actor),
        'Perfil administrativo atualizado.'
      ),
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin deve ser usado dentro de AdminProvider');
  return ctx;
}
