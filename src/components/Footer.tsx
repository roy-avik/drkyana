import { useTranslation } from '../i18n/useTranslation';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-ink/5 bg-white py-8 text-center text-sm text-muted">
      <div className="container-page">
        <p>{t('footer.copy', '© 2026 Dr Kyana · Dental Surgery · Dhaka')}</p>
      </div>
    </footer>
  );
}
