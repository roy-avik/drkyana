/**
 * Skill sandbox — the Vercel cookbook centres `loadSkill` around a `Sandbox`
 * interface (readFile / readdir). On Node it's backed by the real FS; here it's
 * backed by a `Record<string, string>` generated at build time (Workers have
 * no FS).
 *
 * Keeping the abstraction means the runtime code matches the guide's example
 * unchanged — only `mapSandbox` is Workers-specific. If we ever swap to a
 * different backing store (R2 for hot-loadable skills, etc.) only this file
 * changes.
 */

export interface Sandbox {
  /** Read a file's contents as UTF-8 text. Throws if the path is unknown. */
  readFile(path: string): Promise<string>;
  /**
   * List files under a directory prefix (non-recursive). Returns repo-relative
   * paths. Returns `[]` if the prefix has no entries.
   */
  readdir(prefix: string): Promise<string[]>;
}

/** In-memory sandbox backed by a {path: body} map. */
export function mapSandbox(files: Record<string, string>): Sandbox {
  return {
    async readFile(path: string): Promise<string> {
      const body = files[path];
      if (body === undefined) {
        throw new Error(`sandbox: file not found: ${path}`);
      }
      return body;
    },
    async readdir(prefix: string): Promise<string[]> {
      const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
      const out: string[] = [];
      for (const key of Object.keys(files)) {
        if (!key.startsWith(normalized)) continue;
        const rest = key.slice(normalized.length);
        // Non-recursive: only direct entries (no further "/").
        if (!rest.includes("/")) out.push(key);
      }
      return out;
    },
  };
}
