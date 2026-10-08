import { describe, expect, it } from "vitest";
import { reportPaths } from "../src/report-paths.ts";

describe("eval report paths", () => {
  it("only a run over every fixture replaces its committed baseline", () => {
    expect(reportPaths({ mode: "live", scope: "full" }).report).toBe("report.md");
    expect(reportPaths({ mode: "record", scope: "full" }).contactSheet).toBe("contact-sheet.png");
    expect(reportPaths({ mode: "live", scope: "home" })).toEqual({ report: "report-home.md", contactSheet: "contact-sheet-home.png", variety: "variety-live-home.md" });
    expect(reportPaths({ mode: "offline", scope: "full" })).toEqual({ report: "offline-report.md", contactSheet: "offline-contact-sheet.png", variety: "variety-offline-full.md" });
  });

  it("puts partial and replay runs in eval/runs/ (not committed)", () => {
    expect(reportPaths({ mode: "live", scope: "home", only: ["pekarna-kvas"] }).report).toBe("runs/report-live-home-pekarna-kvas.md");
    expect(reportPaths({ mode: "offline", scope: "full", photos: 0 }).report).toBe("runs/report-offline-full-0photos.md");
    expect(reportPaths({ mode: "replay", scope: "full" }).report).toBe("runs/report-replay-full.md");
    // Its times mix replayed and live calls: never a baseline.
    expect(reportPaths({ mode: "record-missing", scope: "full" }).report).toBe("runs/report-record-missing-full.md");
    // Twins and runs without edits aren't the baseline set either.
    expect(reportPaths({ mode: "live", scope: "home", twins: true }).report).toBe("runs/report-live-home-twins.md");
    expect(reportPaths({ mode: "live", scope: "home", edits: false }).report).toBe("runs/report-live-home-noedits.md");
  });

  it("keeps the variety numbers of every run over every fixture, partial runs in eval/runs/", () => {
    expect(reportPaths({ mode: "offline", scope: "full" }).variety).toBe("variety-offline-full.md");
    expect(reportPaths({ mode: "replay", scope: "full" }).variety).toBe("variety-replay-full.md");
    expect(reportPaths({ mode: "record", scope: "home", twins: true, edits: false }).variety).toBe("variety-live-home-twins.md");
    expect(reportPaths({ mode: "live", scope: "home", only: ["pekarna-kvas"] }).variety).toBe("runs/variety-live-home-pekarna-kvas.md");
  });

  it("a labelled run reports under its label in eval/runs/, the label standing for its fixture list", () => {
    expect(reportPaths({ mode: "record-missing", scope: "home", twins: true, edits: false, label: "off" })).toEqual({
      report: "runs/report-record-missing-home-off-twins-noedits.md",
      contactSheet: "runs/contact-sheet-record-missing-home-off-twins-noedits.png",
      variety: "runs/variety-record-missing-home-off-twins-noedits.md",
    });
    expect(reportPaths({ mode: "record-missing", scope: "home", only: ["avtoservis-mrak", "avto-kovac"], label: "on" }).variety).toBe("runs/variety-record-missing-home-on.md");
  });
});
