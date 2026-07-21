import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Test floor for the pure logic where clinical risk concentrates: triage rules,
// deterministic fact merging, PII stripping, chunking, locale parsing, and the
// reminder query. Deliberately NOT a coverage push — these are the functions
// where a silent regression reaches a patient.
//
// `packages/server` is server-only and imports Cloudflare built-ins
// (`cloudflare:email`, and `cloudflare:sockets` transitively via worker-mailer).
// Those are runtime-provided and unresolvable under Node, so they're aliased to
// local stubs. Tests must therefore avoid asserting on real email/socket
// behaviour — that belongs in an integration test against wrangler, not here.
export default defineConfig({
  resolve: {
    alias: {
      '@drkyana/types': fileURLToPath(new URL('./packages/types/src/index.ts', import.meta.url)),
      'cloudflare:email': fileURLToPath(new URL('./tests/stubs/cloudflare-email.ts', import.meta.url)),
      'cloudflare:sockets': fileURLToPath(new URL('./tests/stubs/cloudflare-sockets.ts', import.meta.url)),
      'worker-mailer': fileURLToPath(new URL('./tests/stubs/worker-mailer.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
