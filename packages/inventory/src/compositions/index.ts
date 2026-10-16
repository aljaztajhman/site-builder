/**
 * Composition presets (kind `composition`, docs/plans/studio-phase1-design.md §5, I3): one file per preset under
 * `<intent>/<name>.ts`, each a `definePreset({ … })` default export (format and slots: @sb/spec composition/preset.ts
 * and slots.ts). New presets register as drafts; the owner's gallery decisions (decisions.json) approve them.
 */
import { parsePresetId, type CompositionPreset } from "@sb/spec";
import type { Asset, AssetTags } from "../schema.ts";
import areaHeadingBesideLine from "./area/heading-beside-line.ts";
import areaSignpostBand from "./area/signpost-band.ts";
import areaWhereWithPin from "./area/where-with-pin.ts";
import bookingBandSplit from "./booking/band-split.ts";
import bookingBookBesideHours from "./booking/book-beside-hours.ts";
import bookingHeadingBookCall from "./booking/heading-book-call.ts";
import bookingTownStamp from "./booking/town-stamp.ts";
import callHeadingActionsBand from "./call/heading-actions-band.ts";
import callHeadingSplitRuled from "./call/heading-split-ruled.ts";
import callPhonePlate from "./call/phone-plate.ts";
import callPhotoScrim from "./call/photo-scrim.ts";
import contactDetailsAndMap from "./contact/details-and-map.ts";
import contactDetailsHours from "./contact/details-hours.ts";
import contactDetailsRowMap from "./contact/details-row-map.ts";
import contactFactsCards from "./contact/facts-cards.ts";
import contactFactsStrip from "./contact/facts-strip.ts";
import contactHousePlateMap from "./contact/house-plate-map.ts";
import contactPhoneCallOut from "./contact/phone-call-out.ts";
import faqBandToggle from "./faq/band-toggle.ts";
import faqPinnedOpen from "./faq/pinned-open.ts";
import faqQuestionsThenPhone from "./faq/questions-then-phone.ts";
import faqToggleList from "./faq/toggle-list.ts";
import galleryArchRow from "./gallery/arch-row.ts";
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
import heroShopWindowTags from "./hero/shop-window-tags.ts";
import heroHandsAndHours from "./hero/hands-and-hours.ts";
import heroWorkshopDoor from "./hero/workshop-door.ts";
import heroPriceBoardBand from "./hero/price-board-band.ts";
import heroTypeWallStrip from "./hero/type-wall-strip.ts";
import heroPosterCallBlock from "./hero/poster-call-block.ts";
import heroPaintingOnDark from "./hero/painting-on-dark.ts";
import heroNightPrintCentred from "./hero/night-print-centred.ts";
import heroPoster1 from "./hero/poster-1.ts";
import heroBand1 from "./hero/band-1.ts";
import heroMagazine1 from "./hero/magazine-1.ts";
import heroStrata1 from "./hero/strata-1.ts";
import heroMosaic1 from "./hero/mosaic-1.ts";
import heroField1 from "./hero/field-1.ts";
import heroLedger1 from "./hero/ledger-1.ts";
import heroSplit1 from "./hero/split-1.ts";
import highlightsBroadsheet from "./highlights/broadsheet.ts";
import highlightsCheckerFields from "./highlights/checker-fields.ts";
import highlightsDarkPanel from "./highlights/dark-panel.ts";
import highlightsLargeLines from "./highlights/large-lines.ts";
import highlightsLeadStatement from "./highlights/lead-statement.ts";
import highlightsOverPhoto from "./highlights/over-photo.ts";
import highlightsPhotoList from "./highlights/photo-list.ts";
import highlightsRuledRows from "./highlights/ruled-rows.ts";
import highlightsStaircase from "./highlights/staircase.ts";
import highlightsTwoColumns from "./highlights/two-columns.ts";
import hoursArchPhotoHours from "./hours/arch-photo-hours.ts";
import hoursCompactList from "./hours/compact-list.ts";
import hoursHeadingTable from "./hours/heading-table.ts";
import hoursPosterBandHours from "./hours/poster-band-hours.ts";
import hoursStationBoard from "./hours/station-board.ts";
import hoursWeekChart from "./hours/week-chart.ts";
import menuCardOverPhoto from "./menu/card-over-photo.ts";
import menuDarkBoard from "./menu/dark-board.ts";
import menuFirstTwoBand from "./menu/first-two-band.ts";
import menuLeadersColumn from "./menu/leaders-column.ts";
import menuLeadersTwoColumns from "./menu/leaders-two-columns.ts";
import menuPlatesThenList from "./menu/plates-then-list.ts";
import noticeFramedCard from "./notice/framed-card.ts";
import noticeOneLineBar from "./notice/one-line-bar.ts";
import pageHeadMarkerDisc from "./page-head/marker-disc.ts";
import pageHeadTitleBlock from "./page-head/title-block.ts";
import pageHeadTitlePhoto from "./page-head/title-photo.ts";
import pageHeadTitleRuled from "./page-head/title-ruled.ts";
import pricesBandLargeRows from "./prices/band-large-rows.ts";
import pricesBoardOffers from "./prices/board-offers.ts";
import pricesLeaderRowsNotes from "./prices/leader-rows-notes.ts";
import pricesLedgerSheet from "./prices/ledger-sheet.ts";
import pricesPhotoRates from "./prices/photo-rates.ts";
import pricesPriceTagsRow from "./prices/price-tags-row.ts";
import pricesReceiptDocket from "./prices/receipt-docket.ts";
import pricesRowsTable from "./prices/rows-table.ts";
import productsPhotoGrid from "./products/photo-grid.ts";
import productsPriceColumns from "./products/price-columns.ts";
import productsRoundPlates from "./products/round-plates.ts";
import roomsPhotoCards from "./rooms/photo-cards.ts";
import roomsPhotoRows from "./rooms/photo-rows.ts";
import servicesAsideNote from "./services/aside-note.ts";
import servicesListBeside from "./services/list-beside.ts";
import servicesNamedRows from "./services/named-rows.ts";
import servicesPhotoBleedList from "./services/photo-bleed-list.ts";
import servicesPhotoCardsLead from "./services/photo-cards-lead.ts";
import servicesPosterNames from "./services/poster-names.ts";
import servicesSmallCards from "./services/small-cards.ts";
import servicesTwoColumnNamed from "./services/two-column-named.ts";
import stepsBesideArch from "./steps/beside-arch.ts";
import stepsInverseBand from "./steps/inverse-band.ts";
import stepsNumberedColumn from "./steps/numbered-column.ts";
import stepsRecipeCard from "./steps/recipe-card.ts";
import stepsThenCall from "./steps/then-call.ts";
import stepsTurnedHeading from "./steps/turned-heading.ts";
import storyDoorPlate from "./story/door-plate.ts";
import storyHeadingBesideText from "./story/heading-beside-text.ts";
import storyNameFigure from "./story/name-figure.ts";
import storyNarrowColumn from "./story/narrow-column.ts";
import storyPhotoLeftText from "./story/photo-left-text.ts";
import storyPhotoOwner from "./story/photo-owner.ts";
import storyPhotoPairOffset from "./story/photo-pair-offset.ts";
import storyPhotoRightText from "./story/photo-right-text.ts";
import storyRoundPhoto from "./story/round-photo.ts";
import storyTextOwner from "./story/text-owner.ts";
import teamDarkRoster from "./team/dark-roster.ts";
import teamDoorPlates from "./team/door-plates.ts";
import teamLeadName from "./team/lead-name.ts";
import teamNameRoleList from "./team/name-role-list.ts";
import teamNamesInColumns from "./team/names-in-columns.ts";
import teamPhotoBesideNames from "./team/photo-beside-names.ts";

/** Every preset, in a fixed order (by intent, then name). */
export const COMPOSITION_PRESETS: readonly CompositionPreset[] = [
  areaHeadingBesideLine,
  areaSignpostBand,
  areaWhereWithPin,
  bookingBandSplit,
  bookingBookBesideHours,
  bookingHeadingBookCall,
  bookingTownStamp,
  callHeadingActionsBand,
  callHeadingSplitRuled,
  callPhonePlate,
  callPhotoScrim,
  contactDetailsAndMap,
  contactDetailsHours,
  contactDetailsRowMap,
  contactFactsCards,
  contactFactsStrip,
  contactHousePlateMap,
  contactPhoneCallOut,
  faqBandToggle,
  faqPinnedOpen,
  faqQuestionsThenPhone,
  faqToggleList,
  galleryArchRow,
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
  heroShopWindowTags,
  heroHandsAndHours,
  heroWorkshopDoor,
  heroPriceBoardBand,
  heroTypeWallStrip,
  heroPosterCallBlock,
  heroPaintingOnDark,
  heroNightPrintCentred,
  heroPoster1,
  heroBand1,
  heroMagazine1,
  heroStrata1,
  heroMosaic1,
  heroField1,
  heroLedger1,
  heroSplit1,
  highlightsBroadsheet,
  highlightsCheckerFields,
  highlightsDarkPanel,
  highlightsLargeLines,
  highlightsLeadStatement,
  highlightsOverPhoto,
  highlightsPhotoList,
  highlightsRuledRows,
  highlightsStaircase,
  highlightsTwoColumns,
  hoursArchPhotoHours,
  hoursCompactList,
  hoursHeadingTable,
  hoursPosterBandHours,
  hoursStationBoard,
  hoursWeekChart,
  menuCardOverPhoto,
  menuDarkBoard,
  menuFirstTwoBand,
  menuLeadersColumn,
  menuLeadersTwoColumns,
  menuPlatesThenList,
  noticeFramedCard,
  noticeOneLineBar,
  pageHeadMarkerDisc,
  pageHeadTitleBlock,
  pageHeadTitlePhoto,
  pageHeadTitleRuled,
  pricesBandLargeRows,
  pricesBoardOffers,
  pricesLeaderRowsNotes,
  pricesLedgerSheet,
  pricesPhotoRates,
  pricesPriceTagsRow,
  pricesReceiptDocket,
  pricesRowsTable,
  productsPhotoGrid,
  productsPriceColumns,
  productsRoundPlates,
  roomsPhotoCards,
  roomsPhotoRows,
  servicesAsideNote,
  servicesListBeside,
  servicesNamedRows,
  servicesPhotoBleedList,
  servicesPhotoCardsLead,
  servicesPosterNames,
  servicesSmallCards,
  servicesTwoColumnNamed,
  stepsBesideArch,
  stepsInverseBand,
  stepsNumberedColumn,
  stepsRecipeCard,
  stepsThenCall,
  stepsTurnedHeading,
  storyDoorPlate,
  storyHeadingBesideText,
  storyNameFigure,
  storyNarrowColumn,
  storyPhotoLeftText,
  storyPhotoOwner,
  storyPhotoPairOffset,
  storyPhotoRightText,
  storyRoundPhoto,
  storyTextOwner,
  teamDarkRoster,
  teamDoorPlates,
  teamLeadName,
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
