// Stub for the `cloudflare:sockets` runtime built-in (pulled in transitively by
// worker-mailer). Any test that reaches this has strayed out of unit-test
// territory — fail loudly rather than silently pretending to open a socket.
export function connect(): never {
  throw new Error('cloudflare:sockets connect() is not available under vitest');
}
