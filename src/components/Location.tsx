import { useTranslation } from '../i18n/useTranslation';

// Google Maps embed pointed at Dhaka city (no pin). If she ever settles into a
// primary chamber, swap this for an embed from google.com/maps → Share → Embed.
const MAP_SRC =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3650.4499334069366!2d90.41251731498166!3d23.8103408847515!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755c700f7a04d75%3A0xab38f5b7c4be9a4c!2sDhaka!5e0!3m2!1sen!2sbd!4v1700000000000!5m2!1sen!2sbd';

export function Location() {
  const { t } = useTranslation();
  return (
    <section id="location" className="bg-surface-alt py-20 md:py-28">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="section-label">{t('location.label', 'Practice')}</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {t('location.title', 'Where I see patients')}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
            {t('location.intro')}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div className="card p-7! hover:translate-y-0!">
            <h3 className="text-base font-semibold text-ink">
              {t('location.servicearea', 'Service area')}
            </h3>
            <p
              className="mt-2 text-sm leading-relaxed text-muted"
              dangerouslySetInnerHTML={{ __html: t('location.address', 'Chambers across Dhaka.<br>Location confirmed at booking.') }}
            />
            <h3 className="mt-6 text-base font-semibold text-ink">
              {t('location.availability', 'Availability')}
            </h3>
            <ul className="mt-2 space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3 border-b border-ink/5 pb-2">
                <span className="text-ink">{t('location.days', 'Saturday – Thursday')}</span>
                <span className="text-muted">{t('location.appt', 'By appointment')}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-ink">{t('location.friday', 'Friday')}</span>
                <span className="text-muted">{t('location.closed', 'Closed')}</span>
              </li>
            </ul>
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-ink/5 shadow-sm">
            <iframe
              src={MAP_SRC}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              title="Dhaka — practice area"
              className="h-full min-h-[280px] w-full md:min-h-[360px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
