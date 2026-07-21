import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { OtpStep } from '../components/OtpStep';
import {
  PatientRecords,
  type AppointmentView,
  type PrescriptionView,
} from '../components/PatientRecords';
import { useTranslation } from '../i18n/useTranslation';
import { Link } from '../router';

// ---------------------------------------------------------------------------
// /account — a returning patient's own appointments + prescriptions. Gated by
// the same email-verified session cookie as the chat; if the browser isn't
// verified, the patient verifies their email (OtpStep) right here, then we load
// their records. Read-only; no AI processing, so no AI-consent gate is needed.
// ---------------------------------------------------------------------------

interface RecordsResponse {
  verified: boolean;
  patient?: { name: string | null; visitCount: number; lastVisit: number | null } | null;
  appointments?: AppointmentView[];
  prescriptions?: PrescriptionView[];
}

type Status = 'loading' | 'unverified' | 'ready' | 'error';

export function AccountPage() {
  const { t, lang } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<RecordsResponse | null>(null);
  const fetchingRef = useRef(false);

  const load = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setStatus('loading');
    try {
      const res = await fetch('/api/patient/records', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const body = (await res.json()) as RecordsResponse;
      if (!body.verified) {
        setStatus('unverified');
        return;
      }
      setData(body);
      setStatus('ready');
    } catch {
      setStatus('error');
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patientName = data?.patient?.name?.trim();

  return (
    <>
      <Header />
      <main>
        <section className="py-16 md:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <span className="section-label">{t('nav.account', 'My records')}</span>
                <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                  {patientName
                    ? t('account.title_named', 'Hello, {name}').replace('{name}', patientName)
                    : t('account.title', 'Your records')}
                </h1>
                <p className="mt-4 text-muted md:text-lg">
                  {t(
                    'account.subtitle',
                    'Your appointments and prescriptions with Dr Kyana.',
                  )}
                </p>
              </div>

              <div className="mt-8">
                {status === 'loading' && (
                  <p className="text-center text-sm text-muted">
                    {t('account.loading', 'Loading your records…')}
                  </p>
                )}

                {status === 'error' && (
                  <div className="text-center">
                    <p className="text-sm text-red">
                      {t('account.error', 'Something went wrong loading your records.')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="btn-ghost mt-4 px-6 py-2.5"
                    >
                      {t('account.retry', 'Try again')}
                    </button>
                  </div>
                )}

                {status === 'unverified' && (
                  <div className="mx-auto max-w-sm">
                    <p className="mb-4 text-center text-sm text-muted">
                      {t(
                        'account.verify_prompt',
                        'Verify your email to see your appointments and prescriptions.',
                      )}
                    </p>
                    <OtpStep
                      locale={lang}
                      initialEmail=""
                      disabled={false}
                      t={t}
                      onComplete={() => void load()}
                    />
                  </div>
                )}

                {status === 'ready' && data && !data.patient && (
                  <div className="rounded-2xl border border-dashed border-ink/15 bg-surface-alt p-8 text-center">
                    <p className="text-sm text-muted">
                      {t(
                        'account.no_records',
                        'No records yet. Once you’ve had a visit with Dr Kyana, your appointments and prescriptions will appear here.',
                      )}
                    </p>
                    <Link to="/receptionist" className="btn-primary mt-5 inline-block px-6 py-2.5">
                      {t('receptionist.start_button')}
                    </Link>
                  </div>
                )}

                {status === 'ready' && data?.patient && (
                  <PatientRecords
                    appointments={data.appointments ?? []}
                    prescriptions={data.prescriptions ?? []}
                    t={t}
                    lang={lang}
                  />
                )}
              </div>

              <p className="mt-10 text-center text-xs text-muted">
                <Link to="/" className="underline-offset-2 hover:text-ink hover:underline">
                  {t('receptionist.page.back_home', '← Back to home')}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
