// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileModal } from "../src/components/ProfileModal.js";
import { ApplicationReviewModal } from "../src/components/ApplicationReviewModal.js";
import { SettingsView } from "../src/views/SettingsView.js";
import { api, setDataMode, createActionContext } from "../src/lib/api.js";
import { initialSettings } from "../server/db.js";
import { realProfile, job, deferred } from "./fixtures.js";
import type { ApplicationRecord } from "../src/types/index.js";
beforeEach(() => { setDataMode("real"); vi.spyOn(window, "alert").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const profileProps = () => ({ isOpen: true, onClose: vi.fn(), profile: realProfile(), onProfileUpdated: vi.fn() });
function application(id = "app-one", answer = "Original"): ApplicationRecord {
 const j = job(); return { id, jobId: j.id, company: j.company, position: j.position, location: "", source: j.source, applyUrl: j.applyUrl, status: "Ready to Apply", applicationMode: "approval_required", matchPercentage: 90, discoveredAt: "2026-11-03T00:00:00Z", lastUpdatedAt: "2026-11-03T00:00:00Z", timeline: [], applicationAnswers: [{ question: "Test question", suggestedAnswer: answer, confirmed: false }], reviewNotes: id };
}
it("opens a previously closed profile without conditional hook errors and discards canceled edits", () => {
 const props = profileProps(); const { rerender } = render(<ProfileModal {...props} isOpen={false} />);
 rerender(<ProfileModal {...props} />); fireEvent.change(screen.getByDisplayValue("Test Candidate"), { target: { value: "Canceled edit" } });
 rerender(<ProfileModal {...props} isOpen={false} />); rerender(<ProfileModal {...props} />); expect(screen.getByDisplayValue("Test Candidate")).toBeTruthy(); expect(screen.queryByDisplayValue("Canceled edit")).toBeNull();
});
it("requires fresh confirmation after profile edits", async () => {
 const update = vi.spyOn(api, "updateProfile").mockResolvedValue(realProfile()); render(<ProfileModal {...profileProps()} />);
 fireEvent.click(screen.getByRole("button", { name: "Save Master Profile" })); expect(update).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("checkbox", { name: /reviewed all fields/ })); fireEvent.change(screen.getByDisplayValue("Test Candidate"), { target: { value: "Changed" } });
 expect((screen.getByRole("checkbox", { name: /reviewed all fields/ }) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole("checkbox", { name: /reviewed all fields/ })); fireEvent.click(screen.getByRole("button", { name: "Save Master Profile" })); await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ personal: expect.objectContaining({ fullName: "Changed" }) }), true, createActionContext()));
});
it("replaces imported skills rather than contaminating extraction with previous skills", async () => {
 vi.spyOn(api, "uploadResume").mockResolvedValue({ success: true, parsed: { personal: { ...realProfile().personal, fullName: "Botanist" }, skills: ["Botany"], experience: [], education: [], languages: [] } });
 const update = vi.spyOn(api, "updateProfile").mockResolvedValue(realProfile()); render(<ProfileModal {...profileProps()} />);
 fireEvent.click(screen.getByRole("button", { name: /Resume Import/ })); fireEvent.change(screen.getByPlaceholderText(/Paste resume text/), { target: { value: "Botanist\nBotany" } }); fireEvent.click(screen.getByRole("button", { name: "Extract Profile Data" }));
 fireEvent.click(await screen.findByRole("button", { name: "Replace Imported Sections" })); fireEvent.click(screen.getByRole("checkbox", { name: /reviewed all fields/ })); fireEvent.click(screen.getByRole("button", { name: "Save Master Profile" })); await waitFor(() => expect(update).toHaveBeenCalled());
 expect(update.mock.calls[0][0].skills).toEqual(["Botany"]); expect(update.mock.calls[0][0].experience).toEqual([]);
});
it("shows AI parsing errors without offering fabricated extraction", async () => {
 vi.spyOn(api, "uploadResume").mockRejectedValue(new Error("Gemini unavailable")); render(<ProfileModal {...profileProps()} />); fireEvent.click(screen.getByRole("button", { name: /Resume Import/ })); fireEvent.change(screen.getByPlaceholderText(/Paste resume text/), { target: { value: "Resume" } }); fireEvent.click(screen.getByRole("button", { name: "Extract Profile Data" })); expect(await screen.findByText("Gemini unavailable")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Replace Imported Sections" })).toBeNull();
});
it("rejects binary resume files rather than reading them as text", () => {
 const { container } = render(<ProfileModal {...profileProps()} />); fireEvent.click(screen.getByRole("button", { name: /Resume Import/ })); const input = container.querySelector('input[type="file"]')!;
 fireEvent.change(input, { target: { files: [new File(["binary"], "resume.pdf", { type: "application/pdf" })] } }); expect(screen.getByText(/PDF and Word extraction is not implemented/)).toBeTruthy();
});
it("adds an empty editable certification instead of an invented AWS qualification", () => {
 render(<ProfileModal {...profileProps()} />); fireEvent.click(screen.getByRole("button", { name: /Skills & Certs/ })); fireEvent.click(screen.getByRole("button", { name: /Add Certification/ })); expect((screen.getByLabelText("Certification name") as HTMLInputElement).value).toBe(""); expect(screen.queryByText("AWS Certified Developer")).toBeNull();
});
it("preserves ISO month values when editing education dates", () => {
 const profile = realProfile(); profile.education = [{ id: "education", institution: "Test", degree: "BS", fieldOfStudy: "Biology", startDate: "2018-09", endDate: "2022-05" }]; render(<ProfileModal {...profileProps()} profile={profile} />); fireEvent.click(screen.getByRole("button", { name: "Education" })); const input = screen.getByPlaceholderText("Graduation Year / Dates") as HTMLInputElement;
 fireEvent.change(input, { target: { value: "2018-09 - 2023-06" } }); expect(input.value).toBe("2018-09 - 2023-06");
});
it("resets application answers and notes between records, and never mutates input props", async () => {
 const first = application(), second = application("app-two", "Second answer"), update = vi.spyOn(api, "updateApplication").mockResolvedValue(second);
 const props = { isOpen: true, onClose: vi.fn(), application: first, job: job(), onStatusChanged: vi.fn() }; const { rerender } = render(<ApplicationReviewModal {...props} />);
 fireEvent.click(screen.getByRole("button", { name: /Application Q&A/ })); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved edit" } }); expect(first.applicationAnswers![0].suggestedAnswer).toBe("Original");
 rerender(<ApplicationReviewModal {...props} application={second} />); expect(screen.getByDisplayValue("app-two")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: /Application Q&A/ })); expect(screen.getByDisplayValue("Second answer")).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: "Moved to Interview" })); await waitFor(() => expect(update).toHaveBeenCalledWith("app-two", expect.objectContaining({ reviewNotes: "app-two", applicationAnswers: second.applicationAnswers }), createActionContext()));
});
it("discards canceled application edits when reopening the same record", () => {
 const props = { isOpen: true, onClose: vi.fn(), application: application(), job: job(), onStatusChanged: vi.fn() }; const { rerender } = render(<ApplicationReviewModal {...props} />); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved note" } }); rerender(<ApplicationReviewModal {...props} isOpen={false} />); rerender(<ApplicationReviewModal {...props} />); expect(screen.getByDisplayValue("app-one")).toBeTruthy();
});
it("records a manual preview outcome directly without staging or consuming quota", async () => {
 const stored = application(), create = vi.spyOn(api, "createApplication"), update = vi.spyOn(api, "updateApplication"), record = vi.spyOn(api, "recordManualApplication").mockResolvedValue(stored);
 render(<ApplicationReviewModal isOpen onClose={vi.fn()} application={application("app-preview-job-real")} job={job()} onStatusChanged={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: /Record Manual Application/ }));
 await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-real", status: "Submission Unverified" }), createActionContext())); expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it("opens settings after null loading state without changing hook order", () => {
 const props = { settings: null, agentStatus: null, onRefreshSettings: vi.fn(), onTogglePause: vi.fn() }; const { rerender } = render(<SettingsView {...props} />); rerender(<SettingsView {...props} settings={initialSettings} />); expect(screen.getByRole("button", { name: "Save Settings" })).toBeTruthy();
});
it("keeps existing projects and certifications when accepting extracted resume sections", async () => {
 const profile = realProfile(); profile.projects = [{ id: "project", title: "Real project", description: "User work", technologies: [] }]; profile.certifications = [{ id: "cert", name: "Real credential", issuer: "Issuer", issueDate: "2026" }];
 vi.spyOn(api, "uploadResume").mockResolvedValue({ success: true, parsed: { personal: realProfile().personal, skills: [], experience: [], education: [], languages: [] } }); const update = vi.spyOn(api, "updateProfile").mockResolvedValue(profile);
 render(<ProfileModal {...profileProps()} profile={profile} />); fireEvent.click(screen.getByRole("button", { name: /Resume Import/ })); fireEvent.change(screen.getByPlaceholderText(/Paste resume text/), { target: { value: "User resume" } }); fireEvent.click(screen.getByRole("button", { name: "Extract Profile Data" })); fireEvent.click(await screen.findByRole("button", { name: "Replace Imported Sections" })); fireEvent.click(screen.getByRole("checkbox", { name: /reviewed all fields/ })); fireEvent.click(screen.getByRole("button", { name: "Save Master Profile" }));
 await waitFor(() => expect(update).toHaveBeenCalled()); expect(update.mock.calls[0][0].projects).toEqual(profile.projects); expect(update.mock.calls[0][0].certifications).toEqual(profile.certifications);
});
it("does not promote a preserved sample profile into real profile editing", async () => {
 const profile = { ...realProfile(), legacyProfileAvailable: true }; vi.spyOn(api, "getLegacyProfile").mockResolvedValue({ profile: { ...realProfile(), isDemo: true, personal: { ...realProfile().personal, fullName: "Sample Candidate" } }, warning: "Demo" }); render(<ProfileModal {...profileProps()} profile={profile} />); fireEvent.click(screen.getByRole("button", { name: /Review preserved legacy profile/ }));
 await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("demonstration data"))); expect(screen.queryByDisplayValue("Sample Candidate")).toBeNull();
});
it("requires fresh answer confirmation after editing a previously confirmed answer", () => {
 const app = application(); app.applicationAnswers![0].confirmed = true; render(<ApplicationReviewModal isOpen application={app} job={job()} onClose={vi.fn()} onStatusChanged={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /Application Q&A/ })); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Changed answer" } }); expect((screen.getByRole("checkbox", { name: "I reviewed this answer" }) as HTMLInputElement).checked).toBe(false); expect(app.applicationAnswers![0].confirmed).toBe(true);
});
for (const scenario of ["add role", "add internship", "remove role", "add bullet", "remove bullet", "add education", "remove education", "add skill", "remove skill", "add certification", "remove certification", "add project", "remove project"]) it(`invalidates profile confirmation after button-driven ${scenario}`, () => {
 const profile = realProfile();
 profile.experience = [{ id: "exp", company: "Real employer", role: "Real role", location: "", type: "Full-time", startDate: "", endDate: "", current: true, description: "", highlights: ["First", "Second"] }];
 profile.education = [{ id: "edu", institution: "Real school", degree: "BS", fieldOfStudy: "", startDate: "", endDate: "" }];
 profile.certifications = [{ id: "cert", name: "Real certification", issuer: "", issueDate: "" }]; profile.projects = [{ id: "project", title: "Real project", description: "", technologies: [] }];
 const { container } = render(<ProfileModal {...profileProps()} profile={profile} />);
 const tab = scenario.includes("role") || scenario.includes("internship") || scenario.includes("bullet") ? /Work & Internships/ : scenario.includes("education") ? /^Education$/ : scenario.includes("project") ? /^Projects$/ : /Skills & Certs/;
 fireEvent.click(screen.getByRole("button", { name: tab }));
 if (scenario === "add skill") fireEvent.change(screen.getByPlaceholderText(/Add skill/), { target: { value: "Botany" } });
 const checkbox = screen.getByRole("checkbox", { name: /reviewed all fields/ }) as HTMLInputElement;
 fireEvent.click(checkbox); expect(checkbox.checked).toBe(true);
 const names: Record<string, RegExp> = { "add role": /^Add Role$/, "add internship": /^Add Internship$/, "add bullet": /^Add bullet point$/, "add education": /^Add Education$/, "add skill": /^Add Skill$/, "add certification": /Add Certification/, "add project": /^Add Project$/ };
 if (scenario.startsWith("add")) fireEvent.click(screen.getByRole("button", { name: names[scenario] }));
 else {
  const selector = scenario === "remove skill" ? '.lucide-x' : scenario === "remove bullet" ? '.lucide-x' : '.lucide-trash2, .lucide-trash-2';
  const buttons = [...container.querySelectorAll(selector)].map(icon => icon.closest("button")!).filter(button => button && !button.className.includes("hover:bg-[#EFEFEF]"));
  // The modal close icon is outside the scrollable tab content.
  const target = buttons.find(button => button.closest('.overflow-y-auto'))!;
  expect(target).toBeTruthy(); fireEvent.click(target);
 }
 expect(checkbox.checked).toBe(false);
 expect(profile.experience[0].highlights).toEqual(["First", "Second"]);
});
it("does not confirm edits made while an older profile save is in flight", async () => {
 const pending = deferred<ReturnType<typeof realProfile>>(), updated = vi.fn();
 const save = vi.spyOn(api, "updateProfile").mockReturnValueOnce(pending.promise).mockResolvedValue(realProfile());
 render(<ProfileModal {...profileProps()} onProfileUpdated={updated} />);
 fireEvent.click(screen.getByRole("checkbox", { name: /reviewed all fields/ })); fireEvent.click(screen.getByRole("button", { name: "Save Master Profile" }));
 fireEvent.change(screen.getByDisplayValue("Test Candidate"), { target: { value: "Newer draft" } });
 await act(async () => pending.resolve({ ...realProfile(), revision: "saved-version" })); expect(updated).not.toHaveBeenCalled();
 expect(screen.getByDisplayValue("Newer draft")).toBeTruthy(); expect((screen.getByRole("checkbox", { name: /reviewed all fields/ }) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole("checkbox", { name: /reviewed all fields/ })); fireEvent.click(screen.getByRole("button", { name: "Save Master Profile" }));
 await waitFor(() => expect(save).toHaveBeenCalledTimes(2)); expect(save.mock.calls[1][0]).toMatchObject({ revision: "saved-version", personal: { fullName: "Newer draft" } });
});
it("retains unsaved settings edits and immediately synchronizes both pause transitions", async () => {
 const save = vi.spyOn(api, "updateSettings").mockResolvedValue(initialSettings), props = { settings: initialSettings, agentStatus: null, onRefreshSettings: vi.fn(), onTogglePause: vi.fn() };
 const { rerender } = render(<SettingsView {...props} />);
 fireEvent.change(screen.getByDisplayValue("12"), { target: { value: "7" } });
 rerender(<SettingsView {...props} settings={{ ...initialSettings, emergencyPause: true }} />); expect(screen.getByRole("button", { name: "Resume Processing" })).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: "Save Settings" })); await waitFor(() => expect(save).toHaveBeenCalledTimes(1)); expect(save.mock.calls[0][0]).toMatchObject({ emergencyPause: true, dailyApplicationLimit: 7 });
 await waitFor(() => expect(screen.getByRole("button", { name: "Save Settings" })).toBeTruthy());
 rerender(<SettingsView {...props} settings={{ ...initialSettings, emergencyPause: false }} />); expect(screen.getByRole("button", { name: "Engage Emergency Stop" })).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: "Save Settings" })); await waitFor(() => expect(save).toHaveBeenCalledTimes(2)); expect(save.mock.calls[1][0]).toMatchObject({ emergencyPause: false, dailyApplicationLimit: 7 });
});
for (const switches of [["demo"], ["demo", "real"]] as const) it(`stops a multi-step approval after mode switching ${switches.join(" → ")}`, async () => {
 const pending = deferred<ApplicationRecord>(), create = vi.spyOn(api, "createApplication").mockReturnValueOnce(pending.promise), update = vi.spyOn(api, "updateApplication"), changed = vi.fn();
 render(<ApplicationReviewModal isOpen application={{ ...application("app-preview-job-real"), status: "Awaiting Approval" }} job={job()} onClose={vi.fn()} onStatusChanged={changed} />);
 fireEvent.click(screen.getByRole("button", { name: "Approve Local Package" })); expect(create).toHaveBeenCalledTimes(1);
 for (const mode of switches) setDataMode(mode);
 await act(async () => pending.resolve(application())); expect(update).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled(); expect(window.alert).not.toHaveBeenCalled();
});
it("rejects a stale resume extraction after real → demo → real", async () => {
 const pending = deferred<Awaited<ReturnType<typeof api.uploadResume>>>(); vi.spyOn(api, "uploadResume").mockReturnValueOnce(pending.promise);
 render(<ProfileModal {...profileProps()} />); fireEvent.click(screen.getByRole("button", { name: /Resume Import/ })); fireEvent.change(screen.getByPlaceholderText(/Paste resume text/), { target: { value: "Source" } }); fireEvent.click(screen.getByRole("button", { name: "Extract Profile Data" }));
 setDataMode("demo"); setDataMode("real"); await act(async () => pending.resolve({ success: true, parsed: { personal: { ...realProfile().personal, fullName: "Stale candidate" } } }));
 expect(screen.queryByRole("button", { name: "Replace Imported Sections" })).toBeNull(); expect(screen.queryByText("Stale candidate")).toBeNull();
});
it("does not show an extraction preview when the source text changes during parsing", async () => {
 const pending = deferred<Awaited<ReturnType<typeof api.uploadResume>>>(); vi.spyOn(api, "uploadResume").mockReturnValueOnce(pending.promise);
 render(<ProfileModal {...profileProps()} />); fireEvent.click(screen.getByRole("button", { name: /Resume Import/ })); const source = screen.getByPlaceholderText(/Paste resume text/); fireEvent.change(source, { target: { value: "Original source" } }); fireEvent.click(screen.getByRole("button", { name: "Extract Profile Data" })); fireEvent.change(source, { target: { value: "New source" } });
 await act(async () => pending.resolve({ success: true, parsed: { skills: ["TypeScript"] } })); expect(screen.queryByRole("button", { name: "Replace Imported Sections" })).toBeNull(); expect(screen.getByText(/changed during extraction/)).toBeTruthy();
});
it("does not overwrite newer profile edits with a delayed legacy import", async () => {
 const pending = deferred<Awaited<ReturnType<typeof api.getLegacyProfile>>>(); vi.spyOn(api, "getLegacyProfile").mockReturnValueOnce(pending.promise);
 render(<ProfileModal {...profileProps()} profile={{ ...realProfile(), legacyProfileAvailable: true }} />); fireEvent.click(screen.getByRole("button", { name: /Review preserved legacy profile/ })); fireEvent.change(screen.getByDisplayValue("Test Candidate"), { target: { value: "Newer user edit" } });
 await act(async () => pending.resolve({ profile: { ...realProfile(), personal: { ...realProfile().personal, fullName: "Old legacy name" } }, warning: "Legacy" })); expect(screen.getByDisplayValue("Newer user edit")).toBeTruthy(); expect(screen.queryByDisplayValue("Old legacy name")).toBeNull(); expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Profile changed"));
});
for (const [button, status] of [["Mark Rejected", "Rejected"], ["Moved to Interview", "Interview"]] as const) it(`records preview ${status} without a staging chain`, async () => {
 const create = vi.spyOn(api, "createApplication"), record = vi.spyOn(api, "recordManualApplication").mockResolvedValue(application());
 render(<ApplicationReviewModal isOpen application={{ ...application("app-preview-job-real"), status: "Discovered" }} job={job()} onClose={vi.fn()} onStatusChanged={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: button }));
 await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-real", status }), createActionContext())); expect(create).not.toHaveBeenCalled();
});
