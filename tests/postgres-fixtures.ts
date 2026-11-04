import { PGlite } from "@electric-sql/pglite";
import type { ClientBase } from "pg";
import { PostgresRepository } from "../server/persistence/postgres.js";
import { migrate } from "../server/persistence/migrate.js";
import type { SqlPool, SqlClient } from "../server/persistence/pool.js";

/** In-memory PostgreSQL test double. No connection strings, files or remote connections.
 * PGlite has one session, so checked-out clients are serialized. Neon concurrency
 * and PgBouncer behavior still require separate live integration verification. */
export class LocalSqlPool implements SqlPool {
  active = 0;
  private tail: Promise<void> = Promise.resolve();
  private constructor(readonly sql: PGlite) {}
  static async create() { return new LocalSqlPool(await PGlite.create()); }
  async connect(): Promise<SqlClient> {
    const previous = this.tail;
    let unlock!: () => void;
    this.tail = new Promise<void>(resolve => { unlock = resolve; });
    await previous; this.active++;
    let released = false;
    return {
      query: async (text, values) => {
        const result = values?.length ? await this.sql.query(text, values) : (await this.sql.exec(text)).at(-1)!;
        return { rows: result.rows, rowCount: result.affectedRows };
      },
      release: () => { if (!released) { released = true; this.active--; unlock(); } },
    };
  }
  async end() { await this.tail; await this.sql.close(); }
  async raw(text: string, values?: any[]) { const c = await this.connect(); try { return await c.query(text, values); } finally { c.release(); } }
}
export async function localRepository() {
  const pool = await LocalSqlPool.create(), client = await pool.connect();
  try { await migrate(client as unknown as ClientBase); } catch (error) { client.release(); await pool.end(); throw error; } finally { client.release(); }
  const db = new PostgresRepository(pool);
  await db.initialize();
  return { pool, db };
}
