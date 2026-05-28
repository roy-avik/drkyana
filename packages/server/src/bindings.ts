/**
 * Cloudflare bindings for the agent server.
 *
 * NOTE: these are MINIMAL placeholder interfaces so the contract compiles
 * before `@cloudflare/workers-types` is installed (Phase 1). Replace the
 * placeholders with the real types from `@cloudflare/workers-types` then —
 * the field names already match the real bindings.
 */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface KVNamespace {
  get(key: string, type?: "text" | "json"): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}
export interface VectorizeIndex {
  query(
    vector: number[],
    opts?: {
      topK?: number;
      namespace?: string;
      returnMetadata?: "none" | "indexed" | "all";
      filter?: Record<string, unknown>;
    },
  ): Promise<{ matches: VectorizeMatch[] }>;
  upsert(
    vectors: { id: string; values: number[]; namespace?: string; metadata?: Record<string, unknown> }[],
  ): Promise<{ count: number }>;
}

export interface R2Bucket {
  get(key: string): Promise<{ body: ReadableStream; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer | ReadableStream | string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cloudflare Email Service send binding (`send_email`). */
export interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

/**
 * Worker environment. Secrets (ANTHROPIC_API_KEY, PATIENT_AGENT_TOKEN, etc.)
 * are injected by Cloudflare; never hard-code them.
 */
export interface Env {
  // data
  DB: D1Database;
  KV: KVNamespace;
  VECTORIZE: VectorizeIndex;
  R2: R2Bucket;
  // email
  EMAIL: SendEmailBinding;
  // secrets
  ANTHROPIC_API_KEY: string;
  PATIENT_AGENT_TOKEN: string;
  IP_HASH_SALT: string;
  // config
  RECEPTIONIST_FROM: string; // "receptionist@drkyana.com"
  DR_KYANA_NOTIFY_EMAIL: string;
}
