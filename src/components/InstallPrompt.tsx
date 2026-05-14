import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIosUa = /iPhone|iPad|iPod/.test(ua);
  const msStream = (window as unknown as { MSStream?: unknown }).MSStream;
  return isIosUa && !msStream;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [standalone] = useState<boolean>(() => isStandalone());
  const [ios] = useState<boolean>(() => isIos());

  useEffect(() => {
    if (standalone || ios) return;
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [standalone, ios]);

  if (standalone) return null;

  if (ios) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
        {t('quickCheck.pwa.iosUnsupported')}
      </div>
    );
  }

  if (installed) {
    return (
      <div className="rounded-2xl border border-green-300/60 bg-green-50 p-4 text-sm text-green-900">
        {t('quickCheck.pwa.installed')}
      </div>
    );
  }

  if (!deferred) {
    return (
      <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-brand">
        {t('quickCheck.pwa.chromeOnly')}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void deferred.prompt()}
      className="btn-primary w-full"
    >
      {t('quickCheck.pwa.install')}
    </button>
  );
}
