import { Worker } from "node:worker_threads";
import path from "node:path";
import { SafetyError } from "./validation.js";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_TEXT_LIMIT = 120_000;
export const DOCUMENT_TIMEOUT_MS = 15_000;
export type ResumeFormat = "pdf" | "docx" | "txt" | "md";
let activeWorkers = 0;
const types: Record<ResumeFormat, string[]> = { pdf: ["application/pdf"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], txt: ["text/plain"], md: ["text/plain", "text/markdown", "text/x-markdown"] };
export function documentFormat(name: string, mime = ""): ResumeFormat {
  const extension = path.extname(name).slice(1).toLowerCase() as ResumeFormat;
  if (!Object.hasOwn(types, extension)) throw new SafetyError("Supported resume formats: PDF, DOCX, TXT and Markdown (.md)", 415);
  if (mime && mime !== "application/octet-stream" && !types[extension].includes(mime)) throw new SafetyError("File type does not match the selected resume format", 415);
  return extension;
}
export function safeResumeFilename(name: string) { return path.basename(name.replace(/\\/g, "/")).replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 120) || "resume"; }
export function extractResumeDocument(buffer: Buffer, name: string, mime = "", options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ text: string; pages?: number; filename: string; format: ResumeFormat }> {
  const format = documentFormat(name, mime);
  if (!buffer.length) return Promise.reject(new SafetyError("The selected resume file is empty", 422));
  if (buffer.length > MAX_RESUME_BYTES) return Promise.reject(new SafetyError("Resume exceeds the 5 MB upload limit", 413));
  if ((format === "pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) || (format === "docx" && !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])))) return Promise.reject(new SafetyError("File contents do not match the selected document type", 415));
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new SafetyError("Document extraction cancelled", 409)); return; }
    if (activeWorkers >= 2) { reject(new SafetyError("Document extraction is busy. Retry after the current uploads finish.", 429)); return; }
    const worker = new Worker(new URL("./document-worker.mjs", import.meta.url), { workerData: { bytes: new Uint8Array(buffer), format }, execArgv: [], env: { NODE_ENV: process.env.NODE_ENV || "development" }, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    activeWorkers++;
    // Parser diagnostics may include document data. Never forward them to logs.
    worker.stdout?.resume(); worker.stderr?.resume(); let settled = false;
    const finish = (error?: SafetyError, result?: { text: string; pages?: number }) => {
      if (settled) return; settled = true; activeWorkers--; clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
      void worker.terminate().catch(() => console.error("Resume extraction worker could not be terminated; document details omitted."));
      if (error) reject(error); else resolve({ ...result!, filename: safeResumeFilename(name), format });
    };
    const cancel = () => finish(new SafetyError("Document extraction cancelled", 409));
    const timer = setTimeout(() => finish(new SafetyError("Document extraction timed out. Try a smaller document or paste resume text.", 504, { code: "DOCUMENT_TIMEOUT" })), options.timeoutMs ?? DOCUMENT_TIMEOUT_MS);
    options.signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", message => message.error ? finish(new SafetyError(message.error, 422, { code: message.code })) : finish(undefined, message));
    worker.once("error", () => finish(new SafetyError("Document extraction failed. Try another copy of this document.", 422)));
    worker.once("exit", () => { if (!settled) finish(new SafetyError("Document extraction stopped before completion", 422)); });
  });
}
