// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App.js";
import { InterviewTrackerView } from "../src/views/InterviewTrackerView.js";
import { IntegrationsView } from "../src/views/IntegrationsView.js";
import { api, getDataMode, setDataMode, createActionContext, assertActionContext } from "../src/lib/api.js";
import { createDemoData } from "../server/demo.js";
import { initialSettings } from "../server/db.js";
import { realProfile, job, deferred } from "./fixtures.js";
beforeEach(() => {
 setDataMode("real");
 const demo = createDemoData();
 const getters = { getProfile: () => getDataMode() === "demo" ? demo.profile : realProfile(), getJobs: () => getDataMode() === "demo" ? demo.jobs : [], getApplications: () => getDataMode() === "demo" ? demo.applications : [], getInterviews: () => getDataMode() === "demo" ? demo.interviews : [], getResumes: () => [], getCoverLetters: () => [], getConnectors: () => demo.connectors, getAgentStatus: () => demo.status, getAgentLogs: () => [], getSettings: () => initialSettings };
 for (const [name, value] of Object.entries(getters)) vi.spyOn(api, name as keyof typeof getters).mockImplementation(async () => value() as any);
 vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setDataMode("real"); });
it("retains every existing dashboard section and the existing layout classes", async () => {
 const { container } = render(<App />); await screen.findByText("AI Career Workspace");
 expect(container.firstElementChild?.className).toContain("bg-[#F8F8F7]"); expect(container.querySelector("aside")?.className).toContain("w-64");
 for (const label of ["Overview", "Discover Jobs", "AI Matches", "Resume Manager", "Cover Letters", "Applications", "Interview Tracker", "AI Agent Monitor", "Analytics", "Integrations", "Settings"]) {
  fireEvent.click(screen.getByRole("button", { name: label })); expect(container.querySelector("main")).toBeTruthy();
 }
 expect(screen.getByText(/Daily Staging Cap/)).toBeTruthy();
});
it("keeps optional demo mode clearly labeled and returns to clean real data", async () => {
 render(<App />); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "View optional demo" })); await screen.findByText(/DEMO PREVIEW/); await screen.findByText("AI Career Workspace");
 fireEvent.click(screen.getByRole("button", { name: "Discover Jobs" })); await waitFor(() => expect(screen.getAllByText("SAMPLE")).toHaveLength(6));
 fireEvent.click(screen.getByRole("button", { name: "Return to real data" })); await screen.findByText(/No jobs match/); expect(screen.queryByText("SAMPLE")).toBeNull(); expect(getDataMode()).toBe("real");
});
it("does not let a stale real-data load populate demo mode", async () => {
 let resolve!: (value: ReturnType<typeof job>[]) => void;
 vi.mocked(api.getJobs).mockReturnValueOnce(new Promise(r => { resolve = r; })); render(<App />);
 fireEvent.click(screen.getByRole("button", { name: "View optional demo" })); await screen.findByText("AI Career Workspace"); resolve([{ ...job("old"), company: "StaleRealCompany" }]);
 fireEvent.click(screen.getByRole("button", { name: "Discover Jobs" })); await waitFor(() => expect(screen.getAllByText("SAMPLE")).toHaveLength(6)); expect(screen.queryByText("StaleRealCompany")).toBeNull();
});
it("surfaces initial load errors and supports retry", async () => {
 vi.mocked(api.getProfile).mockRejectedValueOnce(new Error("Server unavailable")); render(<App />); expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Server unavailable")); fireEvent.click(screen.getByRole("button", { name: "Retry loading" })); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
it("shows connector capability honestly and disables credential entry", async () => {
 const connectors = createDemoData().connectors; const update = vi.spyOn(api, "updateConnector").mockResolvedValue(connectors[0]); render(<IntegrationsView connectors={connectors} onRefreshConnectors={vi.fn()} />);
 expect(screen.getAllByText("Not implemented")).toHaveLength(connectors.length); fireEvent.click(screen.getAllByRole("button", { name: "Config" })[0]);
 expect((screen.getByPlaceholderText("Unavailable: connector not implemented") as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole("button", { name: "Save Configuration" })); await waitFor(() => expect(update).toHaveBeenCalledWith(connectors[0].id, { configuredPollingIntervalMinutes: 30 }, createActionContext()));
});
it("includes data mode on requests so demo cannot accidentally use real endpoints", async () => {
 const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
 // Use an unmocked operation to exercise the common transport.
 setDataMode("demo"); await api.getJob("demo-test"); expect(fetchMock).toHaveBeenCalledWith("/api/jobs/demo-test", expect.objectContaining({ headers: expect.objectContaining({ "X-HireFlow-Mode": "demo" }) }));
});
it("does not revive an old real-data load after real → demo → real", async () => {
 const pending = deferred<ReturnType<typeof job>[]>(); vi.mocked(api.getJobs).mockReturnValueOnce(pending.promise); render(<App />);
 fireEvent.click(screen.getByRole("button", { name: "View optional demo" })); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Return to real data" })); await screen.findByText("AI Career Workspace");
 await act(async () => pending.resolve([{ ...job("stale"), company: "Stale real company" }])); fireEvent.click(screen.getByRole("button", { name: "Discover Jobs" })); expect(screen.queryByText("Stale real company")).toBeNull(); expect(screen.getByText(/No jobs match/)).toBeTruthy();
});
it("rejects stale transport responses even when fetch ignores abort and mode returns to real", async () => {
 const pending = deferred<Response>(), fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pending.promise);
 const context = createActionContext(), original = api.getJob("real", context), rejection = expect(original).rejects.toThrow("mode changed");
 setDataMode("demo"); setDataMode("real"); expect(context.signal.aborted).toBe(true); expect(() => assertActionContext(context)).toThrow();
 pending.resolve(new Response(JSON.stringify(job()), { status: 200 })); await rejection;
 expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: context.signal, headers: { "X-HireFlow-Mode": "real" } });
 fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 200 })); await expect(api.getJob("fresh")).resolves.toMatchObject({ id: "job-real" });
});
it("rejects stale response bodies when mode changes while JSON is being read", async () => {
 const body = deferred<ReturnType<typeof job>>(); vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, status: 200, json: () => body.promise } as Response);
 const request = api.getJob("test"), rejection = expect(request).rejects.toThrow("mode changed"); await Promise.resolve(); setDataMode("demo"); setDataMode("real"); body.resolve(job()); await rejection;
});
it("never dispatches a subsequent request with an obsolete action context", async () => {
 const context = createActionContext(), fetchMock = vi.spyOn(globalThis, "fetch"); setDataMode("demo"); setDataMode("real");
 await expect(api.updateApplication("old", { status: "Ready to Apply" }, context)).rejects.toThrow("mode changed"); expect(fetchMock).not.toHaveBeenCalled();
});
it("does not continue a stale pause action with a logs request after real → demo → real", async () => {
 const pending = deferred<Awaited<ReturnType<typeof api.setPaused>>>(); vi.spyOn(api, "setPaused").mockReturnValueOnce(pending.promise);
 render(<App />); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByTitle("Resume manual processing")); await waitFor(() => expect(api.setPaused).toHaveBeenCalled());
 fireEvent.click(screen.getByRole("button", { name: "View optional demo" })); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Return to real data" })); await screen.findByText("AI Career Workspace");
 const calls = vi.mocked(api.getAgentLogs).mock.calls.length;
 await act(async () => pending.resolve({ isPaused: false, status: { ...createDemoData().status, isPaused: false }, settings: initialSettings })); expect(api.getAgentLogs).toHaveBeenCalledTimes(calls); expect(screen.getByTitle("Resume manual processing")).toBeTruthy();
});
it("does not reload data from the finally block of an obsolete cycle", async () => {
 vi.mocked(api.getAgentStatus).mockResolvedValue({ ...createDemoData().status, isPaused: false, workerState: "idle" });
 const pending = deferred<Awaited<ReturnType<typeof api.runAgentCycle>>>(); vi.spyOn(api, "runAgentCycle").mockReturnValueOnce(pending.promise);
 render(<App />); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByTitle("Process stored jobs; discovery and submission are not implemented"));
 fireEvent.click(screen.getByRole("button", { name: "View optional demo" })); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Return to real data" })); await screen.findByText("AI Career Workspace");
 const calls = vi.mocked(api.getProfile).mock.calls.length;
 await act(async () => pending.resolve({ success: true, discoveredCount: 0, matchedCount: 0, processedCount: 0, message: "Nothing submitted" })); expect(api.getProfile).toHaveBeenCalledTimes(calls); expect(screen.getByTitle("Process stored jobs; discovery and submission are not implemented").getAttribute("disabled")).toBeNull();
});
it("synchronizes app settings immediately after pause without discarding unsaved edits", async () => {
 const status = { ...createDemoData().status, isPaused: false, workerState: "idle" as const };
 vi.mocked(api.getAgentStatus).mockResolvedValue(status); vi.spyOn(api, "setPaused").mockResolvedValue({ isPaused: true, status: { ...status, isPaused: true, workerState: "paused" }, settings: { ...initialSettings, emergencyPause: true } });
 const save = vi.spyOn(api, "updateSettings").mockResolvedValue({ ...initialSettings, emergencyPause: true }); render(<App />); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Settings" }));
 fireEvent.change(screen.getByDisplayValue("12"), { target: { value: "8" } }); fireEvent.click(screen.getByRole("button", { name: "Emergency Pause" }));
 await screen.findByRole("button", { name: "Resume Processing" }); fireEvent.click(screen.getByRole("button", { name: "Save Settings" })); await waitFor(() => expect(save).toHaveBeenCalled()); expect(save.mock.calls[0][0]).toMatchObject({ emergencyPause: true, dailyApplicationLimit: 8 });
});
it("displays the configured Gemini model and truthful cycle tooltip", async () => {
 vi.mocked(api.getSettings).mockResolvedValue({ ...initialSettings, geminiModel: "gemini-3.1-flash-lite" }); render(<App />); await screen.findByText("AI Career Workspace");
 expect(screen.getByTitle("Process stored jobs; discovery and submission are not implemented")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "AI Agent Monitor" })); expect(screen.getByText("gemini-3.1-flash-lite")).toBeTruthy(); expect(screen.queryByText("gemini-3.8-flash")).toBeNull();
 expect(screen.getByText("No scheduler implemented")).toBeTruthy();
});
it("does not overwrite a pause result with an earlier status poll", async () => {
 let poll!: () => Promise<void>; vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => Promise<void>) => { poll = fn; return 123; }) as any);
 const status = { ...createDemoData().status, isPaused: false, workerState: "idle" as const }; vi.mocked(api.getAgentStatus).mockResolvedValue(status);
 vi.spyOn(api, "setPaused").mockResolvedValue({ isPaused: true, status: { ...status, isPaused: true, workerState: "paused" }, settings: { ...initialSettings, emergencyPause: true } });
 render(<App />); await screen.findByText("AI Career Workspace"); const delayed = deferred<typeof status>(); vi.mocked(api.getAgentStatus).mockReturnValueOnce(delayed.promise);
 let request!: Promise<void>; act(() => { request = poll(); }); fireEvent.click(screen.getByRole("button", { name: "Emergency Pause" })); await screen.findByTitle("Resume manual processing");
 await act(async () => { delayed.resolve(status); await request; }); expect(screen.getByTitle("Resume manual processing")).toBeTruthy();
});
it("serializes repeated pause intents without resuming until explicitly requested", async () => {
 const status = { ...createDemoData().status, isPaused: false, workerState: "idle" as const }; vi.mocked(api.getAgentStatus).mockResolvedValue(status);
 const paused = deferred<Awaited<ReturnType<typeof api.setPaused>>>(), retried = deferred<Awaited<ReturnType<typeof api.setPaused>>>();
 const request = vi.spyOn(api, "setPaused").mockReturnValueOnce(paused.promise).mockReturnValueOnce(retried.promise).mockResolvedValue({ isPaused: false, status, settings: initialSettings });
 render(<App />); await screen.findByText("AI Career Workspace"); const button = screen.getByRole("button", { name: "Emergency Pause" }); fireEvent.click(button); fireEvent.click(button);
 await waitFor(() => expect(request).toHaveBeenCalledTimes(1)); expect(request.mock.calls[0][0]).toBe(true);
 const saved = { isPaused: true, status: { ...status, isPaused: true, workerState: "paused" as const }, settings: { ...initialSettings, emergencyPause: true } };
 await act(async () => paused.resolve({ ...saved, warning: "Pause state was saved, but the activity log could not be saved." })); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); expect(request.mock.calls[1][0]).toBe(true);
 await act(async () => retried.resolve(saved)); expect(screen.getByTitle("Resume manual processing")).toBeTruthy(); expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("activity log could not be saved"));
 fireEvent.click(screen.getByRole("button", { name: "Settings" })); expect(screen.getByRole("button", { name: "Resume Processing" })).toBeTruthy();
 fireEvent.click(screen.getByTitle("Resume manual processing")); await waitFor(() => expect(request).toHaveBeenCalledTimes(3)); expect(request.mock.calls[2][0]).toBe(false); await screen.findByRole("button", { name: "Engage Emergency Stop" });
});
it("uses the atomic interview-preparation operation and rejects a stale completion across modes", async () => {
 const interview = { ...createDemoData().interviews[0], isDemo: false }, pending = deferred<typeof interview>(), refresh = vi.fn();
 const generate = vi.spyOn(api, "generateAndSaveInterviewPrep").mockReturnValueOnce(pending.promise), preview = vi.spyOn(api, "generateInterviewPrep"), update = vi.spyOn(api, "updateInterview");
 render(<InterviewTrackerView interviews={[interview]} jobs={[]} onRefreshInterviews={refresh} />); fireEvent.click(screen.getByRole("button", { name: "Generate AI Prep Sheet" })); expect(generate).toHaveBeenCalledWith(interview.id, createActionContext());
 setDataMode("demo"); setDataMode("real"); await act(async () => pending.resolve(interview)); expect(preview).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
});
it("reconciles actual server pause state after a failed request rather than guessing a toggle", async () => {
 const status = { ...createDemoData().status, isPaused: false, workerState: "idle" as const }, actual = { ...status, isPaused: true, workerState: "paused" as const };
 vi.mocked(api.getAgentStatus).mockResolvedValue(status); vi.spyOn(api, "setPaused").mockImplementationOnce(async paused => {
  expect(paused).toBe(true); vi.mocked(api.getAgentStatus).mockResolvedValue(actual); vi.mocked(api.getSettings).mockResolvedValue({ ...initialSettings, emergencyPause: true }); throw new Error("Response lost after commit");
 });
 render(<App />); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Emergency Pause" })); await screen.findByTitle("Resume manual processing");
 fireEvent.click(screen.getByRole("button", { name: "Settings" })); expect(screen.getByRole("button", { name: "Resume Processing" })).toBeTruthy(); expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Current server state: paused"));
});
it("reports an unconfirmed pause state when the request and reconciliation both fail", async () => {
 vi.mocked(api.getAgentStatus).mockResolvedValue({ ...createDemoData().status, isPaused: false, workerState: "idle" });
 vi.spyOn(api, "setPaused").mockImplementationOnce(async () => { vi.mocked(api.getAgentStatus).mockRejectedValue(new Error("Status unavailable")); throw new Error("Request unavailable"); });
 render(<App />); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Emergency Pause" }));
 expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Server pause state could not be confirmed")); expect(screen.getByRole("button", { name: "Emergency Pause" })).toBeTruthy();
});
it("does not clear a newer cycle's loading state after switching modes during the old finally refresh", async () => {
 vi.mocked(api.getAgentStatus).mockResolvedValue({ ...createDemoData().status, isPaused: false, workerState: "idle" });
 const oldRefresh = deferred<ReturnType<typeof realProfile>>(), newCycle = deferred<Awaited<ReturnType<typeof api.runAgentCycle>>>();
 vi.mocked(api.getProfile).mockResolvedValueOnce(realProfile()).mockReturnValueOnce(oldRefresh.promise).mockImplementation(async () => realProfile());
 const success = { success: true, discoveredCount: 0, matchedCount: 0, processedCount: 0, message: "No submissions" };
 const run = vi.spyOn(api, "runAgentCycle").mockResolvedValueOnce(success).mockReturnValueOnce(newCycle.promise);
 render(<App />); await screen.findByText("AI Career Workspace"); const button = () => screen.getByTitle("Process stored jobs; discovery and submission are not implemented") as HTMLButtonElement;
 fireEvent.click(button()); await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2)); expect(button().disabled).toBe(true);
 fireEvent.click(screen.getByRole("button", { name: "View optional demo" })); await screen.findByText("AI Career Workspace"); fireEvent.click(screen.getByRole("button", { name: "Return to real data" })); await screen.findByText("AI Career Workspace");
 fireEvent.click(button()); await waitFor(() => expect(run).toHaveBeenCalledTimes(2)); expect(button().disabled).toBe(true);
 await act(async () => oldRefresh.resolve(realProfile())); expect(button().disabled).toBe(true);
 await act(async () => newCycle.resolve(success)); await waitFor(() => expect(button().disabled).toBe(false));
});
it("labels manually stored jobs accurately in analytics without implying source discovery", async () => {
 vi.mocked(api.getJobs).mockResolvedValue([job()]); render(<App />); await screen.findByText("AI Career Workspace"); expect(screen.getByText("Stored Jobs")).toBeTruthy(); expect(screen.queryByText("Jobs Discovered")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
 expect(screen.getByText("Stored Jobs by Source")).toBeTruthy(); expect(screen.getByText("1 stored job")).toBeTruthy(); expect(screen.getByText("Direct Career Page")).toBeTruthy(); expect(screen.queryByText("Source Discovery Yield")).toBeNull(); expect(screen.queryByText(/discoveries/i)).toBeNull();
});
it("always sends an explicit pause intent through the HTTP transport", async () => {
 const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ isPaused: true, status: createDemoData().status, settings: { ...initialSettings, emergencyPause: true } }), { status: 200 }));
 await api.setPaused(true); expect(fetchMock).toHaveBeenCalledWith("/api/agent/toggle-pause", expect.objectContaining({ method: "POST", body: JSON.stringify({ paused: true }) }));
});
