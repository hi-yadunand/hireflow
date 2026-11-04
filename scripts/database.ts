import "dotenv/config";
import { createPool } from "../server/persistence/pool.js";
import { PostgresRepository } from "../server/persistence/postgres.js";
import { databaseError } from "../server/persistence/config.js";
import { migrate, verifyMigrationTarget } from "../server/persistence/migrate.js";

async function main() {
  const mode = process.argv[2];
  if (mode !== "migrate" && mode !== "check") throw new Error("Use db:migrate or db:check");
  verifyMigrationTarget();
  const pool = createPool(mode === "migrate" ? "DATABASE_MIGRATION_URL" : "DATABASE_URL");
  const repository = new PostgresRepository(pool);
  try {
    if (mode === "migrate") {
      const client = await pool.connect();
      let count: number;
      try { count = (await migrate(client)).length; } finally { client.release(); }
      await repository.initialize();
      console.log(`PostgreSQL migrations applied: ${count}. Clean initialization verified; no legacy import or demo seeding performed.`);
    }
    await repository.verifyReady();
    const state = await repository.read(db => ({ jobs: db.getJobs().length, applications: db.getApplications().length, paused: db.getStatus().isPaused }));
    console.log("PostgreSQL connection and schema verified. Manual processing only.", state);
  } finally { await repository.close(); }
}
main().catch(error => { console.error("HireFlow database command failed:", databaseError(error).message); process.exitCode = 1; });
