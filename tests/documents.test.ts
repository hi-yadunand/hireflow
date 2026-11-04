import { describe, expect, it } from "vitest";
import { extractResumeDocument, documentFormat, safeResumeFilename, MAX_RESUME_BYTES } from "../server/documents.js";
import { docxFixture, pdfFixture, resumeFixture, zipFixture } from "./document-fixtures.js";

describe("real local document extraction", () => {
  it("extracts text from PDF without OCR or provider calls", async () => {
    const value = await extractResumeDocument(await pdfFixture(), "resume.pdf", "application/pdf");
    expect(value.pages).toBe(1); expect(value.text).toContain("Test Candidate"); expect(value.text).toContain("PostgreSQL");
  });
  it("extracts DOCX text and embedded professional hyperlink targets", async () => {
    const body = await docxFixture(resumeFixture, { "word/_rels/document.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://github.com/example" TargetMode="External"/></Relationships>' });
    const result = await extractResumeDocument(body, "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.text).toContain("Test Candidate"); expect(result.text).toContain("https://github.com/example");
  });
  for (const extension of ["txt", "md"]) it(`extracts UTF-8 ${extension} without altering real text`, async () => {
    const text = "Résumé — 日本語\n" + resumeFixture;
    expect((await extractResumeDocument(Buffer.from(text), `resume.${extension}`)).text).toBe(text);
  });
  it("reports OCR required for image-only/blank pages instead of returning a profile", async () => {
    await expect(extractResumeDocument(await pdfFixture(""), "scan.pdf")).rejects.toMatchObject({ status: 422, details: { code: "OCR_REQUIRED" } });
  });
  it("rejects PDFs beyond the page bound", async () => {
    await expect(extractResumeDocument(await pdfFixture("", 31), "large.pdf")).rejects.toMatchObject({ details: { code: "DOCUMENT_LIMIT" } });
  });
  it("rejects empty files, corrupt formats and disguised documents", async () => {
    await expect(extractResumeDocument(Buffer.alloc(0), "empty.txt")).rejects.toMatchObject({ status: 422 });
    await expect(extractResumeDocument(Buffer.from("%PDF-corrupt data"), "bad.pdf")).rejects.toMatchObject({ status: 422 });
    await expect(extractResumeDocument(Buffer.from("PK\u0003\u0004bad"), "bad.docx")).rejects.toMatchObject({ status: 422 });
    await expect(extractResumeDocument(Buffer.from("not a PDF"), "wrong.pdf")).rejects.toMatchObject({ status: 415 });
  });
  it("rejects oversized files, binary text and invalid UTF-8", async () => {
    await expect(extractResumeDocument(Buffer.alloc(MAX_RESUME_BYTES + 1), "big.txt")).rejects.toMatchObject({ status: 413 });
    await expect(extractResumeDocument(Buffer.from([0, 1, 2]), "bad.txt")).rejects.toMatchObject({ status: 422 });
    await expect(extractResumeDocument(Buffer.from([255, 254, 200]), "bad.txt")).rejects.toMatchObject({ status: 422 });
    await expect(extractResumeDocument(Buffer.from(" \n\t"), "empty.md")).rejects.toMatchObject({ status: 422 });
  });
  it("validates archive expansion bounds and required DOCX entries", async () => {
    await expect(extractResumeDocument(await docxFixture(resumeFixture, { "bomb.xml": Buffer.alloc(1_000_000, "A") }), "bomb.docx")).rejects.toMatchObject({ details: { code: "DOCUMENT_LIMIT" } });
    await expect(extractResumeDocument(await zipFixture({ "not-word.txt": "not a Word document" }), "bad.docx")).rejects.toMatchObject({ status: 422 });
  });
  it("enforces worker deadlines, releases capacity and respects cancellation", async () => {
    await expect(extractResumeDocument(await pdfFixture(), "resume.pdf", "", { timeoutMs: 1 })).rejects.toMatchObject({ status: 504 });
    const controller = new AbortController(); controller.abort();
    await expect(extractResumeDocument(Buffer.from(resumeFixture), "resume.txt", "", { signal: controller.signal })).rejects.toMatchObject({ status: 409 });
    expect((await extractResumeDocument(Buffer.from(resumeFixture), "resume.txt")).text).toBe(resumeFixture);
  });
  it("rejects unsupported types and sanitizes filenames without touching file paths", () => {
    expect(() => documentFormat("resume.exe")).toThrow("Supported resume formats");
    expect(() => documentFormat("resume.pdf", "image/png")).toThrow("does not match");
    expect(safeResumeFilename("../../private/resume.pdf")).toBe("resume.pdf");
    expect(safeResumeFilename("C:\\private\\resume.docx")).toBe("resume.docx");
  });
});
it("extracts DOCX header contact text without following external file relationships", async () => {
 const input = await docxFixture(resumeFixture, {
  "word/header1.xml": '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header Candidate | header@example.test</w:t></w:r></w:p></w:hdr>',
  "word/_rels/document.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file:///private/never-read" TargetMode="External"/></Relationships>',
 });
 const result = await extractResumeDocument(input, "resume.docx"); expect(result.text).toContain("header@example.test"); expect(result.text).not.toContain("file://");
});
