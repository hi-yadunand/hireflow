# Gemini configuration and reviewed master-resume import

This adds resume import to the existing personal, local-only HireFlow app. PostgreSQL remains the only runtime persistence store. There are no new migrations, job sources, submissions, schedulers, public listeners or authentication changes.

## Configuration

The server loads the project-root `.env` through `server/config/env.ts`, independently of its working directory. Existing process environment settings take precedence. `GEMINI_API_KEY` is server-only and is read lazily when constructing the official `@google/genai` client. Credentials are never returned by status endpoints. Changes to `.env` require restarting the server.

`GET /api/ai/status` distinguishes key presence from connectivity. `POST /api/ai/check` performs a real, bounded generic JSON request. A verified status is cached for five minutes for that key/model combination; presence alone is never called verified. No candidate data is sent by a connection check. Pause checks and cancellation apply.

Run `npm run ai:check` for a separate real connectivity check. `npm run ai:check -- gemini-3.1-flash-lite` explicitly checks the other supported model; it does not change runtime settings or provide an automatic fallback. The default model remains `gemini-3.8-flash`. Provider errors retain sanitized HTTP/reason codes, never raw messages containing request data or credentials.

## Upload and extraction

Use Master Professional Profile → Resume Import (AI). Supported files are PDF, DOCX, UTF-8 TXT and Markdown, at most 5 MB. Upload progress comes from actual browser upload events. The server extracts text before the user invokes Gemini with Extract Profile Data; no file is permanently stored.

`POST /api/profile/extract-document` accepts one multipart `resume` file. Extension, MIME, signatures and byte size are checked. Extraction runs in a dedicated worker without credential environment variables, with a 15-second deadline, 128 MB JavaScript heap limit, 120,000-character text cap and a two-worker process limit. PDFs are limited to 30 pages. DOCX ZIP archives have entry-count, expansion-ratio and uncompressed-size limits. Neither document links nor external file relationships are followed. DOCX body/header/footer text and professional hyperlink targets are included; PDFs include hyperlink targets where the parser can associate them.

OCR is not implemented. Image-only and very sparse PDF pages are rejected with an OCR-required message. This is a text-density check, not a guarantee that every mixed scanned/text document is complete. Inspect the extracted source and the final fields before confirming. Encrypted, corrupted, oversized and unreadable files fail explicitly.

## Gemini analysis and mapping

`POST /api/profile/upload-resume` sends extracted text through the existing backend Gemini service, using structured output. The schema covers personal links, headline/summary, work/internships, education/academic details, skills, certifications, projects, languages, standalone professional highlights and explicit preferences. Technologies across categories populate the existing skills list; work responsibilities and achievements use existing description/highlight fields. A stated career objective can populate summary when no summary exists.

Small optional additions cover facts the old profile could not represent: other professional links, standalone awards/highlights, preferred locations, experience-level preference and notice period. These use existing JSONB profile payloads and existing tabs. There are no new dashboard sections or duplicate skill-category fields.

Missing preferences are omitted, not guessed. Salary and authorization are never inferred from identity/location. Authorization classifications require explicitly quoted source details. Text facts must be supported by the source, and unsupported facts, invalid types and semantically empty responses are rejected. This extraction check does not independently establish real-world truth, relationships between facts or complete extraction. Every AI value remains unverified until the user reviews it.

Only a draft is populated. A safe merge fills missing values and deduplicates skills and records using natural identities rather than generated IDs. Existing nonempty scalar facts are preserved and surfaced as conflicts. Choose Keep existing, Use extracted, or explicitly Use All Extracted Values. Empty extraction values do not clear existing facts. Repeated imports retain existing IDs and do not append duplicate records. Different employment start dates can represent separate tenures and are preserved. Conflicts must be resolved before saving.

Pause epochs, profile revisions, model changes, changed source text, local edits, mode generations and request cancellation are checked before accepting asynchronous results. No extraction endpoint writes the master profile.

## Reviewed save

The editor no longer remounts on every successful revision change. This preserves the success message and reviewed state instead of merely unchecking the checkbox. Failed saves keep the draft and confirmation, display an inline error and allow retry. An immediate in-flight guard prevents duplicate save requests. Edits still invalidate prior confirmation. If the draft changes during a save, only the server revision is advanced in the newer draft, with an explicit unsaved-edits message.

Only an explicit confirmed Save Master Profile performs the existing transactional PostgreSQL update and immutable revision snapshot creation. Success appears after the API's committed response. Optional highlights remain canonical arrays and no placeholder qualifications are inserted.

## Verification and limitations

Automated tests use mocked Gemini, generated local document fixtures, temporary JSON reference fixtures and in-memory PGlite. They never load the real `.env` or connect to Neon. Tests cover document parsing, limits, cancellation, malformed/provider responses, source grounding, conflicts, deduplication, save-state behavior, confirmation gates and full SQL save/reload through fresh app/repository instances.

Separate real checks confirmed the configured key can access `models/gemini-3.8-flash` metadata. Actual content generation attempts returned provider HTTP 503, and one short probe timed out. These failures do not establish successful generation or end-to-end extraction with the real provider. The app reports the failure and offers retry without saving fabricated data. Provider availability/quotas and the exposed key's rotation must be addressed outside this repository; no automatic model switch was made.

The npm audit advisory chain through development-only `node-pg-migrate` / `glob` / `minimatch` remains from the PostgreSQL foundation. Do not apply an unreviewed forced downgrade merely to suppress it.

## Local steps

1. `GEMINI_API_KEY` is configured in the ignored root `.env`; database credentials are unchanged. Because the key was shared in chat/screenshots, rotate it in Google AI Studio and update only that entry. Do not put it in a `VITE_*` variable or post it in chat again.
2. Preserve any unsaved browser edits, stop the old development server, then run `npm run dev` from the project root.
3. Open `http://localhost:3000`, then Master Professional Profile → Resume Import (AI).
4. Select Check Gemini connection. If the provider returns HTTP 503, wait and retry; presence of a key is not proof of working generation.
5. Upload the master resume, wait for text extraction, then select Extract Profile Data.
6. Inspect populated tabs, resolve any conflicts and correct uncertain information. Keep missing salary/visa fields unprovided unless separately known.
7. Check the accuracy confirmation and select Save Master Profile. A success message must appear; an error preserves the draft for retry.
8. Close/reopen the profile, or refresh the browser after success, and confirm the reviewed fields remain. GET `/api/profile` retrieves current persisted data; do not paste personal data into diagnostic logs.

## Files touched by this integration cycle

Modified: `.env` (ignored; Gemini entry only), `.env.example`, `package.json`, `package-lock.json`, `server.ts`, `server/agent.ts`, `server/ai-operation.ts`, `server/app.ts`, `server/gemini.ts`, `server/validation.ts`, `src/components/ProfileModal.tsx`, `src/lib/api.ts`, `src/lib/profile.ts`, `src/types/index.ts`, `tests/api.test.ts`, `tests/ai-operation.test.ts`, `tests/gemini.test.ts`, `tests/modals.test.tsx`, `tests/profile.test.ts`, `tests/postgres.test.ts`.

Created: `server/config/env.ts`, `server/documents.ts`, `server/document-worker.mjs`, `server/resume-schema.ts`, `server/resume-grounding.ts`, `src/lib/profile-import.ts`, `scripts/gemini-check.ts`, `tests/document-fixtures.ts`, `tests/documents.test.ts`, `tests/environment.test.ts`, `tests/profile-import.test.ts`, `tests/resume-fixture.ts`, `tests/upload-client.test.ts`, `docs/RESUME_IMPORT.md`.

Dependencies added: runtime `pdf-parse`, `mammoth`, `multer`, `yauzl`; development `@types/multer`, `@types/yauzl`, `yazl`, `@types/yazl`, `pdf-lib`. The existing official Gemini SDK resolves to `@google/genai@2.32.0` in the lockfile. Existing Phase 0/0.1/1 changes are retained; this list describes the current integration cycle rather than every uncommitted file in the workspace.
