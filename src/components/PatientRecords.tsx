import { Link } from '../router';
import { renderMarkdown } from '@drkyana/types';

// ---------------------------------------------------------------------------
// Read-only view of a returning patient's appointments + prescriptions, shown
// on /account. Data comes from GET /api/patient/records (already scoped to the
// signed-in patient by the session cookie). Prescription bodies render through
// renderMarkdown, which HTML-escapes its input BEFORE applying the markdown
// grammar — so the dangerouslySetInnerHTML below cannot inject markup. Keep it
// that way: never pass unescaped HTML through here.
// ---------------------------------------------------------------------------

export interface AppointmentView {
  id: string;
  scheduledAt: number; // unix seconds
  durationMin: number;
  status: string;
  note: string | null;
  chamberName: string | null;
  chamberArea: string | null;
}

export interface PrescriptionView {
  id: string;
  title: string | null;
  markdown: string;
  status: string;
  createdAt: number; // unix seconds
}

type T = (key: string, fallback?: string) => string;

/** Map the app language to a BCP-47 locale for Intl date formatting. */
function intlLocale(lang: string): string {
  if (lang === 'fa') return 'fa-IR';
  if (lang === 'bn') return 'bn-BD';
  return 'en';
}

function formatDateTime(unixSeconds: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return new Date(unixSeconds * 1000).toLocaleString();
  }
}

function formatDate(unixSeconds: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), {
      dateStyle: 'medium',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return new Date(unixSeconds * 1000).toLocaleDateString();
  }
}

/** Tailwind classes for an appointment status chip. */
function apptChipClass(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'bg-brand/10 text-brand';
    case 'completed':
      return 'bg-green/10 text-green';
    case 'cancelled':
    case 'no_show':
      return 'bg-red/10 text-red';
    default: // proposed
      return 'bg-ink/5 text-muted';
  }
}

function StatusChip({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function AppointmentCard({
  appt,
  t,
  lang,
}: {
  appt: AppointmentView;
  t: T;
  lang: string;
}) {
  const place = [appt.chamberName, appt.chamberArea].filter(Boolean).join(' · ');
  return (
    <li className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {formatDateTime(appt.scheduledAt, lang)}
          </p>
          {place && <p className="mt-0.5 text-xs text-muted">{place}</p>}
        </div>
        <StatusChip
          label={t(`account.status.${appt.status}`, appt.status)}
          cls={apptChipClass(appt.status)}
        />
      </div>
      {appt.note && <p className="mt-2 text-sm text-ink/80">{appt.note}</p>}
    </li>
  );
}

function PrescriptionCard({
  rx,
  t,
  lang,
}: {
  rx: PrescriptionView;
  t: T;
  lang: string;
}) {
  return (
    <li className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {rx.title || t('account.rx.untitled', 'Prescription')}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatDate(rx.createdAt, lang)}
          </p>
        </div>
        <StatusChip
          label={t(`account.rx.${rx.status}`, rx.status)}
          cls="bg-brand/10 text-brand"
        />
      </div>
      {rx.markdown && (
        <div
          className="md-content mt-3 border-t border-ink/5 pt-3 text-sm leading-relaxed text-ink/85"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(rx.markdown) }}
        />
      )}
    </li>
  );
}

export function PatientRecords({
  appointments,
  prescriptions,
  t,
  lang,
}: {
  appointments: AppointmentView[];
  prescriptions: PrescriptionView[];
  t: T;
  lang: string;
}) {
  return (
    <div className="flex flex-col gap-10">
      <section>
        <h3 className="mb-3 text-lg font-semibold text-ink">
          {t('account.appointments_heading', 'Appointments')}
        </h3>
        {appointments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 bg-surface-alt p-4 text-sm text-muted">
            {t('account.empty_appointments', 'No appointments on file yet.')}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {appointments.map((a) => (
              <AppointmentCard key={a.id} appt={a} t={t} lang={lang} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-ink">
          {t('account.prescriptions_heading', 'Prescriptions')}
        </h3>
        {prescriptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 bg-surface-alt p-4 text-sm text-muted">
            {t('account.empty_prescriptions', 'No prescriptions on file yet.')}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {prescriptions.map((rx) => (
              <PrescriptionCard key={rx.id} rx={rx} t={t} lang={lang} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted">
        {t('account.help', 'Questions about your care?')}{' '}
        <Link to="/receptionist" className="text-brand underline-offset-2 hover:underline">
          {t('account.ask_receptionist', 'Ask the AI receptionist')}
        </Link>
      </p>
    </div>
  );
}
