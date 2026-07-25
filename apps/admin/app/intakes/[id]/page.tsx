import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminIdentity } from "@/server/page-auth";
import { getIntake, getPatient, listChambers } from "@/server/db";
import StatusControl from "../../components/StatusControl";
import AppointmentsPanel from "../../components/AppointmentsPanel";
import TranscriptPanel from "../../components/TranscriptPanel";
import { ClinicalAssistsPanel } from "../../components/ClinicalAssistsPanel";
import NotAuthorized from "../../components/NotAuthorized";
import { fmtDate, TRIAGE_CLASS, TRIAGE_LABEL } from "../../lib/format";
import { Card, cardClassName } from "@drkyana/ui";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="flex flex-wrap gap-1">
        {items.map((it) => (
          <span key={it} className="chip bg-ink/5 text-ink">
            {it}
          </span>
        ))}
      </dd>
    </div>
  );
}

export default async function IntakeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) return <NotAuthorized />;

  const { id } = await params;
  const intake = await getIntake(id);
  if (!intake) notFound();
  const patient = intake.patient_id ? await getPatient(intake.patient_id) : null;
  const chambers = (await listChambers(false)).map((c) => ({
    id: c.id,
    name: c.name,
    area: c.area,
  }));

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Back to queue
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{intake.name || "Unknown patient"}</h1>
        {intake.triage_level && (
          <span className={`chip ${TRIAGE_CLASS[intake.triage_level]}`}>
            {TRIAGE_LABEL[intake.triage_level]}
            {intake.triage_action ? ` · ${intake.triage_action}` : ""}
          </span>
        )}
      </div>

      <Card>
        <StatusControl intakeId={intake.id} initial={intake.status} />
      </Card>

      <section className={`${cardClassName} p-4`}>
        <h2 className="mb-3 text-sm font-semibold">Identity</h2>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Phone" value={intake.phone} />
          <Field label="Email" value={intake.email} />
          <Field label="Age" value={intake.age} />
          <Field label="Gender" value={intake.gender} />
        </dl>
      </section>

      <section className={`${cardClassName} p-4`}>
        <h2 className="mb-3 text-sm font-semibold">Complaint</h2>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Affected area" value={intake.affected_area} />
          <Field label="Symptoms" value={intake.symptoms} />
          <Field label="Duration" value={intake.duration} />
          <Field label="Severity (0–10)" value={intake.severity} />
          <Field label="Triggers" value={intake.triggers} />
        </dl>
        {intake.raw_message && (
          <p className="mt-3 rounded-lg bg-surface-alt p-2 text-sm text-muted">
            “{intake.raw_message}”
          </p>
        )}
      </section>

      <section className={`${cardClassName} p-4`}>
        <h2 className="mb-3 text-sm font-semibold">Medical & dental history</h2>
        <dl className="space-y-3">
          <ListField label="Conditions" items={intake.conditions} />
          <ListField label="Allergies" items={intake.allergies} />
          <ListField label="Medications" items={intake.medications} />
          <Field label="Last dental visit" value={intake.last_dental_visit} />
          <Field label="Anxiety" value={intake.anxiety} />
        </dl>
      </section>

      <section className={`${cardClassName} p-4 border-amber-200 bg-amber-50/40`}>
        <h2 className="mb-1 text-sm font-semibold">Requested appointment</h2>
        <p className="mb-3 text-xs text-muted">
          What the patient <strong>sought</strong> at intake — not yet granted.
        </p>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Preferred area" value={intake.preferred_area} />
          <Field label="Preferred days" value={intake.preferred_days} />
          <Field label="Time of day" value={intake.time_of_day} />
          <Field label="Urgency" value={intake.urgency} />
          <Field label="Payment" value={intake.payment} />
        </dl>
        <p className="mt-3 text-xs text-muted">
          Created {fmtDate(intake.created_at)} · Updated {fmtDate(intake.updated_at)}
        </p>
      </section>

      {intake.patient_id && (
        <AppointmentsPanel
          patientId={intake.patient_id}
          intakeId={intake.id}
          chambers={chambers}
        />
      )}

      <TranscriptPanel
        patientId={intake.patient_id ?? null}
        originatingSessionId={intake.session_id ?? null}
      />

      <ClinicalAssistsPanel intakeId={intake.id} />

      {patient && (
        <section className={`${cardClassName} p-4 border-accent/30 bg-accent/5`}>
          <h2 className="mb-2 text-sm font-semibold">
            Patient record (read-only)
          </h2>
          {patient.summary && (
            <p className="mb-3 text-sm text-ink">{patient.summary}</p>
          )}
          <dl className="space-y-3">
            <ListField label="Conditions" items={patient.memory.conditions} />
            <ListField label="Allergies" items={patient.memory.allergies} />
            <ListField label="Medications" items={patient.memory.medications} />
            <ListField
              label="Recurring complaints"
              items={patient.memory.recurring_complaints}
            />
            <ListField label="Flags" items={patient.memory.flags} />
            <Field label="Dental history" value={patient.memory.dental_history} />
            <Field label="Anxiety" value={patient.memory.anxiety} />
            <Field label="Visits" value={patient.visit_count} />
            <Field label="Last visit" value={fmtDate(patient.last_visit)} />
          </dl>
          <p className="mt-2 text-xs text-muted">
            Longitudinal record. Agent edits to clinical memory require your
            approval before they persist.
          </p>
        </section>
      )}
    </div>
  );
}
