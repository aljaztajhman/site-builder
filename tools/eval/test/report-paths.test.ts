import { describe, expect, it } from "vitest";
import { reportPaths } from "../src/report-paths.ts";

describe("eval report paths", () => {
  it("only a run over every fixture replaces its committed baseline", () => {
    expect(reportPaths({ mode: "live", scope: "full" }).report).toBe("report.md");
    expect(reportPaths({ mode: "record", scope: "full" }).contactSheet).toBe("contact-sheet.png");
    expect(reportPaths({ mode: "live", scope: "home" })).toEqual({ report: "report-home.md", contactSheet: "contact-sheet-home.png" });
    expect(reportPaths({ mode: "offline", scope: "full" })).toEqual({ report: "offline-report.md", contactSheet: "offline-contact-sheet.png" });
  });

  it("puts partial and replay runs in eval/runs/ (not committed)", () => {
    expect(reportPaths({ mode: "live", scope: "home", only: ["pekarna-kvas"] }).report).toBe("runs/report-live-home-pekarna-kvas.md");
    expect(reportPaths({ mode: "offline", scope: "full", photos: 0 }).report).toBe("runs/report-offline-full-0photos.md");
    expect(reportPaths({ mode: "replay", scope: "full" }).report).toBe("runs/report-replay-full.md");
  });
});
