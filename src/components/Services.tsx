import { useTranslation } from '../i18n/useTranslation';
import { Carousel } from './Carousel';

const ICONS = {
  scaling: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c-2.5 0-4 1.5-4 4 0 2 1 4 1 7s-1 5 1 6c1.5.6 2-2 2-4s.5-4 2-4 1.5 2 2 4 .5 4.6 2 4c2-1 1-3 1-6s1-5 1-7c0-2.5-1.5-4-4-4-1.5 0-2 1-3 1s-1.5-1-3-1" />
    </svg>
  ),
  rct: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c-3 0-5 2-5 5 0 3 1 4 1 8 0 2 1 5 2 5s1-3 2-3 1 3 2 3 2-3 2-5c0-4 1-5 1-8 0-3-2-5-5-5z" />
      <path d="M9 11h6" />
    </svg>
  ),
  general: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11V7a3 3 0 1 1 6 0v4" />
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M12 15v2" />
    </svg>
  ),
};

const SERVICES = [
  { key: 'scaling', icon: ICONS.scaling },
  { key: 'rct', icon: ICONS.rct },
  { key: 'general', icon: ICONS.general },
] as const;

export function Services() {
  const { t } = useTranslation();
  return (
    <section id="services" className="py-20 md:py-28">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="section-label">{t('services.label', 'Care')}</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {t('services.title', 'Services')}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
            {t('services.intro')}
          </p>
        </div>

        <Carousel>
          {SERVICES.map((s) => (
            <article key={s.key} className="card group min-h-[200px]">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand/[0.08] text-brand transition-colors ease-spring group-hover:bg-brand/[0.12]">
                <span className="block h-6 w-6">{s.icon}</span>
              </div>
              <h3 className="text-lg font-semibold text-ink">
                {t(`services.${s.key}.title`)}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {t(`services.${s.key}.desc`)}
              </p>
            </article>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
