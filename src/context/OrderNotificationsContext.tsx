import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import { formatKwanza } from '../utils/formatters';
import {
  AudioUnlockState,
  filterMissedOrdersSince,
  getAudioUnlockState,
  IncomingOrderSummary,
  loadNotificationPreferences,
  markAllNotificationItemsRead,
  markNotificationItemRead,
  mergeIncomingOrderNotifications,
  NotificationMelodyId,
  NotificationPreferences,
  OrderNotificationItem,
  playNotificationMelody,
  saveNotificationPreferences,
  subscribeAudioUnlockState,
  unlockNotificationAudio,
} from '../utils/orderNotifications';
import { useAdmin } from './AdminContext';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';
export type RealtimeSubscriptionState = 'disabled' | 'connecting' | 'subscribed' | 'reconnecting';

interface OrderNotificationsContextValue {
  hasOrdersAccess: boolean;
  prefs: NotificationPreferences;
  updatePrefs: (patch: Partial<NotificationPreferences>) => void;
  audioState: AudioUnlockState;
  browserPermission: BrowserNotificationPermission;
  realtimeState: RealtimeSubscriptionState;
  notifications: OrderNotificationItem[];
  unreadCount: number;
  activateSoundAndPermissions: () => Promise<{ audioUnlocked: boolean; permission: BrowserNotificationPermission }>;
  previewMelody: (melody: NotificationMelodyId, volumeOverride?: number) => Promise<boolean>;
  triggerTestNotification: () => Promise<void>;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const OrderNotificationsContext = createContext<OrderNotificationsContextValue | null>(null);

function detectBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function getUserNotifStorageKey(userId: string): string {
  return `bercali_admin_order_notifs_v1_${userId}`;
}

interface StoredUserNotifData {
  items: OrderNotificationItem[];
  notifiedIds: string[];
  lastCheckedIso: string | null;
}

function readStoredUserNotifs(userId: string): StoredUserNotifData {
  if (!userId || typeof window === 'undefined' || !window.localStorage) {
    return { items: [], notifiedIds: [], lastCheckedIso: null };
  }
  try {
    const raw = window.localStorage.getItem(getUserNotifStorageKey(userId));
    if (!raw) return { items: [], notifiedIds: [], lastCheckedIso: null };
    const parsed = JSON.parse(raw) as Partial<StoredUserNotifData>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notifiedIds: Array.isArray(parsed.notifiedIds) ? parsed.notifiedIds : [],
      lastCheckedIso: typeof parsed.lastCheckedIso === 'string' ? parsed.lastCheckedIso : null,
    };
  } catch {
    return { items: [], notifiedIds: [], lastCheckedIso: null };
  }
}

function writeStoredUserNotifs(userId: string, data: StoredUserNotifData): void {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getUserNotifStorageKey(userId), JSON.stringify(data));
  } catch {
    // Ignora falha de quota em modo privado
  }
}

export const OrderNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    session,
    snapshot,
    can,
    canOpenModule,
    notify,
    reloadData,
    setActiveModule,
    setFocusedEntityId,
  } = useAdmin();

  const hasOrdersAccess =
    session.isAuthenticated &&
    !session.isPasswordRecoveryMode &&
    Boolean(session.userId) &&
    canOpenModule('orders');

  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    loadNotificationPreferences()
  );
  const [audioState, setAudioState] = useState<AudioUnlockState>(() =>
    getAudioUnlockState()
  );
  const [browserPermission, setBrowserPermission] = useState<BrowserNotificationPermission>(
    () => detectBrowserNotificationPermission()
  );
  const [realtimeState, setRealtimeState] = useState<RealtimeSubscriptionState>('disabled');
  const [notifications, setNotifications] = useState<OrderNotificationItem[]>([]);

  const prefsRef = useRef<NotificationPreferences>(prefs);
  prefsRef.current = prefs;

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const lastCheckedIsoRef = useRef<string>(new Date().toISOString());
  const initialOrdersSeededForUserRef = useRef<string>('');
  const catchUpInFlightRef = useRef(false);

  // Sincroniza estado do AudioContext + desbloqueia automaticamente no primeiro gesto se o som estiver ativo
  useEffect(() => {
    const unsub = subscribeAudioUnlockState((next) => setAudioState(next));
    setBrowserPermission(detectBrowserNotificationPermission());

    const handleGestureUnlock = () => {
      if (prefsRef.current.enabled && prefsRef.current.soundEnabled && getAudioUnlockState() === 'locked') {
        void unlockNotificationAudio();
      }
    };

    window.addEventListener('pointerdown', handleGestureUnlock, { passive: true });
    window.addEventListener('keydown', handleGestureUnlock, { passive: true });

    return () => {
      unsub();
      window.removeEventListener('pointerdown', handleGestureUnlock);
      window.removeEventListener('keydown', handleGestureUnlock);
    };
  }, []);

  // Carrega histórico local do utilizador autenticado com acesso a encomendas
  useEffect(() => {
    if (!hasOrdersAccess) {
      setNotifications([]);
      notifiedIdsRef.current = new Set();
      initialOrdersSeededForUserRef.current = '';
      setRealtimeState('disabled');
      return;
    }

    const stored = readStoredUserNotifs(session.userId);
    setNotifications(stored.items);
    notifiedIdsRef.current = new Set(stored.notifiedIds);
    lastCheckedIsoRef.current = stored.lastCheckedIso || new Date().toISOString();
  }, [hasOrdersAccess, session.userId]);

  // Regista encomendas iniciais já existentes no arranque da sessão para não disparar falsos alertas históricos
  useEffect(() => {
    if (!hasOrdersAccess || snapshot.orders.length === 0) return;
    if (initialOrdersSeededForUserRef.current === session.userId) return;

    initialOrdersSeededForUserRef.current = session.userId;
    for (const ord of snapshot.orders) {
      notifiedIdsRef.current.add(ord.id);
      if (ord.createdAt && ord.createdAt > lastCheckedIsoRef.current) {
        lastCheckedIsoRef.current = ord.createdAt;
      }
    }
    writeStoredUserNotifs(session.userId, {
      items: notifications,
      notifiedIds: Array.from(notifiedIdsRef.current).slice(-300),
      lastCheckedIso: lastCheckedIsoRef.current,
    });
  }, [hasOrdersAccess, notifications, session.userId, snapshot.orders]);

  const dispatchBrowserNotification = useCallback(
    (title: string, body: string, orderId?: string) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      try {
        const n = new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: orderId ? `bercali-order-${orderId}` : `bercali-test-${Date.now()}`,
        });
        n.onclick = () => {
          window.focus();
          if (orderId) {
            setFocusedEntityId(orderId);
            setActiveModule('orders');
          }
          n.close();
        };
      } catch {
        // Fallback para ServiceWorkerRegistration.showNotification em dispositivos móveis Android PWA
        if ('serviceWorker' in navigator) {
          void navigator.serviceWorker.ready
            .then((reg) =>
              reg.showNotification(title, {
                body,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                tag: orderId ? `bercali-order-${orderId}` : `bercali-test-${Date.now()}`,
              })
            )
            .catch(() => undefined);
        }
      }
    },
    [setActiveModule, setFocusedEntityId]
  );

  const resolveCustomerName = useCallback(
    async (customerId: string | null | undefined): Promise<string> => {
      if (!customerId) return 'Cliente Registado';
      const cached = snapshotRef.current.customers.find((c) => c.id === customerId);
      if (cached?.name) return cached.name;

      if (!can('customers:view')) {
        return 'Cliente Registado';
      }

      try {
        const client = await getSupabaseClient();
        if (!client) return 'Cliente Registado';
        const { data } = await client
          .from('customers')
          .select('full_name')
          .eq('id', customerId)
          .maybeSingle();
        if (data && typeof data.full_name === 'string' && data.full_name.trim()) {
          return data.full_name.trim();
        }
      } catch {
        // Mantém nome genérico caso falhe a leitura pontual
      }
      return 'Novo Cliente';
    },
    [can]
  );

  const processIncomingOrders = useCallback(
    async (incoming: IncomingOrderSummary[], options?: { forceBrowserNotify?: boolean }) => {
      if (!hasOrdersAccess || incoming.length === 0) return;

      const currentPrefs = prefsRef.current;
      let addedItems: OrderNotificationItem[] = [];

      setNotifications((prev) => {
        const merged = mergeIncomingOrderNotifications(
          prev,
          notifiedIdsRef.current,
          incoming
        );
        addedItems = merged.newlyAdded;
        notifiedIdsRef.current = new Set(merged.nextNotifiedIds);

        for (const item of incoming) {
          if (!item.isTest && item.createdAt && item.createdAt > lastCheckedIsoRef.current) {
            lastCheckedIsoRef.current = item.createdAt;
          }
        }

        if (addedItems.length > 0) {
          writeStoredUserNotifs(session.userId, {
            items: merged.nextList,
            notifiedIds: merged.nextNotifiedIds,
            lastCheckedIso: lastCheckedIsoRef.current,
          });
        }

        return currentPrefs.enabled ? merged.nextList : prev;
      });

      if (!currentPrefs.enabled || addedItems.length === 0) {
        return;
      }

      const latest = addedItems[addedItems.length - 1];
      const toastMsg =
        addedItems.length === 1
          ? `Nova encomenda ${latest.orderCode} · ${latest.customerName} (${formatKwanza(latest.totalKz)})`
          : `${addedItems.length} novas encomendas recebidas (última: ${latest.orderCode} · ${latest.customerName})`;

      notify('info', toastMsg);

      if (currentPrefs.soundEnabled && currentPrefs.volume > 0) {
        void playNotificationMelody(currentPrefs.melody, currentPrefs.volume);
      }

      const isBackground =
        typeof document !== 'undefined' && document.visibilityState !== 'visible';
      if (isBackground || options?.forceBrowserNotify) {
        dispatchBrowserNotification(
          addedItems.length === 1
            ? `Nova encomenda · ${latest.orderCode}`
            : `${addedItems.length} novas encomendas — Bercali Store`,
          `${latest.customerName} · ${formatKwanza(latest.totalKz)}`,
          latest.isTest ? undefined : latest.orderId
        );
      }
    },
    [dispatchBrowserNotification, hasOrdersAccess, notify, session.userId]
  );

  // Recupera encomendas entradas enquanto a app esteve em segundo plano ou sem rede
  const catchUpMissedOrders = useCallback(async () => {
    if (!hasOrdersAccess || catchUpInFlightRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    catchUpInFlightRef.current = true;
    try {
      const client = await getSupabaseClient();
      if (!client) return;

      const sinceIso = lastCheckedIsoRef.current;
      const { data, error } = await client
        .from('orders')
        .select('id, order_number, customer_id, total_amount, source, created_at')
        .gt('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .limit(25);

      if (error || !data || data.length === 0) {
        return;
      }

      const rawMapped = data.map((row: Record<string, unknown>) => ({
        id: String(row.id || ''),
        orderNumber: String(row.order_number || ''),
        customerId: row.customer_id ? String(row.customer_id) : null,
        totalKz: Math.round(Number(row.total_amount || 0)),
        origin: String(row.source || 'website'),
        createdAt: String(row.created_at || new Date().toISOString()),
      }));

      const missed = filterMissedOrdersSince(
        rawMapped,
        sinceIso,
        notifiedIdsRef.current
      );

      const newestCreatedAt = rawMapped[rawMapped.length - 1]?.createdAt;
      if (newestCreatedAt && newestCreatedAt > lastCheckedIsoRef.current) {
        lastCheckedIsoRef.current = newestCreatedAt;
      }

      if (missed.length > 0) {
        const summaries: IncomingOrderSummary[] = [];
        for (const m of missed) {
          const customerName = await resolveCustomerName(m.customerId);
          summaries.push({
            id: m.id,
            code: m.orderNumber,
            customerName,
            totalKz: m.totalKz,
            origin: m.origin,
            createdAt: m.createdAt,
          });
        }
        await processIncomingOrders(summaries);
        await reloadData();
      }
    } catch {
      // Silencia falha temporária de rede; nova tentativa ocorre ao voltar online
    } finally {
      catchUpInFlightRef.current = false;
    }
  }, [hasOrdersAccess, processIncomingOrders, reloadData, resolveCustomerName]);

  // Subscrição Supabase Realtime a INSERT em public.orders com reconexão automática
  useEffect(() => {
    if (!hasOrdersAccess) {
      setRealtimeState('disabled');
      return;
    }

    let cancelled = false;
    let activeChannel: RealtimeChannel | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const teardownChannel = async () => {
      const ch = activeChannel;
      activeChannel = null;
      if (!ch) return;
      const client = await getSupabaseClient();
      if (client) {
        await client.removeChannel(ch).catch(() => undefined);
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) return;
      setRealtimeState('reconnecting');
      const delayMs = Math.min(25000, 2500 * Math.pow(1.8, attempt));
      attempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) {
          void connectRealtime();
        }
      }, delayMs);
    };

    const connectRealtime = async () => {
      if (cancelled) return;
      await teardownChannel();
      if (cancelled) return;

      const client = await getSupabaseClient();
      if (!client || cancelled) return;

      setRealtimeState(attempt > 0 ? 'reconnecting' : 'connecting');

      const channelName = `bercali-orders-rt-${session.userId}-${Date.now()}`;
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
          },
          (payload) => {
            if (cancelled) return;
            const row = (payload.new || {}) as Record<string, unknown>;
            const orderId = String(row.id || '');
            if (!orderId) return;

            const orderCode = String(row.order_number || 'Nova encomenda');
            const customerId = row.customer_id ? String(row.customer_id) : null;
            const totalKz = Math.round(Number(row.total_amount || 0));
            const origin = String(row.source || 'website');
            const createdAt = String(row.created_at || new Date().toISOString());

            void (async () => {
              const customerName = await resolveCustomerName(customerId);
              await processIncomingOrders([
                {
                  id: orderId,
                  code: orderCode,
                  customerName,
                  totalKz,
                  origin,
                  createdAt,
                },
              ]);
              await reloadData();
            })();
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            attempt = 0;
            setRealtimeState('subscribed');
            // Ao reconectar, verifica se alguma encomenda entrou durante a quebra
            void catchUpMissedOrders();
          } else if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            scheduleReconnect();
          }
        });

      activeChannel = channel;
    };

    void connectRealtime();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void catchUpMissedOrders();
      }
    };

    const handleOnline = () => {
      clearReconnectTimer();
      attempt = 0;
      void connectRealtime();
      void catchUpMissedOrders();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      void teardownChannel();
    };
  }, [catchUpMissedOrders, hasOrdersAccess, processIncomingOrders, reloadData, resolveCustomerName, session.userId]);

  const updatePrefs = useCallback((patch: Partial<NotificationPreferences>) => {
    setPrefs((prev) => saveNotificationPreferences({ ...prev, ...patch }));
  }, []);

  const activateSoundAndPermissions = useCallback(async () => {
    const audioUnlocked = await unlockNotificationAudio();
    let permission = detectBrowserNotificationPermission();

    if (typeof window !== 'undefined' && 'Notification' in window && permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = detectBrowserNotificationPermission();
      }
    }

    setBrowserPermission(permission);
    setAudioState(getAudioUnlockState());

    if (audioUnlocked && prefsRef.current.volume > 0) {
      await playNotificationMelody(prefsRef.current.melody, prefsRef.current.volume);
    }

    return { audioUnlocked, permission };
  }, []);

  const previewMelody = useCallback(
    async (melody: NotificationMelodyId, volumeOverride?: number) => {
      await unlockNotificationAudio();
      const vol = volumeOverride ?? prefsRef.current.volume;
      return playNotificationMelody(melody, Math.max(10, vol));
    },
    []
  );

  const triggerTestNotification = useCallback(async () => {
    await unlockNotificationAudio();
    setBrowserPermission(detectBrowserNotificationPermission());

    const nowIso = new Date().toISOString();
    const testSummary: IncomingOrderSummary = {
      id: `${Date.now()}`,
      code: `${snapshotRef.current.storeSettings.orderCodePrefix || 'BRC-2026-'}TESTE`,
      customerName: 'Cliente de Demonstração (Teste)',
      totalKz: 45000,
      origin: 'website',
      createdAt: nowIso,
      isTest: true,
    };

    // Mesmo que notificações estejam desligadas, se clicou em Testar, avisa ou executa
    if (!prefsRef.current.enabled) {
      notify(
        'info',
        'As notificações estão desativadas neste aparelho. Ativa o interruptor acima para receber alertas.'
      );
      return;
    }

    await processIncomingOrders([testSummary], { forceBrowserNotify: true });
  }, [notify, processIncomingOrders]);

  const markAsRead = useCallback(
    (notificationId: string) => {
      setNotifications((prev) => {
        const next = markNotificationItemRead(prev, notificationId);
        if (session.userId) {
          writeStoredUserNotifs(session.userId, {
            items: next,
            notifiedIds: Array.from(notifiedIdsRef.current).slice(-300),
            lastCheckedIso: lastCheckedIsoRef.current,
          });
        }
        return next;
      });
    },
    [session.userId]
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = markAllNotificationItemsRead(prev);
      if (session.userId) {
        writeStoredUserNotifs(session.userId, {
          items: next,
          notifiedIds: Array.from(notifiedIdsRef.current).slice(-300),
          lastCheckedIso: lastCheckedIsoRef.current,
        });
      }
      return next;
    });
  }, [session.userId]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    if (session.userId) {
      writeStoredUserNotifs(session.userId, {
        items: [],
        notifiedIds: Array.from(notifiedIdsRef.current).slice(-300),
        lastCheckedIso: lastCheckedIsoRef.current,
      });
    }
  }, [session.userId]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value: OrderNotificationsContextValue = {
    hasOrdersAccess,
    prefs,
    updatePrefs,
    audioState,
    browserPermission,
    realtimeState,
    notifications,
    unreadCount,
    activateSoundAndPermissions,
    previewMelody,
    triggerTestNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  };

  return (
    <OrderNotificationsContext.Provider value={value}>
      {children}
    </OrderNotificationsContext.Provider>
  );
};

export function useOrderNotifications(): OrderNotificationsContextValue {
  const ctx = useContext(OrderNotificationsContext);
  if (!ctx) {
    throw new Error(
      'useOrderNotifications deve ser usado dentro de OrderNotificationsProvider'
    );
  }
  return ctx;
}
