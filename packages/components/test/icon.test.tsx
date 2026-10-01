import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "../src/primitives/index.tsx";
import { html } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const NAMES: IconName[] = ["phone", "map-pin", "clock", "mail"];

describe("Icon", () => {
  for (const name of NAMES) {
    it(`renders ${name} as a hidden inline line icon in the text colour`, () => {
      const out = html(<Icon name={name} />);
      expect(out).toMatch(/^<svg class="icon" viewBox="0 0 24 24" width="20" height="20" /);
      expect(out).toContain('fill="none"');
      expect(out).toContain('stroke="currentColor"');
      expect(out).toContain('stroke-width="1.75"');
      expect(out).toContain('aria-hidden="true"');
      expect(out).toContain('focusable="false"');
      // No colour, background shape, title or external reference of its own.
      expect(out).not.toMatch(/fill="(?!none)|stroke="(?!currentColor)|style=|<title|<use|href=|<image/);
      expect(out).toMatch(/<(path|circle|rect) /);
    });
  }

  it("is sized to the label text with no background or circle around it", () => {
    const css = readFileSync(path.join(here, "../styles/base.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(/\.icon\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/width:\s*1\.15em/);
    expect(rule).toMatch(/height:\s*1\.15em/);
    expect(rule).not.toMatch(/background|border|border-radius|color|padding/);
    expect(css.match(/\.fact-label\s*\{([^}]*)\}/)?.[1]).toMatch(/gap:\s*0\.5em/);
  });
});
