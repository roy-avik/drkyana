"use client";

import { useEffect, useState, useCallback } from "react";
import type { ChamberRow, ChamberScheduleSlot } from "@drkyana/types";
import { Button, Card, cardClassName } from "@drkyana/ui";

interface FormState {
  id?: string;
  name: string;
  area: string;
  address: string;
  services: string; // comma-separated in the form
  schedule: ChamberScheduleSlot[];
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  area: "",
  address: "",
  services: "",
  schedule: [],
  active: true,
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function ChamberManager() {
  const [chambers, setChambers] = useState<ChamberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chambers", { cache: "no-store" });
      if (res.status === 401) {
        setError("Not authorized. Sign in via Cloudflare Access.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { chambers: ChamberRow[] };
      setChambers(data.chambers ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setForm({ ...EMPTY });
  }

  function startEdit(c: ChamberRow) {
    setForm({
      id: c.id,
      name: c.name,
      area: c.area,
      address: c.address ?? "",
      services: c.services.join(", "),
      schedule: c.schedule,
      active: c.active,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim() || !form.area.trim()) {
      setError("Name and area are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      area: form.area.trim(),
      address: form.address.trim() || null,
      services: form.services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      schedule: form.schedule.filter((s) => s.day && s.from && s.to),
      active: form.active,
    };
    try {
      const res = await fetch(
        form.id ? `/api/chambers/${form.id}` : "/api/chambers",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(c: ChamberRow) {
    if (!confirm(`Deactivate ${c.name}?`)) return;
    try {
      const res = await fetch(`/api/chambers/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function addSlot() {
    if (!form) return;
    setForm({
      ...form,
      schedule: [...form.schedule, { day: "mon", from: "09:00", to: "13:00" }],
    });
  }

  function updateSlot(i: number, patch: Partial<ChamberScheduleSlot>) {
    if (!form) return;
    const schedule = form.schedule.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setForm({ ...form, schedule });
  }

  function removeSlot(i: number) {
    if (!form) return;
    setForm({ ...form, schedule: form.schedule.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chambers</h1>
        {!form && (
          <Button tone="brand" onClick={startCreate}>
            + Add chamber
          </Button>
        )}
      </div>

      {error && (
        <Card role="alert" className="border-red/30 bg-red/5 text-sm text-red">{error}</Card>
      )}

      {form && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">
            {form.id ? "Edit chamber" : "New chamber"}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">Name *</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Area *</span>
              <input
                className="input"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </label>
          </div>
          <label>
            <span className="field-label">Address</span>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label>
            <span className="field-label">Services (comma-separated)</span>
            <input
              className="input"
              placeholder="cleaning, fillings, extraction"
              value={form.services}
              onChange={(e) => setForm({ ...form, services: e.target.value })}
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="field-label mb-0">Schedule</span>
              <button className="btn-ghost py-1 text-xs" onClick={addSlot}>
                + Slot
              </button>
            </div>
            <div className="space-y-2">
              {form.schedule.map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="input w-auto"
                    value={slot.day}
                    onChange={(e) => updateSlot(i, { day: e.target.value })}
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    className="input w-auto"
                    value={slot.from}
                    onChange={(e) => updateSlot(i, { from: e.target.value })}
                  />
                  <span className="text-muted">–</span>
                  <input
                    type="time"
                    className="input w-auto"
                    value={slot.to}
                    onChange={(e) => updateSlot(i, { to: e.target.value })}
                  />
                  <button
                    className="text-sm text-red"
                    onClick={() => removeSlot(i)}
                    aria-label="Remove slot"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {form.schedule.length === 0 && (
                <p className="text-xs text-muted">No slots yet.</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>

          <div className="flex gap-2">
            <Button tone="brand" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {!loading && chambers.length === 0 && !form && (
        <Card className="text-center text-sm text-muted">No chambers yet.</Card>
      )}

      <ul className="space-y-2">
        {chambers.map((c) => (
          <li key={c.id} className={`${cardClassName} p-4 ${c.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {!c.active && (
                    <span className="chip bg-ink/5 text-muted">Inactive</span>
                  )}
                </div>
                <p className="text-sm text-muted">{c.area}</p>
                {c.address && <p className="text-xs text-muted">{c.address}</p>}
                {c.services.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.services.map((s) => (
                      <span key={s} className="chip bg-ink/5 text-ink">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {c.schedule.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {c.schedule.map((s) => `${s.day} ${s.from}–${s.to}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button className="btn-ghost py-1 text-xs" onClick={() => startEdit(c)}>
                  Edit
                </button>
                {c.active && (
                  <button
                    className="btn-ghost py-1 text-xs text-red"
                    onClick={() => void deactivate(c)}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
