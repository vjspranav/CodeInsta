/**
 * In-memory stand-in for the Supabase client, shared by the data-layer tests. Just enough of the
 * query builder (select/insert/delete/eq/gte, thenable) and auth/rpc to record what the code did.
 */
type Result = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };
export type Call = {
  table: string;
  op: "select" | "insert" | "delete";
  payload?: unknown;
  filters: [string, string, unknown][];
  opts?: unknown;
};

export function makeFakeDb(userId: string | null = "user-1") {
  const rows: Record<string, Record<string, unknown>[]> = {};
  const calls: Call[] = [];
  /** key `${table}.${op}`: error to return for that operation. */
  const failures: Record<string, { code?: string; message?: string } | undefined> = {};
  /** key `${table}.${op}`: promise the operation waits on before answering. */
  const gates: Record<string, Promise<void> | undefined> = {};
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const rpcResult: { value: unknown; error: unknown } = { value: 0, error: null };

  const exec = async (table: string, q: Call): Promise<Result> => {
    calls.push(q);
    const key = `${table}.${q.op}`;
    const gate = gates[key];
    if (gate) await gate;
    const failure = failures[key];
    if (failure) return { data: null, error: failure, count: null };
    const list = (rows[table] ??= []);
    const match = (row: Record<string, unknown>) =>
      q.filters.every(([kind, col, val]) =>
        kind === "eq" ? row[col] === val : String(row[col]) >= String(val),
      );
    if (q.op === "insert") {
      list.push({ created_at: new Date().toISOString(), ...(q.payload as object) });
      return { data: null, error: null };
    }
    if (q.op === "delete") {
      rows[table] = list.filter((row) => !match(row));
      return { data: null, error: null };
    }
    const found = list.filter(match);
    return { data: found, error: null, count: found.length };
  };

  const db = {
    from(table: string) {
      const q: Call = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {
        select(_cols?: string, opts?: unknown) {
          q.op = "select";
          q.opts = opts;
          return b;
        },
        insert(payload: unknown) {
          q.op = "insert";
          q.payload = payload;
          return b;
        },
        delete() {
          q.op = "delete";
          return b;
        },
        eq(col: string, val: unknown) {
          q.filters.push(["eq", col, val]);
          return b;
        },
        gte(col: string, val: unknown) {
          q.filters.push(["gte", col, val]);
          return b;
        },
        then(resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) {
          return exec(table, q).then(resolve, reject);
        },
      };
      return b;
    },
    rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: rpcResult.value, error: rpcResult.error });
    },
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: userId ? { user: { id: userId } } : null } }),
    },
  };
  return { db, rows, calls, failures, gates, rpcCalls, rpcResult };
}
