import { useTranslation } from '../i18n/useTranslation';
import { Carousel } from './Carousel';

const INSTA_QR = `${import.meta.env.BASE_URL}assets/insta-qr.png`;

// Dr Kyana's WhatsApp number is deliberately NOT published here. It is a
// personal number, and putting it on a public medical site invites contact
// outside any consent, record, or audit trail. Outbound WhatsApp will come
// back as an admin-initiated escalation (she starts the conversation), with
// the number held as a Worker secret — never in this bundle.
export const CLINIC_EMAIL = 'care@drkyana.com';

const InstaIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
    <defs>
      <linearGradient id="ig-grad-card" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FED576" />
        <stop offset="26%" stopColor="#F47133" />
        <stop offset="61%" stopColor="#BC3081" />
        <stop offset="100%" stopColor="#4C63D2" />
      </linearGradient>
    </defs>
    <path fill="url(#ig-grad-card)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);

const ClinicIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7" fill="none" stroke="#0f4c81" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14" />
    <path d="M12 9v6M9 12h6" />
  </svg>
);

export function Contact() {
  const { t } = useTranslation();

  const cards = [
    <a
      key="instagram"
      href="https://instagram.com/drkyana"
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-start gap-4 rounded-2xl bg-white/[0.06] p-6 backdrop-blur-sm ring-1 ring-white/10 transition ease-spring hover:-translate-y-1 hover:bg-white/[0.1] hover:ring-white/20"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
        {InstaIcon}
      </div>
      <h3 className="text-lg font-semibold">{t('contact.instagram', 'Instagram')}</h3>
      <p className="text-sm text-white/80 group-hover:text-white">@drkyana</p>
      <img
        src={INSTA_QR}
        alt="Instagram QR for @drkyana"
        className="mt-2 w-full max-w-[180px] rounded-lg"
        loading="lazy"
      />
      <p className="text-xs uppercase tracking-wider text-white/70">{t('contact.scan_ig', 'Scan · @drkyana')}</p>
    </a>,

    <a
      key="clinic"
      href={`mailto:${CLINIC_EMAIL}`}
      className="group flex flex-col items-start gap-4 rounded-2xl bg-white/[0.06] p-6 backdrop-blur-sm ring-1 ring-white/10 transition ease-spring hover:-translate-y-1 hover:bg-white/[0.1] hover:ring-white/20"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
        {ClinicIcon}
      </div>
      <h3 className="text-lg font-semibold">{t('contact.clinic', 'Clinic')}</h3>
      <p className="text-sm text-white/80 group-hover:text-white">{CLINIC_EMAIL}</p>
      <p className="text-xs uppercase tracking-wider text-white/70">
        {t('contact.clinic_note', 'Appointments & documents')}
      </p>
    </a>,
  ];

  return (
    <section
      id="contact"
      className="relative overflow-hidden py-20 md:py-28"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand to-brand-dark" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(circle_at_25%_15%,rgba(59,130,246,0.4),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(125,211,252,0.25),transparent_50%)]" aria-hidden="true" />

      <div className="container-page text-white">
        <div className="max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            {t('contact.label', 'Connect')}
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            {t('contact.title', 'Get in touch')}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/85 md:text-lg">
            {t('contact.intro')}
          </p>
        </div>

        <Carousel dark interval={4000}>
          {cards}
        </Carousel>
      </div>
    </section>
  );
}
