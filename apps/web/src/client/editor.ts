/**
 * Dashboard editor. Direct edits (text, blocks, facts, design, pages) are JSON Patches sent to
 * /api/sites/:id/patch and applied in code: no model call, no tokens. Only the AI tab talks to
 * the model.
 */

import { EDITOR_STARTER_TEXT } from "@sb/spec/starter";
import { COLOR_LABEL, DIRECTION_LABEL, ENUM_LABEL, SECTION_LABEL, TOKEN_LABEL, VARIANT_LABEL, blockerMessage, describePath, fieldLabel, issueText, type BlockerLike } from "@sb/spec/labels";
import { formatDateTime, formatEur, siteStatus } from "../ui/labels.ts";
import { groupVersions, undoTarget, type ListedVersion } from "./versions.ts";

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

interface Pulse {
  status: string;
  version: number | null;
  chat: number;
  lastEvent: number;
}

interface State {
  pulse: Pulse;
  site: {
    id: string; name: string; slug: string; status: string; published_version: number | null; published_at: string | null; intake?: { scope?: string };
    brief?: { name?: string; town?: string | null; summary?: string; offerings?: { name: string }[] } | null;
  };
  version: number | null;
  spec: Obj | null;
  events: { id: string; stage: string; level: string; message: string; created_at: string; data: unknown }[];
  chat: { id: string; role: string; content: string; result: unknown; created_at: string }[];
  cost: { stage: string; calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; eur: number; ms: number }[];
  versions: { version: number; source: string; message: string | null; created_at: string }[];
  placeholders: { path: string; kind: string }[];
  /** What stands between the site and publishing; worded in Slovene here (labels.ts). */
  checklist: BlockerLike[];
  blockers: string[];
  messages: number;
  /** Model spend today and the cap: the admin only (null for owners). */
  spendToday: number | null;
  cap: number | null;
  /** What this viewer may do here and has left (apps/web/src/limits.ts AccessInfo); absent before accounts. */
  access?: {
    viewer: "anonymous" | "free" | "paid" | "admin";
    can: { edit: boolean; chat: boolean; regenerate: boolean; publish: boolean; export: boolean; fullSite: boolean };
    allowance: { text: string };
    expiresAt: string | null;
    signIn: string | null;
    /** The free-preview badge beside the frame, or null. */
    badge?: string | null;
  };
  /** Server time of this response (ISO). */
  now: string;
}

const root = document.getElementById("app")!;
const siteId = root.dataset.siteId!;
let state: State;
let catalogue: Catalogue | null = null;
/** Whether the viewer may do this here; true when the server sends no access info. */
const can = (k: "edit" | "chat" | "regenerate" | "publish" | "export"): boolean => state.access?.can[k] ?? true;
/** What the panel shows: "content" is the page (or the selected section); the rest open from shortcuts, taps and the ⋯ menu. */
type Tab = "content" | "facts" | "photos" | "design" | "pages" | "versions" | "chat" | "diag" | "add" | "image";
let tab: Tab = "content";
let pageIndex = 0;
let selected: string | null = null;
let device: "mobile" | "desktop" = "mobile";
/** Tapping the preview always edits; "Predogled v novem zavihku" (⋯ menu) shows the clean page. */
const editMode = true;
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
  const body = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string; issues?: { path: string; code: string; message: string }[]; checklist?: BlockerLike[] };
  if (!r.ok) {
    const spec = currentSpec();
    const detail =
      body.issues?.slice(0, 3).map((i) => issueText(spec, i)).join("; ") ??
      body.checklist?.slice(0, 3).map((b) => `${describePath(spec, b.path)}: ${blockerMessage(b)}`).join(" ") ??
      body.message ??
      body.error ??
      r.statusText;
    throw new Error(detail);
  }
  return body;
}

/** Server clock minus this browser's, from the last state fetch; running-stage seconds use server time. */
let clockSkew = 0;

async function fetchState(): Promise<State> {
  const s = await api<State>("");
  const skew = Date.parse(s.now) - Date.now();
  clockSkew = Number.isFinite(skew) ? skew : 0;
  return s;
}

/** Running-stage seconds count up once a second without re-rendering anything else. */
window.setInterval(() => {
  for (const el of document.querySelectorAll<HTMLElement>("[data-since]")) el.textContent = elapsed(el.dataset.since!);
}, 1000);

/** The spec on screen (null before the first load), for wording errors. */
const currentSpec = (): unknown => (typeof state === "undefined" ? null : state.spec);

async function load(rerender = true): Promise<void> {
  const loaded = typeof state !== "undefined";
  try {
    state = await fetchState();
    if (state.spec && !catalogue) catalogue = await api<Catalogue>("/catalogue");
  } catch (e) {
    // Nothing on screen yet: the caller shows the failure. Otherwise keep the last state and say so.
    if (!loaded) throw e;
    toast ||= `Povezave ni. ${(e as Error).message}`;
  }
  if (rerender) render();
  else showToast();
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
const pollSignature = (): string => pulseKey(state.pulse);
const pulseKey = (p: Pulse): string => [p.status, p.version, p.chat, p.lastEvent].join("|");

function schedulePoll(): void {
  window.clearTimeout(pollTimer);
  const active = state.site.status === "generating" || state.site.status === "editing" || awaitingReply();
  if (active) pollTimer = window.setTimeout(() => void poll(), 2000);
}

async function poll(): Promise<void> {
  const before = pollSignature();
  try {
    // The pulse is one small query; the full state (spec, versions, events, chat, checklist) only when it moved.
    const pulse = await api<Pulse>("/pulse");
    if (pulseKey(pulse) === before) return schedulePoll();
    state = await fetchState();
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

/**
 * Saves wait their turn: each is sent after the previous one has landed and the version is fresh.
 * Form edits waiting out their autosave delay go first, so a move, an added section, an undo or a
 * publish never overtakes text the owner just typed.
 */
let saveChain: Promise<unknown> = Promise.resolve();

function queued<T>(run: () => Promise<T>): Promise<T> {
  flushPending();
  const p = saveChain.then(run);
  saveChain = p.catch(() => undefined);
  return p;
}

/** Form saves not sent yet, keyed by form. */
const pendingSaves = new Map<number, () => void>();
let pendingSeq = 0;

function flushPending(): void {
  const all = [...pendingSaves.values()];
  pendingSaves.clear();
  for (const go of all) go();
}

/** Waits `delay` ms after the last change before saving, unless another save starts first. */
function debounced(save: (v: Json | undefined) => void, delay = 700): { push(v: Json | undefined): void; cancel(): void } {
  const key = ++pendingSeq;
  let timer: number | undefined;
  const cancel = () => {
    window.clearTimeout(timer);
    pendingSaves.delete(key);
  };
  return {
    push(v) {
      cancel();
      const go = () => {
        cancel();
        save(v);
      };
      pendingSaves.set(key, go);
      timer = window.setTimeout(go, delay);
    },
    cancel,
  };
}

/**
 * Where a form saves, found again when the save is sent: sections and pages move, so an index taken
 * when the form was drawn can point at another section by then. The guard ("test" op) makes the
 * server refuse rather than write into the wrong place if the spec still changed in between.
 */
type Where = () => { pointer: string; guard?: Op } | null;
const at = (pointer: string): Where => () => ({ pointer });

function inSection(id: string, rest: string): Where {
  return () => {
    for (const [pi, p] of pages().entries()) {
      const si = ((p.sections ?? []) as Obj[]).findIndex((s) => s.id === id);
      if (si >= 0) return { pointer: `/pages/${pi}/sections/${si}${rest}`, guard: { op: "test", path: `/pages/${pi}/sections/${si}/id`, value: id } };
    }
    return null;
  };
}

function inPage(id: string, rest: string): Where {
  return () => {
    const pi = pages().findIndex((p) => p.id === id);
    return pi < 0 ? null : { pointer: `/pages/${pi}${rest}`, guard: { op: "test", path: `/pages/${pi}/id`, value: id } };
  };
}

/** Guards for operations addressed by index: the server refuses them if the section or page moved. */
const isSection = (pi: number, si: number, id: string): Op => ({ op: "test", path: `/pages/${pi}/sections/${si}/id`, value: id });
const isPage = (pi: number, id: string): Op => ({ op: "test", path: `/pages/${pi}/id`, value: id });

/** Operations that put `v` at `where` (or remove it), or null when that place is gone. */
function opsAt(where: Where, v: Json | undefined): Op[] | null {
  const w = where();
  if (!w) return null;
  return [...(w.guard ? [w.guard] : []), v === undefined ? { op: "remove", path: w.pointer } : { op: "replace", path: w.pointer, value: v }];
}

/** Sends direct-edit operations (no model call). A function is evaluated when the save is sent. */
function patch(ops: Op[] | (() => Op[] | null), message: string, rerender = true): Promise<boolean> {
  return queued(() => sendPatch(ops, message, rerender));
}

async function sendPatch(opsOrFn: Op[] | (() => Op[] | null), message: string, rerender: boolean): Promise<boolean> {
  if (!state.spec) return false;
  const ops = typeof opsOrFn === "function" ? opsOrFn() : opsOrFn;
  if (!ops) {
    toast = "Tega dela strani ni več, sprememba ni shranjena.";
    await load();
    return false;
  }
  try {
    const r = await api<{ version: number; adjustments: string[] }>("/patch", { method: "POST", body: JSON.stringify({ baseVersion: state.version, ops, message }) });
    toast = r.adjustments.length ? `Shranjeno. ${r.adjustments.join("; ")}` : "Shranjeno.";
    // Form autosaves keep the form (and its focus) in place; everything else re-renders.
    await load(rerender || r.adjustments.length > 0);
    reloadPreview();
    return true;
  } catch (e) {
    toast = rerender ? `Ni shranjeno. ${(e as Error).message}` : `Še ni shranjeno: ${(e as Error).message}`;
    await load(rerender);
    return false;
  }
}

function post(path: string, body: unknown, ok: string): Promise<void> {
  return queued(async () => {
    try {
      await api(path, { method: "POST", body: JSON.stringify({ baseVersion: state.version, ...(body as object) }) });
      toast = ok;
    } catch (e) {
      toast = (e as Error).message;
    }
    await load();
    reloadPreview();
  });
}

// ---------- Spec helpers ----------
const pages = () => (state.spec?.pages ?? []) as Obj[];
const currentPage = () => pages()[pageIndex] as Obj | undefined;
const sections = () => ((currentPage()?.sections ?? []) as Obj[]);
const esc = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");
const pageFileOf = (p: Obj) => `${(p.slug as string) || "index"}.html`;
const sectionInfo = (type: string) => catalogue?.sections.find((s) => s.type === type);
const label = (t: string) => SECTION_LABEL[t] ?? t;

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
function field(schema: Schema, rootSchema: Schema, value: Json | undefined, key: string, sink: Sink, optional = false, ptr = "", parent?: string): HTMLElement {
  const el = fieldBody(schema, rootSchema, value, key, sink, optional, ptr, parent);
  if (ptr && !el.dataset.path) el.dataset.path = ptr;
  return el;
}

function fieldBody(schema: Schema, rootSchema: Schema, value: Json | undefined, key: string, sink: Sink, optional: boolean, ptr: string, parent: string | undefined): HTMLElement {
  const s = resolve(schema, rootSchema);
  const title = fieldLabel(key, parent);
  const box = h("div", { class: "field" });

  if (Array.isArray(s.anyOf)) {
    const opts = (s.anyOf as Schema[]).map((o) => resolve(o, rootSchema));
    const phIndex = opts.findIndex(isPlaceholderSchema);
    const nonPh = opts.filter((_, i) => i !== phIndex);
    const isPh = value !== null && typeof value === "object" && !Array.isArray(value) && "$placeholder" in value;
    if (phIndex >= 0 && nonPh.length === 1) {
      const inner0 = nonPh[0]!;
      // A text fact: emptying the field marks it missing, a missing one is just an empty field to type in.
      if (inner0.type === "string" && !Array.isArray(inner0.enum)) {
        const missing = { $placeholder: PH_KIND[key] ?? "text" } as Json;
        const phSink: Sink = { edit: (v) => sink.edit(v === undefined ? missing : v), structure: sink.structure };
        const f = field(inner0, rootSchema, isPh ? "" : value, key, phSink, true, ptr, parent);
        if (isPh) {
          f.classList.add("missing");
          f.append(h("p", { class: "note warn" }, "Manjka. Dokler ga ne vpišete, strani ni mogoče objaviti."));
        }
        return f;
      }
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
                  const f = field(nonPh[0]!, rootSchema, defaultFor(nonPh[0]!, rootSchema, key, false), key, sink, false, ptr, parent);
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
      const inner = field(nonPh[0]!, rootSchema, value, key, sink, false, ptr, parent);
      inner.append(h("button", { class: "linkish", type: "button", onClick: () => sink.structure({ $placeholder: PH_KIND[key] ?? "text" }) }, "Tega podatka nimam"));
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
    box.append(h("label", {}, title), sel, field(opts[idx]!, rootSchema, value, key, sink, false, ptr, parent));
    return box;
  }

  if (Array.isArray(s.enum)) {
    box.append(
      h("label", {}, title),
      h(
        "select",
        { onChange: (e: Event) => sink.edit((e.target as HTMLSelectElement).value || undefined) },
        ...(optional ? [h("option", { value: "" }, "Brez")] : []),
        ...(s.enum as string[]).map((v) => h("option", { value: v, selected: v === value }, ENUM_LABEL[v] ?? v)),
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
      // Optional fields not in use wait under "Več možnosti", so the form shows what the site has.
      const more = h("details", { class: "more-fields" }, h("summary", {}, "Več možnosti"));
      for (const [k, sub] of Object.entries(props)) {
        if (k === "$placeholder") continue;
        if (!req.has(k) && !(k in obj)) {
          more.append(h("button", { class: "btn sm", type: "button", onClick: () => childSink(k).structure(defaultFor(sub, rootSchema, k)) }, `+ ${fieldLabel(k, key)}`), " ");
          continue;
        }
        const child = field(sub, rootSchema, obj[k], k, childSink(k), !req.has(k), `${ptr}/${esc(k)}`, key);
        if (!req.has(k)) child.append(h("button", { class: "linkish", type: "button", onClick: () => childSink(k).structure(undefined) }, "Odstrani"));
        fs.append(child);
      }
      if (more.childElementCount > 1) fs.append(more);
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
        fs.append(tools, field(itemSchema, rootSchema, item, key === "paragraphs" ? "text" : key, itemSink, false, `${ptr}/${i}`, parent));
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
      // The counter shows only near the limit.
      const countText = () => (max && input.value.length >= max * 0.8 ? `${input.value.length}/${max}` : "");
      const count = h("div", { class: "count" }, countText());
      const hint = h("div", { class: "err", role: "status" });
      const re = pattern ? new RegExp(pattern) : null;
      const minLen = Number(s.minLength ?? 0);
      input.addEventListener("input", () => {
        count.textContent = countText();
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
function formAt(where: Where, schema: Schema, value: Json, title: string, message: string): HTMLElement {
  const live = structuredClone(value);
  const send = (v: Json | undefined, rerender: boolean) => patch(() => opsAt(where, v), message, rerender);
  const later = debounced((v) => void send(v, false));
  return field(schema, schema, live, title, {
    edit: (v) => later.push(v),
    structure: (v) => {
      later.cancel();
      void send(v, true);
    },
  }, false, where()?.pointer ?? "");
}

/** Debounced save of a single scalar (page settings). */
function autosave(where: Where, message: string, delay = 700): (v: Json | undefined) => void {
  const later = debounced((v) => void patch(() => opsAt(where, v), message, false), delay);
  return (v) => later.push(v);
}

// ---------- Panes ----------
const HEADER_VARIANT: Record<string, string> = { bar: "Vrstica", "split-cta": "Z gumbom na desni", stacked: "Ime na sredini" };
const FOOTER_VARIANT: Record<string, string> = { columns: "Stolpci", compact: "Strnjena" };
const TONE: Record<string, string> = { default: "Osnovno", alt: "Izmenično", inverse: "Obratno (temno)", band: "Barvni pas" };

/** A select with its label; `linkLabels` ties them together. */
const labelled = (title: string, control: HTMLElement) => h("div", {}, h("label", {}, title), control);
/** Marks a form block as the place for a spec path, so the pre-publish checklist can open it. */
const withPath = (path: string, el: HTMLElement) => ((el.dataset.path = path), el);

/** Nothing selected: what to do next, four shortcuts and the sections of this page. */
const SHORTCUTS: [Tab, string, string][] = [
  ["facts", "Podatki", "Ime, telefon, naslov, delovni čas"],
  ["photos", "Fotografije", "Dodajte svoje, zamenjajte ustvarjene"],
  ["design", "Oblika", "Slog, barve in pisave"],
  ["pages", "Strani", "Meni, nove strani, iskalniki"],
];

function contentPane(): HTMLElement {
  if (!state.spec) return h("div", { class: "pane" });
  const si = sections().findIndex((s) => s.id === selected);
  return si >= 0 ? sectionPane(si) : homePane();
}

function homePane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  pane.append(
    h("p", { class: "hint" }, "Tapnite karkoli na strani in to uredite. Ali pa v polje pod predogledom napišite, kaj naj spremenimo."),
    h("div", { class: "shortcuts" }, ...SHORTCUTS.map(([k, title, desc]) =>
      h("button", { type: "button", class: "shortcut", onClick: () => { tab = k; selected = null; setSheet("full"); render(); } }, h("strong", {}, title), h("span", {}, desc)))),
  );
  if (pages().length > 1) {
    pane.append(
      h("label", {}, "Stran"),
      h("select", { onChange: (e: Event) => { pageIndex = Number((e.target as HTMLSelectElement).value); selected = null; render(); reloadPreview(); } },
        ...pages().map((p, i) => h("option", { value: String(i), selected: i === pageIndex }, String((p.nav as Obj).label)))),
    );
  }
  const secs = sections();
  pane.append(
    h("h2", {}, "Na tej strani"),
    h("ul", { class: "outline" }, ...secs.map((s) =>
      h("li", {
        role: "button",
        tabindex: "0",
        onClick: () => select(String(s.id)),
        onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(String(s.id)); } },
      }, h("span", { class: "t" }, h("strong", {}, label(String(s.type))), h("span", { class: "muted" }, sectionTitle(s)))))),
  );
  if (canAddSections()) pane.append(h("button", { class: "btn", type: "button", onClick: () => openAdd(secs.length) }, "+ Dodaj razdelek"));
  return pane;
}

function sectionPane(si: number): HTMLElement {
  const pi = pageIndex;
  const s = sections()[si]!;
  const info = sectionInfo(String(s.type));
  const base = `/pages/${pi}/sections/${si}`;
  const pane = h("div", { class: "pane" },
    h("div", { class: "pane-head", id: "selected-head" },
      h("button", { class: "btn quiet sm", type: "button", onClick: () => { selected = null; render(); } }, "← Vsi razdelki"),
      h("h2", { class: "pane-title" }, label(String(s.type))),
    ),
  );
  if (!info || !catalogue) {
    pane.append(h("p", { class: "muted" }, "Ta razdelek ustvari sistem (pravna besedila, 404). Podatke uredite pod »Podatki«."));
    return pane;
  }
  pane.append(
    h("p", { class: "help" }, "Besedilo popravite kar na strani: tapnite ga. Premik, podvajanje in brisanje so na vrhu razdelka v predogledu."),
    variantPicker(s, pi, si, info.variants),
    labelled("Ozadje", h("select", { onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; void patch([isSection(pi, si, String(s.id)), s.tone === undefined ? { op: "add", path: `${base}/tone`, value: v } : { op: "replace", path: `${base}/tone`, value: v }], "ozadje"); } },
      ...["default", "alt", "inverse", "band"].map((t) => h("option", { value: t, selected: (s.tone ?? "default") === t }, TONE[t]!)))),
    formAt(inSection(String(s.id), "/props"), info.props, s.props as Json, "props", `urejen razdelek ${s.type}`),
  );
  return pane;
}

const canAddSections = (): boolean => !!catalogue && ["home", "standard"].includes(String(currentPage()?.kind));

// ---------- Adding a section: where it goes is chosen first (the "+" under a section, or the end) ----------
let addAt = 0;

function openAdd(at: number): void {
  addAt = at;
  tab = "add";
  setSheet("full");
  render();
}

function addPane(): HTMLElement {
  const secs = sections();
  const after = secs[addAt - 1];
  const pane = h("div", { class: "pane" },
    paneHead("Dodaj razdelek"),
    h("p", { class: "help" }, after && addAt < secs.length ? `Nov razdelek pride pod »${label(String(after.type))}«.` : "Nov razdelek pride na konec strani."),
  );
  const addable = (catalogue?.sections ?? []).filter((c) => c.canAdd);
  pane.append(h("div", { class: "add-grid" }, ...addable.map((c) =>
    h("button", {
      type: "button",
      onClick: async () => {
        const at = addAt;
        await post("/sections", { pageIndex, index: at, type: c.type }, "Razdelek dodan.");
        const added = sections()[at];
        if (added?.type === c.type) select(String(added.id));
      },
    }, label(c.type)))));
  return pane;
}

// ---------- A tapped picture: replace it, describe it ----------
let imageId: string | null = null;

function imagePane(): HTMLElement {
  const images = ((state.spec?.assets as Obj | undefined)?.images ?? []) as Obj[];
  const i = images.findIndex((im) => im.id === imageId);
  const im = images[i];
  if (!im) return photosPane();
  const id = String(im.id);
  const generated = im.origin === "generated";
  const alt = h("textarea", { rows: 2, maxlength: 180, placeholder: "Npr. Pek vzame hlebce iz krušne peči" }) as HTMLTextAreaElement;
  alt.value = String(im.alt ?? "");
  alt.addEventListener("change", () => void patch([{ op: "replace", path: `/assets/images/${i}/alt`, value: alt.value.trim() }], "opis slike"));
  return h("div", { class: "pane" },
    paneHead("Slika"),
    h("img", { class: "image-big", src: `/preview/${siteId}/media/${id}-720.webp`, alt: "", width: 360, height: 240 }),
    generated ? h("p", { class: "note warn" }, "To sliko smo ustvarili z UI, ker je bilo vaših fotografij premalo. Ko jo zamenjate s svojo, oznaka izgine.") : null,
    h("div", { class: "row" }, fileButton(generated ? "Zamenjaj s svojo fotografijo" : "Zamenjaj", false, (files) => void uploadPhotos(files, id), true)),
    withPath(`/assets/images/${i}/alt`, labelled("Opis za obiskovalce, ki slik ne vidijo", alt)),
    h("button", { class: "linkish", type: "button", onClick: () => { tab = "photos"; render(); } }, "Vse fotografije"),
  );
}

/** Width the layout thumbnails are drawn at: the narrowest full desktop layout (sites switch at 768 and 1024 px), where variants differ most. */
const THUMB_WIDTH = 1024;

/**
 * "Druga postavitev": the selected section in each of its layouts, with its own content, rendered by
 * the preview route (same components as the published site; no model call). A tap switches to it.
 */
function variantPicker(s: Obj, pi: number, si: number, variants: string[]): HTMLElement {
  const type = String(s.type);
  const page = pages()[pi]!;
  const box = h("fieldset", { class: "variants" }, h("legend", {}, "Postavitev"));
  for (const v of variants) {
    const name = VARIANT_LABEL[type]?.[v] ?? v;
    const chosen = v === s.variant;
    const frame = h("iframe", {
      title: `Postavitev »${name}«`,
      tabindex: "-1",
      "aria-hidden": "true",
      loading: "lazy",
      src: `/preview/${siteId}/${pageFileOf(page)}?v=${state.version ?? ""}&section=${encodeURIComponent(String(s.id))}&variant=${encodeURIComponent(v)}`,
    });
    // Only the section: the site's header, footer, call bar and cookie notice are hidden in the thumbnail.
    frame.addEventListener("load", () => {
      const d = frame.contentDocument;
      if (!d) return;
      const style = d.createElement("style");
      style.textContent = ".site-header,footer,.action-bar,.consent,.skip-link{display:none!important}";
      d.head.append(style);
    });
    const thumb = h("span", { class: "thumb" }, frame);
    new ResizeObserver(() => (frame.style.transform = `scale(${thumb.clientWidth / THUMB_WIDTH})`)).observe(thumb);
    box.append(
      h("button", {
        type: "button",
        class: "variant",
        "aria-pressed": String(chosen),
        onClick: () => {
          if (!chosen) void patch([isSection(pi, si, String(s.id)), { op: "replace", path: `/pages/${pi}/sections/${si}/variant`, value: v }], "postavitev");
        },
      }, thumb, h("span", { class: "name" }, name)),
    );
  }
  return box;
}

function factsPane(): HTMLElement {
  const pane = h("div", { class: "pane" }, paneHead("Podatki"));
  if (!state.spec || !catalogue) return pane;
  pane.append(h("p", { class: "help" }, "Prikažejo se v glavi, nogi, kontaktu in pri delovnem času."));
  pane.append(formAt(at("/business"), catalogue.business, state.spec.business as Json, "Podatki o podjetju", "podatki"));
  const chrome = state.spec.chrome as Obj;
  const header = chrome.header as Obj;
  pane.append(
    h("h2", {}, "Glava in noga"),
    h("div", { class: "pair" },
      labelled("Glava", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/header/variant", value: (e.target as HTMLSelectElement).value }], "glava") }, ...["bar", "split-cta", "stacked"].map((v) => h("option", { value: v, selected: v === header.variant }, HEADER_VARIANT[v]!)))),
      labelled("Gumb v glavi", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/header/cta", value: (e.target as HTMLSelectElement).value }], "gumb v glavi") }, ...["call", "booking", "directions", "none"].map((v) => h("option", { value: v, selected: v === header.cta }, { call: "Klic", booking: "Rezervacija", directions: "Navodila za pot", none: "Brez" }[v]!)))),
      labelled("Ozadje glave", h("select", { onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; void patch([{ op: header.tone === undefined ? "add" : "replace", path: "/chrome/header/tone", value: v }], "ozadje glave"); } }, ...["default", "alt", "inverse", "band"].map((v) => h("option", { value: v, selected: v === (header.tone ?? "default") }, { default: "Kot stran", alt: "Izmenično", inverse: "Temno", band: "Barvno" }[v]!)))),
      labelled("Noga", h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/footer/variant", value: (e.target as HTMLSelectElement).value }], "noga") }, ...["columns", "compact"].map((v) => h("option", { value: v, selected: v === (chrome.footer as Obj).variant }, FOOTER_VARIANT[v]!)))),
    ),
    h("label", {}, h("input", { type: "checkbox", checked: chrome.mobileActionBar === true, onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/mobileActionBar", value: (e.target as HTMLInputElement).checked }], "vrstica za klic") }), "Spodnja vrstica za klic in pot na telefonu"),
  );
  return pane;
}

// ---------- Photos: add the owner's own, replace generated ones, describe each ----------
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/** A button that opens the file picker; the files go straight to `onFiles`. */
function fileButton(text: string, multiple: boolean, onFiles: (files: File[]) => void, primary = false): HTMLElement {
  const input = h("input", { type: "file", class: "sr-only", accept: PHOTO_ACCEPT, ...(multiple ? { multiple: true } : {}) }) as HTMLInputElement;
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length) onFiles(files);
  });
  return h("label", { class: primary ? "btn sm primary file-btn" : "btn sm file-btn" }, input, text);
}

/** Uploads photos (or one in place of `replace`); the server makes the variants and queues the descriptions. */
function uploadPhotos(files: File[], replace?: string): Promise<void> {
  toast = replace ? "Nalagam fotografijo …" : "Nalagam fotografije …";
  showToast();
  return queued(() => sendPhotos(files, replace));
}

async function sendPhotos(files: File[], replace?: string): Promise<void> {
  const form = new FormData();
  for (const f of files) form.append("photos", f, f.name);
  if (replace) form.set("replace", replace);
  if (state.version) form.set("baseVersion", String(state.version));
  try {
    const r = await fetch(`/api/sites/${siteId}/photos`, { method: "POST", body: form });
    const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string; added?: string[] };
    if (!r.ok) throw new Error(body.message ?? body.error ?? r.statusText);
    toast = replace ? "Slika je zamenjana. Opis pripravljamo …" : `Dodano: ${body.added?.length ?? files.length}. Opis pripravljamo …`;
  } catch (e) {
    toast = (e as Error).message;
  }
  await load();
  reloadPreview();
}

/** Where an image is shown, as section names. */
function photoUses(imageId: string): string[] {
  const out: string[] = [];
  for (const page of (state.spec?.pages ?? []) as Obj[]) {
    for (const s of (page.sections ?? []) as Obj[]) {
      if (JSON.stringify(s.props ?? {}).includes(`"${imageId}"`)) out.push(`${label(String(s.type))}${page.kind === "home" ? "" : ` (${String((page.nav as Obj)?.label ?? page.slug)})`}`);
    }
  }
  return out;
}

function photosPane(): HTMLElement {
  const pane = h("div", { class: "pane" }, paneHead("Fotografije"));
  if (!state.spec) return pane;
  const images = ((state.spec.assets as Obj).images ?? []) as Obj[];
  const generated = images.filter((im) => im.origin === "generated").length;
  pane.append(
    h("p", { class: "help" }, generated ? "Slike z oznako »Ustvarjeno z UI« smo dodali, ker je bilo vaših fotografij premalo. Zamenjajte jih s svojimi, ko jih imate." : "Fotografije na vaši strani. Vsaka potrebuje kratek opis za obiskovalce, ki slik ne vidijo."),
    h("div", { class: "row" }, fileButton("Dodaj fotografije", true, (files) => void uploadPhotos(files), true)),
  );
  const list = h("ul", { class: "photos" });
  images.forEach((im, i) => {
    const id = String(im.id);
    const uses = photoUses(id);
    const alt = String(im.alt ?? "");
    const altField = h("textarea", { rows: 2, maxlength: 180, placeholder: "Npr. Pek vzame hlebce iz krušne peči" }) as HTMLTextAreaElement;
    altField.value = alt;
    altField.addEventListener("change", () => void patch([{ op: "replace", path: `/assets/images/${i}/alt`, value: altField.value.trim() }], "opis slike"));
    list.append(
      h("li", { class: "photo" },
        h("img", { src: `/preview/${siteId}/media/${id}-360.webp`, alt: "", loading: "lazy", width: 120, height: 90 }),
        h("div", { class: "photo-body" },
          h("div", { class: "row" },
            im.origin === "generated" ? h("span", { class: "pill busy" }, "Ustvarjeno z UI") : h("span", { class: "pill plain" }, "Vaša fotografija"),
            h("span", { class: "muted photo-uses" }, uses.length ? `Na strani: ${uses.join(", ")}` : "Na strani še ni uporabljena"),
          ),
          withPath(`/assets/images/${i}/alt`, labelled("Opis slike", altField)),
          !alt && uses.length ? h("p", { class: "note warn" }, "Brez opisa strani ni mogoče objaviti. Opis pripravljamo samodejno; lahko ga napišete sami.") : null,
          h("div", { class: "row" }, fileButton(im.origin === "generated" ? "Zamenjaj s svojo fotografijo" : "Zamenjaj", false, (files) => void uploadPhotos(files, id))),
        ),
      ),
    );
  });
  pane.append(list);
  return pane;
}

/**
 * Oblika for owners: the style as cards, one main colour, the fonts. The other colours and the
 * numbers wait under "Napredno"; code keeps contrast and each style's ranges either way.
 */
function designPane(): HTMLElement {
  const pane = h("div", { class: "pane" }, paneHead("Oblika"));
  if (!state.spec || !catalogue) return pane;
  const d = state.spec.design as Obj;
  const dir = catalogue.directions.find((x) => x.id === d.direction);
  const set = (k: string, v: Json) => void patch([{ op: "replace", path: `/design/${k}`, value: v }], `oblikovanje ${k}`);
  const colors = d.colors as Obj;

  const main = h("input", { type: "color", value: colors.primary as string, "aria-label": "Glavna barva" });
  main.addEventListener("change", () => set("colors/primary", main.value));
  pane.append(
    withPath("/design/colors/primary", h("div", { class: "row main-color" }, main, h("span", {}, h("strong", {}, "Glavna barva"), h("span", { class: "muted" }, " gumbi in poudarki")))),
    h("label", {}, "Pisave"),
    h("select", { onChange: (e: Event) => set("fontPair", (e.target as HTMLSelectElement).value) }, ...(dir?.fontPairs ?? []).map((id) => h("option", { value: id, selected: id === d.fontPair }, catalogue!.fontPairs.find((f) => f.id === id)?.label ?? id))),
  );

  pane.append(
    h("h2", {}, "Slog"),
    h("div", { class: "styles", role: "group", "aria-label": "Slog" }, ...catalogue.directions.map((x) => {
      const chosen = x.id === d.direction;
      return h("button", {
        type: "button",
        class: "style-card",
        "aria-pressed": String(chosen),
        onClick: () => { if (!chosen) void post("/direction", { direction: x.id }, "Slog zamenjan."); },
      }, h("strong", {}, DIRECTION_LABEL[x.id]?.name ?? x.name), h("span", {}, DIRECTION_LABEL[x.id]?.summary ?? x.summary));
    })),
  );

  const advanced = h("details", { class: "more-fields" }, h("summary", {}, "Napredno: vse barve, velikosti, zaobljenost"));
  const fs = h("fieldset", { class: "colors" }, h("legend", {}, "Barve (kontrast preverimo sami)"));
  for (const [k, v] of Object.entries(colors)) {
    if (k === "primary") continue;
    const input = h("input", { type: "color", value: v as string, "aria-label": COLOR_LABEL[k] ?? k });
    input.addEventListener("change", () => set(`colors/${k}`, input.value));
    fs.append(withPath(`/design/colors/${k}`, h("div", { class: "row" }, input, h("span", { class: "sp" }, COLOR_LABEL[k] ?? k))));
  }
  advanced.append(fs);
  const r = (dir?.ranges ?? {}) as Record<string, [number, number] | string[]>;
  const num = (k: string, title: string, step: string) => {
    const [lo, hi] = (r[k] as [number, number]) ?? [0, 100];
    const input = h("input", { type: "number", min: lo, max: hi, step, value: d[k] as number });
    input.addEventListener("change", () => set(k, Number(input.value)));
    return labelled(`${title} (${lo}–${hi})`, input);
  };
  const choice = (k: string, title: string) =>
    labelled(title, h("select", { onChange: (e: Event) => set(k, (e.target as HTMLSelectElement).value) }, ...((r[k] as string[]) ?? []).map((v) => h("option", { value: v, selected: v === d[k] }, TOKEN_LABEL[k]?.[v] ?? v))));
  advanced.append(h("div", { class: "pair" }, num("radius", "Zaobljenost (px)", "1"), num("baseFontSize", "Velikost pisave", "1"), num("scale", "Razmerje naslovov", "0.005"), num("headingWeight", "Debelina naslovov", "50"), num("headingTracking", "Razmik črk (em)", "0.005"), choice("density", "Gostota"), choice("shadow", "Senca"), choice("headingCase", "Velike črke")));
  // Colours a checklist entry points at open the advanced part.
  if (checklistOpen) advanced.open = true;
  pane.append(advanced);
  return pane;
}

function pagesPane(): HTMLElement {
  const pane = h("div", { class: "pane" }, paneHead("Strani"));
  if (!state.spec) return pane;
  pages().forEach((p, i) => {
    const nav = p.nav as Obj;
    const seo = p.seo as Obj;
    const system = p.kind !== "home" && p.kind !== "standard";
    const fs = h("fieldset", {}, h("legend", {}, `${nav.label} · ${pageFileOf(p)}`));
    const text = (key: string, title: string, val: string, max: number) => {
      const ptr = `/pages/${i}/${key}`;
      const input = h("input", { type: "text", maxlength: max, value: val });
      const save = autosave(inPage(String(p.id), `/${key}`), "nastavitve strani");
      input.addEventListener("input", () => save(input.value));
      return withPath(ptr, labelled(title, input));
    };
    fs.append(text("nav/label", "Ime v meniju", nav.label as string, 24), text("seo/title", "Naslov za iskalnike", seo.title as string, 60), text("seo/description", "Opis za iskalnike", seo.description as string, 160));
    if (!system) {
      fs.append(
        h("label", {}, h("input", { type: "checkbox", checked: nav.show === true, onChange: (e: Event) => void patch([{ op: "replace", path: `/pages/${i}/nav/show`, value: (e.target as HTMLInputElement).checked }], "meni") }), "Prikaži v meniju"),
        h("div", { class: "row" },
          h("button", { class: "btn sm", type: "button", "aria-label": `Premakni stran ${nav.label} gor`, disabled: i <= 1 || p.kind === "home", onClick: () => void patch([isPage(i, String(p.id)), { op: "move", from: `/pages/${i}`, path: `/pages/${i - 1}` }], "vrstni red strani") }, "↑ Gor"),
          h("button", { class: "btn sm", type: "button", "aria-label": `Premakni stran ${nav.label} dol`, disabled: p.kind === "home" || pages()[i + 1]?.kind !== "standard", onClick: () => void patch([isPage(i, String(p.id)), { op: "move", from: `/pages/${i}`, path: `/pages/${i + 1}` }], "vrstni red strani") }, "↓ Dol"),
          p.kind === "standard" && h("button", { class: "btn sm danger", type: "button", onClick: () => { if (confirm(`Izbrišem stran ${nav.label}?`)) { pageIndex = 0; void patch([isPage(i, String(p.id)), { op: "remove", path: `/pages/${i}` }], "izbrisana stran"); } } }, "Izbriši stran"),
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

const COST_STAGE: Record<string, string> = { classify: "Vrsta dejavnosti", brief: "Razumevanje opisa", design: "Oblikovna smer", altText: "Opisi fotografij", imageGen: "Ustvarjene slike", content: "Besedila in postavitev", critique: "Samopregled", edit: "Pomočnik" };
const n0 = (n: number) => n.toLocaleString("sl-SI");

/** A panel opened from the ⋯ menu or the assistant box: its title and a way back to editing. */
function paneHead(title: string): HTMLElement {
  return h("div", { class: "pane-head" },
    h("button", { class: "btn quiet sm", type: "button", onClick: () => { tab = "content"; render(); } }, "← Nazaj"),
    h("h2", { class: "pane-title" }, title),
  );
}

/** The whole conversation with the assistant (the box under the preview shows only the latest reply). */
function chatPane(): HTMLElement {
  const busy = state.site.status === "editing" || awaitingReply();
  const chat = h("div", { class: "chat" }, ...state.chat.map((m) => h("div", { class: `msg ${m.role}` }, m.content)));
  if (busy) chat.append(h("div", { class: "msg", role: "status" }, "Urejam stran …"));
  return h("div", { class: "pane" }, paneHead("Pogovor s pomočnikom"), state.chat.length || busy ? chat : h("p", { class: "muted" }, "Še nič. Napišite, kaj naj spremenimo, v polje pod predogledom."));
}

/** Model spend and the generation log: for us, not part of everyday editing. */
function diagPane(): HTMLElement {
  const total = state.cost.reduce((a, c) => a + c.eur, 0);
  return h("div", { class: "pane" },
    paneHead("Poraba in dnevnik"),
    h("p", { class: "help num" }, state.spendToday !== null && state.cap !== null ? `Danes ${formatEur(state.spendToday)} od ${formatEur(state.cap)} (vse strani). Ta stran skupaj: ${formatEur(total)}.` : `Ta stran skupaj: ${formatEur(total)}.`),
    h("table", {},
      h("tr", {}, h("th", {}, "Faza"), h("th", { class: "num" }, "Klici"), h("th", { class: "num" }, "Vhod"), h("th", { class: "num" }, "Izhod"), h("th", { class: "num" }, "€")),
      ...state.cost.map((c) => h("tr", {}, h("td", {}, COST_STAGE[c.stage] ?? c.stage), h("td", { class: "num" }, n0(c.calls)), h("td", { class: "num" }, n0(c.input + c.cacheRead + c.cacheWrite)), h("td", { class: "num" }, n0(c.output)), h("td", { class: "num" }, c.eur.toLocaleString("sl-SI", { minimumFractionDigits: 3, maximumFractionDigits: 3 })))),
    ),
    h("p", { class: "help" }, "Vhod vključuje žetone iz predpomnilnika."),
    h("h2", {}, "Dnevnik"),
    h("div", { class: "log" }, ...state.events.slice(-80).map((e) => h("div", { class: e.level === "error" ? "err" : "" }, `${new Date(e.created_at).toLocaleTimeString("sl-SI")} ${e.stage}: ${e.message}`))),
  );
}

// ---------- The assistant box under the preview: say what to change ----------
/** Built once and kept, so a re-render never wipes what the owner is typing. */
let dock: { root: HTMLElement; input: HTMLTextAreaElement; status: HTMLElement; chips: HTMLElement; send: HTMLButtonElement; note: HTMLElement } | null = null;

/** A few things owners ask for, offered while the box is empty; a tap fills the box, it doesn't send. */
function suggestions(): string[] {
  const out: string[] = [];
  const types = new Set(sections().map((s) => String(s.type)));
  if (!types.has("faq")) out.push("Dodaj pogosta vprašanja");
  out.push("Toplejše barve", "Krajši uvod na vrhu strani");
  if (!types.has("opening-hours") && !(state.spec?.business as Obj | undefined)?.hours) out.push("Dodaj delovni čas");
  return out.slice(0, 3);
}

async function sendToAssistant(): Promise<void> {
  if (!dock) return;
  const message = dock.input.value.trim();
  if (!message) return dock.input.focus();
  dock.send.disabled = true;
  try {
    await api("/chat", { method: "POST", body: JSON.stringify({ message }) });
    dock.input.value = "";
    toast = "Poslano. Spremembo pokažemo v predogledu.";
  } catch (e) {
    toast = (e as Error).message;
  }
  await load();
}

function buildDock(): HTMLElement {
  const input = h("textarea", { rows: 1, id: "ask", placeholder: "Kaj naj spremenimo?", "aria-label": "Kaj naj spremenimo?" }) as HTMLTextAreaElement;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendToAssistant();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    renderDock();
  });
  const send = h("button", { class: "btn primary sm", type: "button", onClick: () => void sendToAssistant() }, "Pošlji") as HTMLButtonElement;
  const status = h("div", { class: "ask-status", role: "status" });
  const chips = h("div", { class: "sugg" });
  const note = h("p", { class: "ask-note" });
  const root = h("div", { class: "ask-dock" }, status, chips, h("div", { class: "ask" }, input, send), note);
  dock = { root, input, status, chips, send, note };
  return root;
}

/** Updates the box's status line, latest reply and suggestions; the typed text stays. */
function renderDock(): void {
  if (!dock) return;
  dock.root.hidden = !state.spec;
  const busy = state.site.status === "editing" || awaitingReply();
  const last = state.chat.at(-1);
  const allowed = can("chat");
  dock.send.disabled = busy || state.site.status === "generating" || !allowed;
  dock.input.disabled = !allowed;
  dock.input.placeholder = allowed ? "Kaj naj spremenimo?" : state.access?.viewer === "anonymous" ? "Pomočnik je na voljo po prijavi" : "Spremembe s pomočnikom ste porabili";
  // What's left, in one sentence (the admin has no limits, so no note).
  const left = state.access && state.access.viewer !== "admin" ? state.access.allowance.text : "";
  dock.note.textContent = left;
  dock.note.hidden = !left;
  dock.status.replaceChildren(
    ...(busy
      ? [h("span", { class: "busy-dot", "aria-hidden": "true" }), "Urejam stran …"]
      : last?.role === "assistant"
        ? [h("span", { class: "reply" }, last.content), h("button", { class: "linkish", type: "button", onClick: () => { tab = "chat"; setSheet("full"); render(); } }, "Pogovor")]
        : []),
  );
  dock.chips.replaceChildren(
    ...(busy || dock.input.value.trim() || !allowed
      ? []
      : suggestions().map((s) => h("button", { type: "button", onClick: () => { dock!.input.value = s; dock!.input.focus(); renderDock(); } }, s))),
  );
}

/** A preview made without an account: what it is, how long it stays, and the one step to keep and edit it. */
function guestPane(): HTMLElement {
  const a = state.access;
  const until = a?.expiresAt ? new Date(a.expiresAt).toLocaleDateString("sl-SI", { day: "numeric", month: "long" }) : null;
  return h("div", { class: "pane guest" },
    h("h2", { class: "pane-title" }, "Vaš brezplačni predogled"),
    h("p", {}, "Prijavite se z e-pošto, pa stran shranimo pod vaše ime. Potem jo urejate s tapom na besedilo, s pomočnikom in jo, ko bo pripravljena, objavite."),
    until ? h("p", { class: "help" }, `Brez prijave predogled hranimo do ${until}.`) : null,
    a?.signIn ? h("a", { class: "btn primary", href: a.signIn }, "Shrani in uredi") : null,
    a?.allowance.text ? h("p", { class: "help" }, a.allowance.text) : null,
  );
}

function versionsPane(): HTMLElement {
  const SRC: Record<string, string> = { generate: "ustvarjeno", critique: "samopregled", edit: "pomočnik", manual: "urejanje", revert: "obnovljeno" };
  // Retention may have removed a version since the list loaded: the server says so, and the list reloads.
  const restore = (version: number) => void queued(async () => {
    try {
      await api("/revert", { method: "POST", body: JSON.stringify({ version }) });
      toast = `Obnovljena različica ${version}.`;
    } catch (e) {
      toast = (e as Error).message;
    }
    await load();
    reloadPreview();
  });
  const action = (v: ListedVersion, label: string) =>
    v.version === state.version
      ? h("span", { class: "pill plain" }, "trenutna")
      : h("button", { class: "btn sm", type: "button", "aria-label": label, onClick: () => restore(v.version) }, "Obnovi");
  const published = (v: ListedVersion) => (v.version === state.site.published_version ? " · objavljena" : v.published ? " · bila objavljena" : "");
  return h("div", { class: "pane" },
    paneHead("Zgodovina sprememb"),
    h("p", { class: "help" }, "Vsaka sprememba je nova različica, tudi obnova. Zaporedna urejanja so združena, »Obnovi« vrne zadnje. Nedavne hranimo vse, starejše po eno na dan, objavljene vse."),
    h("ol", { class: "versions" }, ...groupVersions(state.versions).map((item) => item.type === "one"
      ? h("li", {},
          h("b", {}, `v${item.row.version}`),
          h("div", { class: "what" }, h("span", {}, `${SRC[item.row.source] ?? item.row.source} · ${formatDateTime(item.row.created_at)}${published(item.row)}`), item.row.message ? h("span", { class: "muted" }, item.row.message.slice(0, 120)) : null),
          action(item.row, `Obnovi različico ${item.row.version}`),
        )
      : h("li", {},
          h("b", { title: item.range }, `v${item.newest.version}`),
          h("div", { class: "what" }, h("span", {}, item.label), h("span", { class: "muted" }, `${SRC.manual} · ${item.day} · ${item.range}`)),
          action(item.newest, `Obnovi različico ${item.newest.version}, zadnjo od: ${item.label}`),
        ))),
  );
}

// ---------- Generation progress: real stage names, real seconds ----------
const STAGES: [string, string][] = [
  ["classify", "Vrsta dejavnosti"],
  ["brief", "Razumevanje opisa"],
  ["design", "Oblikovna smer"],
  ["imageGen", "Ustvarjanje slik"],
  ["images", "Fotografije"],
  ["content", "Besedila in postavitev"],
  ["check", "Preverjanje na telefonu in namizju"],
  ["critique", "Samopregled in popravki"],
];
/** Stages that only some runs have: listed once they start. */
const OPTIONAL_STAGES = new Set(["imageGen"]);
/** Which running stage the live preview names when several run side by side (the one the owner waits on). */
const ACTIVITY_ORDER = ["content", "imageGen", "images", "design", "brief", "classify", "check", "critique"];

type RunEvent = State["events"][number];

/** The latest run's events: from its last "classify start". */
function currentRun(): RunEvent[] {
  const starts = state.events.map((e) => e.stage === "classify" && e.message === "start");
  return state.events.slice(Math.max(0, starts.lastIndexOf(true)));
}

/** Seconds since `since` on the server's clock, as "8 s" or "1:05". */
function elapsed(since: string): string {
  const s = Math.max(0, Math.floor((Date.now() + clockSkew - Date.parse(since)) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Running stages with the time each started, in pipeline order. */
function runningStages(run: RunEvent[]): { key: string; since: string }[] {
  const out: { key: string; since: string }[] = [];
  for (const [key] of STAGES) {
    const starts = run.filter((e) => e.stage === key && e.message === "start");
    const done = run.filter((e) => e.stage === key && e.message === "done").length;
    if (starts.length > done) out.push({ key, since: starts.at(-1)!.created_at });
  }
  return out;
}

function progress(): HTMLElement {
  const run = currentRun();
  const running = new Map(runningStages(run).map((r) => [r.key, r.since]));
  const list = h("ol", { class: "stages", "aria-label": "Potek ustvarjanja" });
  for (const [key, name] of STAGES) {
    const begun = run.filter((e) => e.stage === key && e.message === "start").length;
    if (!begun && OPTIONAL_STAGES.has(key)) continue;
    const done = run.filter((e) => e.stage === key && e.message === "done");
    const ms = done.reduce((a, e) => a + Number((e.data as { ms?: number } | null)?.ms ?? 0), 0);
    const since = running.get(key);
    const cls = since ? "run" : done.length ? "done" : "";
    list.append(
      h("li", { class: cls },
        h("i", { "aria-hidden": "true" }),
        h("span", {}, name, h("span", { class: "sr-only" }, cls === "run" ? " (poteka)" : cls === "done" ? " (končano)" : " (čaka)")),
        // A running stage counts up every second, so a long step never looks stuck.
        since
          ? h("span", { class: "num", "data-since": since }, elapsed(since))
          : h("span", { class: "num" }, ms ? `${(ms / 1000).toLocaleString("sl-SI", { maximumFractionDigits: ms < 10_000 ? 1 : 0 })} s` : ""),
      ),
    );
  }
  return list;
}

/** What the run has produced so far, for the live preview while the content is written. */
function liveData() {
  const run = currentRun();
  const briefDone = run.some((e) => e.stage === "brief" && e.message === "done");
  const brief = briefDone ? state.site.brief ?? null : null;
  const design = run.findLast((e) => e.stage === "design" && e.message === "Direction chosen")?.data as { direction: string; colors: Record<string, string> } | undefined;
  const photos = (run.find((e) => e.stage === "images" && e.message === "Photos ready")?.data as { ids?: string[] } | undefined)?.ids ?? [];
  const generated = run.filter((e) => e.stage === "imageGen" && e.message === "Image ready").map((e) => e.data as { id: string; alt: string });
  const running = runningStages(run).sort((a, b) => ACTIVITY_ORDER.indexOf(a.key) - ACTIVITY_ORDER.indexOf(b.key));
  return {
    name: brief?.name ?? null,
    town: brief?.town ?? null,
    summary: brief?.summary ?? null,
    offerings: (brief?.offerings ?? []).map((o) => o.name).slice(0, 4),
    direction: design ? DIRECTION_LABEL[design.direction]?.name ?? null : null,
    colors: design?.colors ?? null,
    images: [...photos.map((id) => ({ id, alt: "", generated: false })), ...generated.map((g) => ({ ...g, generated: true }))].slice(0, 2),
    activity: running[0] ? { name: STAGES.find(([k]) => k === running[0]!.key)![1], since: running[0].since } : null,
  };
}

/** Pictures already faded in once; a re-render shows them without fading again. */
const shownImages = new Set<string>();

/**
 * The preview frame while the site is generated: a skeleton page that fills in with what the run has
 * actually produced (name, colours, pictures), so the owner sees it moving long before the text is ready.
 */
function liveSkeleton(): HTMLElement {
  const d = liveData();
  const bars = (...widths: number[]) => widths.map((w) => h("span", { class: "sk-bar", style: { width: `${w}%` } }));
  const picture = (i: number, cls: string) => {
    const img = d.images[i];
    if (!img) return h("div", { class: `${cls} sk-block` });
    const fresh = !shownImages.has(img.id);
    shownImages.add(img.id);
    return h("div", { class: `${cls} sk-pic` },
      h("img", { src: `/preview/${siteId}/media/${img.id}-720.webp`, alt: "", class: fresh ? "fresh" : null }),
      img.generated ? h("span", { class: "sk-ai" }, "Ustvarjeno z UI") : null,
    );
  };
  const page = h("div", { class: `frame skeleton live${d.colors ? " colored" : ""}`, "aria-hidden": "true" },
    h("div", { class: "sk-head" },
      d.name ? h("span", { class: "sk-name" }, d.name) : h("span", { class: "sk-bar", style: { width: "38%" } }),
      h("span", { class: "sk-btn" }),
    ),
    h("div", { class: "sk-hero" },
      picture(0, "sk-hero-pic"),
      h("div", { class: "sk-hero-text" },
        d.town ? h("span", { class: "sk-eyebrow" }, d.town) : h("span", { class: "sk-bar", style: { width: "30%" } }),
        h("span", { class: "sk-bar sk-h" }), h("span", { class: "sk-bar sk-h", style: { width: "70%" } }),
        d.summary ? h("p", { class: "sk-summary" }, d.summary) : bars(92, 85, 60),
        h("span", { class: "sk-btn wide" }),
      ),
    ),
    h("div", { class: "sk-section" },
      h("span", { class: "sk-bar sk-h", style: { width: "55%" } }),
      d.offerings.length ? h("ul", { class: "sk-offers" }, d.offerings.map((o) => h("li", {}, o))) : bars(90, 80, 86),
    ),
    d.images[1] ? picture(1, "sk-second") : null,
    d.direction ? h("p", { class: "sk-direction" }, `Oblikovna smer: ${d.direction}`) : null,
    d.activity ? h("p", { class: "sk-activity" }, h("i", {}), `${d.activity.name} … `, h("span", { "data-since": d.activity.since }, elapsed(d.activity.since))) : null,
  );
  if (d.colors) {
    const c = d.colors;
    const vars: Record<string, string | undefined> = { "--sk-bg": c.background, "--sk-surface": c.surface, "--sk-text": c.text, "--sk-muted": c.muted, "--sk-primary": c.primary, "--sk-line": c.border };
    for (const [k, v] of Object.entries(vars)) if (v) page.style.setProperty(k, v);
  }
  // Rebuilt only when something new arrived, so the shimmer and the counters run on undisturbed.
  page.dataset.sig = JSON.stringify({ ...d, activity: d.activity?.name ?? null });
  return page;
}

function statusBlock(): HTMLElement | null {
  const s = state.site;
  if (s.status === "generating") {
    const runStart = currentRun()[0]?.created_at;
    return h("div", { class: "pane" },
      h("h2", { class: "pane-title" }, state.spec ? "Stran preverjamo" : "Stran se ustvarja", runStart ? h("span", { class: "elapsed", "data-since": runStart }, elapsed(runStart)) : null),
      progress(),
      h("p", { class: "help" }, state.spec ? "Predogled je pripravljen. Ko preverjanje najde kaj za popraviti, se pokaže nova različica. Urejate lahko že zdaj." : "Predogled se sestavlja sproti. Stran lahko zaprete, ustvarjanje teče naprej."),
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

/** The editing layer in the preview: styles and the section toolbar are added at runtime; the rendered HTML is unchanged. */
const EDIT_CSS = `main section{cursor:pointer} main section:hover{outline:2px dashed #156b4a;outline-offset:-2px}
main section[data-sb-selected]{position:relative;outline:3px solid #156b4a;outline-offset:-3px}
[contenteditable]{outline:2px solid #9a5b00!important;outline-offset:2px;cursor:text}
.sb-tools{position:absolute;top:8px;left:8px;z-index:2147483000;display:flex;gap:2px;padding:4px;background:#fff;border:1px solid #c9c4ba;border-radius:8px;box-shadow:0 8px 24px rgb(20 20 18/.16)}
.sb-tools button,.sb-add{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;padding:0 10px;border-radius:6px;font:600 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#151412;cursor:pointer}
.sb-tools button:hover{background:#ece9e3}
.sb-tools button:disabled{color:#b5b0a7;cursor:default;background:none}
.sb-add{position:absolute;left:50%;bottom:8px;z-index:2147483000;transform:translateX(-50%);padding:0 16px;border-radius:999px;background:#156b4a;color:#fff;box-shadow:0 8px 24px rgb(20 20 18/.2)}
.sb-tools button:focus-visible,.sb-add:focus-visible{outline:2px solid #156b4a;outline-offset:2px}
@media (pointer:coarse){.sb-tools button,.sb-add{min-height:44px;min-width:44px}}`;

/** Which business fact a tap in the preview points at, if any: those live in Podatki, not in a section. */
function factAt(t: HTMLElement): string | null {
  const href = t.closest("a")?.getAttribute("href") ?? "";
  if (href.startsWith("tel:")) return "/business/phone";
  if (href.startsWith("mailto:")) return "/business/email";
  if (/google\.[a-z.]+\/maps|maps\.apple\.com|openstreetmap/.test(href) || t.closest("address")) return "/business/address";
  if (t.closest(".hours")) return "/business/hours";
  return null;
}

function attachEditing(): void {
  const doc = frame?.contentDocument;
  if (!doc || !editMode || !can("edit")) return;
  const style = doc.createElement("style");
  style.textContent = EDIT_CSS;
  doc.head.append(style);
  decorate();
  frame?.contentWindow?.addEventListener("scroll", placeTools, { passive: true });
  frame?.contentWindow?.addEventListener("resize", placeTools);
  doc.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[contenteditable], .sb-tools, .sb-add")) return;
    const link = t.closest("a");
    if (link) e.preventDefault();
    const sec = t.closest("main section[id]");
    const fact = factAt(t);
    if (fact) {
      e.preventDefault();
      if (sec) selected = sec.id;
      goTo(fact);
      return;
    }
    // A picture opens its own panel: replace it or describe it.
    const img = t.closest("img");
    const id = img ? /\/media\/(img_[a-z0-9_]+)-\d+\./.exec(img.currentSrc || img.src)?.[1] : undefined;
    if (id) {
      e.preventDefault();
      if (sec) selected = sec.id;
      imageId = id;
      tab = "image";
      setSheet("full");
      render();
      return;
    }
    // First tap selects the section, a tap on its text then edits that text in place (works by touch;
    // a double-click does both).
    if (sec && sec.id === selected && t.closest(INLINE_TEXT)) {
      e.preventDefault();
      inlineEdit(t);
    } else if (sec) select(sec.id, false);
    else if (t.closest("header, footer")) {
      tab = "facts";
      setSheet("full");
      render();
    }
  }, true);
}

/** Marks the selected section in the preview and gives it its toolbar (move, duplicate, delete) and "+". */
function decorate(): void {
  const doc = frame?.contentDocument;
  if (!doc?.body) return;
  doc.querySelectorAll(".sb-tools, .sb-add").forEach((n) => n.remove());
  doc.querySelectorAll("[data-sb-selected]").forEach((n) => n.removeAttribute("data-sb-selected"));
  const secs = sections();
  const si = secs.findIndex((s) => s.id === selected);
  const s = secs[si];
  const el = s ? doc.getElementById(String(s.id)) : null;
  if (!el || !s) return;
  el.setAttribute("data-sb-selected", "");
  if (s.type === "legal" || s.type === "not-found") return;
  const pi = pageIndex;
  const id = String(s.id);
  const name = label(String(s.type));
  const button = (text: string, aria: string, run: () => void, disabled = false) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.title = aria;
    b.setAttribute("aria-label", aria);
    b.disabled = disabled;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      run();
    });
    return b;
  };
  const tools = doc.createElement("div");
  tools.className = "sb-tools";
  tools.setAttribute("role", "toolbar");
  tools.setAttribute("aria-label", `Razdelek ${name}`);
  tools.append(
    button("↑", `Premakni gor: ${name}`, () => void patch([isSection(pi, si, id), { op: "move", from: `/pages/${pi}/sections/${si}`, path: `/pages/${pi}/sections/${si - 1}` }], "premik"), si === 0),
    button("↓", `Premakni dol: ${name}`, () => void patch([isSection(pi, si, id), { op: "move", from: `/pages/${pi}/sections/${si}`, path: `/pages/${pi}/sections/${si + 1}` }], "premik"), si === secs.length - 1),
    button("Podvoji", `Podvoji: ${name}`, () => void patch([isSection(pi, si, id), { op: "add", path: `/pages/${pi}/sections/${si + 1}`, value: { ...structuredClone(s), id: newSectionId(String(s.type)) } }], "podvojen razdelek")),
    button("Izbriši", `Izbriši: ${name}`, () => {
      if (!confirm(`Izbrišem razdelek »${name}«?`)) return;
      selected = null;
      void patch([isSection(pi, si, id), { op: "remove", path: `/pages/${pi}/sections/${si}` }], "izbrisan razdelek");
    }),
  );
  el.prepend(tools);
  if (canAddSections()) {
    const add = button("+ Dodaj razdelek", `Dodaj razdelek pod: ${name}`, () => openAdd(si + 1));
    add.className = "sb-add";
    el.append(add);
  }
  placeTools();
}

/**
 * Keeps the toolbar at the top and "+" at the bottom of the part of the selected section that is on
 * screen, so a tall section never hides them.
 */
function placeTools(): void {
  const doc = frame?.contentDocument;
  const win = frame?.contentWindow;
  const el = doc?.querySelector<HTMLElement>("[data-sb-selected]");
  if (!doc || !win || !el) return;
  const r = el.getBoundingClientRect();
  const tools = el.querySelector<HTMLElement>(":scope > .sb-tools");
  const add = el.querySelector<HTMLElement>(":scope > .sb-add");
  const room = Math.max(0, r.height - 56);
  // The site's fixed call bar covers the bottom of a phone screen; "+" stays above it.
  const bar = doc.querySelector<HTMLElement>(".action-bar");
  const barHeight = bar && win.getComputedStyle(bar).position === "fixed" ? bar.getBoundingClientRect().height : 0;
  if (tools) tools.style.top = `${Math.min(room, Math.max(8, -r.top + 8))}px`;
  if (add) add.style.bottom = `${Math.min(room, Math.max(8, r.bottom - (win.innerHeight - barHeight) + 8))}px`;
}

/** Elements whose text can be edited in place. */
const INLINE_TEXT = "h1,h2,h3,h4,p,li,dt,dd,summary,a,span,figcaption,th,td";

/** Text tapped in the selected section: find the string in the section's props that it shows, edit it in place. */
function inlineEdit(el: HTMLElement): void {
  const sec = el.closest("main section[id]");
  if (!sec) return;
  const si = sections().findIndex((s) => s.id === sec.id);
  if (si < 0) return;
  const target = el.closest(INLINE_TEXT) as HTMLElement | null;
  if (!target || target.isContentEditable) return;
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
    toast = "To besedilo uredite v obrazcu razdelka.";
    render();
    return;
  }
  const ptr = matches[0]!;
  target.setAttribute("contenteditable", "plaintext-only");
  target.focus();
  let done = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); target.blur(); }
    if (e.key === "Escape") { finish(false); }
  };
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    target.removeEventListener("keydown", onKey);
    target.removeAttribute("contenteditable");
    const next = (target.textContent ?? "").replace(/\s+/g, " ").trim();
    if (save && next && next !== text) void patch([isSection(pageIndex, si, sec.id), { op: "replace", path: ptr, value: next }], "urejeno besedilo");
    else target.textContent = text;
  };
  target.addEventListener("blur", () => finish(true), { once: true });
  target.addEventListener("keydown", onKey);
}

function select(id: string, scroll = true): void {
  selected = id;
  tab = "content";
  checklistOpen = false;
  if (sheet === "closed") setSheet("peek");
  render();
  if (scroll) frame?.contentDocument?.getElementById(id)?.scrollIntoView({ block: "start" });
  // Show the section's form: below the outline, out of sight in the phone sheet or after a tap in the preview.
  if (narrowScreen() || !scroll) document.getElementById("selected-head")?.scrollIntoView({ block: "start" });
}

// ---------- Phone: the site fills the screen; the editor is a bottom sheet: closed, peeking or full ----------
/** Closed is a slim strip (handle and one line): the site gets the screen until something is tapped. */
let sheet: "closed" | "peek" | "full" = "closed";
const narrowScreen = (): boolean => window.matchMedia("(max-width: 900px)").matches;
const handleLabel = (): string => (sheet === "full" ? "Pomanjšaj urejanje" : "Razširi urejanje");

function setSheet(next: "closed" | "peek" | "full"): void {
  const changed = next !== sheet;
  sheet = next;
  if (!shell) return;
  shell.panel.dataset.sheet = next;
  shell.ed.dataset.sheet = next;
  const handle = shell.panel.querySelector<HTMLButtonElement>(".sheet-handle");
  handle?.setAttribute("aria-expanded", String(next === "full"));
  handle?.setAttribute("aria-label", handleLabel());
  // The preview gets the room the sheet leaves; resize it once the sheet has moved.
  if (changed && narrowScreen()) window.setTimeout(sizeFrame, 220);
}

/** Tap opens it fully, or closes it from full; dragging up or down moves it one step. Hidden on wide screens. */
function sheetHandle(): HTMLElement {
  const b = h("button", { type: "button", class: "sheet-handle", "aria-expanded": String(sheet === "full"), "aria-label": handleLabel() }, h("span", { "aria-hidden": "true" }));
  let startY: number | null = null;
  let dragged = false;
  b.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    dragged = false;
  });
  b.addEventListener("pointerup", (e) => {
    const dy = startY === null ? 0 : e.clientY - startY;
    startY = null;
    if (Math.abs(dy) > 30) {
      dragged = true;
      setSheet(dy < 0 ? (sheet === "closed" ? "peek" : "full") : sheet === "full" ? "peek" : "closed");
    }
  });
  b.addEventListener("click", () => {
    if (dragged) dragged = false;
    else setSheet(sheet === "full" ? "closed" : "full");
  });
  return b;
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
    h("a", { class: "btn quiet sm back", href: "/sites", "aria-label": "Moje strani" }, h("span", { "aria-hidden": "true" }, "←"), h("span", { class: "label" }, " Moje strani")),
    h("h1", { class: "site-name" }, ((state.spec?.business as Obj | undefined)?.name as string | undefined) ?? s.name),
    h("span", { class: `pill ${status.tone}` }, status.label),
    h("span", { class: "sp" }),
  ];
  // Nothing to undo, open or publish before the first version exists.
  if (!state.spec) return head;
  if (!can("edit")) return [...head, state.access?.signIn ? h("a", { class: "btn sm primary", href: state.access.signIn }, "Shrani in uredi") : null];
  const todo = state.checklist.length;
  return [
    ...head,
    h("span", { class: "actions" },
      h("button", { class: "btn quiet sm icon-btn", type: "button", "aria-label": "Razveljavi", title: "Razveljavi", disabled: prev === null, onClick: () => void undo() }, "↶"),
      // What is left before publishing, as one chip instead of a banner on every screen.
      todo ? h("button", { class: "chip warn", type: "button", id: "checklist-summary", "aria-label": `Še ${todo} do objave`, onClick: () => openChecklist() }, `Še ${todo}`, h("span", { class: "label" }, " do objave")) : null,
      moreMenu(),
      // While something blocks publishing the button stays tappable and opens the checklist: a disabled
      // button with a tooltip explains nothing on a phone.
      h("button", {
        class: state.checklist.length ? "btn sm primary blocked" : "btn sm primary",
        type: "button",
        "aria-describedby": state.checklist.length ? "checklist-summary" : undefined,
        onClick: async () => {
          // A free account can build and edit, not publish yet: say so instead of a refusal after the tap.
          if (!can("publish")) {
            toast = "Objava je na voljo z naročnino. Med preizkusom jo omogočamo izbranim podjetjem.";
            return showToast();
          }
          if (state.checklist.length) return openChecklist();
          // Publishes the version on screen, after any text still waiting to be saved.
          await queued(async () => {
            try {
              const r = await api<{ url: string }>("/publish", { method: "POST", body: "{}" });
              toast = `Objavljeno: ${r.url}`;
            } catch (e) {
              toast = `Ni objavljeno. ${(e as Error).message}`;
            }
            await load();
          });
        },
      }, "Objavi"),
    ),
  ];
}

/** Everything that isn't everyday editing, in one menu. Stays open across re-renders. */
let menuOpen = false;
function moreMenu(): HTMLElement {
  const s = state.site;
  const go = (t: Tab) => () => { menuOpen = false; tab = t; selected = null; setSheet("full"); render(); };
  const menu = h("details", { class: "menu", open: menuOpen },
    h("summary", { class: "btn quiet sm icon-btn", "aria-label": "Več možnosti", title: "Več možnosti" }, "⋯"),
    h("div", { class: "list" },
      h("a", { href: `/sites/${siteId}/messages` }, state.messages ? `Sporočila (${state.messages})` : "Sporočila"),
      h("button", { type: "button", onClick: go("versions") }, "Zgodovina sprememb"),
      h("a", { href: previewUrl(), target: "_blank" }, "Predogled v novem zavihku"),
      s.published_version ? h("a", { href: `/s/${s.slug}/`, target: "_blank" }, "Odpri objavljeno stran") : null,
      can("export") ? h("button", { type: "button", id: "export-start", onClick: () => { menuOpen = false; void startExport(); } }, "Prenesi stran (.zip)") : null,
      !can("regenerate") ? null : h("button", {
        type: "button",
        disabled: s.status === "generating",
        onClick: () => {
          if (confirm("Ustvarim celotno stran znova? Podatki o podjetju ostanejo, besedila in postavitev so nova. Trenutna vsebina ostane v zgodovini, zato jo lahko obnovite.")) void post("/generate", { scope: "full" }, "Ustvarjanje se je začelo.");
        },
      }, "Ustvari celotno stran znova"),
      !state.access || state.access.viewer === "admin" ? h("button", { type: "button", onClick: go("diag") }, "Poraba in dnevnik") : null,
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
  // While the first version is generated the live preview can be watched at either size, too.
  if (!state.spec && state.site.status !== "generating") return [];
  return [
    h("div", { class: "seg", role: "group", "aria-label": "Velikost predogleda" },
      h("button", { type: "button", "aria-pressed": String(device === "mobile"), onClick: () => { device = "mobile"; render(); } }, "Telefon"),
      h("button", { type: "button", "aria-pressed": String(device === "desktop"), onClick: () => { device = "desktop"; render(); } }, "Računalnik"),
    ),
    h("span", { class: "sp" }),
    h("span", { class: "muted where" }, p ? String((p.nav as Obj).label) : ""),
  ];
}

function render(): void {
  if (!shell) {
    // Labelled, so they stay distinct from the header and main of the site inside the preview frame.
    const top = h("header", { class: "top", "aria-label": "Urejevalnik" });
    const panel = h("section", { class: "panel", "aria-label": "Urejanje" });
    panel.addEventListener("focusin", (e) => {
      if (narrowScreen() && (e.target as HTMLElement).matches("input:not([type=checkbox]):not([type=color]):not([type=file]), textarea, select")) setSheet("full");
    });
    const bar = h("div", { class: "bar" });
    const stage = h("div", { class: "stage" });
    const ed = h("main", { class: "ed", "aria-label": "Urejanje strani" }, panel, h("section", { class: "canvas", "aria-label": "Predogled" }, bar, stage, buildDock()));
    root.replaceChildren(h("div", { class: "shell" }, top, ed));
    shell = { top, ed, panel, bar, stage };
    lastWidth = window.innerWidth;
    // Only width changes resize the frame: phone keyboards change the height while typing.
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      document.documentElement.style.setProperty("--top-h", `${top.offsetHeight}px`);
      sizeFrame();
    });
  }
  document.title = `${((state.spec?.business as Obj | undefined)?.name as string | undefined) ?? state.site.name} · urejanje`;
  shell.top.replaceChildren(...topItems().filter((c): c is Node => c instanceof Node));
  document.documentElement.style.setProperty("--top-h", `${shell.top.offsetHeight}px`);

  shell.panel.dataset.sheet = sheet;
  shell.ed.dataset.sheet = sheet;
  shell.panel.replaceChildren(
    ...[
      state.spec ? sheetHandle() : null,
      statusBlock(),
      checklistBlock(),
      !state.spec && state.site.status !== "generating" && state.site.status !== "failed" ? h("div", { class: "pane" }, h("p", { class: "muted" }, "Stran še nima vsebine.")) : null,
      state.spec && !can("edit") ? guestPane() : null,
      state.spec && can("edit") ? { content: contentPane, facts: factsPane, photos: photosPane, design: designPane, pages: pagesPane, versions: versionsPane, chat: chatPane, diag: diagPane, add: addPane, image: imagePane }[tab]() : null,
    ].filter((c): c is HTMLElement => c !== null),
  );
  shell.bar.replaceChildren(...barItems().filter((c): c is Node => c instanceof Node));
  shell.bar.hidden = !state.spec && state.site.status !== "generating";
  shell.ed.classList.toggle("nospec", !state.spec);
  shell.ed.classList.toggle("generating", state.site.status === "generating");
  renderStage();
  renderDock();
  linkLabels(shell.panel);
  linkLabels(shell.bar);
  // Keep the selection and its toolbar in sync with the frame that survives re-renders.
  decorate();
  showToast();
}

function renderStage(): void {
  const stage = shell!.stage;
  if (!state.spec) {
    frame = null;
    if (state.site.status === "generating") {
      const live = liveSkeleton();
      const current = stage.querySelector<HTMLElement>(".frame.live");
      if (current?.dataset.sig !== live.dataset.sig) stage.replaceChildren(live);
    } else stage.replaceChildren(h("div", { class: "frame skeleton" }, "Predogleda še ni."));
    syncBadge(null);
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
    stage.replaceChildren(h("div", { class: "frame-box" }, h("div", { class: "frame" }, f)));
  }
  syncBadge(stage.querySelector<HTMLElement>(".frame-box"));
  sizeFrame();
}

/**
 * The free-preview badge (`sb-preview-watermark`): on the frame's corner, in the editor's own page, never
 * in the site inside the frame (preview = published output). The server decides when (access.badge).
 */
function syncBadge(box: HTMLElement | null): void {
  const text = box ? (state.access?.badge ?? null) : null;
  // The stage makes room above the frame for it (app.css .stage.badged).
  shell?.stage.classList.toggle("badged", !!text);
  if (!box) return;
  let badge = box.querySelector<HTMLElement>(":scope > .preview-badge");
  if (!text) return badge?.remove();
  if (!badge) badge = box.appendChild(h("span", { class: "preview-badge" }));
  if (badge.textContent !== text) badge.textContent = text;
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
  // The stage's own vertical padding: more at the top while the free-preview badge sits above the frame.
  const cs = getComputedStyle(stage);
  const avail = stage.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 2;
  const height = Math.max(narrow ? 200 : 360, device === "mobile" ? Math.min(avail, 800) : avail);
  wrap.style.width = `${Math.round(width * scale) + 2}px`;
  wrap.style.height = `${height + 2}px`;
  if (frame) {
    Object.assign(frame.style, { display: "block", border: "0", width: `${width}px`, height: `${Math.round(height / scale)}px`, transform: `scale(${scale})`, transformOrigin: "0 0" });
  }
}

/** Undo = revert to undoTarget (read at click time, not render time). */
function undo(): Promise<void> {
  return queued(async () => {
    // Read when the turn comes: text typed just before is saved first, and that is what gets undone.
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
  });
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

// ---------- Pre-publish checklist: each entry says what is missing, where, and opens the field ----------
let checklistOpen = false;
/** "export": the same checklist, opened by "Prenesi stran" as a warning with "Izvozi vseeno" (sb-export-checklist). */
let checklistFor: "publish" | "export" = "publish";

/** Opened from the "Še N do objave" chip, by Objavi or by an export while something is missing; closed otherwise. */
function checklistBlock(): HTMLElement | null {
  const list = state.checklist;
  if (!checklistOpen || !list.length || !state.spec) return null;
  const spec = state.spec;
  const missing = list.filter((b) => b.kind === "placeholder").length;
  const exporting = checklistFor === "export";
  return h("div", { class: "pane tight", id: "checklist" },
    h("div", { class: "note warn checklist" },
      h("div", { class: "row" },
        h("p", { class: "sp" }, h("strong", {}, exporting ? exportSummary(missing, list.length - missing) : blockerSummary(missing, list.length - missing))),
        h("button", { class: "btn quiet sm", type: "button", "aria-label": "Zapri seznam", onClick: () => { checklistOpen = false; render(); } }, "✕"),
      ),
      // Above the list, so a long checklist doesn't hide the way on.
      exporting
        ? h("div", { class: "row export-anyway" },
            h("a", { class: "btn sm", id: "export-anyway", href: `/api/sites/${siteId}/export?anyway=1`, onClick: () => { checklistOpen = false; window.setTimeout(render, 0); } }, "Izvozi vseeno"),
          )
        : null,
      h("ol", {}, ...list.slice(0, 40).map((b) =>
        h("li", {}, h("button", { type: "button", onClick: () => goTo(b.path) }, h("strong", {}, describePath(spec, b.path)), h("span", {}, blockerMessage(b)))))),
    ));
}

/** "Prenesi stran (.zip)": straight to the download when nothing is on the checklist, else the checklist as a warning first. */
async function startExport(): Promise<void> {
  // Text still waiting to be saved goes first, and the checklist is read fresh: the zip is the version on screen.
  await queued(() => load(false));
  if (!state.checklist.length) {
    render();
    window.location.href = `/api/sites/${siteId}/export`;
    return;
  }
  openChecklist("export");
}

function openChecklist(forWhat: "publish" | "export" = "publish"): void {
  checklistFor = forWhat;
  checklistOpen = true;
  setSheet("full");
  render();
  const box = document.getElementById("checklist");
  box?.scrollIntoView({ block: "nearest" });
  box?.querySelector<HTMLElement>("li button")?.focus({ preventScroll: true });
}

/** Opens the tab, page and section a spec path belongs to, then the field itself. */
function goTo(path: string): void {
  setSheet("full");
  const [, head, a, b, c] = path.split("/");
  if (head === "pages" && b === "sections") {
    const pi = Number(a);
    const sec = ((pages()[pi]?.sections ?? []) as Obj[])[Number(c)];
    const pageChanged = pi !== pageIndex;
    pageIndex = pi;
    selected = sec ? String(sec.id) : null;
    tab = "content";
    render();
    if (pageChanged) reloadPreview();
    else if (selected) frame?.contentDocument?.getElementById(selected)?.scrollIntoView({ block: "start" });
  } else {
    tab = head === "pages" ? "pages" : head === "business" || head === "chrome" ? "facts" : head === "assets" ? "photos" : head === "design" ? "design" : "content";
    render();
  }
  focusPath(path);
}

/** Scrolls to and focuses the form block for `path` (or its closest marked ancestor) and flashes it. */
function focusPath(path: string): void {
  let best: HTMLElement | null = null;
  for (const n of shell?.panel.querySelectorAll<HTMLElement>("[data-path]") ?? []) {
    const p = n.dataset.path!;
    if ((path === p || path.startsWith(`${p}/`)) && p.length > (best?.dataset.path?.length ?? -1)) best = n;
  }
  if (!best) return;
  const target = best;
  target.scrollIntoView({ block: "center" });
  target.classList.add("flash");
  window.setTimeout(() => target.classList.remove("flash"), 2000);
  target.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
}

function items(n: number): string {
  const form = new Intl.PluralRules("sl-SI").select(n);
  return `${n} ${({ one: "postavko", two: "postavki", few: "postavke" } as Record<string, string>)[form] ?? "postavk"}`;
}

/** The checklist's heading: missing facts (yellow in the preview) and other things to fix. */
function blockerSummary(missing: number, other: number): string {
  const parts: string[] = [];
  if (missing) parts.push(`${missingPhrase(missing)} (rumeno v predogledu)`);
  if (other) parts.push(`preverite še ${items(other)}`);
  return `Pred objavo: ${parts.join(", ")}. Tapnite postavko, odpre se pravo polje.`;
}

/** The same checklist before an export: a warning, the download stays possible. */
function exportSummary(missing: number, other: number): string {
  const parts: string[] = [];
  if (missing) parts.push(`${missingPhrase(missing)} (rumeno v predogledu)`);
  if (other) parts.push(`preverite še ${items(other)}`);
  return `Stran še ni pripravljena za objavo: ${parts.join(", ")}. Če jo izvozite zdaj, ostanejo te napake tudi v datotekah. Tapnite postavko, odpre se pravo polje.`;
}

/** "manjka 1 podatek", "manjkata 2 podatka", "manjkajo 3 podatki", "manjka 5 podatkov" (Slovene plural rules). */
function missingPhrase(n: number): string {
  const form = new Intl.PluralRules("sl-SI").select(n);
  const words: Record<string, string> = { one: "manjka {n} podatek", two: "manjkata {n} podatka", few: "manjkajo {n} podatki", other: "manjka {n} podatkov" };
  return (words[form] ?? words.other!).replace("{n}", String(n));
}

/** One live region for the whole session, shown and hidden, so screen readers keep announcing it. */
const toastEl = document.body.appendChild(h("div", { class: "toast", role: "status", hidden: true }));
let toastTimer: number | undefined;

function showToast(): void {
  if (!toast) return;
  toastEl.textContent = toast;
  toastEl.hidden = false;
  const t = toast;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toast === t) {
      toast = "";
      toastEl.hidden = true;
    }
  }, 4000);
}

load()
  .then(() => {
    // An export link opened while something was on the checklist comes back here (?export=1): show the warning.
    const url = new URL(window.location.href);
    if (url.searchParams.get("export") !== "1") return;
    url.searchParams.delete("export");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (can("export") && state.checklist.length) openChecklist("export");
  })
  .catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    root.replaceChildren(h("p", { role: "alert", class: "hint" }, `Urejevalnika ni bilo mogoče naložiti: ${message}. Osvežite stran.`));
  });
