// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, setDataMode } from "../src/lib/api.js";
class UploadXHR {
  static latest: UploadXHR;
  headers: Record<string, string> = {}; upload: { onprogress?: (event: any) => void } = {};
  method = ""; url = ""; status = 200; responseText = ""; timeout = 0; body?: FormData;
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void;
  constructor() { UploadXHR.latest = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(key: string, value: string) { this.headers[key] = value; }
  send(body: FormData) { this.body = body; }
  abort() { this.onabort?.(); }
}
beforeEach(() => { setDataMode("real"); vi.stubGlobal("XMLHttpRequest", UploadXHR); });
afterEach(() => vi.unstubAllGlobals());
it("sends a real multipart File, reports actual byte progress and leaves boundary generation to the browser", async () => {
 const progress = vi.fn(), file = new File(["Resume source text"], "resume.txt", { type: "text/plain" });
 const request = api.extractResumeDocument(file, progress), xhr = UploadXHR.latest;
 expect(xhr.url).toBe("/api/profile/extract-document"); expect(xhr.headers).toEqual({ "X-HireFlow-Mode": "real" }); expect(xhr.body?.get("resume")).toBe(file); expect(xhr.timeout).toBe(30000);
 xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 }); expect(progress).toHaveBeenCalledWith(25);
 xhr.responseText = JSON.stringify({ success: true, text: "Resume source text", filename: "resume.txt", format: "txt" }); xhr.onload?.();
 await expect(request).resolves.toMatchObject({ text: "Resume source text" });
});
it("rejects network errors, malformed extraction responses and upload timeouts", async () => {
 for (const scenario of ["network", "timeout", "malformed", "empty"] as const) {
  const request = api.extractResumeDocument(new File(["resume"], "resume.txt"), () => {}), xhr = UploadXHR.latest;
  if (scenario === "network") xhr.onerror?.(); else if (scenario === "timeout") xhr.ontimeout?.(); else { xhr.responseText = scenario === "malformed" ? "not-json" : '{"success":true,"text":""}'; xhr.onload?.(); }
  await expect(request).rejects.toThrow(/upload failed|timed out|Invalid server response|no readable resume text/);
 }
});
it("aborts real → demo → real uploads and ignores subsequent progress and late responses", async () => {
 const progress = vi.fn(), pending = api.extractResumeDocument(new File(["resume"], "resume.txt"), progress), xhr = UploadXHR.latest;
 const rejected = expect(pending).rejects.toThrow("cancelled"); setDataMode("demo"); setDataMode("real"); await rejected;
 xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 }); xhr.responseText = '{"success":true,"text":"Stale resume"}'; xhr.onload?.();
 expect(progress).not.toHaveBeenCalled();
});
