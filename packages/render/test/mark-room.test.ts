import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FONT_PAIRS, migrateSpec, type SiteSpec } from "@sb/spec";
import { MARK_INK, hasMarkedCapital, markMarkedLines, markRoom, renderPage, tokensCss } from "../src/index.ts";

const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;

describe("room for marked capitals (M1: carons on the line above)", () => {
  it("knows a capital with a mark above it, as set", () => {
    expect(hasMarkedCapital("Šimnu", false)).toBe(true);
    expect(hasMarkedCapital("Pošteno", false)).toBe(false);
    expect(hasMarkedCapital("Pošteno", true)).toBe(true);
    expect(hasMarkedCapital("Ćevapi Đuro", false)).toBe(true);
    // Đ has a bar, not a mark above; a cedilla hangs below.
    expect(hasMarkedCapital("Đuro Çelik", false)).toBe(false);
  });

  it("marks the block and the inline elements up to the text, nothing else", () => {
    const out = markMarkedLines('<main><section><h1 class="t"><span>Pekarna</span> <em>Šimnu</em></h1><p>Pekarna</p></section></main>', false);
    expect(out).toBe('<main><section><h1 class="t" data-marks=""><span>Pekarna</span> <em data-marks="">Šimnu</em></h1><p>Pekarna</p></section></main>');
  });

  it("set in capitals: the headings and the names on an uppercase site, a composed heading in capitals; not a composed one in normal case", () => {
    // The header's row is a container: only the name and the link around it take the room, not the menu beside them.
    const html =
      '<header><div class="container"><a class="site-header__brand"><span class="site-header__name">Pošta</span></a><nav>Meni</nav></div></header><h2>Pošteno</h2><p>Pošteno</p><h2 class="cx-h cx-h--normal">Pošteno</h2>';
    expect(markMarkedLines(html, true)).toBe(
      '<header><div class="container"><a class="site-header__brand" data-marks="caps"><span class="site-header__name" data-marks="caps">Pošta</span></a><nav>Meni</nav></div></header><h2 data-marks="caps">Pošteno</h2><p>Pošteno</p><h2 class="cx-h cx-h--normal">Pošteno</h2>',
    );
    expect(markMarkedLines(html, false)).toBe(html);
    expect(markMarkedLines('<p class="cx-h cx-h--uppercase">Pošteno</p>', false)).toBe('<p class="cx-h cx-h--uppercase" data-marks="caps">Pošteno</p>');
  });

  it("leaves scripts, styles and drawings alone", () => {
    const html = '<script>if (a<b) x = "Š"</script><style>.Š{}</style><svg><title>Š</title></svg><p>Ž</p>';
    expect(markMarkedLines(html, false)).toBe('<script>if (a<b) x = "Š"</script><style>.Š{}</style><svg><title>Š</title></svg><p data-marks="">Ž</p>');
  });

  it("gives every heading face its room: mark ink, the deepest descender above, air", () => {
    for (const p of FONT_PAIRS) expect(MARK_INK[p.heading.file], p.heading.file).toBeDefined();
    // Oswald: 1.094 + 0.282 + air.
    expect(markRoom("oswald", false)).toBeGreaterThanOrEqual(1.094 + 0.282 + 0.04);
    expect(markRoom("unknown-face", true)).toBeGreaterThanOrEqual(markRoom("oswald", true));
    const spec = golden("pekarna-kvas");
    expect(tokensCss(spec.design)).toContain(`--lh-marks:${markRoom("fraunces", false)}`);
  });

  it("a page: the name in the footer wordmark and a hero title with Č get the mark; the rest keep their markup", () => {
    const spec = golden("pekarna-kvas");
    spec.business.name = "Pekarna Šimnu";
    spec.design.skeleton = { header: "bar", actions: "bar", footer: "wordmark", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };
    const hero = spec.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = { ...hero.props, headline: "Čas za kruh" };
    const out = renderPage(spec, spec.pages[0]!);
    expect(out).toMatch(/<p class="site-footer__wordmark"[^>]* data-marks=""/);
    expect(out).toMatch(/<h1 [^>]*data-marks="">Čas za kruh/);
  });
});
