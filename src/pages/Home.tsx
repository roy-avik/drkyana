import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { About } from '../components/About';
import { Services } from '../components/Services';
import { Location } from '../components/Location';
import { Contact } from '../components/Contact';
import { Footer } from '../components/Footer';
import { useTranslation } from '../i18n/useTranslation';
import { Link } from '../router';

/**
 * Marketing home. The AI receptionist used to be an inline section here; it now
 * lives on its own /receptionist page, so this page funnels to it with a CTA
 * band where the section used to be.
 */
function ReceptionistCTA() {
  const { t } = useTranslation();
  return (
    <section id="receptionist" className="py-16 md:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl rounded-3xl bg-brand/[0.06] px-6 py-12 text-center ring-1 ring-brand/10 md:px-12">
          <span className="section-label">{t('receptionist.label')}</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            {t('receptionist.cta.title', 'Talk to Dr Kyana’s AI receptionist')}
          </h2>
          <p className="mt-4 text-muted md:text-lg">
            {t(
              'receptionist.cta.subtitle',
              'Describe your concern and the assistant gathers your details for Dr Kyana’s team — book a visit or check your appointments and prescriptions.',
            )}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/receptionist" className="btn-primary px-8 py-3">
              {t('receptionist.start_button')}
            </Link>
            <Link to="/account" className="btn-ghost px-8 py-3">
              {t('nav.account', 'My records')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <About />
        <Services />
        <ReceptionistCTA />
        <Location />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
