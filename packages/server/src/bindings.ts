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
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cloudflare Email Service send binding (`send_email`). */
export interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

/**
 * Workers AI binding (`AI`). Used ONLY for embeddings here (Anthropic has no
 * embeddings API): the KB query is embedded with a multilingual 1024-dim model
 * (`@cf/baai/bge-m3`) whose dimensions match the `drkyana-kb` Vectorize index.
 * Minimal placeholder shape (mirrors the real `Ai` from @cloudflare/workers-types).
 */
export interface AiEmbeddingResponse {
  shape?: number[];
  data: number[][];
}
export interface Ai {
  run(
    model: "@cf/baai/bge-m3",
    inputs: { text: string | string[] },
  ): Promise<AiEmbeddingResponse>;
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
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
  // Workers AI — embeddings for kb_search (bge-m3, 1024-dim → matches Vectorize).
  AI: Ai;
  // email
  EMAIL: SendEmailBinding;
  // secrets
  ANTHROPIC_API_KEY: string;
  PATIENT_AGENT_TOKEN: string;
  IP_HASH_SALT: string;
  /**
   * Tavily search API key — admin agent's `web_search` and `web_fetch`.
   * Optional: when unset, both tools fail soft and the agent continues without
   * live web access (treat like an empty KB).
   */
  TAVILY_API_KEY?: string;
  /**
   * SMTP password for the clinic mailbox (RECEPTIONIST_FROM) — patient OTP
   * send path (packages/server/src/smtp.ts). Cloudflare secret; never committed.
   * The `cloudflare:email` binding can't reach arbitrary patient addresses, so
   * OTP goes out over GoDaddy SMTP instead.
   */
  SMTP_PASSWORD?: string;
  /** SMTP host — default "smtpout.secureserver.net" (GoDaddy Pro Email). */
  SMTP_HOST?: string;
  /** SMTP port — default 465 (implicit TLS); 587 for STARTTLS. */
  SMTP_PORT?: string;
  // config
  RECEPTIONIST_FROM: string; // "receptionist@drkyana.com"
  DR_KYANA_NOTIFY_EMAIL: string;
}
