import { Pool } from "pg";
import { connectionConfig, type ConnectionKind } from "./config.js";
export interface SqlResult { rows: any[]; rowCount?: number | null; }
export interface SqlClient { query(text: string, values?: any[]): Promise<SqlResult>; release(destroy?: boolean): void; }
export interface SqlPool { connect(): Promise<SqlClient>; end(): Promise<void>; }
export function createPool(kind: ConnectionKind): Pool {
  const pool = new Pool(connectionConfig(kind));
  pool.on("error", () => console.error("HireFlow PostgreSQL pool connection failed; credentials and query data omitted."));
  return pool;
}
