// Stub for the `cloudflare:email` runtime built-in, which only exists inside a
// Worker. Tests never exercise real delivery; email paths are asserted via the
// EMAIL binding stub instead.
export class EmailMessage {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly raw: string,
  ) {}
}
