"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppointmentRow, AppointmentEventRow, AppointmentStatus } from "@drkyana/types";
import { Button, Input, Select, cardClassName } from "@drkyana/ui";

interface ChamberOpt {
  id: string;
  name: string;
  area: string;
}

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  proposed: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-sky-100 text-sky-800",
  cancelled: "bg-rose-100 text-rose-800",
  no_show: "bg-zinc-200 text-zinc-700",
};

function fmtSlot(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** <input type="datetime-local"> value (local) → unix seconds. */
function toUnix(local: string): number | null {
  if (!local) return null;
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export default function AppointmentsPanel({
  patientId,
  intakeId,
  chambers,
}: {
  patientId: string;
  intakeId: string;
  chambers: ChamberOpt[];
}) {
  const [appts, setAppts] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<Record<string, AppointmentEventRow[]>>({});

  // Inline reschedule (replaces window.prompt) — id of the appointment being
  // rescheduled, plus its draft datetime-local value.
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");

  // Inline cancel/no-show reason (replaces window.prompt) — the target
  // appointment + status, plus the draft reason text.
  const [reasonFor, setReasonFor] = useState<{ id: string; status: AppointmentStatus } | null>(null);
  const [reasonValue, setReasonValue] = useState("");

  // create form
  const [slot, setSlot] = useState("");
  const [chamberId, setChamberId] = useState("");
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState("");

  const chamberName = (id: string | null | undefined) =>
    chambers.find((c) => c.id === id)?.name ?? (id ? "Chamber" : "—");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/appointments?patientId=${encodeURIComponent(patientId)}`);
    const data = (await res.json().catch(() => ({}))) as { appointments?: AppointmentRow[] };
    setAppts(data.appointments ?? []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const scheduledAt = toUnix(slot);
    if (!scheduledAt) return;
    setBusy(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        patientId,
        intakeId,
        chamberId: chamberId || null,
        scheduledAt,
        durationMin: duration,
        note: note || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { appointment?: AppointmentRow };
    setSlot("");
    setNote("");
    setBusy(false);
    // Use the returned row directly — refetching immediately can miss the write
    // on a D1 read replica.
    if (data.appointment) setAppts((prev) => [data.appointment!, ...prev]);
    else await load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { appointment?: AppointmentRow };
    setBusy(false);
    if (data.appointment) {
      const updated = data.appointment;
      setAppts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } else {
      await load();
    }
  }

  async function setStatus(id: string, status: AppointmentStatus) {
    if (status === "cancelled" || status === "no_show") {
      setReasonFor({ id, status });
      setReasonValue("");
      return;
    }
    await patch(id, { status });
  }

  async function confirmReason() {
    if (!reasonFor) return;
    const { id, status } = reasonFor;
    setReasonFor(null);
    await patch(id, { status, reason: reasonValue || undefined });
    setReasonValue("");
  }

  function startReschedule(id: string) {
    setRescheduleId(id);
    setRescheduleValue("");
  }

  async function confirmReschedule() {
    if (!rescheduleId) return;
    const ts = toUnix(rescheduleValue);
    if (!ts) return;
    const id = rescheduleId;
    setRescheduleId(null);
    setRescheduleValue("");
    await patch(id, { scheduledAt: ts, reason: "rescheduled" });
  }

  async function toggleHistory(id: string) {
    if (events[id]) {
      setEvents((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/appointments/${id}`);
    const data = (await res.json().catch(() => ({}))) as { events?: AppointmentEventRow[] };
    setEvents((e) => ({ ...e, [id]: data.events ?? [] }));
  }

  return (
    <section className={`${cardClassName} p-4 border-emerald-200 bg-emerald-50/40`}>
      <h2 className="mb-1 text-sm font-semibold">Confirmed appointment(s)</h2>
      <p className="mb-3 text-xs text-muted">
        What was <strong>granted</strong> — distinct from the requested logistics
        above. All changes are logged.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : appts.length === 0 ? (
        <p className="text-sm text-muted">No appointments yet for this patient.</p>
      ) : (
        <ul className="space-y-2">
          {appts.map((a) => (
            <li key={a.id} className="rounded-lg border border-ink/10 bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{fmtSlot(a.scheduled_at)}</span>
                <span className="text-xs text-muted">· {a.duration_min} min</span>
                <span className="text-xs text-muted">· {chamberName(a.chamber_id)}</span>
                <span className={`chip ${STATUS_CLASS[a.status]}`}>{a.status}</span>
              </div>
              {a.note && <p className="mt-1 text-xs text-muted">{a.note}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {a.status === "proposed" && (
                  <Button disabled={busy} onClick={() => setStatus(a.id, "confirmed")}>
                    Confirm
                  </Button>
                )}
                <Button disabled={busy} onClick={() => startReschedule(a.id)}>
                  Reschedule
                </Button>
                {a.status !== "completed" && a.status !== "cancelled" && (
                  <>
                    <Button disabled={busy} onClick={() => setStatus(a.id, "completed")}>
                      Complete
                    </Button>
                    <Button disabled={busy} onClick={() => setStatus(a.id, "cancelled")}>
                      Cancel
                    </Button>
                    <Button disabled={busy} onClick={() => setStatus(a.id, "no_show")}>
                      No-show
                    </Button>
                  </>
                )}
                <Button onClick={() => toggleHistory(a.id)}>
                  {events[a.id] ? "Hide history" : "History"}
                </Button>
              </div>
              {rescheduleId === a.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-ink/20 p-2">
                  <label className="text-xs text-muted">
                    New date & time
                    <Input
                      type="datetime-local"
                      autoFocus
                      value={rescheduleValue}
                      onChange={(e) => setRescheduleValue(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <Button
                    tone="brand"
                    disabled={busy || !rescheduleValue}
                    onClick={confirmReschedule}
                  >
                    Confirm
                  </Button>
                  <Button onClick={() => setRescheduleId(null)}>Cancel</Button>
                </div>
              )}
              {reasonFor?.id === a.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-ink/20 p-2">
                  <label className="min-w-[10rem] flex-1 text-xs text-muted">
                    Reason for {reasonFor.status === "no_show" ? "no-show" : "cancelling"} (optional)
                    <Input
                      autoFocus
                      value={reasonValue}
                      onChange={(e) => setReasonValue(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <Button tone="brand" disabled={busy} onClick={confirmReason}>
                    Confirm
                  </Button>
                  <Button onClick={() => setReasonFor(null)}>Cancel</Button>
                </div>
              )}
              {events[a.id] && (
                <ul className="mt-2 space-y-1 border-t border-ink/10 pt-2">
                  {events[a.id].map((ev) => (
                    <li key={ev.id} className="text-xs text-muted">
                      <span className="font-medium text-ink">{ev.type}</span>
                      {ev.detail?.reason ? ` — ${ev.detail.reason}` : ""}
                      {" · "}
                      {fmtSlot(ev.at)}
                      {ev.actor ? ` · ${ev.actor}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-lg border border-dashed border-ink/20 p-3">
        <h3 className="mb-2 text-xs font-semibold text-ink">Grant a new appointment</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            Date & time
            <Input
              type="datetime-local"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="text-xs text-muted">
            Chamber
            <Select
              className="mt-1"
              placeholder="— select —"
              options={chambers.map((c) => ({ value: c.id, label: `${c.name} (${c.area})` }))}
              value={chamberId}
              onValueChange={setChamberId}
            />
          </label>
          <label className="text-xs text-muted">
            Duration (min)
            <Input
              type="number"
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
              className="mt-1"
            />
          </label>
          <label className="text-xs text-muted">
            Note
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
        <Button tone="brand" className="mt-2" disabled={busy || !slot} onClick={create}>
          Propose appointment
        </Button>
      </div>
    </section>
  );
}
