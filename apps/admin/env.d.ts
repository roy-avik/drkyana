// Cloudflare bindings available to server-side code via getCloudflareContext().env.
//
// This augments the global `CloudflareEnv` interface that @opennextjs/cloudflare
// returns from getCloudflareContext().env. We declare it here (rather than via
// `wrangler types`, which generates a worker-configuration.d.ts at deploy time)
// so the management route handlers type the D1/KV/R2/Vectorize/Email bindings.
//
// NOTE: these shapes intentionally mirror packages/server/src/bindings.ts but are
// declared locally — admin client/server code must not import @drkyana/server for
// data access (the management CRUD is plain D1). Worker runtime types come from
// @cloudflare/workers-types.

import type {
  D1Database,
  KVNamespace,
  R2Bucket,
  VectorizeIndex,
  SendEmail,
} from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    // data
    DB: D1Database;
    KV: KVNamespace;
    VECTORIZE: VectorizeIndex;
    R2: R2Bucket;
    // email (Cloudflare Email Service send binding)
    EMAIL: SendEmail;
    // config vars
    RECEPTIONIST_FROM: string;
    DR_KYANA_NOTIFY_EMAIL: string;
    // secrets (injected by Cloudflare; never committed)
    ANTHROPIC_API_KEY?: string;
    // Cloudflare Access — JWT verification config for the admin gate.
    ACCESS_TEAM_DOMAIN?: string; // e.g. "drkyana.cloudflareaccess.com"
    ACCESS_AUD?: string; // Access application Audience (AUD) tag
  }
}

export {};
