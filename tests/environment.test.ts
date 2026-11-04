import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { ENV_FILE, PROJECT_ROOT, loadServerEnvironment } from "../server/config/env.js";
const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })); });
it("loads the explicitly selected environment before services without returning values or overwriting existing configuration", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hireflow-env-test-")); dirs.push(dir);
  const file = path.join(dir, ".env"), environment = { DATABASE_URL: "existing-test-database-sentinel" } as NodeJS.ProcessEnv;
  fs.writeFileSync(file, 'GEMINI_API_KEY="test-only-secret"\nDATABASE_URL="file-test-database"\n', { mode: 0o600 });
  const status = loadServerEnvironment(file, environment);
  expect(status).toEqual({ fileFound: true, geminiConfigured: true }); expect(environment.GEMINI_API_KEY).toBe("test-only-secret"); expect(environment.DATABASE_URL).toBe("existing-test-database-sentinel");
  expect(JSON.stringify(status)).not.toContain("test-only-secret");
});
it("uses the project root for .env resolution and reports missing keys honestly", () => {
  expect(ENV_FILE).toBe(path.join(PROJECT_ROOT, ".env"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hireflow-env-test-")); dirs.push(dir);
  expect(loadServerEnvironment(path.join(dir, "missing.env"), {})).toEqual({ fileFound: false, geminiConfigured: false });
  const file = path.join(dir, ".env"); fs.writeFileSync(file, 'GEMINI_API_KEY=""\n'); expect(loadServerEnvironment(file, {}).geminiConfigured).toBe(false);
});
