import { PDFDocument, StandardFonts } from "pdf-lib";
import { ZipFile } from "yazl";
export const resumeFixture = "Test Candidate\nEngineer and TypeScript developer at Test Employer\nExperience: Completed a documented engineering internship.\nEducation: Example University, Computer Science.\nSkills: TypeScript and PostgreSQL.";
export async function pdfFixture(text = resumeFixture, pages = 1) {
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) { const page = document.addPage(); if (text) page.drawText(text, { font, size: 10, x: 30, y: 750, maxWidth: 500 }); }
  return Buffer.from(await document.save());
}
export function zipFixture(entries: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new ZipFile(), chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    zip.outputStream.on("data", chunk => chunks.push(chunk)); zip.outputStream.on("error", reject); zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    for (const [name, value] of Object.entries(entries)) zip.addBuffer(Buffer.isBuffer(value) ? value : Buffer.from(value), name);
    zip.end();
  });
}
export function docxFixture(text = resumeFixture, extras: Record<string, string | Buffer> = {}) {
  return zipFixture({
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split("\n").map(line => `<w:p><w:r><w:t>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
    ...extras,
  });
}
