import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Receptionist } from '../components/Receptionist';
import { useTranslation } from '../i18n/useTranslation';
import { Link } from '../router';

/**
 * Standalone AI receptionist page (/receptionist). The Receptionist component
 * manages its own consent → OTP → chat phases; this page just frames it.
 */
export function ReceptionistPage() {
  const { t } = useTranslation();
  return (
    <>
      <Header />
      <main>
        <Receptionist />
        <div className="container-page pb-16 text-center">
          <Link
            to="/"
            className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {t('receptionist.page.back_home', '← Back to home')}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
