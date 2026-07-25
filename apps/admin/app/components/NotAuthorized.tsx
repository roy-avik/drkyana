import { Card } from "@drkyana/ui";

export default function NotAuthorized() {
  return (
    <Card className="border-red/30 bg-red/5">
      <h2 className="font-semibold text-red">Not authorized</h2>
      <p className="mt-1 text-sm text-muted">
        This console is protected by Cloudflare Access. Sign in with the
        authorized Google account to continue.
      </p>
    </Card>
  );
}
