import "../server/config/env.js";
import { checkConnection, DEFAULT_MODEL } from "../server/gemini.js";
import { providerError } from "../server/ai-operation.js";
const model = process.argv[2] || DEFAULT_MODEL;
try {
  if (![DEFAULT_MODEL, "gemini-3.1-flash-lite"].includes(model)) throw new Error("Unsupported connection-check model");
  const status = await checkConnection(model);
  console.log(JSON.stringify(status));
} catch (error) {
  const safe = providerError(error);
  console.error(JSON.stringify({ connectivity: "failed", model, error: safe.message, details: safe.details }));
  process.exitCode = 1;
}
