import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import type { ClientBase } from "pg";
import { SafetyError } from "../validation.js";
import { connectionConfig } from "./config.js";

export function verifyMigrationTarget(env: NodeJS.ProcessEnv = process.env) {
  connectionConfig("DATABASE_URL", env); connectionConfig("DATABASE_MIGRATION_URL", env);
  const runtime = new URL(env.DATABASE_URL!), direct = new URL(env.DATABASE_MIGRATION_URL!);
  if (runtime.hostname.replace("-pooler.", ".") !== direct.hostname || runtime.pathname !== direct.pathname || runtime.port !== direct.port) throw new SafetyError("Runtime and migration connections must target the same PostgreSQL database", 503);
}
export async function migrate(client: ClientBase) {
  const preflight = await client.query("SELECT to_regnamespace('hireflow') IS NOT NULL AS schema_exists, to_regclass('public.hireflow_migrations') IS NOT NULL AS history_exists");
  if (preflight.rows[0].schema_exists && !preflight.rows[0].history_exists) throw new SafetyError("An unmanaged HireFlow schema exists. Migration stopped without replacing any objects.", 409);
  // Direct connections only: the runner's advisory lock is session-scoped.
  // Silence driver/runner messages, which can contain server diagnostics or SQL data.
  return runner({ dbClient: client, dir: fileURLToPath(new URL("../migrations", import.meta.url)),
    migrationsTable: "hireflow_migrations", migrationsSchema: "public", schema: "public",
    direction: "up", singleTransaction: true, checkOrder: true, count: Infinity,
    logger: { info() {}, warn() {}, error() {}, debug() {} } });
}
