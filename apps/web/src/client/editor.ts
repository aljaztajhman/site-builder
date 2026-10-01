/**
 * Dashboard editor. Direct edits (text, blocks, facts, design, pages) are JSON Patches sent to
 * /api/sites/:id/patch and applied in code: no model call, no tokens. Only the AI tab talks to
 * the model.
 */

import { EDITOR_STARTER_TEXT } from "@sb/spec/starter";
import { formatDateTime, formatEur, siteStatus } from "../ui/labels.ts";
import { undoTarget } from "./versions.ts";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
type Schema = { [k: string]: unknown };

interface Op {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
}

interface SectionInfo {
  type: string;
  group: string;
  variants: string[];
  description: string;
  images: string;
  props: Schema;
  canAdd: boolean;
}

interface Catalogue {
  sections: SectionInfo[];
  business: Schema;
  directions: { id: string; name: string; summary: string; fontPairs: string[]; ranges: Record<string, unknown> }[];
  fontPairs: { id: string; label: string }[];
}

interface State {
  site: { id: string; name: string; slug: string; status: string; published_version: number | null; published_at: string | null; intake?: { scope?: string } };
  version: number | null;
  spec: Obj | null;
  events: { id: string; stage: string; level: string; message: string; created_at: string; data: unknown }[];
  chat: { id: string; role: string; content: string; result: unknown; created_at: string }[];
  cost: { stage: string; calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; eur: number; ms: number }[];
  versions: { version: number; source: string; message: string | null; created_at: string }[];
  placeholders: { path: string; kind: string }[];
  blockers: string[];
  messages: number;
  spendToday: number;
  cap: number;
}

const root = document.getElementById("app")!;
const siteId = root.dataset.siteId!;
let state: State;
let catalogue: Catalogue | null = null;
let tab: "content" | "facts" | "design" | "pages" | "ai" | "versions" = "content";
let pageIndex = 0;
let selected: string | null = null;
let device: "mobile" | "desktop" = "mobile";
let editMode = true;
let toast = "";
let pollTimer: number | undefined;

// ---------- DOM helper ----------
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "value") (el as HTMLInputElement).value = String(v);
    else if (k === "checked") (el as HTMLInputElement).checked = Boolean(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}


// ---------- API ----------
async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/sites/${siteId}${path}`, { headers: { "content-type": "application/json" }, ...init });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string; issues?: { path: string; message: string }[]; blockers?: string[] };
  if (!r.ok) {
    const detail = body.issues?.map((i) => `${i.path}: ${i.message}`).join("\n") ?? body.blockers?.slice(0, 8).join("\n") ?? body.message ?? body.error ?? r.statusText;
    throw new Error(detail);
  }
  return body;
}

async function load(rerender = true): Promise<void> {
  state = await api<State>("");
  if (state.spec && !catalogue) catalogue = await api<Catalogue>("/catalogue");
  if (rerender) render();
  else {
    // Form autosave: keep the form, refresh only the version label.
    const v = document.getElementById("ed-version");
    if (v && state.version) v.textContent = `v${state.version}`;
    showToast();
  }
  schedulePoll();
}

/**
 * A chat message is waiting for its reply: the worker may not have marked the site "editing" yet.
 * Bounded in time, so a lost job can't keep the send button disabled.
 */
const awaitingReply = (): boolean => {
  const last = state.chat.at(-1);
  return last?.role === "user" && Date.now() - Date.parse(last.created_at) < 3 * 60_000;
};

/** What a poll can change on screen; re-render only when it differs, so typing isn't wiped every 2 s. */
const pollSignature = (): string => [state.site.status, state.version, state.chat.length, state.events.length].join("|");

function schedulePoll(): void {
  window.clearTimeout(pollTimer);
  const active = state.site.status === "generating" || state.site.status === "editing" || awaitingReply();
  if (active) pollTimer = window.setTimeout(() => void poll(), 2000);
}

async function poll(): Promise<void> {
  const before = pollSignature();
  try {
    state = await api<State>("");
    if (state.spec && !catalogue) catalogue = await api<Catalogue>("/catalogue");
  } catch {
    // A failed request (deploy, network blip) must not stop polling; try again on the next tick.
    pollTimer = window.setTimeout(() => void poll(), 5000);
    return;
  }
  if (pollSignature() !== before) render();
  if (state.version !== frameVersion) reloadPreview();
  schedulePoll();
}

/** Sends direct-edit operations. No model call. */
/** Saves wait their turn: each is sent after the previous one has landed and the version is fresh. */
let saveChain: Promise<unknown> = Promise.resolve();

function patch(ops: Op[], message: string, rerender = true): Promise<boolean> {
  const run = saveChain.then(() => sendPatch(ops, message, rerender));
  saveChain = run.catch(() => undefined);
  return run;
}

async function sendPatch(ops: Op[], message: string, rerender: boolean): Promise<boolean> {
  if (!state.spec) return false;
  try {
    const r = await api<{ version: number; adjustments: string[] }>("/patch", { method: "POST", body: JSON.stringify({ baseVersion: state.version, ops, message }) });
    toast = r.adjustments.length ? `Shranjeno. ${r.adjustments.join("; ")}` : "Shranjeno.";
    // Form autosaves keep the form (and its focus) in place; everything else re-renders.
    await load(rerender || r.adjustments.length > 0);
    reloadPreview();
    return true;
  } catch (e) {
    toast = rerender ? `Ni shranjeno: ${(e as Error).message}` : `Še ni shranjeno: dopolnite polja. (${(e as Error).message.split(String.fromCharCode(10))[0]})`;
    await load(rerender);
    return false;
  }
}

async function post(path: string, body: unknown, ok: string): Promise<void> {
  try {
    await api(path, { method: "POST", body: JSON.stringify({ baseVersion: state.version, ...(body as object) }) });
    toast = ok;
  } catch (e) {
    toast = (e as Error).message;
  }
  await load();
  reloadPreview();
}

// ---------- Spec helpers ----------
const pages = () => (state.spec?.pages ?? []) as Obj[];
const currentPage = () => pages()[pageIndex] as Obj | undefined;
const sections = () => ((currentPage()?.sections ?? []) as Obj[]);
const esc = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");
const pageFileOf = (p: Obj) => `${(p.slug as string) || "index"}.html`;
const sectionInfo = (type: string) => catalogue?.sections.find((s) => s.type === type);
const TYPE_LABEL: Record<string, string> = {
  "hero-split": "Uvod s fotografijo",
  "hero-image": "Uvod čez fotografijo",
  "hero-type": "Uvod (besedilo)",
  "page-header": "Glava strani",
  text: "Besedilo",
  "image-text": "Slika in besedilo",
  highlights: "Poudarki",
  steps: "Koraki",
  cta: "Poziv k dejanju",
  booking: "Rezervacija",
  about: "O nas",
  announcement: "Obvestilo",
  "services-list": "Storitve (seznam)",
  "services-cards": "Storitve (kartice)",
  "price-list": "Cenik",
  menu: "Jedilnik",
  "opening-hours": "Delovni čas",
  contact: "Kontakt",
  faq: "Pogosta vprašanja",
  team: "Ekipa",
  gallery: "Galerija",
  products: "Izdelki",
  rooms: "Sobe in ponudba",
  "service-area": "Območje dela",
  "contact-strip": "Hitri kontakt",
  legal: "Pravno besedilo",
  "not-found": "Stran ne obstaja",
};
const label = (t: string) => TYPE_LABEL[t] ?? t;

function sectionTitle(s: Obj): string {
  const p = (s.props ?? {}) as Obj;
  const t = (p.headline ?? p.title ?? p.eyebrow ?? "") as string;
  return typeof t === "string" && t ? t : "";
}

function newSectionId(type: string): string {
  const taken = new Set(pages().flatMap((p) => ((p.sections as Obj[]) ?? []).map((s) => s.id as string)));
  const base = `s_${type.replace(/-/g, "_")}`;
  let id = base;
  let n = 1;
  while (taken.has(id)) id = `${base}_${++n}`;
  return id;
}

// ---------- Schema-driven forms ----------
function resolve(s: Schema, rootSchema: Schema): Schema {
  if (typeof s.$ref === "string") {
    const name = s.$ref.split("/").pop()!;
    const defs = (rootSchema.$defs ?? rootSchema.definitions ?? {}) as Record<string, Schema>;
    return defs[name] ?? s;
  }
  return s;
}

function isPlaceholderSchema(s: Schema): boolean {
  return !!(s.properties as Obj | undefined)?.$placeholder;
}

/** Default value for a new field. `starter` fills text with the editor starter text (a publish blocker until replaced). */
function defaultFor(s: Schema, rootSchema: Schema, key: string, starter = true): Json {
  s = resolve(s, rootSchema);
  if (Array.isArray(s.anyOf)) {
    const opts = s.anyOf as Schema[];
    const ph = opts.find((o) => isPlaceholderSchema(resolve(o, rootSchema)));
    if (ph) return { $placeholder: key === "price" ? "price" : key === "name" ? "name" : "text" };
    return defaultFor(opts[0]!, rootSchema, key, starter);
  }
  if ("const" in s) return s.const as Json;
  if (Array.isArray(s.enum)) return s.enum[0] as Json;
  switch (s.type) {
    case "object": {
      const out: Obj = {};
      const req = new Set((s.required as string[]) ?? []);
      for (const [k, sub] of Object.entries((s.properties ?? {}) as Record<string, Schema>)) if (req.has(k)) out[k] = defaultFor(sub, rootSchema, k, starter);
      return out;
    }
    case "array":
      return Array.from({ length: Number(s.minItems ?? 0) }, () => defaultFor((s.items ?? {}) as Schema, rootSchema, key, starter));
    case "string": {
      if (typeof s.pattern === "string" && s.pattern.includes("img_")) return ((state.spec?.assets as Obj)?.images as Obj[])?.[0]?.id ?? "";
      if (typeof s.pattern === "string" && s.pattern.includes("p_")) return pages()[0]?.id ?? "";
      return starter ? (EDITOR_STARTER_TEXT[key] ?? EDITOR_STARTER_TEXT.text!).slice(0, Number(s.maxLength ?? 200)) : "";
    }
    case "number":
    case "integer":
      return Number(s.minimum ?? 0);
    case "boolean":
      return false;
    default:
      return null;
  }
}

const FIELD_LABEL: Record<string, string> = {
  props: "Vsebina razdelka",
  headline: "Naslov",
  title: "Naslov",
  eyebrow: "Nadnaslov",
  intro: "Uvod",
  text: "Besedilo",
  body: "Besedilo",
  paragraphs: "Odstavki",
  description: "Opis",
  items: "Postavke",
  primary: "Glavni gumb",
  secondary: "Drugi gumb",
  link: "Povezava",
  label: "Besedilo gumba",
  target: "Cilj",
  image: "Fotografija",
  images: "Fotografije",
  price: "Cena",
  amount: "Znesek (€)",
  unit: "Enota",
  from: "Cena od",
  name: "Ime",
  role: "Vloga",
  question: "Vprašanje",
  answer: "Odgovor",
  phone: "Telefon",
  email: "E-pošta",
  address: "Naslov",
  street: "Ulica in hišna številka",
  postalCode: "Poštna številka",
  city: "Kraj",
  hours: "Delovni čas",
  entries: "Obdobja",
  open: "Odprto od (HH:MM)",
  close: "Odprto do (HH:MM)",
  closed: "Zaprto",
  note: "Opomba",
  provider: "Podatki o ponudniku (ZEPT)",
  legalName: "Polno ime podjetja",
  registrationNumber: "Matična številka",
  taxNumber: "Davčna številka",
  vatPayer: "Zavezanec za DDV",
  bookingUrl: "Povezava za rezervacije",
};

const PH_KIND: Record<string, string> = { phone: "phone", email: "email", address: "address", hours: "hours", price: "price", name: "name", legalName: "legalName", registrationNumber: "registrationNumber", taxNumber: "taxNumber" };

/**
 * How a field reports changes. `edit` is a value change inside the form (debounced save, the form
 * stays as it is); `structure` changes the form's shape (item added, removed, moved; optional field
 * added; placeholder toggled) and saves at once, then re-renders.
 */
interface Sink {
  edit(v: Json | undefined): void;
  structure(v: Json | undefined): void;
}

/**
 * Renders an editor for `value` by its JSON Schema. Objects and arrays are edited in place, so all
 * fields of one form share one live copy and a save always sends the current whole value.
 * Placeholders ({$placeholder}) show as "missing" with a button to fill them.
 */
function field(schema: Schema, rootSchema: Schema, value: Json | undefined, key: string, sink: Sink, optional = false): HTMLElement {
  const s = resolve(schema, rootSchema);
  const title = FIELD_LABEL[key] ?? key;
  const box = h("div", { class: "field" });

  if (Array.isArray(s.anyOf)) {
    const opts = (s.anyOf as Schema[]).map((o) => resolve(o, rootSchema));
    const phIndex = opts.findIndex(isPlaceholderSchema);
    const nonPh = opts.filter((_, i) => i !== phIndex);
    const isPh = value !== null && typeof value === "object" && !Array.isArray(value) && "$placeholder" in value;
    if (phIndex >= 0 && nonPh.length === 1) {
      if (isPh) {
        // Show an empty editor without saving; the value is saved once it is valid.
        const holder = h("div", { class: "field" });
        holder.append(
          h("label", {}, title),
          h(
            "div",
            { class: "note warn row" },
            h("span", { class: "sp" }, "Manjka. Dokler podatka ne vpišete, stran ni objavljiva."),
            h(
              "button",
              {
                class: "btn sm",
                type: "button",
                onClick: () => {
                  const f = field(nonPh[0]!, rootSchema, defaultFor(nonPh[0]!, rootSchema, key, false), key, sink);
                  holder.replaceWith(f);
                  linkLabels(f);
                  f.querySelector<HTMLElement>("input, textarea, select")?.focus();
                },
              },
              "Vnesi",
            ),
          ),
        );
        return holder;
      }
      const inner = field(nonPh[0]!, rootSchema, value, key, sink);
      inner.append(h("button", { class: "btn sm", type: "button", onClick: () => sink.structure({ $placeholder: PH_KIND[key] ?? "text" }) }, "Označi kot manjkajoče"));
      return inner;
    }
    // Link targets and other unions: pick the branch whose keys match the value.
    const idx = Math.max(0, opts.findIndex((o) => value && typeof value === "object" && !Array.isArray(value) && Object.keys((o.properties ?? {}) as Obj).some((k) => k in (value as Obj))));
    const names = opts.map((o) => Object.keys((o.properties ?? {}) as Obj)[0] ?? "vrednost");
    const KIND: Record<string, string> = { page: "Stran na tej strani", action: "Dejanje (klic, pot, e-pošta, rezervacija)", url: "Zunanja povezava" };
    const sel = h(
      "select",
      { onChange: (e: Event) => sink.structure(defaultFor(opts[Number((e.target as HTMLSelectElement).value)]!, rootSchema, key)) },
      ...names.map((n, i) => h("option", { value: String(i), selected: i === idx }, KIND[n] ?? n)),
    );
    box.append(h("label", {}, title), sel, field(opts[idx]!, rootSchema, value, key, sink));
    return box;
  }

  if (Array.isArray(s.enum)) {
    const ENUM: Record<string, string> = { call: "Pokliči", directions: "Navodila za pot", email: "E-pošta", booking: "Rezervacija" };
    box.append(
      h("label", {}, title),
      h(
        "select",
        { onChange: (e: Event) => sink.edit((e.target as HTMLSelectElement).value || undefined) },
        ...(optional ? [h("option", { value: "" }, "Brez")] : []),
        ...(s.enum as string[]).map((v) => h("option", { value: v, selected: v === value }, ENUM[v] ?? v)),
      ),
    );
    return box;
  }

  switch (s.type) {
    case "object": {
      const fs = h("fieldset", {}, h("legend", {}, title));
      const props = (s.properties ?? {}) as Record<string, Schema>;
      const req = new Set((s.required as string[]) ?? []);
      const obj = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Obj;
      const childSink = (k: string): Sink => ({
        edit: (v) => {
          if (v === undefined) delete obj[k];
          else obj[k] = v;
          sink.edit(obj);
        },
        structure: (v) => {
          if (v === undefined) delete obj[k];
          else obj[k] = v;
          sink.structure(obj);
        },
      });
      for (const [k, sub] of Object.entries(props)) {
        if (k === "$placeholder") continue;
        if (!req.has(k) && !(k in obj)) {
          fs.append(h("button", { class: "btn sm", type: "button", onClick: () => childSink(k).structure(defaultFor(sub, rootSchema, k)) }, `+ ${FIELD_LABEL[k] ?? k}`), " ");
          continue;
        }
        const child = field(sub, rootSchema, obj[k], k, childSink(k), !req.has(k));
        if (!req.has(k)) child.append(h("button", { class: "btn sm", type: "button", onClick: () => childSink(k).structure(undefined) }, "Odstrani"));
        fs.append(child);
      }
      return fs;
    }
    case "array": {
      const arr = (Array.isArray(value) ? value : []) as Json[];
      const itemSchema = (s.items ?? {}) as Schema;
      const fs = h("fieldset", {}, h("legend", {}, `${title} (${arr.length})`));
      const restructure = (fn: () => void) => {
        fn();
        sink.structure(arr);
      };
      arr.forEach((item, i) => {
        const itemSink: Sink = {
          edit: (v) => {
            arr[i] = v ?? null;
            sink.edit(arr);
          },
          structure: (v) => restructure(() => (v === undefined ? arr.splice(i, 1) : (arr[i] = v))),
        };
        const tools = h(
          "div",
          { class: "row" },
          h("button", { class: "icon", type: "button", title: "Gor", "aria-label": "Premakni gor", disabled: i === 0, onClick: () => restructure(() => arr.splice(i - 1, 0, ...arr.splice(i, 1))) }, "↑"),
          h("button", { class: "icon", type: "button", title: "Dol", "aria-label": "Premakni dol", disabled: i === arr.length - 1, onClick: () => restructure(() => arr.splice(i + 1, 0, ...arr.splice(i, 1))) }, "↓"),
          h("button", { class: "icon", type: "button", title: "Odstrani", "aria-label": "Odstrani", disabled: arr.length <= Number(s.minItems ?? 0), onClick: () => restructure(() => arr.splice(i, 1)) }, "✕"),
        );
        fs.append(tools, field(itemSchema, rootSchema, item, key === "paragraphs" ? "text" : key, itemSink));
      });
      if (arr.length < Number(s.maxItems ?? 99)) {
        fs.append(h("button", { class: "btn sm", type: "button", onClick: () => restructure(() => arr.push(defaultFor(itemSchema, rootSchema, key))) }, "+ Dodaj"));
      }
      return fs;
    }
    case "string": {
      const pattern = typeof s.pattern === "string" ? s.pattern : "";
      if (pattern.includes("img_")) {
        const imgs = ((state.spec?.assets as Obj)?.images ?? []) as Obj[];
        box.append(
          h("label", {}, title),
          h("select", { onChange: (e: Event) => sink.edit((e.target as HTMLSelectElement).value) }, ...imgs.map((im) => h("option", { value: im.id as string, selected: im.id === value }, `${im.origin === "generated" ? "Ustvarjeno z UI" : "Fotografija"}: ${String(im.alt).slice(0, 50)}`))),
        );
        return box;
      }
      if (pattern.includes("p_")) {
        box.append(
          h("label", {}, title),
          h("select", { onChange: (e: Event) => sink.edit((e.target as HTMLSelectElement).value) }, ...pages().map((p) => h("option", { value: p.id as string, selected: p.id === value }, ((p.nav as Obj).label as string) ?? p.id))),
        );
        return box;
      }
      const max = Number(s.maxLength ?? 0);
      const long = max > 120;
      const input = long
        ? h("textarea", { maxlength: max || undefined, rows: Math.min(8, Math.ceil(max / 90)) })
        : h("input", { type: key === "email" ? "email" : key.toLowerCase().includes("url") ? "url" : "text", maxlength: max || undefined });
      input.value = typeof value === "string" ? value : "";
      const count = h("div", { class: "count" }, max ? `${input.value.length}/${max}` : "");
      const hint = h("div", { class: "err", role: "status" });
      const re = pattern ? new RegExp(pattern) : null;
      const minLen = Number(s.minLength ?? 0);
      input.addEventListener("input", () => {
        count.textContent = max ? `${input.value.length}/${max}` : "";
        const v = input.value;
        if (v === "" && optional) {
          hint.textContent = "";
          input.removeAttribute("aria-invalid");
          return sink.edit(undefined);
        }
        // Don't save values the schema would reject; say what is expected instead.
        const bad = v.length < minLen ? "Polje ne sme biti prazno." : re && !re.test(v) ? `Neveljavna oblika${typeof s.description === "string" ? ` (${s.description})` : ""}.` : "";
        hint.textContent = bad;
        if (bad) input.setAttribute("aria-invalid", "true");
        else {
          input.removeAttribute("aria-invalid");
          sink.edit(v);
        }
      });
      box.append(h("label", {}, title), input, count, hint);
      return box;
    }
    case "number":
    case "integer": {
      const input = h("input", { type: "number", step: s.type === "integer" ? "1" : "any", min: s.minimum as number | undefined, max: s.maximum as number | undefined, value: value ?? "" });
      input.addEventListener("input", () => sink.edit(input.value === "" ? undefined : Number(input.value)));
      box.append(h("label", {}, title), input);
      return box;
    }
    case "boolean": {
      const input = h("input", { type: "checkbox", checked: value === true });
      input.addEventListener("change", () => sink.edit(input.checked));
      box.append(h("label", {}, input, " ", title));
      return box;
    }
    default:
      return h("div", { class: "muted" }, `${title}: ni urejevalnika`);
  }
}

/**
 * Form root at a spec pointer: a live copy of the value; edits are debounced and saved without
 * re-rendering (focus stays), structural changes save at once and re-render.
 */
function formAt(pointer: string, schema: Schema, value: Json, title: string, message: string): HTMLElement {
  const live = structuredClone(value);
  let timer: number | undefined;
  const send = (v: Json | undefined, rerender: boolean) =>
    patch([v === undefined ? { op: "remove", path: pointer } : { op: "replace", path: pointer, value: v }], message, rerender);
  return field(schema, schema, live, title, {
    edit: (v) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void send(v, false), 700);
    },
    structure: (v) => {
      window.clearTimeout(timer);
      void send(v, true);
    },
  });
}

/** Debounced save of a single scalar at a pointer (page settings). */
function autosave(pointer: string, message: string, delay = 700): (v: Json | undefined) => void {
  let timer: number | undefined;
  return (v) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void patch([v === undefined ? { op: "remove", path: pointer } : { op: "replace", path: pointer, value: v }], message, false), delay);
  };
}

// ---------- Panes ----------
const HEADER_VARIANT: Record<string, string> = { bar: "Vrstica", "split-cta": "Z gumbom na desni", stacked: "Ime na sredini" };
const FOOTER_VARIANT: Record<string, string> = { columns: "Stolpci", compact: "Strnjena" };
const TONE: Record<string, string> = { default: "Osnovno", alt: "Izmenično", inverse: "Obratno (temno)" };

/** A select with its label; `linkLabels` ties them together. */
const labelled = (title: string, control: HTMLElement) => h("div", {}, h("label", {}, title), control);

function contentPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  if (!state.spec) return pane;
  pane.append(
    h("label", {}, "Stran"),
    h("select", { onChange: (e: Event) => { pageIndex = Number((e.target as HTMLSelectElement).value); selected = null; render(); reloadPreview(); } }, ...pages().map((p, i) => h("option", { value: String(i), selected: i === pageIndex }, `${(p.nav as Obj).label} (${pageFileOf(p)})`))),
  );
  const secs = sections();
  const pi = pageIndex;
  const list = h("ul", { class: "outline" });
  secs.forEach((s, i) => {
    const id = s.id as string;
    const system = s.type === "legal" || s.type === "not-found";
    const name = label(s.type as string);
    list.append(
      h(
        "li",
        { class: id === selected ? "sel" : "", onClick: () => select(id) },
        h("span", { class: "t" }, h("strong", {}, name), h("span", { class: "muted" }, sectionTitle(s))),
        !system && h("button", { class: "icon", type: "button", title: "Premakni gor", "aria-label": `Premakni gor: ${name}`, disabled: i === 0, onClick: (e: Event) => { e.stopPropagation(); void patch([{ op: "move", from: `/pages/${pi}/sections/${i}`, path: `/pages/${pi}/sections/${i - 1}` }], "premik"); } }, "↑"),
        !system && h("button", { class: "icon", type: "button", title: "Premakni dol", "aria-label": `Premakni dol: ${name}`, disabled: i === secs.length - 1, onClick: (e: Event) => { e.stopPropagation(); void patch([{ op: "move", from: `/pages/${pi}/sections/${i}`, path: `/pages/${pi}/sections/${i + 1}` }], "premik"); } }, "↓"),
        !system && h("button", { class: "icon", type: "button", title: "Podvoji", "aria-label": `Podvoji: ${name}`, onClick: (e: Event) => { e.stopPropagation(); void patch([{ op: "add", path: `/pages/${pi}/sections/${i + 1}`, value: { ...structuredClone(s), id: newSectionId(s.type as string) } }], "podvojen razdelek"); } }, "⧉"),
        !system && h("button", { class: "icon", type: "button", title: "Izbriši", "aria-label": `Izbriši: ${name}`, onClick: (e: Event) => { e.stopPropagation(); if (confirm(`Izbrišem razdelek »${name}«?`)) void patch([{ op: "remove", path: `/pages/${pi}/sections/${i}` }], "izbrisan razdelek"); } }, "✕"),
      ),
    );
  });
  pane.append(h("h2", {}, "Razdelki"), list);

  if (catalogue && currentPage()?.kind !== "privacy" && currentPage()?.kind !== "accessibility" && currentPage()?.kind !== "not-found") {
    const addable = catalogue.sections.filter((c) => c.canAdd);
    const sel = h("select", {}, ...addable.map((c) => h("option", { value: c.type }, label(c.type))));
    const at = selected ? secs.findIndex((s) => s.id === selected) + 1 : secs.length;
    pane.append(
      h("label", { class: "sr-only" }, "Nov razdelek"),
      h("div", { class: "add-row" }, sel, h("button", { class: "btn", type: "button", onClick: () => void post("/sections", { pageIndex: pi, index: at, type: sel.value }, "Razdelek dodan.") }, "+ Dodaj")),
      h("p", { class: "help" }, selected ? "Nov razdelek pride pod izbranega." : "Nov razdelek pride na konec strani."),
    );
  }

  const si = secs.findIndex((s) => s.id === selected);
  const s = secs[si];
  if (s && catalogue) {
    const info = sectionInfo(s.type as string);
    const base = `/pages/${pi}/sections/${si}`;
    pane.append(h("h2", {}, label(s.type as string)));
    if (info) {
      pane.append(
        h("p", { class: "help" }, "Dvakrat kliknite besedilo v predogledu, da ga uredite neposredno."),
        h("div", { class: "pair" },
          labelled("Različica", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: `${base}/variant`, value: (e.target as HTMLSelectElement).value }], "različica") }, ...info.variants.map((v) => h("option", { value: v, selected: v === s.variant }, v)))),
          labelled("Ozadje", h("select", { onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; void patch([s.tone === undefined ? { op: "add", path: `${base}/tone`, value: v } : { op: "replace", path: `${base}/tone`, value: v }], "ozadje"); } },
            ...["default", "alt", "inverse"].map((t) => h("option", { value: t, selected: (s.tone ?? "default") === t }, TONE[t]!)))),
        ),
        formAt(`${base}/props`, info.props, s.props as Json, "props", `urejen razdelek ${s.type}`),
      );
    } else {
      pane.append(h("p", { class: "muted" }, "Ta razdelek ustvari sistem (pravna besedila, 404). Podatke uredite v zavihku Podatki."));
    }
  }
  return pane;
}

function factsPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  if (!state.spec || !catalogue) return pane;
  pane.append(h("p", { class: "help" }, "Podatki se prikažejo v glavi, nogi, kontaktu in delovnem času. Manjkajoči podatki so označeni in preprečujejo objavo."));
  pane.append(formAt("/business", catalogue.business, state.spec.business as Json, "Podatki o podjetju", "podatki"));
  const chrome = state.spec.chrome as Obj;
  const header = chrome.header as Obj;
  pane.append(
    h("h2", {}, "Glava in noga"),
    h("div", { class: "pair" },
      labelled("Glava", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/header/variant", value: (e.target as HTMLSelectElement).value }], "glava") }, ...["bar", "split-cta", "stacked"].map((v) => h("option", { value: v, selected: v === header.variant }, HEADER_VARIANT[v]!)))),
      labelled("Gumb v glavi", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/header/cta", value: (e.target as HTMLSelectElement).value }], "gumb v glavi") }, ...["call", "booking", "directions", "none"].map((v) => h("option", { value: v, selected: v === header.cta }, { call: "Pokliči", booking: "Rezervacija", directions: "Navodila za pot", none: "Brez" }[v]!)))),
      labelled("Ozadje glave", h("select", { onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; void patch([{ op: header.tone === undefined ? "add" : "replace", path: "/chrome/header/tone", value: v }], "ozadje glave"); } }, ...["default", "alt", "inverse"].map((v) => h("option", { value: v, selected: v === (header.tone ?? "default") }, { default: "Kot stran", alt: "Izmenično", inverse: "Temno" }[v]!)))),
      labelled("Noga", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/footer/variant", value: (e.target as HTMLSelectElement).value }], "noga") }, ...["columns", "compact"].map((v) => h("option", { value: v, selected: v === (chrome.footer as Obj).variant }, FOOTER_VARIANT[v]!)))),
    ),
    h("label", {}, h("input", { type: "checkbox", checked: chrome.mobileActionBar === true, onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/mobileActionBar", value: (e.target as HTMLInputElement).checked }], "vrstica za klic") }), "Spodnja vrstica za klic in pot na telefonu"),
  );
  return pane;
}

function designPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  if (!state.spec || !catalogue) return pane;
  const d = state.spec.design as Obj;
  const dir = catalogue.directions.find((x) => x.id === d.direction);
  const set = (k: string, v: Json) => void patch([{ op: "replace", path: `/design/${k}`, value: v }], `oblikovanje ${k}`);
  pane.append(
    h("label", {}, "Smer oblikovanja"),
    h("select", { onChange: (e: Event) => void post("/direction", { direction: (e.target as HTMLSelectElement).value }, "Smer zamenjana.") }, ...catalogue.directions.map((x) => h("option", { value: x.id, selected: x.id === d.direction }, x.name))),
    h("p", { class: "help" }, dir?.summary ?? ""),
    h("label", {}, "Pisave"),
    h("select", { onChange: (e: Event) => set("fontPair", (e.target as HTMLSelectElement).value) }, ...(dir?.fontPairs ?? []).map((id) => h("option", { value: id, selected: id === d.fontPair }, catalogue!.fontPairs.find((f) => f.id === id)?.label ?? id))),
  );
  const colors = d.colors as Obj;
  const NAMES: Record<string, string> = { background: "Ozadje strani", surface: "Izmenično ozadje", text: "Besedilo", muted: "Drugotno besedilo", primary: "Glavna barva (gumbi)", onPrimary: "Besedilo na gumbih", accent: "Poudarek", border: "Obrobe", inverse: "Temni razdelki", onInverse: "Besedilo na temnem" };
  const fs = h("fieldset", { class: "colors" }, h("legend", {}, "Barve (kontrast se preveri samodejno)"));
  for (const [k, v] of Object.entries(colors)) {
    const input = h("input", { type: "color", value: v as string, "aria-label": NAMES[k] ?? k });
    input.addEventListener("change", () => set(`colors/${k}`, input.value));
    fs.append(h("div", { class: "row" }, input, h("span", { class: "sp" }, NAMES[k] ?? k), h("span", { class: "hex" }, v as string)));
  }
  pane.append(fs);
  const r = (dir?.ranges ?? {}) as Record<string, [number, number] | string[]>;
  const num = (k: string, title: string, step: string) => {
    const [lo, hi] = (r[k] as [number, number]) ?? [0, 100];
    const input = h("input", { type: "number", min: lo, max: hi, step, value: d[k] as number });
    input.addEventListener("change", () => set(k, Number(input.value)));
    return labelled(`${title} (${lo}–${hi})`, input);
  };
  const choice = (k: string, title: string) =>
    labelled(title, h("select", { onChange: (e: Event) => set(k, (e.target as HTMLSelectElement).value) }, ...((r[k] as string[]) ?? []).map((v) => h("option", { value: v, selected: v === d[k] }, v))));
  pane.append(h("div", { class: "pair" }, num("radius", "Zaobljenost (px)", "1"), num("baseFontSize", "Velikost pisave", "1"), num("scale", "Razmerje naslovov", "0.005"), num("headingWeight", "Debelina naslovov", "50"), num("headingTracking", "Razmik črk (em)", "0.005"), choice("density", "Gostota"), choice("shadow", "Senca"), choice("headingCase", "Velike črke")));
  return pane;
}

function pagesPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  if (!state.spec) return pane;
  pages().forEach((p, i) => {
    const nav = p.nav as Obj;
    const seo = p.seo as Obj;
    const system = p.kind !== "home" && p.kind !== "standard";
    const fs = h("fieldset", {}, h("legend", {}, `${nav.label} · ${pageFileOf(p)}`));
    const text = (ptr: string, title: string, val: string, max: number) => {
      const input = h("input", { type: "text", maxlength: max, value: val });
      const save = autosave(ptr, "nastavitve strani");
      input.addEventListener("input", () => save(input.value));
      return labelled(title, input);
    };
    fs.append(text(`/pages/${i}/nav/label`, "Ime v meniju", nav.label as string, 24), text(`/pages/${i}/seo/title`, "Naslov za iskalnike", seo.title as string, 60), text(`/pages/${i}/seo/description`, "Opis za iskalnike", seo.description as string, 160));
    if (!system) {
      fs.append(
        h("label", {}, h("input", { type: "checkbox", checked: nav.show === true, onChange: (e: Event) => void patch([{ op: "replace", path: `/pages/${i}/nav/show`, value: (e.target as HTMLInputElement).checked }], "meni") }), "Prikaži v meniju"),
        h("div", { class: "row" },
          h("button", { class: "btn sm", type: "button", "aria-label": `Premakni stran ${nav.label} gor`, disabled: i <= 1 || p.kind === "home", onClick: () => void patch([{ op: "move", from: `/pages/${i}`, path: `/pages/${i - 1}` }], "vrstni red strani") }, "↑ Gor"),
          h("button", { class: "btn sm", type: "button", "aria-label": `Premakni stran ${nav.label} dol`, disabled: p.kind === "home" || pages()[i + 1]?.kind !== "standard", onClick: () => void patch([{ op: "move", from: `/pages/${i}`, path: `/pages/${i + 1}` }], "vrstni red strani") }, "↓ Dol"),
          p.kind === "standard" && h("button", { class: "btn sm danger", type: "button", onClick: () => { if (confirm(`Izbrišem stran ${nav.label}?`)) { pageIndex = 0; void patch([{ op: "remove", path: `/pages/${i}` }], "izbrisana stran"); } } }, "Izbriši stran"),
        ),
      );
    }
    pane.append(fs);
  });
  const slug = h("input", { type: "text", placeholder: "npr. cenik" });
  const name = h("input", { type: "text", placeholder: "npr. Cenik", maxlength: 24 });
  pane.append(h("h2", {}, "Nova stran"), labelled("Ime v meniju", name), labelled("Naslov datoteke (brez šumnikov)", slug),
    h("p", {}, h("button", { class: "btn", type: "button", onClick: () => void post("/pages", { slug: slug.value.trim(), label: name.value.trim() }, "Stran dodana.") }, "+ Dodaj stran")));
  return pane;
}

const COST_STAGE: Record<string, string> = { classify: "Vrsta dejavnosti", brief: "Razumevanje opisa", design: "Oblikovna smer", altText: "Opisi fotografij", content: "Besedila in postavitev", critique: "Samopregled", edit: "Pomočnik" };
const n0 = (n: number) => n.toLocaleString("sl-SI");

function aiPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  const busy = state.site.status === "editing" || awaitingReply();
  pane.append(h("p", { class: "help" }, "Pomočnik doda ali spremeni vsebino po vašem opisu, npr. »dodaj pogosta vprašanja o parkiranju«. Vsako sporočilo stane nekaj centov. Besedila, vrstni red in podatke lahko brez stroškov urejate tudi neposredno."));
  const chat = h("div", { class: "chat" }, ...state.chat.map((m) => h("div", { class: `msg ${m.role}` }, m.content)));
  if (busy) chat.append(h("div", { class: "msg", role: "status" }, "Urejam stran …"));
  const input = h("textarea", { rows: 3, placeholder: "Npr. dodaj pogosta vprašanja o parkiranju" });
  const total = state.cost.reduce((a, c) => a + c.eur, 0);
  pane.append(
    ...(state.chat.length || busy ? [chat] : []),
    h("label", {}, "Kaj naj spremenim?"),
    input,
    h("div", { class: "row", style: { marginTop: "10px" } },
      h("button", { class: "btn primary", type: "button", disabled: !state.spec || busy, onClick: async () => { if (!input.value.trim()) return; try { await api("/chat", { method: "POST", body: JSON.stringify({ message: input.value }) }); input.value = ""; toast = "Poslano pomočniku."; } catch (e) { toast = (e as Error).message; } await load(); } }, "Pošlji"),
      h("span", { class: "help num", style: { margin: 0 } }, `Danes ${formatEur(state.spendToday)} od ${formatEur(state.cap)}`),
    ),
    h("details", { class: "more" },
      h("summary", {}, `Poraba za to stran: ${formatEur(total)}`),
      h("table", {},
        h("tr", {}, h("th", {}, "Faza"), h("th", { class: "num" }, "Klici"), h("th", { class: "num" }, "Vhod"), h("th", { class: "num" }, "Izhod"), h("th", { class: "num" }, "€")),
        ...state.cost.map((c) => h("tr", {}, h("td", {}, COST_STAGE[c.stage] ?? c.stage), h("td", { class: "num" }, n0(c.calls)), h("td", { class: "num" }, n0(c.input + c.cacheRead + c.cacheWrite)), h("td", { class: "num" }, n0(c.output)), h("td", { class: "num" }, c.eur.toLocaleString("sl-SI", { minimumFractionDigits: 3, maximumFractionDigits: 3 })))),
      ),
      h("p", { class: "help" }, "Vhod vključuje žetone iz predpomnilnika."),
    ),
    h("details", { class: "more" },
      h("summary", {}, "Dnevnik"),
      h("div", { class: "log" }, ...state.events.slice(-80).map((e) => h("div", { class: e.level === "error" ? "err" : "" }, `${new Date(e.created_at).toLocaleTimeString("sl-SI")} ${e.stage}: ${e.message}`))),
    ),
    h("details", { class: "more" },
      h("summary", {}, "Ustvari celotno stran znova"),
      h("p", { class: "help" }, "Vse strani naredimo znova iz vašega opisa. Trenutna vsebina ostane med različicami, zato jo lahko obnovite. Stane približno toliko kot ustvarjanje nove strani."),
      h("button", { class: "btn", type: "button", disabled: state.site.status === "generating", onClick: () => { if (confirm("Ustvarim celotno stran znova? To porabi žetone in zamenja trenutno vsebino z novo različico.")) void post("/generate", { scope: "full" }, "Ustvarjanje se je začelo."); } }, "Ustvari znova"),
    ),
  );
  return pane;
}

function versionsPane(): HTMLElement {
  const SRC: Record<string, string> = { generate: "ustvarjeno", critique: "samopregled", edit: "pomočnik", manual: "urejanje", revert: "obnovljeno" };
  return h("div", { class: "pane" },
    h("p", { class: "help" }, "Vsaka sprememba je nova različica. Tudi obnova je nova različica, zato se nič ne izgubi."),
    h("ol", { class: "versions" }, ...state.versions.map((v) => h("li", {},
      h("b", {}, `v${v.version}`),
      h("div", { class: "what" }, h("span", {}, `${SRC[v.source] ?? v.source} · ${formatDateTime(v.created_at)}`), v.message ? h("span", { class: "muted" }, v.message.slice(0, 120)) : null),
      v.version === state.version
        ? h("span", { class: "pill plain" }, "trenutna")
        : h("button", { class: "btn sm", type: "button", "aria-label": `Obnovi različico ${v.version}`, onClick: () => void api("/revert", { method: "POST", body: JSON.stringify({ version: v.version }) }).then(() => { toast = `Obnovljena različica ${v.version}.`; return load(); }).then(reloadPreview) }, "Obnovi"),
    ))),
  );
}

// ---------- Generation progress: real stage names, real seconds ----------
const STAGES: [string, string][] = [
  ["classify", "Vrsta dejavnosti"],
  ["brief", "Razumevanje opisa"],
  ["design", "Oblikovna smer"],
  ["images", "Fotografije"],
  ["content", "Besedila in postavitev"],
  ["check", "Preverjanje na telefonu in namizju"],
  ["critique", "Samopregled in popravki"],
];

function progress(): HTMLElement {
  // The latest run starts at its last "classify start" event.
  const starts = state.events.map((e) => e.stage === "classify" && e.message === "start");
  const run = state.events.slice(Math.max(0, starts.lastIndexOf(true)));
  const list = h("ol", { class: "stages", "aria-label": "Potek ustvarjanja" });
  for (const [key, name] of STAGES) {
    const begun = run.filter((e) => e.stage === key && e.message === "start").length;
    const done = run.filter((e) => e.stage === key && e.message === "done");
    const ms = done.reduce((a, e) => a + Number((e.data as { ms?: number } | null)?.ms ?? 0), 0);
    const cls = begun > done.length ? "run" : done.length ? "done" : "";
    list.append(
      h("li", { class: cls },
        h("i", { "aria-hidden": "true" }),
        h("span", {}, name, h("span", { class: "sr-only" }, cls === "run" ? " (poteka)" : cls === "done" ? " (končano)" : " (čaka)")),
        h("span", { class: "num" }, ms ? `${(ms / 1000).toLocaleString("sl-SI", { maximumFractionDigits: ms < 10_000 ? 1 : 0 })} s` : ""),
      ),
    );
  }
  return list;
}

function statusBlock(): HTMLElement | null {
  const s = state.site;
  if (s.status === "generating") {
    return h("div", { class: "pane" },
      h("h2", { class: "pane-title" }, state.spec ? "Stran preverjamo" : "Stran se ustvarja"),
      progress(),
      h("p", { class: "help" }, state.spec ? "Predogled je pripravljen. Ko preverjanje najde kaj za popraviti, se pokaže nova različica. Urejate lahko že zdaj." : "Predogled se pokaže, ko so besedila gotova. Stran lahko zaprete, ustvarjanje teče naprej."),
    );
  }
  if (s.status === "failed") {
    const last = [...state.events].reverse().find((e) => e.level === "error");
    return h("div", { class: "pane" },
      h("div", { class: "note bad", role: "alert" },
        h("p", {}, h("strong", {}, "Ustvarjanje ni uspelo."), state.spec ? " Zadnja dobra različica ostaja, urejate jo lahko naprej." : " Poskusite znova; če se ponovi, nam pišite."),
        last ? h("details", {}, h("summary", {}, "Podrobnosti"), h("p", {}, last.message)) : null,
        h("button", { class: "btn sm", type: "button", onClick: () => void post("/generate", { scope: state.site.intake?.scope === "full" ? "full" : "home" }, "Ustvarjanje se je začelo.") }, "Poskusi znova"),
      ),
    );
  }
  return null;
}

// ---------- Preview ----------
let frame: HTMLIFrameElement | null = null;
/** The spec version the preview frame shows, so polling reloads it only when there is something new. */
let frameVersion: number | null = null;

function previewUrl(): string {
  const p = currentPage();
  return `/preview/${siteId}/${p ? pageFileOf(p) : "index.html"}?v=${state.version ?? ""}`;
}

function reloadPreview(): void {
  if (!frame || !state.spec) return;
  const y = frame.contentWindow?.scrollY ?? 0;
  frame.addEventListener("load", () => frame?.contentWindow?.scrollTo(0, y), { once: true });
  frameVersion = state.version;
  frame.src = previewUrl();
}

/** Edit mode helpers run inside the preview document at runtime; the rendered HTML itself is unchanged. */
function attachEditing(): void {
  const doc = frame?.contentDocument;
  if (!doc || !editMode) return;
  const style = doc.createElement("style");
  style.textContent = `main section{cursor:pointer} main section:hover{outline:2px dashed #156b4a;outline-offset:-2px} main section[data-sb-selected]{outline:3px solid #156b4a;outline-offset:-3px} [contenteditable]{outline:2px solid #9a5b00!important;outline-offset:2px;cursor:text}`;
  doc.head.append(style);
  if (selected) doc.getElementById(selected)?.setAttribute("data-sb-selected", "");
  doc.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[contenteditable]")) return;
    const link = t.closest("a");
    if (link) e.preventDefault();
    const sec = t.closest("main section[id]");
    if (sec) select(sec.id, false);
    else if (t.closest("header, footer")) {
      tab = "facts";
      render();
    }
  }, true);
  doc.addEventListener("dblclick", (e) => inlineEdit(e.target as HTMLElement));
}

/** Double-click text in the preview: find the string in the section's props that it shows, edit it in place. */
function inlineEdit(el: HTMLElement): void {
  const sec = el.closest("main section[id]");
  if (!sec) return;
  const si = sections().findIndex((s) => s.id === sec.id);
  if (si < 0) return;
  const target = el.closest("h1,h2,h3,h4,p,li,dt,dd,summary,a,span,figcaption,th,td") as HTMLElement | null;
  if (!target) return;
  const text = (target.textContent ?? "").trim();
  const matches: string[] = [];
  const walk = (v: Json, ptr: string) => {
    if (typeof v === "string") {
      if (v.trim() === text) matches.push(ptr);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${ptr}/${i}`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${ptr}/${esc(k)}`);
  };
  walk(sections()[si]!.props as Json, `/pages/${pageIndex}/sections/${si}/props`);
  if (matches.length !== 1) {
    select(sec.id);
    toast = "To besedilo uredite v obrazcu na levi.";
    render();
    return;
  }
  const ptr = matches[0]!;
  target.setAttribute("contenteditable", "plaintext-only");
  target.focus();
  const finish = (save: boolean) => {
    target.removeAttribute("contenteditable");
    const next = (target.textContent ?? "").replace(/\s+/g, " ").trim();
    if (save && next && next !== text) void patch([{ op: "replace", path: ptr, value: next }], "urejeno besedilo");
    else target.textContent = text;
  };
  target.addEventListener("blur", () => finish(true), { once: true });
  target.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); target.blur(); }
    if (e.key === "Escape") { finish(false); }
  });
}

function select(id: string, scroll = true): void {
  selected = id;
  tab = "content";
  render();
  if (scroll) frame?.contentDocument?.getElementById(id)?.scrollIntoView({ block: "start" });
}

// ---------- Layout ----------
/**
 * The shell (app bar, panel, canvas) is built once. Re-renders replace the bar, the panel and the
 * canvas bar; the preview frame stays in the page, so it keeps its scroll position and doesn't
 * reload on every click (moving an iframe in the DOM reloads it).
 */
let shell: { top: HTMLElement; ed: HTMLElement; panel: HTMLElement; bar: HTMLElement; stage: HTMLElement } | null = null;
let lastWidth = 0;

function topItems(): Child[] {
  const s = state.site;
  const status = siteStatus(s);
  const prev = undoTarget(state.versions, state.version);
  const head: Child[] = [
    h("a", { class: "btn quiet sm", href: "/sites" }, "← Strani"),
    h("h1", { class: "site-name" }, ((state.spec?.business as Obj | undefined)?.name as string | undefined) ?? s.name),
    h("span", { class: `pill ${status.tone}` }, status.label),
    state.version ? h("span", { class: "muted num ver", id: "ed-version" }, `v${state.version}`) : null,
    h("span", { class: "sp" }),
    h("span", { class: "pill plain spend num", title: "Poraba modela danes in dnevna omejitev" }, `${formatEur(state.spendToday)} / ${formatEur(state.cap)} danes`),
  ];
  // Nothing to undo, open or publish before the first version exists.
  if (!state.spec) return head;
  return [
    ...head,
    h("span", { class: "actions" },
      h("button", { class: "btn quiet sm", type: "button", disabled: prev === null, title: prev === null ? "" : `Vrne različico ${prev}`, onClick: () => void undo() }, "Razveljavi"),
      h("button", { class: "btn quiet sm", type: "button", "aria-pressed": String(tab === "versions"), onClick: () => { tab = "versions"; render(); } }, "Različice"),
      moreMenu(),
      h("button", {
        class: "btn sm primary",
        type: "button",
        disabled: state.blockers.length > 0,
        title: state.blockers.length ? "Najprej izpolnite manjkajoče podatke" : "",
        onClick: async () => { try { const r = await api<{ url: string }>("/publish", { method: "POST", body: "{}" }); toast = `Objavljeno: ${r.url}`; } catch (e) { toast = (e as Error).message; } await load(); },
      }, "Objavi"),
    ),
  ];
}

/** Secondary actions in one menu, so the app bar fits a phone in two rows. Stays open across re-renders. */
let menuOpen = false;
function moreMenu(): HTMLElement {
  const s = state.site;
  const menu = h("details", { class: "menu", open: menuOpen },
    h("summary", { class: "btn quiet sm" }, "Več"),
    h("div", { class: "list" },
      h("a", { href: `/sites/${siteId}/messages` }, state.messages ? `Sporočila (${state.messages})` : "Sporočila"),
      h("a", { href: `/api/sites/${siteId}/export` }, "Izvozi kot datoteke (.zip)"),
      h("a", { href: previewUrl(), target: "_blank" }, "Odpri predogled v zavihku"),
      s.published_version ? h("a", { href: `/s/${s.slug}/`, target: "_blank" }, "Odpri objavljeno stran") : null,
    ),
  );
  menu.addEventListener("toggle", () => (menuOpen = menu.open));
  return menu;
}

// A click outside the menu, or Escape, closes it.
document.addEventListener("click", (e) => {
  const open = document.querySelector<HTMLDetailsElement>("details.menu[open]");
  if (open && !open.contains(e.target as Node)) open.open = false;
});
document.addEventListener("keydown", (e) => {
  const open = document.querySelector<HTMLDetailsElement>("details.menu[open]");
  if (e.key === "Escape" && open) {
    open.open = false;
    open.querySelector("summary")?.focus();
  }
});

function barItems(): Child[] {
  const p = currentPage();
  if (!state.spec) return [];
  return [
    h("div", { class: "seg", role: "group", "aria-label": "Velikost predogleda" },
      h("button", { type: "button", "aria-pressed": String(device === "mobile"), onClick: () => { device = "mobile"; render(); } }, "Telefon"),
      h("button", { type: "button", "aria-pressed": String(device === "desktop"), onClick: () => { device = "desktop"; render(); } }, "Namizje"),
    ),
    h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: editMode, onChange: (e: Event) => { editMode = (e.target as HTMLInputElement).checked; frame = null; render(); } }), "Urejanje s klikom"),
    h("span", { class: "sp" }),
    h("span", { class: "muted where" }, `${p ? (p.nav as Obj).label : ""} · ${device === "mobile" ? "360" : "1280"} px`),
  ];
}

function render(): void {
  if (!shell) {
    // Labelled, so they stay distinct from the header and main of the site inside the preview frame.
    const top = h("header", { class: "top", "aria-label": "Urejevalnik" });
    const panel = h("section", { class: "panel", "aria-label": "Urejanje" });
    const bar = h("div", { class: "bar" });
    const stage = h("div", { class: "stage" });
    const ed = h("main", { class: "ed", "aria-label": "Urejanje strani" }, panel, h("section", { class: "canvas", "aria-label": "Predogled" }, bar, stage));
    root.replaceChildren(h("div", { class: "shell" }, top, ed));
    shell = { top, ed, panel, bar, stage };
    lastWidth = window.innerWidth;
    // Only width changes resize the frame: phone keyboards change the height while typing.
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      sizeFrame();
    });
  }
  document.title = `${((state.spec?.business as Obj | undefined)?.name as string | undefined) ?? state.site.name} · urejanje`;
  shell.top.replaceChildren(...topItems().filter((c): c is Node => c instanceof Node));

  // Versions open from the app bar ("Različice"), so the five tabs fit the panel.
  const tabs: [typeof tab, string][] = [["content", "Vsebina"], ["facts", "Podatki"], ["design", "Oblika"], ["pages", "Strani"], ["ai", "Pomočnik"]];
  shell.panel.replaceChildren(
    ...[
      statusBlock(),
      state.spec ? h("div", { class: "tabs", role: "tablist", "aria-label": "Urejanje" }, ...tabs.map(([k, l]) => h("button", { role: "tab", type: "button", "aria-selected": String(tab === k), onClick: () => { tab = k; render(); } }, l))) : null,
      state.blockers.length && state.spec
        ? h("div", { class: "pane tight" }, h("div", { class: "note warn" }, h("p", {}, blockerSummary(state.placeholders.length, state.blockers.length - state.placeholders.length)), h("details", {}, h("summary", {}, "Seznam"), h("ul", {}, ...state.blockers.slice(0, 30).map((b) => h("li", {}, b))))))
        : null,
      !state.spec && state.site.status !== "generating" && state.site.status !== "failed" ? h("div", { class: "pane" }, h("p", { class: "muted" }, "Stran še nima vsebine.")) : null,
      state.spec ? { content: contentPane, facts: factsPane, design: designPane, pages: pagesPane, ai: aiPane, versions: versionsPane }[tab]() : null,
    ].filter((c): c is HTMLElement => c !== null),
  );
  shell.bar.replaceChildren(...barItems().filter((c): c is Node => c instanceof Node));
  shell.bar.hidden = !state.spec;
  shell.ed.classList.toggle("nospec", !state.spec);
  renderStage();
  linkLabels(shell.panel);
  linkLabels(shell.bar);
  // Keep the selection highlight in sync with the frame that survives re-renders.
  const doc = frame?.contentDocument;
  doc?.querySelectorAll("[data-sb-selected]").forEach((n) => n.removeAttribute("data-sb-selected"));
  if (selected && editMode) doc?.getElementById(selected)?.setAttribute("data-sb-selected", "");
  showToast();
}

function renderStage(): void {
  const stage = shell!.stage;
  if (!state.spec) {
    frame = null;
    stage.replaceChildren(h("div", { class: "frame skeleton" }, state.site.status === "generating" ? "Predogled se pokaže, ko so besedila gotova." : "Predogleda še ni."));
    sizeFrame();
    return;
  }
  const width = String(device === "mobile" ? 360 : 1280);
  if (!frame || frame.dataset.width !== width || !frame.isConnected) {
    const f = h("iframe", { title: "Predogled strani", "data-width": width });
    f.addEventListener("load", attachEditing);
    frame = f;
    frameVersion = state.version;
    f.src = previewUrl();
    stage.replaceChildren(h("div", { class: "frame" }, f));
  }
  sizeFrame();
}

/** Fits the preview into the canvas: 360 px phones at full size where they fit, 1280 px desktops scaled down. */
function sizeFrame(): void {
  const stage = shell?.stage;
  const wrap = stage?.querySelector<HTMLElement>(".frame");
  if (!stage || !wrap) return;
  const narrow = window.innerWidth <= 900;
  const width = device === "mobile" ? 360 : 1280;
  const pad = narrow ? 24 : 40;
  const scale = Math.min(1, Math.max(0.2, (stage.clientWidth - pad - 2) / width));
  const avail = narrow ? Math.round(window.innerHeight * 0.7) : stage.clientHeight - pad - 2;
  const height = Math.max(360, device === "mobile" ? Math.min(avail, 800) : avail);
  wrap.style.width = `${Math.round(width * scale) + 2}px`;
  wrap.style.height = `${height + 2}px`;
  if (frame) {
    Object.assign(frame.style, { display: "block", border: "0", width: `${width}px`, height: `${Math.round(height / scale)}px`, transform: `scale(${scale})`, transformOrigin: "0 0" });
  }
}

/** Undo = revert to undoTarget (read at click time, not render time). */
async function undo(): Promise<void> {
  const target = undoTarget(state.versions, state.version);
  if (target === null) return;
  try {
    await api("/revert", { method: "POST", body: JSON.stringify({ version: target }) });
    toast = "Razveljavljeno.";
  } catch (e) {
    toast = (e as Error).message;
  }
  await load();
  reloadPreview();
}

let labelSeq = 0;
/** Associates each form label with the control that follows it, so every field has an accessible name. */
function linkLabels(scope: HTMLElement): void {
  for (const label of scope.querySelectorAll("label")) {
    if (label.htmlFor || label.querySelector("input, select, textarea")) continue;
    let next = label.nextElementSibling;
    while (next && !next.matches("input, select, textarea") && !next.querySelector("input, select, textarea")) next = next.nextElementSibling;
    const control = next?.matches("input, select, textarea") ? next : next?.querySelector("input, select, textarea");
    if (!control) continue;
    if (!control.id) control.id = `f${++labelSeq}`;
    label.htmlFor = control.id;
  }
}

function items(n: number): string {
  const form = new Intl.PluralRules("sl-SI").select(n);
  return `${n} ${({ one: "postavko", two: "postavki", few: "postavke" } as Record<string, string>)[form] ?? "postavk"}`;
}

/** Banner text: missing facts (placeholders) and other things to fix (starter text, validation). */
function blockerSummary(missing: number, other: number): string {
  const parts: string[] = [];
  if (missing) parts.push(`${missingPhrase(missing)} (označeni rumeno v predogledu)`);
  if (other) parts.push(`uredite še ${items(other)} (začetno besedilo ali napake)`);
  return `Pred objavo: ${parts.join("; ")}.`;
}

/** "manjka 1 podatek", "manjkata 2 podatka", "manjkajo 3 podatki", "manjka 5 podatkov" (Slovene plural rules). */
function missingPhrase(n: number): string {
  const form = new Intl.PluralRules("sl-SI").select(n);
  const words: Record<string, string> = { one: "manjka {n} podatek", two: "manjkata {n} podatka", few: "manjkajo {n} podatki", other: "manjka {n} podatkov" };
  return (words[form] ?? words.other!).replace("{n}", String(n));
}

function showToast(): void {
  if (!toast) return;
  document.querySelector(".toast")?.remove();
  document.body.append(h("div", { class: "toast", role: "status" }, toast));
  const t = toast;
  window.setTimeout(() => {
    if (toast === t) {
      toast = "";
      document.querySelector(".toast")?.remove();
    }
  }, 4000);
}

void load();
