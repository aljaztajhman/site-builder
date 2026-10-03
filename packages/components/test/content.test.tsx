import { describe, expect, it } from "vitest";
import {
  aboutSection,
  announcementSection,
  bookingSection,
  contentDefs,
  ctaSection,
  highlightsSection,
  imageText,
  stepsSection,
  textSection,
} from "@sb/spec";
import { About } from "../src/groups/content/About.tsx";
import { Announcement } from "../src/groups/content/Announcement.tsx";
import { Booking } from "../src/groups/content/Booking.tsx";
import { Cta } from "../src/groups/content/Cta.tsx";
import { Highlights } from "../src/groups/content/Highlights.tsx";
import { IMAGE_TEXT_ROUND_SIZES, IMAGE_TEXT_SIZES, ImageText } from "../src/groups/content/ImageText.tsx";
import { Steps } from "../src/groups/content/Steps.tsx";
import { Text } from "../src/groups/content/Text.tsx";
import { contentLcp, contentRenderers } from "../src/groups/content/index.ts";
import { SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

const sparseCtx = () => testCtx(testSpec({ business: SPARSE_BUSINESS }));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/** Every content section renders exactly one h2 labelled for its section, and never an h1. */
function expectH2(out: string, id: string) {
  expect(out).not.toContain("<h1");
  expect(count(out, /<h2/g)).toBe(1);
  expect(out).toMatch(new RegExp(`<h2 id="${id}-title"`));
  expect(out).toContain(`aria-labelledby="${id}-title"`);
}

describe("text", () => {
  const section = textSection.schema.parse({
    id: "s_text",
    type: "text",
    variant: "narrow",
    props: {
      heading: "Kako poteka prvi obisk",
      paragraphs: ["Najprej se pogovorimo o tem, kaj želite.", "Nato predlagamo striženje in barvo, ki vam ustrezata."],
    },
  });

  for (const variant of textSection.variants) {
    it(`renders ${variant}`, () => {
      const out = html(<Text section={{ ...section, variant }} ctx={testCtx()} index={1} />);
      expect(out).toContain(`s-text--${variant}`);
      expectH2(out, "s_text");
      expect(count(out, /<p>/g)).toBe(2);
    });
  }

  it("limits paragraphs to 6 of 600 characters", () => {
    const p = { ...section.props };
    expect(() => textSection.schema.parse({ ...section, props: { ...p, paragraphs: Array(7).fill("Besedilo.") } })).toThrow();
    expect(() => textSection.schema.parse({ ...section, props: { ...p, paragraphs: ["x".repeat(601)] } })).toThrow();
    expect(() => textSection.schema.parse({ ...section, props: { ...p, paragraphs: [] } })).toThrow();
  });
});

describe("image-text", () => {
  const section = imageText.schema.parse({
    id: "s_it",
    type: "image-text",
    variant: "image-left",
    props: {
      heading: "Barvanje las z rastlinskimi barvami",
      paragraphs: ["Uporabljamo barve brez amonijaka."],
      link: { label: "Vse storitve", target: { page: "p_storitve" } },
      image: "img_detail",
    },
  });

  // round and pair set their link as the section's one button (their own tests below and in motifs.test.tsx).
  for (const variant of imageText.variants.filter((v) => v !== "round" && v !== "pair")) {
    it(`renders ${variant} with a lazy photo and a text link`, () => {
      const out = html(<ImageText section={{ ...section, variant }} ctx={testCtx()} index={2} />);
      expect(out).toContain(`s-image-text--${variant}`);
      expectH2(out, "s_it");
      expect(out).toContain('loading="lazy"');
      expect(out).toContain(`sizes="${IMAGE_TEXT_SIZES}"`);
      expect(out).toMatch(/<a href="storitve.html" class="text-link image-text__link">Vse storitve<\/a>/);
    });
  }

  it("renders round with the photo in a disc and the link as the section's one button", () => {
    const out = html(<ImageText section={{ ...section, variant: "round", tone: "band" }} ctx={testCtx()} index={2} />);
    expect(out).toContain("s-image-text--round tone-band");
    expectH2(out, "s_it");
    expect(out).toContain('<picture class="media image-text__media disc media--contained">');
    expect(out).toContain(`sizes="${IMAGE_TEXT_ROUND_SIZES}"`);
    expect(out).toMatch(/<a href="storitve.html" class="btn btn--primary image-text__link">Vse storitve<\/a>/);
    expect(count(out, /btn btn--primary/g)).toBe(1);
  });

  it("requires an image and at most 3 paragraphs", () => {
    const { image: _image, ...noImage } = section.props;
    expect(() => imageText.schema.parse({ ...section, props: noImage })).toThrow();
    expect(() => imageText.schema.parse({ ...section, props: { ...section.props, paragraphs: ["a", "b", "c", "d"] } })).toThrow();
  });
});

describe("highlights", () => {
  const items = [
    { title: "Termin v istem tednu", text: "Prosti termini so objavljeni na spletu." },
    { title: "Parkirišče pred salonom", text: "Dve parkirni mesti sta rezervirani za stranke." },
    { title: "Plačilo s kartico", text: "Sprejemamo vse običajne plačilne kartice." },
  ];
  const section = highlightsSection.schema.parse({
    id: "s_hl",
    type: "highlights",
    variant: "list",
    props: { heading: "Zakaj k nam", intro: "Kaj vas čaka ob obisku.", items },
  });

  for (const variant of highlightsSection.variants) {
    it(`renders ${variant} as a list of h3 points without icons`, () => {
      const out = html(<Highlights section={{ ...section, variant }} ctx={testCtx()} index={1} />);
      expect(out).toContain(`s-highlights--${variant}`);
      expectH2(out, "s_hl");
      expect(count(out, /<li class="highlights__item">/g)).toBe(3);
      expect(count(out, /<h3/g)).toBe(3);
      expect(out).not.toMatch(/<svg|<img/);
    });
  }

  it("takes 2 to 6 items with limited lengths", () => {
    expect(() => highlightsSection.schema.parse({ ...section, props: { ...section.props, items: items.slice(0, 1) } })).toThrow();
    expect(() => highlightsSection.schema.parse({ ...section, props: { ...section.props, items: [...items, ...items, items[0]] } })).toThrow();
    expect(() =>
      highlightsSection.schema.parse({ ...section, props: { ...section.props, items: [{ title: "x".repeat(61), text: "a" }, items[0]] } }),
    ).toThrow();
    expect(() =>
      highlightsSection.schema.parse({ ...section, props: { ...section.props, items: [{ title: "a", text: "x".repeat(201) }, items[0]] } }),
    ).toThrow();
  });
});

describe("steps", () => {
  const section = stepsSection.schema.parse({
    id: "s_steps",
    type: "steps",
    variant: "vertical",
    props: {
      heading: "Kako do termina",
      steps: [
        { title: "Izberite storitev", text: "Na seznamu storitev poiščite, kar potrebujete." },
        { title: "Izberite prost termin", text: "V koledarju so prikazani prosti termini." },
        { title: "Prejmete potrditev", text: "Potrditev prejmete po e-pošti." },
      ],
      action: { label: "Rezerviraj termin", target: { action: "booking" } },
    },
  });

  for (const variant of stepsSection.variants) {
    it(`renders ${variant} as an ordered list without numbered labels`, () => {
      const out = html(<Steps section={{ ...section, variant }} ctx={testCtx()} index={1} />);
      expect(out).toContain(`s-steps--${variant}`);
      expectH2(out, "s_steps");
      expect(out).toContain('<ol class="steps"');
      expect(count(out, /<li class="steps__item">/g)).toBe(3);
      expect(out).not.toMatch(/>\s*0\d/);
      expect(out).not.toContain("<svg");
      expect(out).toContain('href="https://booking.example.com/lipa"');
    });
  }

  it("takes 2 to 5 steps", () => {
    const one = section.props.steps.slice(0, 1);
    const six = [...section.props.steps, ...section.props.steps];
    expect(() => stepsSection.schema.parse({ ...section, props: { ...section.props, steps: one } })).toThrow();
    expect(() => stepsSection.schema.parse({ ...section, props: { ...section.props, steps: six } })).toThrow();
  });
});

describe("cta", () => {
  const section = ctaSection.schema.parse({
    id: "s_cta",
    type: "cta",
    variant: "band",
    tone: "inverse",
    props: {
      heading: "Termin rezervirate v minuti",
      text: "Pokličite ali izberite prost termin na spletu.",
      primary: { label: "Pokliči", target: { action: "call" } },
      secondary: { label: "Rezerviraj", target: { action: "booking" } },
    },
  });

  for (const variant of ctaSection.variants) {
    it(`renders ${variant} left-aligned with one button and the second action as a text link`, () => {
      const out = html(<Cta section={{ ...section, variant }} ctx={testCtx()} index={3} />);
      expect(out).toContain(`s-cta--${variant} tone-inverse`);
      expectH2(out, "s_cta");
      expect(out).toContain('class="btn btn--primary"');
      expect(out).toContain('class="text-link"');
      expect(out).not.toContain("btn--secondary");
    });
  }

  it("is never listed as centred", () => {
    expect(ctaSection.centredVariants ?? []).toEqual([]);
  });

  it("drops the call button when the phone is a placeholder", () => {
    const out = html(<Cta section={section} ctx={sparseCtx()} index={3} />);
    expect(out).not.toContain("tel:");
  });

  it("requires a primary action", () => {
    const { primary: _p, ...rest } = section.props;
    expect(() => ctaSection.schema.parse({ ...section, props: rest })).toThrow();
  });
});

describe("booking", () => {
  const section = bookingSection.schema.parse({
    id: "s_book",
    type: "booking",
    variant: "simple",
    props: {
      heading: "Rezervirajte termin",
      text: "Prosti termini za ta in naslednji teden so na spletu.",
      action: { label: "Rezerviraj termin", target: { action: "booking" } },
    },
  });

  it("renders simple without hours", () => {
    const out = html(<Booking section={section} ctx={testCtx()} index={2} />);
    expect(out).toContain("s-booking--simple");
    expectH2(out, "s_book");
    expect(out).toContain('href="https://booking.example.com/lipa"');
    expect(out).not.toContain("hours__list");
  });

  it("renders with-hours with hours and phone", () => {
    const out = html(<Booking section={{ ...section, variant: "with-hours" }} ctx={testCtx()} index={2} />);
    expect(out).toContain("s-booking--with-hours");
    expectH2(out, "s_book");
    expect(out).toContain("hours__list");
    expect(out).toMatch(/<h3[^>]*>Delovni čas<\/h3>/);
    expect(out).toContain('href="tel:+38641123456"');
  });

  it("shows placeholders for missing hours and phone", () => {
    const call = { ...section, variant: "with-hours" as const, props: { ...section.props, action: { label: "Pokliči", target: { action: "call" as const } } } };
    const out = html(<Booking section={call} ctx={sparseCtx()} index={2} />);
    expect(out).not.toContain("tel:");
    expect(out).toContain('data-ph="hours"');
    expect(out).toContain('data-ph="phone"');
  });

  it("limits the text", () => {
    expect(() => bookingSection.schema.parse({ ...section, props: { ...section.props, text: "x".repeat(301) } })).toThrow();
  });
});

describe("about", () => {
  const section = aboutSection.schema.parse({
    id: "s_about",
    type: "about",
    variant: "image-side",
    props: {
      heading: "Salon v Trnovem",
      paragraphs: ["Salon je odprla Ana, ki je prej delala v večjem salonu v centru."],
      image: "img_team",
      ownerName: "Ana Novak",
      ownerRole: "lastnica salona",
    },
  });

  it("renders image-side with photo and owner", () => {
    const out = html(<About section={section} ctx={testCtx()} index={1} />);
    expect(out).toContain("s-about--image-side");
    expect(out).toContain("about--has-image");
    expectH2(out, "s_about");
    expect(out).toContain('alt="Ekipa salona"');
    expect(out).toContain("Ana Novak");
    expect(out).toContain("lastnica salona");
  });

  it("renders text-only without the photo", () => {
    const out = html(<About section={{ ...section, variant: "text-only" }} ctx={testCtx()} index={1} />);
    expect(out).toContain("s-about--text-only");
    expectH2(out, "s_about");
    expect(out).not.toContain("<img");
  });

  it("renders a name placeholder when the owner's name is missing", () => {
    const ph = { ...section, props: { ...section.props, ownerName: { $placeholder: "name" as const } } };
    expect(aboutSection.schema.parse(ph)).toBeTruthy();
    const out = html(<About section={ph} ctx={testCtx()} index={1} />);
    expect(out).toContain('data-ph="name"');
  });

  it("limits paragraphs to 4", () => {
    expect(() => aboutSection.schema.parse({ ...section, props: { ...section.props, paragraphs: Array(5).fill("Besedilo.") } })).toThrow();
  });

  it("renders figure: the client's number wall-sized beside the heading, the owner and the text, no photo", () => {
    const fig = aboutSection.schema.parse({ ...section, variant: "figure", props: { ...section.props, figure: { label: "Delamo od leta", value: "2004" } } });
    const out = html(<About section={fig} ctx={testCtx()} index={1} />);
    expectH2(out, "s_about");
    expect(out).toContain('<p class="figure"><span class="figure__label">Delamo od leta</span><span class="figure__value">2004</span></p>');
    expect(out).toContain("Ana Novak");
    expect(out).not.toContain("<img");
    // Without a figure it is the plain text-only story.
    const none = html(<About section={{ ...fig, props: { ...section.props } }} ctx={testCtx()} index={1} />);
    expect(none).not.toContain("figure__value");
    expect(none).not.toContain("<img");
  });

  it("keeps the figure short: a number as the client wrote it", () => {
    expect(() => aboutSection.schema.parse({ ...section, variant: "figure", props: { ...section.props, figure: { label: "Od leta", value: "123456789" } } })).toThrow();
    expect(() => aboutSection.schema.parse({ ...section, variant: "figure", props: { ...section.props, figure: { value: "2004" } } })).toThrow();
  });
});

describe("announcement", () => {
  const section = announcementSection.schema.parse({
    id: "s_note",
    type: "announcement",
    variant: "bar",
    props: {
      title: "Zaprto od 24. 12. do 2. 1.",
      text: "Med prazniki salon ne dela. Termine za januar lahko rezervirate že zdaj.",
      link: { label: "Rezerviraj", target: { action: "booking" } },
    },
  });

  for (const variant of announcementSection.variants) {
    it(`renders ${variant} as a static notice`, () => {
      const out = html(<Announcement section={{ ...section, variant }} ctx={testCtx()} index={0} />);
      expect(out).toContain(`s-announcement--${variant}`);
      expectH2(out, "s_note");
      expect(out).not.toMatch(/<button|<marquee|<script/);
      expect(out).toContain('href="https://booking.example.com/lipa"');
    });
  }

  it("limits title and text", () => {
    expect(() => announcementSection.schema.parse({ ...section, props: { ...section.props, title: "x".repeat(61) } })).toThrow();
    expect(() => announcementSection.schema.parse({ ...section, props: { ...section.props, text: "x".repeat(201) } })).toThrow();
  });
});

describe("content group", () => {
  it("has a renderer for every content type and no LCP resolvers", () => {
    expect(Object.keys(contentRenderers).sort()).toEqual(contentDefs.map((d) => d.type).sort());
    expect(contentLcp).toEqual({});
  });

  it("no content section is centred", () => {
    for (const d of contentDefs) expect(d.centredVariants ?? []).toEqual([]);
  });
});
