/**
 * Lógica pura de notificações em tempo real de encomendas + Sintetizador Web Audio API
 * (Zero ficheiros de áudio externos; preferências guardadas por aparelho em localStorage).
 */

export type NotificationMelodyId =
  | 'classic_bell'
  | 'cash_register'
  | 'soft_chime'
  | 'double_alert'
  | 'marimba';

export interface NotificationMelodyOption {
  id: NotificationMelodyId;
  label: string;
  description: string;
}

export const NOTIFICATION_MELODIES: NotificationMelodyOption[] = [
  {
    id: 'classic_bell',
    label: 'Sino clássico',
    description: 'Timbre cristalino de balcão comercial',
  },
  {
    id: 'cash_register',
    label: 'Caixa registadora',
    description: 'Toque duplo metálico de nova venda',
  },
  {
    id: 'soft_chime',
    label: 'Suave',
    description: 'Acorde harmónico discreto e suave',
  },
  {
    id: 'double_alert',
    label: 'Alerta duplo',
    description: 'Pulso duplo nítido de atenção imediata',
  },
  {
    id: 'marimba',
    label: 'Marimba',
    description: 'Arpejo acústico quente em madeira',
  },
];

const VALID_MELODY_IDS = new Set<NotificationMelodyId>(
  NOTIFICATION_MELODIES.map((m) => m.id)
);

export interface NotificationPreferences {
  enabled: boolean;
  soundEnabled: boolean;
  volume: number; // 0 a 100
  melody: NotificationMelodyId;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  soundEnabled: true,
  volume: 80,
  melody: 'classic_bell',
};

export const NOTIFICATION_PREFS_STORAGE_KEY = 'bercali_admin_notification_prefs_v1';

export interface OrderNotificationItem {
  id: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  totalKz: number;
  origin: string;
  createdAt: string;
  receivedAt: string;
  read: boolean;
  isTest?: boolean;
}

export interface IncomingOrderSummary {
  id: string;
  code: string;
  customerName: string;
  totalKz: number;
  origin: string;
  createdAt: string;
  isTest?: boolean;
}

export const MAX_STORED_NOTIFICATIONS = 50;

export function sanitizeNotificationPreferences(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  const enabled =
    typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_NOTIFICATION_PREFERENCES.enabled;
  const soundEnabled =
    typeof obj.soundEnabled === 'boolean'
      ? obj.soundEnabled
      : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled;

  const rawVol = Number(obj.volume);
  const volume = Number.isFinite(rawVol)
    ? Math.max(0, Math.min(100, Math.round(rawVol)))
    : DEFAULT_NOTIFICATION_PREFERENCES.volume;

  const rawMelody = String(obj.melody || '') as NotificationMelodyId;
  const melody = VALID_MELODY_IDS.has(rawMelody)
    ? rawMelody
    : DEFAULT_NOTIFICATION_PREFERENCES.melody;

  return {
    enabled,
    soundEnabled,
    volume,
    melody,
  };
}

export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    return sanitizeNotificationPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): NotificationPreferences {
  const clean = sanitizeNotificationPreferences(prefs);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NOTIFICATION_PREFS_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignora quota exceeded em armazenamento privado
    }
  }
  return clean;
}

/**
 * Integra novas encomendas na lista do sino evitando duplicações por orderId.
 */
export function mergeIncomingOrderNotifications(
  existing: OrderNotificationItem[],
  notifiedOrderIds: Iterable<string>,
  incomingOrders: IncomingOrderSummary[],
  nowIso = new Date().toISOString()
): {
  nextList: OrderNotificationItem[];
  newlyAdded: OrderNotificationItem[];
  nextNotifiedIds: string[];
} {
  const seen = new Set<string>(notifiedOrderIds);
  for (const item of existing) {
    if (!item.isTest) {
      seen.add(item.orderId);
    }
  }

  const newlyAdded: OrderNotificationItem[] = [];

  for (const ord of incomingOrders) {
    if (!ord.id) continue;
    if (!ord.isTest && seen.has(ord.id)) {
      continue;
    }
    if (!ord.isTest) {
      seen.add(ord.id);
    }
    newlyAdded.push({
      id: ord.isTest ? `test-notif-${ ord.id }` : `ord-notif-${ ord.id }`,
      orderId: ord.id,
      orderCode: ord.code || 'Encomenda',
      customerName: ord.customerName || 'Cliente Registado',
      totalKz: Math.max(0, Math.round(Number(ord.totalKz || 0))),
      origin: ord.origin || 'website',
      createdAt: ord.createdAt || nowIso,
      receivedAt: nowIso,
      read: false,
      isTest: Boolean(ord.isTest),
    });
  }

  // Mais recentes primeiro no centro de notificações
  const orderedNew = [...newlyAdded].reverse();
  const nextList = [...orderedNew, ...existing].slice(0, MAX_STORED_NOTIFICATIONS);

  return {
    nextList,
    newlyAdded,
    nextNotifiedIds: Array.from(seen).slice(-300),
  };
}

export function markNotificationItemRead(
  list: OrderNotificationItem[],
  notificationId: string
): OrderNotificationItem[] {
  return list.map((item) =>
    item.id === notificationId ? { ...item, read: true } : item
  );
}

export function markAllNotificationItemsRead(
  list: OrderNotificationItem[]
): OrderNotificationItem[] {
  return list.map((item) => (item.read ? item : { ...item, read: true }));
}

/**
 * Filtra encomendas criadas após `sinceIso` que ainda não tenham sido notificadas,
 * ordenadas da mais antiga para a mais recente.
 */
export function filterMissedOrdersSince<T extends { id: string; createdAt: string }>(
  orders: T[],
  sinceIso: string,
  notifiedOrderIds: Iterable<string>
): T[] {
  const sinceMs = new Date(sinceIso).getTime();
  if (Number.isNaN(sinceMs)) return [];
  const seen = new Set<string>(notifiedOrderIds);

  return orders
    .filter((ord) => {
      if (!ord.id || seen.has(ord.id)) return false;
      const createdMs = new Date(ord.createdAt).getTime();
      return !Number.isNaN(createdMs) && createdMs > sinceMs;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// =============================================================================
// Sintetizador Web Audio API (5 Melodias sem ficheiros externos)
// =============================================================================

export type AudioUnlockState = 'unlocked' | 'locked' | 'unsupported';

let sharedAudioCtx: AudioContext | null = null;
let audioUnlockedFlag = false;
const audioListeners = new Set<(state: AudioUnlockState) => void>();

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || win.webkitAudioContext || null;
}

export function getAudioUnlockState(): AudioUnlockState {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return 'unsupported';
  if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
    return 'unlocked';
  }
  return audioUnlockedFlag ? 'unlocked' : 'locked';
}

function emitAudioState(): void {
  const current = getAudioUnlockState();
  for (const listener of audioListeners) {
    listener(current);
  }
}

export function subscribeAudioUnlockState(
  listener: (state: AudioUnlockState) => void
): () => void {
  audioListeners.add(listener);
  return () => {
    audioListeners.delete(listener);
  };
}

function ensureAudioContext(): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctor();
    sharedAudioCtx.addEventListener('statechange', () => {
      if (sharedAudioCtx?.state === 'running') {
        audioUnlockedFlag = true;
      }
      emitAudioState();
    });
  }
  return sharedAudioCtx;
}

/**
 * Desbloqueia explicitamente o AudioContext através de gesto do utilizador.
 */
export async function unlockNotificationAudio(): Promise<boolean> {
  const ctx = ensureAudioContext();
  if (!ctx) {
    emitAudioState();
    return false;
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Dispara impulso silencioso de 1 frame para desbloquear Safari / Mobile Chrome
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    audioUnlockedFlag = ctx.state === 'running';
    emitAudioState();
    return audioUnlockedFlag;
  } catch {
    emitAudioState();
    return false;
  }
}

interface SynthNoteSpec {
  freq: number;
  startOffset: number;
  duration: number;
  type: OscillatorType;
  peakGain: number;
  endFreq?: number;
}

function getMelodyNotes(melody: NotificationMelodyId): SynthNoteSpec[] {
  switch (melody) {
    case 'classic_bell':
      // Sino clássico: batida cristalina C6 + harmónico G6 -> E6
      return [
        { freq: 1046.5, startOffset: 0, duration: 0.42, type: 'sine', peakGain: 0.75 },
        { freq: 2093.0, startOffset: 0, duration: 0.18, type: 'triangle', peakGain: 0.25 },
        { freq: 1318.51, startOffset: 0.16, duration: 0.52, type: 'sine', peakGain: 0.85 },
      ];

    case 'cash_register':
      // Caixa registadora: clique mecânico curto + sino agudo brilhante ("Ka-Ching!")
      return [
        { freq: 880, startOffset: 0, duration: 0.06, type: 'square', peakGain: 0.28, endFreq: 1174.66 },
        { freq: 1318.51, startOffset: 0.07, duration: 0.08, type: 'triangle', peakGain: 0.5 },
        { freq: 1975.53, startOffset: 0.13, duration: 0.58, type: 'sine', peakGain: 0.85 },
        { freq: 3951.07, startOffset: 0.13, duration: 0.26, type: 'sine', peakGain: 0.22 },
      ];

    case 'soft_chime':
      // Suave: arpejo ascendente F5 -> A5 -> C6 com envelope suave
      return [
        { freq: 698.46, startOffset: 0, duration: 0.32, type: 'sine', peakGain: 0.55 },
        { freq: 880.0, startOffset: 0.12, duration: 0.34, type: 'sine', peakGain: 0.6 },
        { freq: 1046.5, startOffset: 0.24, duration: 0.48, type: 'sine', peakGain: 0.68 },
      ];

    case 'double_alert':
      // Alerta duplo: dois pulsos claros e distintos (A5 -> E6)
      return [
        { freq: 880.0, startOffset: 0, duration: 0.14, type: 'triangle', peakGain: 0.8 },
        { freq: 1174.66, startOffset: 0.02, duration: 0.12, type: 'sine', peakGain: 0.45 },
        { freq: 880.0, startOffset: 0.22, duration: 0.16, type: 'triangle', peakGain: 0.85 },
        { freq: 1318.51, startOffset: 0.24, duration: 0.24, type: 'sine', peakGain: 0.65 },
      ];

    case 'marimba':
      // Marimba: tríade percussiva quente em madeira (G4 -> B4 -> D5 -> G5)
      return [
        { freq: 392.0, startOffset: 0, duration: 0.16, type: 'triangle', peakGain: 0.8 },
        { freq: 493.88, startOffset: 0.09, duration: 0.16, type: 'triangle', peakGain: 0.8 },
        { freq: 587.33, startOffset: 0.18, duration: 0.18, type: 'triangle', peakGain: 0.82 },
        { freq: 783.99, startOffset: 0.27, duration: 0.34, type: 'sine', peakGain: 0.88 },
      ];
  }
}

/**
 * Reproduz a melodia escolhida via Web Audio API respeitando o volume (0-100%).
 */
export async function playNotificationMelody(
  melody: NotificationMelodyId,
  volumePercent: number
): Promise<boolean> {
  const clampedVol = Math.max(0, Math.min(100, Number(volumePercent || 0))) / 100;
  if (clampedVol <= 0.001) return true;

  const ctx = ensureAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') {
      emitAudioState();
      return false;
    }

    audioUnlockedFlag = true;
    emitAudioState();

    const now = ctx.currentTime + 0.01;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(clampedVol * 0.45, now);
    masterGain.connect(ctx.destination);

    const notes = getMelodyNotes(melody);
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const start = now + note.startOffset;
      const stop = start + note.duration;

      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(note.endFreq, stop);
      }

      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.linearRampToValueAtTime(note.peakGain, start + 0.012);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, stop);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(start);
      osc.stop(stop + 0.02);
    }

    return true;
  } catch {
    emitAudioState();
    return false;
  }
}
