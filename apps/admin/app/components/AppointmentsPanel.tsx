"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppointmentRow, AppointmentEventRow, AppointmentStatus } from "@drkyana/types";

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
    let reason: string | undefined;
    if (status === "cancelled" || status === "no_show") {
      reason = window.prompt(`Reason for ${status}?`) ?? undefined;
    }
    await patch(id, { status, reason });
  }

  async function reschedule(id: string) {
    const v = window.prompt("New date/time (YYYY-MM-DD HH:MM)");
    if (!v) return;
    const ts = toUnix(v.replace(" ", "T"));
    if (!ts) {
      window.alert("Could not parse that date/time.");
      return;
    }
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
    <section className="card border-emerald-200 bg-emerald-50/40">
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
                  <button className="btn-ghost" disabled={busy} onClick={() => setStatus(a.id, "confirmed")}>
                    Confirm
                  </button>
                )}
                <button className="btn-ghost" disabled={busy} onClick={() => reschedule(a.id)}>
                  Reschedule
                </button>
                {a.status !== "completed" && a.status !== "cancelled" && (
                  <>
                    <button className="btn-ghost" disabled={busy} onClick={() => setStatus(a.id, "completed")}>
                      Complete
                    </button>
                    <button className="btn-ghost" disabled={busy} onClick={() => setStatus(a.id, "cancelled")}>
                      Cancel
                    </button>
                    <button className="btn-ghost" disabled={busy} onClick={() => setStatus(a.id, "no_show")}>
                      No-show
                    </button>
                  </>
                )}
                <button className="btn-ghost" onClick={() => toggleHistory(a.id)}>
                  {events[a.id] ? "Hide history" : "History"}
                </button>
              </div>
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
            <input
              type="datetime-local"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="mt-1 w-full rounded border border-ink/20 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-muted">
            Chamber
            <select
              value={chamberId}
              onChange={(e) => setChamberId(e.target.value)}
              className="mt-1 w-full rounded border border-ink/20 px-2 py-1 text-sm"
            >
              <option value="">— select —</option>
              {chambers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.area})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Duration (min)
            <input
              type="number"
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
              className="mt-1 w-full rounded border border-ink/20 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-muted">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded border border-ink/20 px-2 py-1 text-sm"
            />
          </label>
        </div>
        <button className="btn-primary mt-2" disabled={busy || !slot} onClick={create}>
          Propose appointment
        </button>
      </div>
    </section>
  );
}
