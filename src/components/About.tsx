import { useTranslation } from '../i18n/useTranslation';

export function About() {
  const { t } = useTranslation();
  return (
    <section id="about" className="bg-surface-alt py-20 md:py-28">
      <div className="container-page max-w-4xl">
        <span className="section-label">{t('about.label', 'Approach')}</span>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
          {t('about.title', 'About')}
        </h2>
        <div className="mt-8 space-y-5 text-base leading-relaxed text-muted md:text-lg">
          <p>{t('about.p1')}</p>
          <p>{t('about.p2')}</p>
        </div>
      </div>
    </section>
  );
}
