import { PROJECT_ROOT } from "./server/config/env.js";
import express from "express";
import path from "node:path";
import { createPool } from "./server/persistence/pool.js";
import { PostgresRepository } from "./server/persistence/postgres.js";
import { databaseError } from "./server/persistence/config.js";
import { createApp } from "./server/app.js";

async function startServer() {
  const repository = new PostgresRepository(createPool("DATABASE_URL"));
  let vite: { close(): Promise<void> } | undefined;
  try {
    await repository.verifyReady();
    const app = createApp(repository);
    if (process.env.NODE_ENV !== "production") {
      const { createServer } = await import("vite");
      const dev = await createServer({ root: PROJECT_ROOT, server: { middlewareMode: true }, appType: "spa" });
      vite = dev; app.use(dev.middlewares);
    } else {
      const dist = path.join(PROJECT_ROOT, "dist");
      app.use(express.static(dist));
      app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
    }
    // Personal app: bind to loopback by default; authentication is not implemented.
    const server = app.listen(Number(process.env.PORT || 3000), process.env.HOST || "127.0.0.1", () => console.log("HireFlow started with PostgreSQL. Processing is manual; discovery and submission are not implemented."));
    let stopping = false;
    const shutdown = () => {
      if (stopping) return; stopping = true;
      const deadline = setTimeout(() => server.closeAllConnections(), 65_000);
      server.close(() => {
        clearTimeout(deadline);
        void Promise.all([vite?.close(), repository.close()]).catch(() => { console.error("HireFlow shutdown failed; database details omitted."); process.exitCode = 1; });
      });
    };
    process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
    server.on("error", () => { console.error("HireFlow HTTP server failed."); shutdown(); process.exitCode = 1; });
  } catch (error) { await vite?.close(); await repository.close(); throw error; }
}
startServer().catch(error => { console.error("HireFlow startup failed:", databaseError(error).message); process.exitCode = 1; });
