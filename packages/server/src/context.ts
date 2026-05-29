/**
 * AgentContext — the server-side capability bundle passed into every tool's
 * `execute()`. The MODEL never sees this; it only emits tool calls. Authorization
 * is derived here from the verified request (Access JWT / patient session),
 * never from model-supplied arguments.
 */
import type { Env } from "./bindings";
import type { Locale } from "@drkyana/types";

export type Caller =
  | { kind: "patient"; sessionId: string; patientId?: string; ipHash: string }
  | { kind: "admin"; email: string; accessSub: string };

export interface AgentContext {
  env: Env;
  caller: Caller;
  locale: Locale;
  abortSignal?: AbortSignal;
  /** Schedule background work that may outlive the response (ctx.waitUntil). */
  waitUntil(p: Promise<unknown>): void;
}

/** Throws unless the caller is an authenticated admin. Call inside admin tools. */
export function assertAdmin(ctx: AgentContext): asserts ctx is AgentContext & {
  caller: Extract<Caller, { kind: "admin" }>;
} {
  if (ctx.caller.kind !== "admin") {
    throw new Error("forbidden: admin-only tool");
  }
}

/** Scope a patient tool to the caller's own record. */
export function assertOwnPatient(ctx: AgentContext, patientId: string): void {
  if (ctx.caller.kind === "admin") return;
  if (ctx.caller.patientId !== patientId) {
    throw new Error("forbidden: patient may only access their own record");
  }
}
