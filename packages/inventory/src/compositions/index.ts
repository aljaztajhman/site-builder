/**
 * Composition presets (kind `composition`, docs/plans/studio-phase1-design.md §5, I3): one file per preset under
 * `<intent>/<name>.ts`, each a `definePreset({ … })` default export (format and slots: @sb/spec composition/preset.ts
 * and slots.ts). New presets register as drafts; the owner's gallery decisions (decisions.json) approve them.
 */
import { parsePresetId, type CompositionPreset } from "@sb/spec";
import type { Asset, AssetTags } from "../schema.ts";
import areaHeadingBesideLine from "./area/heading-beside-line.ts";
import areaWhereWithPin from "./area/where-with-pin.ts";
import bookingBookBesideHours from "./booking/book-beside-hours.ts";
import bookingHeadingBookCall from "./booking/heading-book-call.ts";
import callHeadingActionsBand from "./call/heading-actions-band.ts";
import callHeadingSplitRuled from "./call/heading-split-ruled.ts";
import contactDetailsAndMap from "./contact/details-and-map.ts";
import contactDetailsHours from "./contact/details-hours.ts";
import contactDetailsRowMap from "./contact/details-row-map.ts";
import contactFactsCards from "./contact/facts-cards.ts";
import contactFactsStrip from "./contact/facts-strip.ts";
import contactPhoneCallOut from "./contact/phone-call-out.ts";
import galleryFanBeside from "./gallery/fan-beside.ts";
import galleryMosaic from "./gallery/mosaic.ts";
import galleryPhotoGrid from "./gallery/photo-grid.ts";
import galleryPostcards from "./gallery/postcards.ts";
import galleryTriptychAside from "./gallery/triptych-aside.ts";
import galleryWallBleed from "./gallery/wall-bleed.ts";
import galleryWideThenPair from "./gallery/wide-then-pair.ts";
import heroArchOnDark from "./hero/arch-on-dark.ts";
import heroBendPhoto from "./hero/bend-photo.ts";
import heroBleedPrint from "./hero/bleed-print.ts";
import heroBroadsheetMasthead from "./hero/broadsheet-masthead.ts";
import heroCardOverPhoto from "./hero/card-over-photo.ts";
import heroDiscPhotoTag from "./hero/disc-photo-tag.ts";
import heroDocketOnBand from "./hero/docket-on-band.ts";
import heroEnamelHouseNumber from "./hero/enamel-house-number.ts";
import heroHeadlineDrawnTrade from "./hero/headline-drawn-trade.ts";
import heroHeadlineFacts from "./hero/headline-facts.ts";
import heroHeadlineLargeRuled from "./hero/headline-large-ruled.ts";
import heroLabelCardArch from "./hero/label-card-arch.ts";
import heroPebblePair from "./hero/pebble-pair.ts";
import heroPhoneGiantRope from "./hero/phone-giant-rope.ts";
import heroPhotoBottomBand from "./hero/photo-bottom-band.ts";
import heroPhotoCoverBand from "./hero/photo-cover-band.ts";
import heroPhotoDarkPanel from "./hero/photo-dark-panel.ts";
import heroPhotoLeft from "./hero/photo-left.ts";
import heroPlateRibbon from "./hero/plate-ribbon.ts";
import heroSignpostPole from "./hero/signpost-pole.ts";
import heroSplitPhoto from "./hero/split-photo.ts";
import heroThreeArches from "./hero/three-arches.ts";
import highlightsBroadsheet from "./highlights/broadsheet.ts";
import highlightsCheckerFields from "./highlights/checker-fields.ts";
import highlightsDarkPanel from "./highlights/dark-panel.ts";
import highlightsLargeLines from "./highlights/large-lines.ts";
import highlightsLeadStatement from "./highlights/lead-statement.ts";
import highlightsPhotoList from "./highlights/photo-list.ts";
import highlightsRuledRows from "./highlights/ruled-rows.ts";
import highlightsStaircase from "./highlights/staircase.ts";
import highlightsTwoColumns from "./highlights/two-columns.ts";
import hoursArchPhotoHours from "./hours/arch-photo-hours.ts";
import hoursCompactList from "./hours/compact-list.ts";
import hoursHeadingTable from "./hours/heading-table.ts";
import hoursPosterBandHours from "./hours/poster-band-hours.ts";
import hoursWeekChart from "./hours/week-chart.ts";
import menuLeadersColumn from "./menu/leaders-column.ts";
import menuLeadersTwoColumns from "./menu/leaders-two-columns.ts";
import noticeFramedCard from "./notice/framed-card.ts";
import noticeOneLineBar from "./notice/one-line-bar.ts";
import pageHeadMarkerDisc from "./page-head/marker-disc.ts";
import pageHeadTitleBlock from "./page-head/title-block.ts";
import pageHeadTitlePhoto from "./page-head/title-photo.ts";
import pageHeadTitleRuled from "./page-head/title-ruled.ts";
import pricesBoardOffers from "./prices/board-offers.ts";
import pricesLeaderRowsNotes from "./prices/leader-rows-notes.ts";
import pricesPhotoRates from "./prices/photo-rates.ts";
import pricesPriceTagsRow from "./prices/price-tags-row.ts";
import pricesRowsTable from "./prices/rows-table.ts";
import productsPhotoGrid from "./products/photo-grid.ts";
import productsPriceColumns from "./products/price-columns.ts";
import productsRoundPlates from "./products/round-plates.ts";
import roomsPhotoCards from "./rooms/photo-cards.ts";
import roomsPhotoRows from "./rooms/photo-rows.ts";
import servicesAsideNote from "./services/aside-note.ts";
import servicesListBeside from "./services/list-beside.ts";
import servicesNamedRows from "./services/named-rows.ts";
import servicesPhotoCardsLead from "./services/photo-cards-lead.ts";
import servicesSmallCards from "./services/small-cards.ts";
import servicesTwoColumnNamed from "./services/two-column-named.ts";
import storyHeadingBesideText from "./story/heading-beside-text.ts";
import storyNameFigure from "./story/name-figure.ts";
import storyNarrowColumn from "./story/narrow-column.ts";
import storyPhotoLeftText from "./story/photo-left-text.ts";
import storyPhotoOwner from "./story/photo-owner.ts";
import storyPhotoPairOffset from "./story/photo-pair-offset.ts";
import storyPhotoRightText from "./story/photo-right-text.ts";
import storyRoundPhoto from "./story/round-photo.ts";
import storyTextOwner from "./story/text-owner.ts";
import teamNameRoleList from "./team/name-role-list.ts";
import teamNamesInColumns from "./team/names-in-columns.ts";
import teamPhotoBesideNames from "./team/photo-beside-names.ts";

/** Every preset, in a fixed order (by intent, then name). */
export const COMPOSITION_PRESETS: readonly CompositionPreset[] = [
  areaHeadingBesideLine,
  areaWhereWithPin,
  bookingBookBesideHours,
  bookingHeadingBookCall,
  callHeadingActionsBand,
  callHeadingSplitRuled,
  contactDetailsAndMap,
  contactDetailsHours,
  contactDetailsRowMap,
  contactFactsCards,
  contactFactsStrip,
  contactPhoneCallOut,
  galleryFanBeside,
  galleryMosaic,
  galleryPhotoGrid,
  galleryPostcards,
  galleryTriptychAside,
  galleryWallBleed,
  galleryWideThenPair,
  heroArchOnDark,
  heroBendPhoto,
  heroBleedPrint,
  heroBroadsheetMasthead,
  heroCardOverPhoto,
  heroDiscPhotoTag,
  heroDocketOnBand,
  heroEnamelHouseNumber,
  heroHeadlineDrawnTrade,
  heroHeadlineFacts,
  heroHeadlineLargeRuled,
  heroLabelCardArch,
  heroPebblePair,
  heroPhoneGiantRope,
  heroPhotoBottomBand,
  heroPhotoCoverBand,
  heroPhotoDarkPanel,
  heroPhotoLeft,
  heroPlateRibbon,
  heroSignpostPole,
  heroSplitPhoto,
  heroThreeArches,
  highlightsBroadsheet,
  highlightsCheckerFields,
  highlightsDarkPanel,
  highlightsLargeLines,
  highlightsLeadStatement,
  highlightsPhotoList,
  highlightsRuledRows,
  highlightsStaircase,
  highlightsTwoColumns,
  hoursArchPhotoHours,
  hoursCompactList,
  hoursHeadingTable,
  hoursPosterBandHours,
  hoursWeekChart,
  menuLeadersColumn,
  menuLeadersTwoColumns,
  noticeFramedCard,
  noticeOneLineBar,
  pageHeadMarkerDisc,
  pageHeadTitleBlock,
  pageHeadTitlePhoto,
  pageHeadTitleRuled,
  pricesBoardOffers,
  pricesLeaderRowsNotes,
  pricesPhotoRates,
  pricesPriceTagsRow,
  pricesRowsTable,
  productsPhotoGrid,
  productsPriceColumns,
  productsRoundPlates,
  roomsPhotoCards,
  roomsPhotoRows,
  servicesAsideNote,
  servicesListBeside,
  servicesNamedRows,
  servicesPhotoCardsLead,
  servicesSmallCards,
  servicesTwoColumnNamed,
  storyHeadingBesideText,
  storyNameFigure,
  storyNarrowColumn,
  storyPhotoLeftText,
  storyPhotoOwner,
  storyPhotoPairOffset,
  storyPhotoRightText,
  storyRoundPhoto,
  storyTextOwner,
  teamNameRoleList,
  teamNamesInColumns,
  teamPhotoBesideNames,
];

/** A preset by id. */
export const compositionPreset = (id: string): CompositionPreset | undefined => COMPOSITION_PRESETS.find((p) => p.id === id);

/** The presets as inventory assets: drafts until the owner approves them; a preset adds no bytes of its own (the composed sheet does). */
export function compositionAssets(): Asset[] {
  return COMPOSITION_PRESETS.map((p) => {
    const intent = parsePresetId(p.id)?.intent;
    const tags: AssetTags = {
      trades: [...(p.tags?.trades ?? [])],
      stances: [...(p.tags?.stances ?? [])],
      intents: intent ? [intent as AssetTags["intents"][number]] : [],
      mood: [...(p.tags?.mood ?? [])],
      ground: ["dark", "tint", "white"],
      density: ["airy", "compact", "regular"],
    };
    return { id: p.id, kind: "composition", tags, phone: "ok", bytes: 0, license: "own", status: "draft", ...(p.note ? { note: p.note } : {}) } satisfies Asset;
  });
}
