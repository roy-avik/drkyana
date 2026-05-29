import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default Cloudflare config. Phase 1 may add R2 incremental cache / KV queue
// once provisioned. See https://opennext.js.org/cloudflare
export default defineCloudflareConfig();
