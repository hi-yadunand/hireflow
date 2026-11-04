import { config } from "dotenv";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));
export function loadServerEnvironment(file = ENV_FILE, environment = process.env) {
  const result = config({ path: file, processEnv: environment, override: false, quiet: true });
  if (result.error && (result.error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Could not read the server environment configuration. Check local file permissions.");
  return { fileFound: !result.error, geminiConfigured: !!environment.GEMINI_API_KEY?.trim() && environment.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" };
}
// Tests inject environment values explicitly and never read the real .env.
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) loadServerEnvironment();
