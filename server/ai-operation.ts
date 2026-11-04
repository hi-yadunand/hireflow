import { SafetyError } from "./validation.js";

export const AI_TIMEOUT_MS = 60_000;
export interface AIOperationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  subscribeCancel?: (cancel: () => void) => () => void;
}

/** Only allow bounded diagnostic identifiers; never serialize provider messages. */
export function providerError(error: unknown): SafetyError {
  if (error instanceof SafetyError) return error;
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (value.name === "AbortError") return new SafetyError("AI request cancelled. No result was saved.", 409, { code: "AI_CANCELLED" });
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : undefined;
  const knownCodes = new Set(["RESOURCE_EXHAUSTED", "UNAUTHENTICATED", "PERMISSION_DENIED", "UNAVAILABLE", "DEADLINE_EXCEEDED", "INVALID_ARGUMENT", "INTERNAL", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND"]);
  const code = typeof value.code === "string" && knownCodes.has(value.code) ? value.code : undefined;
  const raw = typeof value.message === "string" ? value.message : "";
  const authReason = ["API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED", "API_KEY_REJECTED"].find(reason => raw.includes(reason)) || (status === 400 && /api.?key.{0,30}(?:not valid|invalid|expired)/i.test(raw) ? "API_KEY_INVALID" : undefined);
  const leaked = /key.{0,60}leaked|leaked.{0,60}key/i.test(raw);
  if (authReason || leaked || status === 401 || status === 403) return new SafetyError(`Gemini authentication failed${leaked ? " (key blocked as leaked)" : ""}. Replace GEMINI_API_KEY in the root .env with a valid, permitted key and restart the server.`, 503, { code: leaked ? "API_KEY_LEAKED" : authReason || code || "AI_AUTHENTICATION", providerStatus: status });
  const category = status === 429 ? "quota" : "availability";
  return new SafetyError(`AI request failed (${category}${status ? `; provider HTTP ${status}` : ""}${code ? `; ${code}` : ""}). No result was saved.${status === 429 ? " Check Gemini rate limits and project quota, then retry later." : status === 503 ? " Gemini is temporarily unavailable; retry later." : ""}`, status === 429 ? 429 : 502, { code: code || "AI_PROVIDER_ERROR", providerStatus: status });
}

/** Bounds the entire operation even when a provider ignores AbortSignal. */
export function runAiOperation<T>(work: (signal: AbortSignal) => Promise<T>, options: AIOperationOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) throw new SafetyError("Invalid AI timeout configuration", 500);
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let unsubscribe = () => {};
    const cancel = () => finish(new SafetyError("AI request cancelled or interrupted by pause. No result was saved.", 409, { code: "AI_CANCELLED" }));
    const timer = setTimeout(() => finish(new SafetyError("AI request timed out. No result was saved; retry the operation.", 504, { code: "AI_TIMEOUT" })), timeoutMs);
    function finish(error?: unknown, value?: T) {
      if (settled) return;
      settled = true; clearTimeout(timer); unsubscribe(); options.signal?.removeEventListener("abort", cancel);
      if (error) { controller.abort(error); reject(providerError(error)); } else resolve(value as T);
    }
    if (options.signal?.aborted) { cancel(); return; }
    options.signal?.addEventListener("abort", cancel, { once: true });
    unsubscribe = options.subscribeCancel?.(cancel) || unsubscribe;
    if (settled) { unsubscribe(); return; }
    // The rejection handler remains attached after timeout, avoiding late unhandled rejections.
    Promise.resolve().then(() => {
      if (settled) return;
      return work(controller.signal);
    }).then(value => finish(undefined, value), error => finish(providerError(error)));
  });
}
