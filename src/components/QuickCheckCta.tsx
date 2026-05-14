import { useTranslation } from '../i18n/useTranslation';

export function QuickCheckCta() {
  const { t } = useTranslation();
  return (
    <section id="quick-check-cta" className="py-12 md:py-16">
      <div className="container-page">
        <div className="flex flex-col gap-6 rounded-3xl bg-brand/5 p-8 ring-1 ring-brand/15 md:flex-row md:items-center md:justify-between md:p-10">
          <div>
            <span className="section-label">{t('quickCheck.cta.homepage.label')}</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink md:text-3xl">
              {t('quickCheck.cta.homepage.title')}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted md:text-base">
              {t('quickCheck.cta.homepage.subtitle')}
            </p>
          </div>
          <a href="#/quick-check" className="btn-primary self-start md:self-auto">
            {t('quickCheck.cta.homepage.button')}
          </a>
        </div>
      </div>
    </section>
  );
}
