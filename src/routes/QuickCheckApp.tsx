import { useTranslation } from '../i18n/useTranslation';
import { QuickCheckBody } from '../components/QuickCheck';
import { InstallPrompt } from '../components/InstallPrompt';
import { LangSwitcher } from '../components/LangSwitcher';

export function QuickCheckApp() {
  const { t } = useTranslation();
  const baseUrl = import.meta.env.BASE_URL;
  const standalone =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

  return (
    <div className="min-h-screen bg-surface-alt">
      <header className="sticky top-0 z-30 bg-white/90 shadow-sm shadow-ink/5 backdrop-blur-md">
        <div className="container-page flex h-14 items-center justify-between">
          <a href={baseUrl} className="text-base font-bold text-brand">
            {t('brand', 'Dr. Kyana')}
          </a>
          <div className="flex items-center gap-3">
            <LangSwitcher />
            {!standalone && (
              <a href={baseUrl} className="text-sm font-medium text-muted hover:text-brand">
                ← {t('quickCheck.pwa.back')}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="container-page py-10 md:py-14">
        <div className="mx-auto max-w-xl space-y-6">
          <InstallPrompt />
          <p className="text-xs text-muted">{t('quickCheck.pwa.privacy')}</p>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-ink/5 md:p-8">
            <QuickCheckBody />
          </div>
        </div>
      </main>
    </div>
  );
}
