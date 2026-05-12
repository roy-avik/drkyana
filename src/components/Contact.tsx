import { useTranslation } from '../i18n/useTranslation';
import { Carousel } from './Carousel';

const INSTA_QR = `${import.meta.env.BASE_URL}assets/insta-qr.png`;
const WHATSAPP_QR = `${import.meta.env.BASE_URL}assets/whatsapp-qr.png`;

const MailIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
    <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
  </svg>
);

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

const WaIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
    <path fill="#25D366" d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
  </svg>
);

export function Contact() {
  const { t } = useTranslation();

  const cards = [
    <a
      key="email"
      href="mailto:kyanalotfi96@gmail.com"
      className="group flex flex-col items-start gap-4 rounded-2xl bg-white/[0.06] p-6 backdrop-blur-sm ring-1 ring-white/10 transition hover:-translate-y-1 hover:bg-white/[0.1] hover:ring-white/20"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
        {MailIcon}
      </div>
      <h3 className="text-lg font-semibold">{t('contact.email', 'Email')}</h3>
      <p className="text-sm text-white/80 group-hover:text-white">kyanalotfi96@gmail.com</p>
    </a>,

    <a
      key="instagram"
      href="https://instagram.com/drkyana"
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-start gap-4 rounded-2xl bg-white/[0.06] p-6 backdrop-blur-sm ring-1 ring-white/10 transition hover:-translate-y-1 hover:bg-white/[0.1] hover:ring-white/20"
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
      key="whatsapp"
      href="https://wa.me/8801614369673"
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-start gap-4 rounded-2xl bg-white/[0.06] p-6 backdrop-blur-sm ring-1 ring-white/10 transition hover:-translate-y-1 hover:bg-white/[0.1] hover:ring-white/20"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
        {WaIcon}
      </div>
      <h3 className="text-lg font-semibold">{t('contact.whatsapp', 'WhatsApp')}</h3>
      <p className="text-sm text-white/80 group-hover:text-white">+880 1614 369673</p>
      <img
        src={WHATSAPP_QR}
        alt="WhatsApp QR"
        className="mt-2 w-full max-w-[180px] rounded-lg bg-white p-2"
        loading="lazy"
      />
      <p className="text-xs uppercase tracking-wider text-white/70">{t('contact.scan_wa', 'Scan to chat')}</p>
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
