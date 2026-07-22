import { useTranslation } from '../i18n/useTranslation';
import { Link } from '../router';

export function Footer() {
  const { t } = useTranslation();
  const linkCls = 'underline-offset-2 hover:text-ink hover:underline';
  return (
    <footer className="border-t border-ink/5 bg-white py-8 text-center text-sm text-muted">
      <div className="container-page flex flex-col gap-3">
        <nav aria-label={t('legal.label', 'Legal')} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link to="/terms" className={linkCls}>
            {t('footer.terms', 'Terms')}
          </Link>
          <Link to="/privacy" className={linkCls}>
            {t('footer.privacy', 'Privacy')}
          </Link>
          <Link to="/support" className={linkCls}>
            {t('footer.support', 'Support')}
          </Link>
        </nav>
        <p>{t('footer.copy', '© 2026 Dr Kyana · Dental Surgery · Dhaka')}</p>
      </div>
    </footer>
  );
}
