// Stub for `worker-mailer` (SMTP over cloudflare:sockets). Records sends so a
// test can assert an email WOULD have gone out, without opening a socket.
export const sent: Array<Record<string, unknown>> = [];

export class WorkerMailer {
  static async connect(): Promise<WorkerMailer> {
    return new WorkerMailer();
  }
  async send(message: Record<string, unknown>): Promise<void> {
    sent.push(message);
  }
  async close(): Promise<void> {}
}
