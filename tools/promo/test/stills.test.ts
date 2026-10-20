import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { contactSheetHtml, estimateEur, loadStoryboard, planJobs } from "../stills.ts";

describe("promo stills", () => {
  const board = loadStoryboard();
  const config = loadConfig();

  it("plans one job per variant with the style appended", () => {
    const jobs = planJobs(board);
    expect(jobs.length).toBe(board.shots.reduce((n, s) => n + Math.max(1, s.variants ?? 1), 0));
    expect(new Set(jobs.map((j) => j.file)).size).toBe(jobs.length);
    for (const j of jobs) expect(j.prompt).toBe(`${j.shot.prompt} ${board.style}`);
    expect(planJobs(board, "4").every((j) => j.shot.concept === 4)).toBe(true);
  });

  it("estimates the whole run under the plan's €1 for the default model", () => {
    const eur = estimateEur(config, config.imageGen.models["nano-banana-2"]!, planJobs(board));
    expect(eur).toBeGreaterThan(0);
    expect(eur).toBeLessThanOrEqual(1);
  });

  it("keeps shots free of on-screen text and the storyboard's screens blank", () => {
    for (const s of board.shots) expect(s.prompt).not.toMatch(/\b(logo|sign reading|text saying)\b/i);
    expect(board.style).toMatch(/No text or lettering/);
  });

  it("writes a contact sheet with the total", () => {
    const html = contactSheetHtml([
      { file: "1a-sink-1.jpg", shot: "1a-sink", concept: 1, subject: "Under the sink", model: "m", prompt: "p", width: 1024, height: 1536, seconds: 9, eur: 0.07 },
      { file: "1b-caller-1.jpg", shot: "1b-caller", concept: 1, subject: "Caller", model: "m", prompt: "p", width: 0, height: 0, seconds: 1, eur: 0, error: "HTTP 500" },
    ]);
    expect(html).toContain("1 stills · €0.07");
    expect(html).toContain("1a-sink-1.jpg");
    expect(html).toContain("HTTP 500");
  });
});
