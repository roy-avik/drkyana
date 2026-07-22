// Stub for `worker-mailer` (SMTP over cloudflare:sockets). Records sends so a
// test can assert an email WOULD have gone out — and with what content —
// without opening a socket.
export const sent: Array<{ config: unknown; email: Record<string, unknown> }> = [];

/** Make the next static send throw, to exercise error paths. */
export let failNextSend: Error | null = null;
export function setFailNextSend(e: Error | null): void {
  failNextSend = e;
}

export class WorkerMailer {
  /** smtp.ts uses the static one-shot API: WorkerMailer.send(config, email). */
  static async send(config: unknown, email: Record<string, unknown>): Promise<void> {
    if (failNextSend) {
      const e = failNextSend;
      failNextSend = null;
      throw e;
    }
    sent.push({ config, email });
  }

  static async connect(): Promise<WorkerMailer> {
    return new WorkerMailer();
  }
  async close(): Promise<void> {}
}
