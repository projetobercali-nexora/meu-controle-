import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaStoreState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  isIOS: boolean;
  isOnline: boolean;
  updateAvailable: boolean;
}

const listeners = new Set<() => void>();

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

const pwaState: PwaStoreState = {
  deferredPrompt: null,
  isInstalled: detectStandalone(),
  isIOS: detectIOS(),
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  updateAvailable: false,
};

let updateServiceWorkerFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let initialized = false;

function notifyPwaListeners(): void {
  for (const fn of listeners) {
    fn();
  }
}

export function initPwaLifecycle(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  pwaState.isInstalled = detectStandalone();
  pwaState.isIOS = detectIOS();
  pwaState.isOnline = navigator.onLine;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    pwaState.deferredPrompt = e as BeforeInstallPromptEvent;
    notifyPwaListeners();
  });

  window.addEventListener('appinstalled', () => {
    pwaState.isInstalled = true;
    pwaState.deferredPrompt = null;
    notifyPwaListeners();
  });

  window.addEventListener('online', () => {
    pwaState.isOnline = true;
    notifyPwaListeners();
  });

  window.addEventListener('offline', () => {
    pwaState.isOnline = false;
    notifyPwaListeners();
  });

  const displayMedia = window.matchMedia('(display-mode: standalone)');
  if (typeof displayMedia.addEventListener === 'function') {
    displayMedia.addEventListener('change', (ev) => {
      if (ev.matches) {
        pwaState.isInstalled = true;
        pwaState.deferredPrompt = null;
        notifyPwaListeners();
      }
    });
  }

  try {
    updateServiceWorkerFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        pwaState.updateAvailable = true;
        notifyPwaListeners();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Verifica novas versões ao regressar à aplicação
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void registration.update().catch(() => undefined);
          }
        });
      },
    });
  } catch {
    // Ignora caso Service Worker seja bloqueado num contexto restrito
  }
}

// Captura imediata ao importar o módulo para nunca perder beforeinstallprompt no arranque
if (typeof window !== 'undefined') {
  initPwaLifecycle();
}

export function usePwaStatus() {
  const [snap, setSnap] = useState<PwaStoreState>(() => ({ ...pwaState }));

  useEffect(() => {
    initPwaLifecycle();
    const sync = () => setSnap({ ...pwaState });
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!pwaState.deferredPrompt) {
      return 'unavailable';
    }
    const promptEvent = pwaState.deferredPrompt;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      pwaState.isInstalled = true;
      pwaState.deferredPrompt = null;
    }
    notifyPwaListeners();
    return outcome;
  }, []);

  const applyUpdate = useCallback(async () => {
    pwaState.updateAvailable = false;
    notifyPwaListeners();
    if (updateServiceWorkerFn) {
      await updateServiceWorkerFn(true);
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    pwaState.updateAvailable = false;
    notifyPwaListeners();
  }, []);

  return {
    canInstall: Boolean(snap.deferredPrompt) && !snap.isInstalled,
    isInstalled: snap.isInstalled,
    isIOS: snap.isIOS,
    isOnline: snap.isOnline,
    updateAvailable: snap.updateAvailable,
    promptInstall,
    applyUpdate,
    dismissUpdate,
  };
}
