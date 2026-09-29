import { describe, expect, it } from "vitest";
import { minifyCss, sharedBundle } from "../src/index.ts";

describe("minifyCss", () => {
  it("keeps descendant pseudo-class selectors intact", () => {
    expect(minifyCss(".tone-inverse :focus-visible { outline: 3px solid red; }")).toBe(".tone-inverse :focus-visible{outline:3px solid red}");
    expect(minifyCss("a:hover , b > c { color : blue ; }")).toBe("a:hover,b>c{color:blue}");
  });
});

describe("shared stylesheet", () => {
  const css = new TextDecoder().decode(sharedBundle().files.get("site.css"));

  it("contains no banned visual patterns", () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/monospace/);
    expect(css).not.toMatch(/font-style:italic/);
    // Pill buttons: no fully rounded radius on buttons.
    expect(css).not.toMatch(/\.btn[^{]*\{[^}]*border-radius:(9{3,}px|50%)/);
  });

  it("keeps the inverse focus ring selector", () => {
    expect(css).toContain(".tone-inverse :focus-visible");
  });

  it("ships every font face and island", () => {
    const files = [...sharedBundle().files.keys()];
    expect(files.filter((f) => f.startsWith("fonts/"))).toHaveLength(19);
    expect(files).toEqual(expect.arrayContaining(["js/nav.js", "js/consent.js", "js/gallery.js", "site.css"]));
  });
});
