/**
 * MCP Apps surface for the admin console (server-only).
 *
 *  - views.ts    — View-DSL document builders (D1 rows → declarative views)
 *  - template.ts — the ui://drkyana/admin-view.html MCP App (DLS-styled renderer)
 *  - tools.ts    — view tools (open_*) + app-only action tools (ui_*)
 *  - server.ts   — stateless Streamable-HTTP MCP server (mounted at /api/mcp)
 */
export { handleMcpPost, handleMcpMethodNotAllowed } from "./server";
export {
  viewTools,
  appActionTools,
  viewActionTools,
  type ViewToolOutput,
} from "./tools";
export {
  ADMIN_VIEW_RESOURCE_URI,
  MCP_APP_MIME_TYPE,
  renderAdminViewTemplate,
} from "./template";
export {
  buildAuthServerMetadata,
  buildProtectedResourceMetadata,
  bearerChallenge,
  registerClient,
  renderAuthorizePage,
  completeAuthorize,
  exchangeToken,
  verifyBearer,
  type AuthorizeParams,
  type BearerIdentity,
} from "./oauth";
