# Connecting Claude & ChatGPT (including iOS/iPad) to the admin MCP server

The admin console exposes its views and toolset at `https://<admin-host>/api/mcp`
(MCP Streamable HTTP + MCP Apps). Native apps can't send Cloudflare Access
headers, so the endpoint speaks **standard MCP OAuth**: discovery via
RFC 9728/8414, dynamic client registration (RFC 7591), authorization-code +
PKCE. **Sign-in is still Cloudflare Access** — the authorize page sits behind
the same Google SSO; OAuth only converts that verified session into a bearer
token the app can hold. No new passwords, no client secrets.

```
Claude/ChatGPT app ── POST /api/mcp ──────────────► 401 + WWW-Authenticate
        │                                            (points at /.well-known/…)
        ├─ GET /.well-known/oauth-protected-resource  (public)
        ├─ POST /api/oauth/register                   (public, DCR)
        ├─ opens BROWSER → /oauth/authorize ────────► Cloudflare Access forces
        │       Google sign-in → consent page → code   (the ONLY human step)
        ├─ POST /api/oauth/token (code + PKCE) ─────► access + refresh token
        └─ POST /api/mcp  Authorization: Bearer …  ─► tools + rendered views
```

## 1. One-time Cloudflare Zero Trust setup

The admin domain is fronted by one Access application (Google SSO). OAuth
needs four paths reachable **without** the SSO redirect (they're called
server-to-server by the connector backends and are self-protecting):

Create a second, **path-scoped** Access application (Self-hosted) — most
specific host+path wins in Access, so these carve exceptions out of the main
app — with a single **Bypass → Everyone** policy, listing these paths:

| Path | Why it's safe to bypass |
|---|---|
| `<admin-host>/.well-known/*` | Public discovery metadata; no data. |
| `<admin-host>/api/oauth/register` | Registration grants nothing by itself. |
| `<admin-host>/api/oauth/token` | Only redeems single-use, PKCE-bound codes minted behind SSO. |
| `<admin-host>/api/mcp` | The Worker enforces auth itself: OAuth bearer or Access JWT, else 401. |

**Do NOT bypass `/oauth/authorize`** — it must stay inside the SSO app; that
browser hop *is* the authentication.

That's the whole config. (The earlier service-token setup is no longer
needed: every client, including `mcp-remote` and Claude Code, can use this
OAuth flow.)

## 2. Claude — iPhone / iPad / web / desktop

Connectors are account-level, so add once and it's available everywhere,
including the iOS app:

1. Go to **claude.ai → Settings → Connectors → Add custom connector** (on
   web or in the mobile app's settings).
2. URL: `https://<admin-host>/api/mcp` → **Add**, then **Connect**.
3. A browser sheet opens → Cloudflare Access → **Sign in with Google**
   (Dr Kyana's account) → the consent page ("Connect to Dr Kyana's practice
   console?") → **Authorize**.
4. In a chat, enable the connector under the tools (🔧) menu.

Then: *"Open the intake queue"* → Claude renders the interactive view inline
(Claude's iOS/web/desktop hosts support MCP Apps). Filtering, opening an
intake, changing its status all happen by tapping inside the view. When
Claude itself proposes a write, the app shows its allow/deny prompt — the
same "agent drafts, dentist decides" gate as everywhere else.

## 3. ChatGPT — iPhone / iPad

ChatGPT requires **developer mode** for custom MCP connectors (paid plans;
toggle is on the web app, connectors then sync to iOS):

1. On chatgpt.com: **Settings → Apps & Connectors → Advanced settings →
   Developer mode** (enable).
2. **Apps & Connectors → Create** → MCP server URL
   `https://<admin-host>/api/mcp`, authentication **OAuth** → Create → the
   same browser sign-in + consent flow as above.
3. On iOS, enable the connector for a conversation (developer-mode
   connectors appear under tools).

ChatGPT co-authored the MCP Apps extension; where app rendering is enabled
it draws the views, otherwise tools still work and return the text
summaries.

## 4. Claude Code / other MCP clients

`claude mcp add --transport http drkyana https://<admin-host>/api/mcp` — the
CLI hits the 401, discovers OAuth, opens the browser for the same Access
sign-in. (Terminal clients call tools but don't render the iframe views.)

## Security model & revocation

- **Who can connect:** only someone who completes the Access Google SSO —
  i.e. the identities allowed on the admin Access app. The consent page
  shows the requesting client and warns that access includes patient
  records.
- **Tokens:** access tokens live 1 h; refresh tokens 30 d and rotate on
  every use; codes are single-use with a 10-minute TTL; PKCE (S256) is
  mandatory; redirect URIs must be pre-registered and https.
- **Revoke everything:** delete the `oauth:*` keys from the `drkyana` KV
  namespace (dashboard or `wrangler kv key list --prefix=oauth:` + delete).
  Removing Dr Kyana's connector inside Claude/ChatGPT drops the client-side
  token too.
- **PHI caution:** a connected app can read what the tools expose. Only
  connect accounts you'd let into the admin console itself, and remember
  the Anthropic BAA / data-processing caveats before real patient data
  flows through any third-party host.
