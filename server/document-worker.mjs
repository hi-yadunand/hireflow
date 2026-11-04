import { parentPort, workerData } from "node:worker_threads";
import yauzl from "yauzl";

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const safeLink = value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
async function inspectDocx(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) return reject(new Error("Invalid DOCX"));
      const names = new Set(), links = new Set(), headers = []; let bytes = 0, count = 0, settled = false;
      const stop = error => { if (settled) return; settled = true; zip.close(); reject(error); };
      zip.on("error", stop);
      zip.on("entry", entry => {
        count++; bytes += entry.uncompressedSize;
        if (count > 512 || bytes > 24 * 1024 * 1024 || entry.uncompressedSize > 8 * 1024 * 1024 || (entry.generalPurposeBitFlag & 1) || entry.uncompressedSize > Math.max(4096, entry.compressedSize * 200)) return stop(Object.assign(new Error("Document archive exceeds safe extraction limits or is encrypted."), { code: "DOCUMENT_LIMIT" }));
        if (names.has(entry.fileName)) return stop(new Error("Duplicate archive entry"));
        names.add(entry.fileName);
        const header = /^word\/(?:header|footer)\d*\.xml$/.test(entry.fileName);
        if (!header && !/^word\/_rels\/[^/]+\.xml\.rels$/.test(entry.fileName)) { zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return stop(error || new Error("Unreadable archive"));
          const chunks = []; stream.on("error", stop); stream.on("data", chunk => chunks.push(chunk));
          stream.on("end", () => {
            // Relationship targets only; never follow a link or render document HTML.
            const xml = Buffer.concat(chunks).toString("utf8");
            if (header) {
              if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return stop(new Error("Unsupported XML entity declarations"));
              const text = [...xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t>/g)].map(match => match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")).join(" ");
              if (text.trim()) headers.push(text);
            }
            for (const match of xml.matchAll(/<Relationship\b[^>]*\bTarget=["']([^"']+)["'][^>]*\/?\s*>/g)) {
              if (!/\bType=["'][^"']*\/hyperlink["']/.test(match[0])) continue;
              const link = safeLink(match[1].replace(/&amp;/g, "&")); if (link) links.add(link);
            }
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => {
        if (settled) return; settled = true;
        if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) reject(new Error("Not a DOCX document"));
        else resolve({ links: [...links], headers });
      });
      zip.readEntry();
    });
  });
}
try {
  const buffer = Buffer.from(workerData.bytes); let text = "", pages;
  if (workerData.format === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, maxImageSize: 1_000_000 });
    try {
      const info = await parser.getInfo(); pages = info.total;
      if (pages > 30) fail("DOCUMENT_LIMIT", "PDF exceeds the 30-page resume limit.");
      const result = await parser.getText({ pageJoiner: "\n\n", parseHyperlinks: true });
      if (result.pages.some(page => (page.text.match(/[\p{L}\p{N}]/gu) || []).length < 20)) fail("OCR_REQUIRED", "PDF text extraction is insufficient on at least one page. The PDF may be scanned or image-only; OCR is required before import.");
      text = result.text;
    } finally { await parser.destroy(); }
  } else if (workerData.format === "docx") {
    const { links, headers } = await inspectDocx(buffer), { default: mammoth } = await import("mammoth");
    text = [...headers, (await mammoth.extractRawText({ buffer })).value].join("\n");
    if (links.length) text += "\nProfessional link targets from document:\n" + links.join("\n");
  } else {
    if (buffer.includes(0)) fail("INVALID_DOCUMENT", "Text resumes must use UTF-8 encoding and cannot contain binary data.");
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  }
  text = text.replace(/\r\n?/g, "\n").trim();
  if (!text || (text.match(/[\p{L}\p{N}]/gu) || []).length < 10) fail("EMPTY_DOCUMENT", "The document contains insufficient readable resume text.");
  if (text.length > 120_000) fail("DOCUMENT_LIMIT", "Extracted resume text exceeds the 120,000-character limit.");
  parentPort.postMessage({ text, pages });
} catch (error) {
  const codes = new Set(["OCR_REQUIRED", "EMPTY_DOCUMENT", "DOCUMENT_LIMIT", "INVALID_DOCUMENT"]);
  parentPort.postMessage({ error: codes.has(error?.code) ? error.message : "Could not extract this document. It may be corrupted, password-protected or unsupported.", code: codes.has(error?.code) ? error.code : "INVALID_DOCUMENT" });
}
