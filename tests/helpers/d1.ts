/**
 * Minimal D1 spy — records the SQL and bound params, returns canned rows.
 *
 * Deliberately NOT a SQL engine. It verifies the things that actually break in
 * review: that queries are parameterized (never string-interpolated), that the
 * right values are bound, and that rows map correctly onto the domain type.
 * Anything requiring real SQL semantics belongs in an integration test against
 * wrangler, not here.
 */
export interface RecordedQuery {
  sql: string;
  params: unknown[];
}

export function fakeD1<T = Record<string, unknown>>(rows: T[] = []) {
  const queries: RecordedQuery[] = [];
  /** Statements passed to DB.batch(), in order — batched writes are atomic. */
  const batches: RecordedQuery[][] = [];
  let nextRows: T[] = rows;
  let failWith: Error | null = null;
  // first() responses routed by SQL substring, so a function issuing several
  // different single-row queries can be driven precisely.
  const firstBySql: Array<{ match: string; value: unknown }> = [];

  const DB = {
    prepare(sql: string) {
      const recorded: RecordedQuery = { sql, params: [] };
      const stmt = {
        _recorded: recorded,
        bind(...params: unknown[]) {
          recorded.params = params;
          queries.push(recorded);
          return stmt;
        },
        async all<R = T>(): Promise<{ results: R[] }> {
          if (failWith) throw failWith;
          if (!queries.includes(recorded)) queries.push(recorded);
          return { results: nextRows as unknown as R[] };
        },
        async run() {
          if (failWith) throw failWith;
          if (!queries.includes(recorded)) queries.push(recorded);
          return { success: true };
        },
        async first<R = T>(): Promise<R | null> {
          if (failWith) throw failWith;
          if (!queries.includes(recorded)) queries.push(recorded);
          const hit = firstBySql.find((r) => sql.includes(r.match));
          if (hit) return hit.value as R | null;
          return (nextRows[0] as unknown as R) ?? null;
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ _recorded: RecordedQuery }>) {
      batches.push(stmts.map((s) => s._recorded));
      return stmts.map(() => ({ success: true }));
    },
  };

  return {
    DB,
    queries,
    batches,
    setRows(r: T[]) {
      nextRows = r;
    },
    /** Route a .first() result by SQL substring. Later calls win on tie. */
    whenFirst(match: string, value: unknown) {
      firstBySql.unshift({ match, value });
    },
    failNextWith(e: Error) {
      failWith = e;
    },
    /** Every recorded param across all queries and batches, flattened. */
    allParams(): unknown[] {
      return [...queries, ...batches.flat()].flatMap((q) => q.params);
    },
    find(match: string): RecordedQuery | undefined {
      return [...queries, ...batches.flat()].find((q) => q.sql.includes(match));
    },
    /** The single query issued, asserting exactly one happened. */
    onlyQuery(): RecordedQuery {
      if (queries.length !== 1) {
        throw new Error(`expected exactly 1 query, saw ${queries.length}`);
      }
      return queries[0]!;
    },
  };
}
