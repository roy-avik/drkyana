import { useTranslation } from '../i18n/useTranslation';

const PHOTO = `${import.meta.env.BASE_URL}assets/photo.jpg`;

export function Hero() {
  const { t } = useTranslation();
  return (
    <section id="home" className="relative isolate overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-30 blur-3xl"
        style={{ backgroundImage: `url(${PHOTO})` }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/80 via-white/95 to-surface-alt" aria-hidden="true" />

      <div className="container-page grid items-center gap-12 pb-20 pt-12 md:grid-cols-[1.1fr_0.9fr] md:gap-16 md:pb-28 md:pt-20">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand/[0.07] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            {t('hero.pill', '✦ Dental Surgeon · Dhaka')}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-brand md:text-6xl">
            {t('brand', 'Dr Kyana')}
          </h1>
          <p className="mt-4 text-xl font-medium text-ink md:text-2xl">
            {t('hero.subtitle', 'Modern dentistry. Considered care.')}
          </p>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            {t(
              'hero.description',
              'Precise, unhurried dental care for patients across Dhaka — from routine cleanings to root canal therapy, delivered with modern technique and a calm chairside manner. Consultations at chambers throughout the city.',
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#services" className="btn-primary">{t('cta.services', 'View Services')}</a>
            <a href="#contact" className="btn-ghost">{t('cta.contact', 'Get In Touch')}</a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand/20 via-accent/10 to-transparent blur-2xl" aria-hidden="true" />
          <img
            src={PHOTO}
            alt="Dr Kyana"
            className="aspect-square w-full rounded-[1.75rem] object-cover shadow-2xl shadow-brand/20 ring-1 ring-ink/5"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div
            className="hidden aspect-square w-full items-center justify-center rounded-[1.75rem] bg-brand/10 text-7xl"
            aria-hidden="true"
          >
            👩‍⚕️
          </div>
        </div>
      </div>
    </section>
  );
}
