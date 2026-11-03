import "dotenv/config";
import express from "express";
import path from "node:path";
import { Database } from "./server/db.js";
import { createApp } from "./server/app.js";

async function startServer() {
  // Database construction is explicit: importing API modules never touches user data.
  const db = new Database();
  const app = createApp(db);
  const production = process.env.NODE_ENV === "production";
  if (!production) {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve("dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  app.listen(process.env.PORT || 3000, () => console.log("HireFlow started. Processing is manual; discovery and submission are not implemented."));
}
startServer().catch(error => { console.error("HireFlow startup failed:", error); process.exitCode = 1; });
