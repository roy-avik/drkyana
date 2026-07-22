import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useTranslation } from '../i18n/useTranslation';
import { Link } from '../router';

/** 404 for unknown paths. The SPA fallback serves index.html for every path
 *  (public/_redirects), so unknown URLs used to silently render Home —
 *  a soft-404 both for people and for crawlers. */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <Header />
      <main>
        <section className="py-24 md:py-32">
          <div className="container-page text-center">
            <span className="section-label">404</span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
              {t('notfound.title', 'Page not found')}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-muted">
              {t('notfound.body', 'That page doesn’t exist. It may have moved, or the link may be wrong.')}
            </p>
            <Link to="/" className="btn-primary mt-8 inline-block px-6 py-2.5">
              {t('notfound.home', 'Back to home')}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
