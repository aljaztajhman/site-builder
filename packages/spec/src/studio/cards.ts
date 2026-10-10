/**
 * The constraint-card deck (design-studio.md §5.3, inventory I8): one card per concept, drawn by seed, pushing it away
 * from the safe middle the way a creative brief does. The director may reject a card with a written reason; the critic
 * sees the cards.
 *
 * Every card can be said in today's composition language (spec v19: the 12-column grid, rows, layers and shifts, display
 * sizes, rotation, masks, photo treatments, fact treatments, section tone, surface texture and divider, drawn decor),
 * except those marked `needs: "f1b"`, which wait for composition language v2 (§7). `appliesTo.requires` names what the
 * client's input must have for the card to work (a photo-less site never gets "one photo only, full bleed").
 */
import type { ConstraintCard } from "./deck.ts";

/** Trades whose visitors come to the door, for the cards about getting there. */
const VISITED = ["hairdresser", "restaurant", "tourist-farm", "car-repair", "dental", "physio", "shop", "bakery"] as const;
/** Trades that publish prices as a rule. */
const PRICED = ["restaurant", "bakery", "shop", "hairdresser", "tourist-farm", "car-repair", "physio"] as const;

export const CARDS: readonly ConstraintCard[] = [
  // Type and words.
  { id: "headline-largest", text: "The headline is the largest thing on the page." },
  { id: "one-typeface", text: "One typeface in three sizes; hierarchy from size and space alone." },
  { id: "name-wall", text: "The business name, set across the full width at display size, is the first thing on the page; no photo competes with it." },
  { id: "vertical-heading", text: "One section heading runs vertically up the edge of its section on desktop; on phones it lies flat." },
  { id: "stacked-headline", text: "The headline breaks into three or more short lines at a narrow measure, stacked like a sign." },
  {
    id: "quiet-type",
    text: "No heading larger than the section-heading size; the page wins with space and pictures, not volume.",
    appliesTo: { requires: ["photos"] },
  },
  { id: "words-only-opener", text: "The first screen is words only: no photo and no drawing; the headline, one sentence and one action." },
  { id: "plain-sentence-headline", text: "The headline is a plain sentence in the client's own words saying what they do and where; no adjectives." },
  {
    id: "sign-capitals",
    text: "Headings are short heavy capitals, like painted letters on a sign; everything else stays in normal case.",
    appliesTo: { families: ["signage", "modernist", "contemporary", "print"] },
  },

  // Photos.
  { id: "one-photo-full-bleed", text: "One photo only, full bleed.", appliesTo: { requires: ["photos"] } },
  { id: "no-photo-first-screen", text: "The first screen has no photo; a drawn object carries it." },
  { id: "one-mask", text: "Every photo wears the same mask (arch, circle, cut or ticket); no plain rectangle anywhere on the page.", appliesTo: { requires: ["photos"] } },
  { id: "type-over-photo", text: "The headline overlaps the main photo by a column or more; words and picture read as one block.", appliesTo: { requires: ["photos"] } },
  {
    id: "one-treatment",
    text: "Every photo gets the same treatment in the site's colours (duotone or tint); none appears as shot.",
    appliesTo: { requires: ["photos"], families: ["print", "signage", "craft", "modernist", "contemporary"] },
  },
  { id: "contact-strip", text: "Photos appear only as a strip of small frames side by side, like contact prints; no photo is large.", appliesTo: { requires: ["several-photos"] } },
  { id: "tall-photo-column", text: "One tall photo spans every row of the opener; the words stack in the columns beside it.", appliesTo: { requires: ["photos"] } },
  {
    id: "object-not-room",
    text: "The main picture is one object on a plain ground (a loaf, a tool, a chair), not a room and not a team.",
    appliesTo: { requires: ["photos"], trades: ["bakery", "shop", "restaurant", "hairdresser", "builder", "car-repair", "tourist-farm"] },
  },
  { id: "layered-prints", text: "The opener layers two or three photos with deliberate offsets and overlaps, like prints laid on a table.", appliesTo: { requires: ["several-photos"] } },
  { id: "caption-beside", text: "Every photo has a short caption from the client's text set beside it, never under it.", appliesTo: { requires: ["photos"] } },

  // Grid and space.
  { id: "asymmetric-5-7", text: "A 5/7 asymmetric grid, held on every section." },
  { id: "narrow-column", text: "All running text sits in one narrow column on the left; the rest of the width is space and pictures." },
  { id: "half-empty", text: "Half of the first screen is empty on purpose; one block holds everything." },
  { id: "bottom-anchored", text: "The headline sits at the bottom of a full-height first screen, not at the top." },
  { id: "full-width-only", text: "Every section runs full width; no contained boxes, no cards." },
  { id: "four-sections", text: "The homepage has at most four sections before the footer; each one earns its place." },
  { id: "one-left-edge", text: "Every block aligns to one shared left edge; nothing is centred, nothing sits to the right." },
  { id: "ruled-not-boxed", text: "Hairline rules divide everything; no boxes, no cards, no filled panels." },

  // Colour.
  { id: "two-colours-and-paper", text: "Two colours and the paper; nothing else." },
  { id: "dark-opener", text: "The first screen is on the dark ground; everything after it is light." },
  { id: "one-band", text: "One saturated band colour appears once on the page, behind the single most important section." },
  { id: "one-ground", text: "Every section sits on the same ground; sections part by rules and space, never by colour." },
  { id: "colour-from-material", text: "The accent colour comes from one material the client names (teran red, copper, sage, rust), not from the trade's usual colours." },

  // Facts and content.
  { id: "fact-as-object", text: "The strongest fact the client gave is an object on the page, not a sentence." },
  {
    id: "phone-is-hero",
    text: "The phone number is the hero.",
    appliesTo: { trades: ["car-repair", "builder", "physio", "dental", "hairdresser", "accountant", "tourist-farm"], requires: ["phone"] },
  },
  {
    id: "price-at-headline-size",
    text: "One price the client gave, set at headline size.",
    appliesTo: { trades: ["restaurant", "bakery", "shop", "hairdresser", "tourist-farm"], requires: ["prices"] },
  },
  {
    id: "hours-as-hero",
    text: "The opening hours are the largest block on the first screen, drawn as a week.",
    appliesTo: { trades: ["restaurant", "bakery", "shop", "hairdresser", "car-repair", "dental", "physio"], requires: ["hours"] },
  },
  {
    id: "address-as-sign",
    text: "The street and town are set like a street sign near the top; where to come is the first thing read.",
    appliesTo: { trades: [...VISITED], requires: ["address"] },
  },
  { id: "one-ruled-list", text: "The whole offer is one long ruled list (a name, a short note, the price where the client gave one) instead of cards." },
  { id: "prices-as-objects", text: "Every price is an object on its own tag, plate or ticket, never a row in a table.", appliesTo: { trades: [...PRICED], requires: ["prices"] } },
  { id: "one-button", text: "The page has one button, for the main action; every other link is plain text." },

  // Drawing and ornament.
  { id: "one-drawing-everywhere", text: "One small drawn object serves as the mark, the bullet and the divider; nothing else decorates the page." },
  { id: "no-ornament", text: "No ornament at all: no drawing, no texture, no divider; photos and type carry the page.", appliesTo: { requires: ["photos"] } },

  // Composition language v2 (F1b).
  { id: "pinned-column", text: "On desktop the left column holds still (name, phone, hours) while the right column scrolls past it.", needs: "f1b" },
  { id: "sections-overlap", text: "Each section rises over the edge of the one before it; no straight cut between sections.", needs: "f1b" },
  { id: "line-through-sections", text: "One drawn line or motif crosses every section boundary, tying the page into one piece.", needs: "f1b" },
  { id: "split-field-opener", text: "The first screen splits into a solid colour field and a photo, side by side, edge to edge.", appliesTo: { requires: ["photos"] }, needs: "f1b" },
  { id: "huge-ornament", text: "One ornament or motif drawn huge behind a section, cropped by the page edge.", needs: "f1b" },
  { id: "one-moving-line", text: "One slow line of the client's short phrases runs across the page once; nothing else moves.", needs: "f1b" },
  { id: "sticker-fact", text: "One small rotated label sits on the opener carrying the strongest fact the client gave; never a rating or award.", needs: "f1b" },
  { id: "drawn-map", text: "Where to come is a drawn map of the street with a pin, not a photo and not an embedded map.", appliesTo: { trades: [...VISITED], requires: ["address"] }, needs: "f1b" },
];
