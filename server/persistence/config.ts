import type { PoolConfig } from "pg";
import { SafetyError } from "../validation.js";
export type ConnectionKind = "DATABASE_URL" | "DATABASE_MIGRATION_URL";
export function connectionConfig(kind: ConnectionKind, env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const value = env[kind]?.trim();
  if (!value) throw new SafetyError(`${kind} is required. PostgreSQL persistence cannot start.`, 503);
  let url: URL;
  try { url = new URL(value); } catch { throw new SafetyError(`${kind} must be a valid PostgreSQL URL`, 503); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) throw new SafetyError(`${kind} must be a valid PostgreSQL URL`, 503);
  for (const key of url.searchParams.keys()) if (["host", "hostaddr", "port", "database", "dbname", "user", "username", "password"].includes(key.toLowerCase())) throw new SafetyError(`${kind} must not override endpoint or credentials through query parameters`, 503);
  if (kind === "DATABASE_MIGRATION_URL" && url.hostname.includes("-pooler.")) throw new SafetyError("DATABASE_MIGRATION_URL must use a direct connection", 503);
  if (env.NODE_ENV === "test" || env.VITEST) throw new SafetyError("Automated tests must inject a local SQL double; remote database URLs are disabled in tests", 503);
  // One TLS policy source: URL parameters must not replace certificate validation.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "sslnegotiation"]) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true }, enableChannelBinding: true,
    max: kind === "DATABASE_URL" ? 5 : 1, min: 0, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 15_000,
    maxLifetimeSeconds: 300, statement_timeout: kind === "DATABASE_URL" ? 5_000 : 60_000,
    idle_in_transaction_session_timeout: 10_000, application_name: "hireflow" };
}
export function databaseError(error: unknown): SafetyError {
  if (error instanceof SafetyError) return error;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (code === "23505") return new SafetyError("A conflicting record already exists. Reload before retrying.", 409, { code: "DB_CONFLICT" });
  if (["23503", "23514", "23502"].includes(String(code))) return new SafetyError("Database integrity validation failed. No changes were saved.", 409, { code: "DB_INTEGRITY" });
  const safe = new Set(["28P01", "28000", "42501", "3D000", "3F000", "42P01", "08000", "08003", "08006", "53300", "57P01", "57014", "55P03", "40P01", "40001", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"]);
  const diagnostic = typeof code === "string" && safe.has(code) ? ` (${code})` : "";
  return new SafetyError(`PostgreSQL operation failed${diagnostic}. Server state must be reloaded before retrying.`, 503, { code: "DB_UNAVAILABLE" });
}
