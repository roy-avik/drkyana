/**
 * DLS document builders — one function per admin view. Each maps D1 rows into
 * a ViewDocument (packages/types/src/view-dsl.ts, spec docs/view-dsl.md) that
 * the ui://drkyana/admin-view.html template renders inside the agent host.
 *
 * Same hygiene rules as agent tools: authorize via ctx (callers run
 * assertAdmin before building), keep documents compact (they re-enter the
 * model context as structuredContent), include only the PHI the view shows.
 */
import type {
  Action,
  ActionCall,
  BadgeSpec,
  DraftStatus,
  IntakeStatus,
  Tone,
  TriageLevel,
  ViewDocument,
  ViewNode,
} from "@drkyana/types";
import type { AgentContext } from "../context";
import { listAdminActions } from "../audit";

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

const TRIAGE_TONE: Record<TriageLevel, Tone> = {
  RED: "danger",
  ORANGE: "warning",
  YELLOW: "info",
  GREEN: "success",
};

const INTAKE_STATUSES: IntakeStatus[] = [
  "new",
  "contacted",
  "scheduled",
  "completed",
  "closed",
];

const DRAFT_STATUSES: DraftStatus[] = ["draft", "approved", "sent"];

function triageBadge(level: string | null): BadgeSpec | null {
  if (!level) return null;
  return { text: level, tone: TRIAGE_TONE[level as TriageLevel] ?? "neutral" };
}

function statusBadge(status: string): BadgeSpec {
  return {
    text: status,
    tone: status === "sent" || status === "completed" ? "success" : "neutral",
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const back = (label: string, call: ActionCall): Action => ({
  label,
  call,
  tone: "neutral",
  refresh: false,
});

// ---------------------------------------------------------------------------
// Intake queue
// ---------------------------------------------------------------------------

export interface IntakeQueueArgs {
  status?: IntakeStatus;
  triage?: TriageLevel[];
  days?: number;
}

export async function buildIntakeQueue(
  ctx: AgentContext,
  args: IntakeQueueArgs,
): Promise<ViewDocument> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (args.status) {
    where.push("status = ?");
    binds.push(args.status);
  }
  if (args.triage?.length) {
    where.push(`triage_level IN (${args.triage.map(() => "?").join(",")})`);
    binds.push(...args.triage);
  }
  if (args.days && args.days > 0) {
    where.push("created_at >= ?");
    binds.push(Math.floor(Date.now() / 1000) - args.days * 86400);
  }
  const sql =
    "SELECT id, name, affected_area, symptoms, severity, triage_level, status, created_at FROM intakes" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY CASE triage_level WHEN 'RED' THEN 0 WHEN 'ORANGE' THEN 1 WHEN 'YELLOW' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END, created_at DESC LIMIT 50";
  const { results } = await ctx.env.DB.prepare(sql)
    .bind(...binds)
    .all<Record<string, unknown>>();

  const rows = (results ?? []).map((r) => ({
    id: String(r.id),
    name: (r.name as string | null) || "Unknown",
    complaint:
      [r.affected_area, r.symptoms].filter(Boolean).join(" — ") ||
      "No complaint recorded",
    triage: triageBadge(r.triage_level as string | null) ?? "",
    status: statusBadge(String(r.status ?? "new")),
    created_at: Number(r.created_at ?? 0),
  }));
  const rowTones: Record<number, Tone> = {};
  rows.forEach((r, i) => {
    const t = typeof r.triage === "object" ? r.triage.text : "";
    if (t === "RED" || t === "ORANGE") rowTones[i] = "danger";
  });

  const refresh: ActionCall = { tool: "open_intake_queue", args: { ...args } };
  return {
    v: 1,
    key: "intake_queue",
    title: "Intake queue",
    subtitle: `${rows.length} intake${rows.length === 1 ? "" : "s"} · urgent first`,
    refresh,
    children: [
      {
        type: "form",
        title: "Filters",
        fields: [
          {
            name: "status",
            label: "Status",
            type: "select",
            value: args.status ?? "",
            options: [
              { value: "", label: "All" },
              ...INTAKE_STATUSES.map((s) => ({ value: s, label: s })),
            ],
          },
          {
            name: "days",
            label: "Date range",
            type: "select",
            numeric: true,
            value: String(args.days ?? 0),
            options: [
              { value: "0", label: "All time" },
              { value: "1", label: "Today" },
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ],
          },
        ],
        submit: {
          label: "Apply",
          tone: "brand",
          call: { tool: "open_intake_queue" },
          refresh: false,
        },
      },
      {
        type: "table",
        columns: [
          { key: "name", label: "Patient" },
          { key: "complaint", label: "Complaint" },
          { key: "triage", label: "Triage", format: "badge" },
          { key: "status", label: "Status", format: "badge" },
          { key: "created_at", label: "Received", format: "date", align: "end" },
        ],
        rows,
        rowTones,
        onRowOpen: {
          call: { tool: "open_intake" },
          argKey: "intakeId",
          rowKey: "id",
        },
        empty: "No intakes match these filters.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Intake detail
// ---------------------------------------------------------------------------

export async function buildIntakeDetail(
  ctx: AgentContext,
  intakeId: string,
): Promise<ViewDocument | null> {
  const r = await ctx.env.DB.prepare("SELECT * FROM intakes WHERE id = ?")
    .bind(intakeId)
    .first<Record<string, unknown>>();
  if (!r) return null;

  const badges: BadgeSpec[] = [];
  const triage = triageBadge(r.triage_level as string | null);
  if (triage) badges.push(triage);
  badges.push(statusBadge(String(r.status ?? "new")));

  const children: ViewNode[] = [
    {
      type: "actions",
      actions: [back("← Intake queue", { tool: "open_intake_queue" })],
    },
    {
      type: "keyvalue",
      columns: 2,
      items: [
        { label: "Phone", value: (r.phone as string | null) ?? "—" },
        { label: "Email", value: (r.email as string | null) ?? "—" },
        { label: "Age", value: (r.age as number | null) ?? "—" },
        { label: "Gender", value: (r.gender as string | null) ?? "—" },
        { label: "Affected area", value: (r.affected_area as string | null) ?? "—" },
        {
          label: "Severity",
          value: r.severity != null ? `${r.severity}/10` : "—",
          tone: Number(r.severity ?? 0) >= 7 ? "danger" : undefined,
        },
        { label: "Duration", value: (r.duration as string | null) ?? "—" },
        { label: "Triggers", value: (r.triggers as string | null) ?? "—" },
        { label: "Last dental visit", value: (r.last_dental_visit as string | null) ?? "—" },
        { label: "Anxiety", value: (r.anxiety as string | null) ?? "—" },
        { label: "Preferred area", value: (r.preferred_area as string | null) ?? "—" },
        { label: "Preferred days", value: (r.preferred_days as string | null) ?? "—" },
        { label: "Urgency", value: (r.urgency as string | null) ?? "—" },
        { label: "Payment", value: (r.payment as string | null) ?? "—" },
        { label: "Received", value: Number(r.created_at ?? 0), format: "datetime" },
      ],
    },
  ];

  if (r.symptoms) {
    children.push({
      type: "section",
      title: "Symptoms",
      children: [{ type: "text", text: String(r.symptoms) }],
    });
  }

  const history: BadgeSpec[] = [
    ...parseJson<string[]>(r.conditions, []).map((c) => ({ text: c, tone: "info" as Tone })),
    ...parseJson<string[]>(r.allergies, []).map((a) => ({ text: `allergy: ${a}`, tone: "warning" as Tone })),
    ...parseJson<string[]>(r.medications, []).map((m) => ({ text: `med: ${m}`, tone: "neutral" as Tone })),
  ];
  if (history.length) {
    children.push({
      type: "section",
      title: "Medical history",
      children: [{ type: "badges", badges: history }],
    });
  }

  // Longitudinal record, when the intake is linked to a patient.
  if (r.patient_id) {
    const p = await ctx.env.DB.prepare(
      "SELECT summary, visit_count, last_visit FROM patients WHERE id = ?",
    )
      .bind(r.patient_id)
      .first<Record<string, unknown>>();
    if (p) {
      children.push({
        type: "section",
        title: `Patient record (${p.visit_count ?? 0} visits)`,
        children: [
          {
            type: "text",
            text: (p.summary as string) || "No narrative summary yet.",
            muted: !p.summary,
          },
        ],
      });
    }
  }

  // Appointments granted against this intake.
  const { results: appts } = await ctx.env.DB.prepare(
    "SELECT a.id, a.scheduled_at, a.duration_min, a.status, a.note, c.name AS chamber " +
      "FROM appointments a LEFT JOIN chambers c ON c.id = a.chamber_id " +
      "WHERE a.intake_id = ? ORDER BY a.scheduled_at DESC LIMIT 10",
  )
    .bind(intakeId)
    .all<Record<string, unknown>>();
  if (appts?.length) {
    children.push({
      type: "section",
      title: "Appointments",
      children: [
        {
          type: "table",
          columns: [
            { key: "scheduled_at", label: "When", format: "datetime" },
            { key: "chamber", label: "Chamber" },
            { key: "duration_min", label: "Min", format: "number", align: "end" },
            { key: "status", label: "Status", format: "badge" },
            { key: "note", label: "Note" },
          ],
          rows: appts.map((a) => ({
            scheduled_at: Number(a.scheduled_at ?? 0),
            chamber: (a.chamber as string | null) ?? "—",
            duration_min: Number(a.duration_min ?? 30),
            status: statusBadge(String(a.status ?? "proposed")),
            note: (a.note as string | null) ?? "",
          })),
        },
      ],
    });
  }

  children.push({
    type: "form",
    title: "Update workflow status",
    fields: [
      {
        name: "status",
        label: "Status",
        type: "select",
        value: String(r.status ?? "new"),
        options: INTAKE_STATUSES.map((s) => ({ value: s, label: s })),
        required: true,
      },
      {
        name: "note",
        label: "Note (optional)",
        type: "text",
        placeholder: "Recorded with the change",
      },
    ],
    submit: {
      label: "Update status",
      tone: "brand",
      call: { tool: "update_status", args: { intakeId } },
    },
  });

  return {
    v: 1,
    key: "intake_detail",
    title: (r.name as string | null) || "Unknown patient",
    subtitle: `Intake ${intakeId}`,
    badges,
    refresh: { tool: "open_intake", args: { intakeId } },
    children,
  };
}

// ---------------------------------------------------------------------------
// Chambers
// ---------------------------------------------------------------------------

export async function buildChambers(
  ctx: AgentContext,
  editChamberId?: string,
): Promise<ViewDocument> {
  const { results } = await ctx.env.DB.prepare(
    "SELECT * FROM chambers ORDER BY active DESC, name ASC",
  ).all<Record<string, unknown>>();
  const chambers = results ?? [];

  const editing = editChamberId
    ? chambers.find((c) => String(c.id) === editChamberId)
    : undefined;

  const refresh: ActionCall = { tool: "open_chambers" };
  const children: ViewNode[] = [
    {
      type: "table",
      columns: [
        { key: "name", label: "Name" },
        { key: "area", label: "Area" },
        { key: "services", label: "Services", format: "chips" },
        { key: "active", label: "Active", format: "badge" },
      ],
      rows: chambers.map((c) => ({
        id: String(c.id),
        name: String(c.name ?? ""),
        area: String(c.area ?? ""),
        services: parseJson<string[]>(c.services, []),
        active:
          Number(c.active ?? 0) === 1
            ? { text: "active", tone: "success" }
            : { text: "inactive", tone: "neutral" },
      })),
      onRowOpen: {
        call: { tool: "open_chambers" },
        argKey: "chamberId",
        rowKey: "id",
      },
      empty: "No chambers yet — create the first one below.",
    },
    {
      type: "form",
      title: editing ? `Edit: ${editing.name}` : "Create chamber",
      fields: [
        ...(editing
          ? [{ name: "id", type: "hidden" as const, value: String(editing.id) }]
          : []),
        {
          name: "name",
          label: "Name",
          type: "text" as const,
          value: editing ? String(editing.name ?? "") : "",
          required: !editing,
        },
        {
          name: "area",
          label: "Area",
          type: "text" as const,
          value: editing ? String(editing.area ?? "") : "",
          required: !editing,
        },
        {
          name: "address",
          label: "Address",
          type: "text" as const,
          value: editing ? String(editing.address ?? "") : "",
        },
        {
          name: "services",
          label: "Services (JSON array)",
          type: "text" as const,
          value: editing ? JSON.stringify(parseJson<string[]>(editing.services, [])) : "[]",
          json: true,
        },
        {
          name: "schedule",
          label: 'Schedule (JSON, e.g. [{"day":"mon","from":"09:00","to":"13:00"}])',
          type: "textarea" as const,
          value: editing
            ? JSON.stringify(parseJson<unknown[]>(editing.schedule, []))
            : "[]",
          json: true,
        },
        {
          name: "active",
          label: "Active",
          type: "checkbox" as const,
          value: editing ? Number(editing.active ?? 0) === 1 : true,
        },
      ],
      submit: {
        label: editing ? "Save chamber" : "Create chamber",
        tone: "brand",
        call: { tool: "upsert_chamber" },
      },
    },
  ];
  if (editing) {
    children.push({
      type: "actions",
      actions: [back("Cancel edit", refresh)],
    });
  }

  return {
    v: 1,
    key: "chambers",
    title: "Chambers",
    subtitle: "Dr Kyana's consulting locations across Dhaka",
    refresh: editChamberId
      ? { tool: "open_chambers", args: { chamberId: editChamberId } }
      : refresh,
    children,
  };
}

// ---------------------------------------------------------------------------
// Drafts list + review
// ---------------------------------------------------------------------------

export async function buildDrafts(
  ctx: AgentContext,
  status?: DraftStatus,
): Promise<ViewDocument> {
  const sql = status
    ? "SELECT id, type, title, status, updated_at FROM drafts WHERE status = ? ORDER BY created_at DESC LIMIT 50"
    : "SELECT id, type, title, status, updated_at FROM drafts ORDER BY created_at DESC LIMIT 50";
  const stmt = status
    ? ctx.env.DB.prepare(sql).bind(status)
    : ctx.env.DB.prepare(sql);
  const { results } = await stmt.all<Record<string, unknown>>();
  const drafts = results ?? [];

  return {
    v: 1,
    key: "drafts",
    title: "Drafts",
    subtitle: "Agent-drafted documents awaiting your review",
    refresh: { tool: "open_drafts", args: status ? { status } : {} },
    children: [
      {
        type: "form",
        title: "Filter",
        fields: [
          {
            name: "status",
            label: "Status",
            type: "select",
            value: status ?? "",
            options: [
              { value: "", label: "All" },
              ...DRAFT_STATUSES.map((s) => ({ value: s, label: s })),
            ],
          },
        ],
        submit: {
          label: "Apply",
          tone: "brand",
          call: { tool: "open_drafts" },
          refresh: false,
        },
      },
      {
        type: "table",
        columns: [
          { key: "title", label: "Title" },
          { key: "type", label: "Type", format: "badge" },
          { key: "status", label: "Status", format: "badge" },
          { key: "updated_at", label: "Updated", format: "date", align: "end" },
        ],
        rows: drafts.map((d) => ({
          id: String(d.id),
          title: (d.title as string | null) || `${d.type} draft`,
          type: { text: String(d.type ?? ""), tone: "info" },
          status: statusBadge(String(d.status ?? "draft")),
          updated_at: Number(d.updated_at ?? 0),
        })),
        onRowOpen: {
          call: { tool: "open_draft" },
          argKey: "draftId",
          rowKey: "id",
        },
        empty: "No drafts here.",
      },
    ],
  };
}

export async function buildDraftReview(
  ctx: AgentContext,
  draftId: string,
): Promise<ViewDocument | null> {
  const d = await ctx.env.DB.prepare("SELECT * FROM drafts WHERE id = ?")
    .bind(draftId)
    .first<Record<string, unknown>>();
  if (!d) return null;

  const status = String(d.status ?? "draft") as DraftStatus;
  const citations = parseJson<{ title?: string; snippet?: string }[]>(d.citations, []);

  const children: ViewNode[] = [
    { type: "actions", actions: [back("← All drafts", { tool: "open_drafts" })] },
    {
      type: "callout",
      tone: "info",
      text: "Agent-drafted. Nothing is sent until you approve — review and edit before acting.",
    },
    {
      type: "section",
      title: "Document",
      children: [{ type: "markdown", markdown: String(d.markdown ?? "") }],
    },
  ];

  if (citations.length) {
    children.push({
      type: "section",
      title: "Sources cited",
      children: citations.map((c) => ({
        type: "text" as const,
        text: `${c.title ?? "Untitled"}${c.snippet ? ` — ${c.snippet}` : ""}`,
        muted: true,
      })),
    });
  }

  children.push(
    {
      type: "form",
      title: "Edit markdown",
      fields: [
        {
          name: "markdown",
          type: "textarea",
          value: String(d.markdown ?? ""),
          required: true,
        },
      ],
      submit: {
        label: "Save edits",
        tone: "brand",
        call: { tool: "ui_update_draft", args: { draftId } },
      },
    },
    {
      type: "actions",
      actions: [
        {
          label: "Approve",
          tone: "success",
          call: { tool: "ui_set_draft_status", args: { draftId, status: "approved" } },
        },
        {
          label: "Mark sent",
          tone: "brand",
          confirm:
            "Record this draft as sent? Delivery itself goes through the send pipeline.",
          call: { tool: "ui_set_draft_status", args: { draftId, status: "sent" } },
        },
      ],
    },
  );

  return {
    v: 1,
    key: "draft_review",
    title: (d.title as string | null) || `${d.type} draft`,
    subtitle: `Draft ${draftId}`,
    badges: [{ text: String(d.type ?? ""), tone: "info" }, statusBadge(status)],
    refresh: { tool: "open_draft", args: { draftId } },
    children,
  };
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function buildAppointments(
  ctx: AgentContext,
  status?: string,
): Promise<ViewDocument> {
  const valid = new Set(["proposed", "confirmed", "completed", "cancelled", "no_show"]);
  const filtered = status && valid.has(status) ? status : undefined;
  const sql =
    "SELECT a.id, a.scheduled_at, a.duration_min, a.status, a.note, a.intake_id, " +
    "p.name AS patient, c.name AS chamber FROM appointments a " +
    "LEFT JOIN patients p ON p.id = a.patient_id " +
    "LEFT JOIN chambers c ON c.id = a.chamber_id" +
    (filtered ? " WHERE a.status = ?" : "") +
    " ORDER BY a.scheduled_at DESC LIMIT 50";
  const stmt = filtered
    ? ctx.env.DB.prepare(sql).bind(filtered)
    : ctx.env.DB.prepare(sql);
  const { results } = await stmt.all<Record<string, unknown>>();
  const appts = results ?? [];

  return {
    v: 1,
    key: "appointments",
    title: "Appointments",
    subtitle: "Granted visits (distinct from requested intake logistics)",
    refresh: { tool: "open_appointments", args: filtered ? { status: filtered } : {} },
    children: [
      {
        type: "form",
        title: "Filter",
        fields: [
          {
            name: "status",
            label: "Status",
            type: "select",
            value: filtered ?? "",
            options: [
              { value: "", label: "All" },
              ...[...valid].map((s) => ({ value: s, label: s })),
            ],
          },
        ],
        submit: {
          label: "Apply",
          tone: "brand",
          call: { tool: "open_appointments" },
          refresh: false,
        },
      },
      {
        type: "table",
        columns: [
          { key: "scheduled_at", label: "When", format: "datetime" },
          { key: "patient", label: "Patient" },
          { key: "chamber", label: "Chamber" },
          { key: "status", label: "Status", format: "badge" },
          { key: "note", label: "Note" },
        ],
        rows: appts.map((a) => ({
          intakeId: (a.intake_id as string | null) ?? "",
          scheduled_at: Number(a.scheduled_at ?? 0),
          patient: (a.patient as string | null) ?? "—",
          chamber: (a.chamber as string | null) ?? "—",
          status: statusBadge(String(a.status ?? "proposed")),
          note: (a.note as string | null) ?? "",
        })),
        onRowOpen: {
          call: { tool: "open_intake" },
          argKey: "intakeId",
          rowKey: "intakeId",
        },
        empty: "No appointments recorded.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Activity — the cross-session log (who did what, from which surface)
// ---------------------------------------------------------------------------

export async function buildActivity(ctx: AgentContext): Promise<ViewDocument> {
  const actions = await listAdminActions(ctx.env, 30);

  const SURFACE_LABEL: Record<string, BadgeSpec> = {
    agent: { text: "assistant", tone: "info" },
    mcp: { text: "connector", tone: "brand" },
    "app-view": { text: "console", tone: "neutral" },
  };

  return {
    v: 1,
    key: "activity",
    title: "Recent activity",
    subtitle: "Writes from every surface — assistant chat, connected apps, console views",
    refresh: { tool: "open_activity" },
    children: [
      {
        type: "table",
        columns: [
          { key: "at", label: "When", format: "datetime" },
          { key: "tool", label: "Action", format: "badge" },
          { key: "detail", label: "Detail" },
          { key: "surface", label: "Via", format: "badge" },
          { key: "actor", label: "By" },
        ],
        rows: actions.map((a) => ({
          at: a.at,
          tool: { text: a.tool, tone: "neutral" },
          detail: Object.entries(a.detail)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join("  ") || "—",
          surface: SURFACE_LABEL[a.surface] ?? { text: a.surface, tone: "neutral" },
          actor: a.actor.split("@")[0],
        })),
        empty: "No recorded activity yet.",
      },
    ],
  };
}
