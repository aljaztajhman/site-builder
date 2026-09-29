/**
 * Dashboard editor. Direct edits (text, blocks, facts, design, pages) are JSON Patches sent to
 * /api/sites/:id/patch and applied in code: no model call, no tokens. Only the AI tab talks to
 * the model.
 */

import { EDITOR_STARTER_TEXT } from "@sb/spec/starter";

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
  site: { id: string; name: string; slug: string; status: string; published_version: number | null; published_at: string | null };
  version: number | null;
  spec: Obj | null;
  events: { id: string; stage: string; level: string; message: string; created_at: string; data: unknown }[];
  chat: { id: string; role: string; content: string; result: unknown }[];
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

const STYLE = `
.ed{display:grid;grid-template-columns:420px 1fr;height:calc(100vh - 57px)}
.panel{overflow:auto;border-right:1px solid var(--line);background:var(--panel)}
.tabs{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:2}
.tabs button{border:0;background:none;padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit}
.tabs button[aria-selected=true]{background:#e8eefc;color:#1f3fb0;font-weight:600}
.pane{padding:12px 14px}
.outline{list-style:none;margin:0;padding:0}
.outline li{display:flex;align-items:center;gap:4px;padding:6px;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;background:#fff;cursor:pointer}
.outline li.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.outline .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.icon{border:1px solid var(--line);background:#fff;border-radius:4px;min-width:28px;height:28px;cursor:pointer}
fieldset{border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:8px 0}legend{font-weight:600;font-size:13px}
.count{font-size:12px;color:var(--muted);text-align:right}
.stage{display:flex;flex-direction:column;align-items:center;overflow:auto;background:#e9ecf1;padding:16px}
.frame-wrap{background:#fff;box-shadow:0 1px 3px rgb(0 0 0/.15)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#16181d;color:#fff;padding:8px 14px;border-radius:6px;z-index:10;max-width:90vw}
.chat{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}.msg{padding:8px;border-radius:6px;background:#f1f3f6}.msg.user{background:#e8eefc}
.log{font-size:12px;max-height:260px;overflow:auto;background:#fafbfc;border:1px solid var(--line);border-radius:6px;padding:6px}
.warn{background:#fff8e1;border:1px solid #f1d27a;border-radius:6px;padding:8px;font-size:13px}
@media (max-width:900px){.ed{grid-template-columns:1fr;height:auto}.panel{border-right:0}}
`;

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

function schedulePoll(): void {
  window.clearTimeout(pollTimer);
  const active = state.site.status === "generating" || state.site.status === "editing";
  if (active) pollTimer = window.setTimeout(() => void load().then(reloadPreview), 2000);
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
    toast = rerender ? `Ni shranjeno: ${(e as Error).message}` : `Še ni shranjeno — dopolnite polja. (${(e as Error).message.split(String.fromCharCode(10))[0]})`;
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
            { class: "warn row" },
            "Manjka — ",
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
        ...(optional ? [h("option", { value: "" }, "—")] : []),
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
          h("button", { class: "icon", type: "button", title: "Gor", disabled: i === 0, onClick: () => restructure(() => arr.splice(i - 1, 0, ...arr.splice(i, 1))) }, "↑"),
          h("button", { class: "icon", type: "button", title: "Dol", disabled: i === arr.length - 1, onClick: () => restructure(() => arr.splice(i + 1, 0, ...arr.splice(i, 1))) }, "↓"),
          h("button", { class: "icon", type: "button", title: "Odstrani", disabled: arr.length <= Number(s.minItems ?? 0), onClick: () => restructure(() => arr.splice(i, 1)) }, "✕"),
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
          h("select", { onChange: (e: Event) => sink.edit((e.target as HTMLSelectElement).value) }, ...imgs.map((im) => h("option", { value: im.id as string, selected: im.id === value }, `${im.id} — ${String(im.alt).slice(0, 50)}`))),
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
    list.append(
      h(
        "li",
        { class: id === selected ? "sel" : "", onClick: () => select(id) },
        h("span", { class: "t" }, h("strong", {}, label(s.type as string)), " ", h("span", { class: "muted" }, sectionTitle(s))),
        !system && h("button", { class: "icon", title: "Premakni gor", disabled: i === 0, onClick: (e: Event) => { e.stopPropagation(); void patch([{ op: "move", from: `/pages/${pi}/sections/${i}`, path: `/pages/${pi}/sections/${i - 1}` }], "premik"); } }, "↑"),
        !system && h("button", { class: "icon", title: "Premakni dol", disabled: i === secs.length - 1, onClick: (e: Event) => { e.stopPropagation(); void patch([{ op: "move", from: `/pages/${pi}/sections/${i}`, path: `/pages/${pi}/sections/${i + 1}` }], "premik"); } }, "↓"),
        !system && h("button", { class: "icon", title: "Podvoji", onClick: (e: Event) => { e.stopPropagation(); void patch([{ op: "add", path: `/pages/${pi}/sections/${i + 1}`, value: { ...structuredClone(s), id: newSectionId(s.type as string) } }], "podvojen razdelek"); } }, "⧉"),
        !system && h("button", { class: "icon", title: "Izbriši", onClick: (e: Event) => { e.stopPropagation(); if (confirm(`Izbrišem razdelek »${label(s.type as string)}«?`)) void patch([{ op: "remove", path: `/pages/${pi}/sections/${i}` }], "izbrisan razdelek"); } }, "✕"),
      ),
    );
  });
  pane.append(h("h3", {}, "Razdelki"), list);

  if (catalogue && currentPage()?.kind !== "privacy" && currentPage()?.kind !== "accessibility" && currentPage()?.kind !== "not-found") {
    const addable = catalogue.sections.filter((c) => c.canAdd);
    const sel = h("select", {}, ...addable.map((c) => h("option", { value: c.type }, label(c.type))));
    const at = selected ? secs.findIndex((s) => s.id === selected) + 1 : secs.length;
    pane.append(h("div", { class: "row" }, sel, h("button", { class: "btn", type: "button", onClick: () => void post("/sections", { pageIndex: pi, index: at, type: sel.value }, "Razdelek dodan.") }, "+ Dodaj razdelek")));
  }

  const si = secs.findIndex((s) => s.id === selected);
  const s = secs[si];
  if (s && catalogue) {
    const info = sectionInfo(s.type as string);
    const base = `/pages/${pi}/sections/${si}`;
    pane.append(h("h3", {}, label(s.type as string)));
    if (info) {
      pane.append(
        h("p", { class: "muted" }, "Dvojni klik na besedilo v predogledu ga uredi neposredno."),
        h("div", { class: "row" },
          h("label", {}, "Različica"),
          h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: `${base}/variant`, value: (e.target as HTMLSelectElement).value }], "različica") }, ...info.variants.map((v) => h("option", { value: v, selected: v === s.variant }, v))),
          h("label", {}, "Ozadje"),
          h("select", { onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; void patch([s.tone === undefined ? { op: "add", path: `${base}/tone`, value: v } : { op: "replace", path: `${base}/tone`, value: v }], "ozadje"); } },
            ...["default", "alt", "inverse"].map((t) => h("option", { value: t, selected: (s.tone ?? "default") === t }, { default: "Osnovno", alt: "Izmenično", inverse: "Obratno (temno)" }[t]!))),
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
  pane.append(h("p", { class: "muted" }, "Podatki se prikažejo v glavi, nogi, kontaktu in delovnem času. Manjkajoči podatki so označeni in preprečujejo objavo."));
  pane.append(formAt("/business", catalogue.business, state.spec.business as Json, "Podatki o podjetju", "podatki"));
  const chrome = state.spec.chrome as Obj;
  const header = chrome.header as Obj;
  pane.append(
    h("h3", {}, "Glava in noga"),
    h("label", {}, "Glava"),
    h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/header/variant", value: (e.target as HTMLSelectElement).value }], "glava") }, ...["bar", "split-cta", "stacked"].map((v) => h("option", { value: v, selected: v === header.variant }, v))),
    h("label", {}, "Gumb v glavi"),
    h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/header/cta", value: (e.target as HTMLSelectElement).value }], "gumb v glavi") }, ...["call", "booking", "directions", "none"].map((v) => h("option", { value: v, selected: v === header.cta }, { call: "Pokliči", booking: "Rezervacija", directions: "Navodila za pot", none: "Brez" }[v]!))),
    h("label", {}, "Ozadje glave"),
    h("select", { onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; void patch([{ op: header.tone === undefined ? "add" : "replace", path: "/chrome/header/tone", value: v }], "ozadje glave"); } }, ...["default", "alt", "inverse"].map((v) => h("option", { value: v, selected: v === (header.tone ?? "default") }, { default: "Kot stran", alt: "Izmenično", inverse: "Temno" }[v]!))),
    h("label", {}, "Noga"),
    h("select", { onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/footer/variant", value: (e.target as HTMLSelectElement).value }], "noga") }, ...["columns", "compact"].map((v) => h("option", { value: v, selected: v === (chrome.footer as Obj).variant }, v))),
    h("label", {}, h("input", { type: "checkbox", checked: chrome.mobileActionBar === true, onChange: (e: Event) => void patch([{ op: "replace", path: "/chrome/mobileActionBar", value: (e.target as HTMLInputElement).checked }], "vrstica za klic") }), " Spodnja vrstica za klic in pot na telefonu"),
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
    h("p", { class: "muted" }, dir?.summary ?? ""),
    h("label", {}, "Pisave"),
    h("select", { onChange: (e: Event) => set("fontPair", (e.target as HTMLSelectElement).value) }, ...(dir?.fontPairs ?? []).map((id) => h("option", { value: id, selected: id === d.fontPair }, catalogue!.fontPairs.find((f) => f.id === id)?.label ?? id))),
  );
  const colors = d.colors as Obj;
  const NAMES: Record<string, string> = { background: "Ozadje strani", surface: "Izmenično ozadje", text: "Besedilo", muted: "Drugotno besedilo", primary: "Glavna barva (gumbi)", onPrimary: "Besedilo na gumbih", accent: "Poudarek", border: "Obrobe", inverse: "Temni razdelki", onInverse: "Besedilo na temnem" };
  const fs = h("fieldset", {}, h("legend", {}, "Barve (kontrast se preveri samodejno)"));
  for (const [k, v] of Object.entries(colors)) {
    const input = h("input", { type: "color", value: v as string });
    input.addEventListener("change", () => set(`colors/${k}`, input.value));
    fs.append(h("div", { class: "row" }, input, h("span", {}, NAMES[k] ?? k), h("code", { class: "muted" }, v as string)));
  }
  pane.append(fs);
  const r = (dir?.ranges ?? {}) as Record<string, [number, number] | string[]>;
  const num = (k: string, title: string, step: string) => {
    const [lo, hi] = (r[k] as [number, number]) ?? [0, 100];
    const input = h("input", { type: "number", min: lo, max: hi, step, value: d[k] as number });
    input.addEventListener("change", () => set(k, Number(input.value)));
    return h("div", {}, h("label", {}, `${title} (${lo}–${hi})`), input);
  };
  const choice = (k: string, title: string) =>
    h("div", {}, h("label", {}, title), h("select", { onChange: (e: Event) => set(k, (e.target as HTMLSelectElement).value) }, ...((r[k] as string[]) ?? []).map((v) => h("option", { value: v, selected: v === d[k] }, v))));
  pane.append(num("radius", "Zaobljenost (px)", "1"), num("baseFontSize", "Osnovna velikost pisave", "1"), num("scale", "Razmerje velikosti naslovov", "0.005"), num("headingWeight", "Debelina naslovov", "50"), num("headingTracking", "Razmik črk v naslovih (em)", "0.005"), choice("density", "Gostota"), choice("shadow", "Senca"), choice("headingCase", "Velike črke v naslovih"));
  return pane;
}

function pagesPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  if (!state.spec) return pane;
  pages().forEach((p, i) => {
    const nav = p.nav as Obj;
    const seo = p.seo as Obj;
    const system = p.kind !== "home" && p.kind !== "standard";
    const fs = h("fieldset", {}, h("legend", {}, `${nav.label} — ${pageFileOf(p)}`));
    const text = (ptr: string, title: string, val: string, max: number) => {
      const input = h("input", { type: "text", maxlength: max, value: val });
      const save = autosave(ptr, "nastavitve strani");
      input.addEventListener("input", () => save(input.value));
      return h("div", {}, h("label", {}, title), input);
    };
    fs.append(text(`/pages/${i}/nav/label`, "Ime v meniju", nav.label as string, 24), text(`/pages/${i}/seo/title`, "SEO naslov", seo.title as string, 60), text(`/pages/${i}/seo/description`, "SEO opis", seo.description as string, 160));
    if (!system) {
      fs.append(
        h("label", {}, h("input", { type: "checkbox", checked: nav.show === true, onChange: (e: Event) => void patch([{ op: "replace", path: `/pages/${i}/nav/show`, value: (e.target as HTMLInputElement).checked }], "meni") }), " Prikaži v meniju"),
        h("div", { class: "row" },
          h("button", { class: "btn sm", type: "button", disabled: i <= 1 || p.kind === "home", onClick: () => void patch([{ op: "move", from: `/pages/${i}`, path: `/pages/${i - 1}` }], "vrstni red strani") }, "↑"),
          h("button", { class: "btn sm", type: "button", disabled: p.kind === "home" || pages()[i + 1]?.kind !== "standard", onClick: () => void patch([{ op: "move", from: `/pages/${i}`, path: `/pages/${i + 1}` }], "vrstni red strani") }, "↓"),
          p.kind === "standard" && h("button", { class: "btn sm danger", type: "button", onClick: () => { if (confirm(`Izbrišem stran ${nav.label}?`)) { pageIndex = 0; void patch([{ op: "remove", path: `/pages/${i}` }], "izbrisana stran"); } } }, "Izbriši stran"),
        ),
      );
    }
    pane.append(fs);
  });
  const slug = h("input", { type: "text", placeholder: "npr. cenik" });
  const name = h("input", { type: "text", placeholder: "npr. Cenik", maxlength: 24 });
  pane.append(h("h3", {}, "Nova stran"), h("label", {}, "Ime v meniju"), name, h("label", {}, "Naslov datoteke (brez šumnikov)"), slug,
    h("p", {}, h("button", { class: "btn", type: "button", onClick: () => void post("/pages", { slug: slug.value.trim(), label: name.value.trim() }, "Stran dodana.") }, "+ Dodaj stran")));
  return pane;
}

function aiPane(): HTMLElement {
  const pane = h("div", { class: "pane" });
  pane.append(h("p", { class: "muted" }, "Pomočnik z umetno inteligenco je za nove vsebine (npr. »dodaj pogosta vprašanja«). Vsako sporočilo porabi žetone. Besedila, vrstni red in podatke urejajte neposredno — brez porabe."));
  const chat = h("div", { class: "chat" }, ...state.chat.map((m) => h("div", { class: `msg ${m.role}` }, m.content)));
  const input = h("textarea", { rows: 3, placeholder: "Npr. dodaj pogosta vprašanja o parkiranju" });
  pane.append(
    chat,
    input,
    h("div", { class: "row" },
      h("button", { class: "btn primary", type: "button", disabled: !state.spec || state.site.status === "editing", onClick: async () => { if (!input.value.trim()) return; try { await api("/chat", { method: "POST", body: JSON.stringify({ message: input.value }) }); input.value = ""; toast = "Poslano pomočniku."; } catch (e) { toast = (e as Error).message; } await load(); } }, "Pošlji"),
      h("button", { class: "btn", type: "button", disabled: state.site.status === "generating", onClick: () => { if (confirm("Ustvarim celotno stran znova? To porabi žetone in zamenja trenutno vsebino z novo različico.")) void post("/generate", { scope: "full" }, "Ustvarjanje se je začelo."); } }, "Ustvari celotno stran"),
    ),
    h("h3", {}, "Stroški modela"),
    h("table", {}, h("tr", {}, h("th", {}, "Faza"), h("th", {}, "Klici"), h("th", {}, "Vhod"), h("th", {}, "Izhod"), h("th", {}, "Predpomnilnik"), h("th", {}, "€")),
      ...state.cost.map((c) => h("tr", {}, h("td", {}, c.stage), h("td", {}, String(c.calls)), h("td", {}, String(c.input)), h("td", {}, String(c.output)), h("td", {}, `${c.cacheRead}/${c.cacheWrite}`), h("td", {}, c.eur.toFixed(4)))),
      h("tr", {}, h("th", {}, "Skupaj"), h("td", {}), h("td", {}), h("td", {}), h("td", {}), h("th", {}, state.cost.reduce((a, c) => a + c.eur, 0).toFixed(4)))),
    h("h3", {}, "Dnevnik"),
    h("div", { class: "log" }, ...state.events.slice(-80).map((e) => h("div", { class: e.level === "error" ? "err" : "" }, `${new Date(e.created_at).toLocaleTimeString("sl-SI")} ${e.stage}: ${e.message}`))),
  );
  return pane;
}

function versionsPane(): HTMLElement {
  const SRC: Record<string, string> = { generate: "ustvarjeno", critique: "samopregled", edit: "pomočnik", manual: "urejanje", revert: "povrnjeno" };
  return h("div", { class: "pane" },
    h("table", {}, ...state.versions.map((v) => h("tr", {},
      h("td", {}, `v${v.version}`),
      h("td", {}, SRC[v.source] ?? v.source, v.message ? h("div", { class: "muted" }, v.message.slice(0, 80)) : null),
      h("td", {}, v.version === state.version ? h("strong", {}, "trenutna") : h("button", { class: "btn sm", type: "button", onClick: () => void api("/revert", { method: "POST", body: JSON.stringify({ version: v.version }) }).then(() => { toast = `Povrnjeno na v${v.version}.`; return load(); }).then(reloadPreview) }, "Povrni")),
    ))),
  );
}

// ---------- Preview ----------
let frame: HTMLIFrameElement | null = null;

function previewUrl(): string {
  const p = currentPage();
  return `/preview/${siteId}/${p ? pageFileOf(p) : "index.html"}?v=${state.version ?? ""}`;
}

function reloadPreview(): void {
  if (!frame || !state.spec) return;
  const y = frame.contentWindow?.scrollY ?? 0;
  frame.addEventListener("load", () => frame?.contentWindow?.scrollTo(0, y), { once: true });
  frame.src = previewUrl();
}

/** Edit mode helpers run inside the preview document at runtime; the rendered HTML itself is unchanged. */
function attachEditing(): void {
  const doc = frame?.contentDocument;
  if (!doc || !editMode) return;
  const style = doc.createElement("style");
  style.textContent = `main section{cursor:pointer} main section:hover{outline:2px dashed #1f5eff;outline-offset:-2px} main section[data-sb-selected]{outline:3px solid #1f5eff;outline-offset:-3px} [contenteditable]{outline:2px solid #f59e0b!important;cursor:text}`;
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
function render(): void {
  const s = state.site;
  const active = s.status === "generating" || s.status === "editing";
  const prev = state.versions.find((v) => v.version === (state.version ?? 0) - 1);
  const top = h("div", { class: "top" },
    h("a", { href: "/" }, "← Strani"),
    h("h1", {}, (state.spec?.business as Obj | undefined)?.name as string ?? s.name),
    h("span", { class: "status" }, active ? `${s.status} …` : s.status),
    state.version ? h("span", { class: "muted", id: "ed-version" }, `v${state.version}`) : null,
    h("span", { class: "sp" }),
    h("button", { class: "btn sm", type: "button", disabled: !prev, title: "Razveljavi zadnjo spremembo", onClick: () => void undo() }, "↶ Razveljavi"),
    h("button", { class: "btn sm", type: "button", "aria-pressed": device === "mobile", onClick: () => { device = "mobile"; render(); } }, "Telefon"),
    h("button", { class: "btn sm", type: "button", "aria-pressed": device === "desktop", onClick: () => { device = "desktop"; render(); } }, "Računalnik"),
    h("label", { style: { margin: 0, fontWeight: 400 } }, h("input", { type: "checkbox", checked: editMode, onChange: (e: Event) => { editMode = (e.target as HTMLInputElement).checked; frame = null; render(); } }), " Urejanje"),
    state.spec ? h("a", { class: "btn sm", href: previewUrl(), target: "_blank" }, "Odpri predogled") : null,
    h("a", { class: "btn sm", href: `/sites/${siteId}/messages` }, `Sporočila (${state.messages})`),
    state.spec ? h("a", { class: "btn sm", href: `/api/sites/${siteId}/export` }, "Izvozi .zip") : null,
    h("button", { class: "btn sm primary", type: "button", disabled: !state.spec || state.blockers.length > 0, title: state.blockers.length ? "Najprej izpolnite manjkajoče podatke" : "", onClick: async () => { try { const r = await api<{ url: string }>("/publish", { method: "POST", body: "{}" }); toast = `Objavljeno: ${r.url}`; } catch (e) { toast = (e as Error).message; } await load(); } }, "Objavi"),
    s.published_version ? h("a", { href: `/s/${s.slug}/`, target: "_blank" }, `/s/${s.slug}/`) : null,
    h("span", { class: "muted" }, `€${state.spendToday.toFixed(2)} / €${state.cap.toFixed(2)} danes`),
  );

  const tabs: [typeof tab, string][] = [["content", "Vsebina"], ["facts", "Podatki"], ["design", "Oblikovanje"], ["pages", "Strani"], ["ai", "Pomočnik AI"], ["versions", "Različice"]];
  const panel = h("div", { class: "panel" },
    h("div", { class: "tabs", role: "tablist" }, ...tabs.map(([k, l]) => h("button", { role: "tab", "aria-selected": tab === k, onClick: () => { tab = k; render(); } }, l))),
    state.blockers.length && state.spec ? h("div", { class: "pane" }, h("div", { class: "warn" }, blockerSummary(state.placeholders.length, state.blockers.length - state.placeholders.length), h("details", {}, h("summary", {}, "Seznam"), h("ul", {}, ...state.blockers.slice(0, 30).map((b) => h("li", {}, b)))))) : null,
    !state.spec ? h("div", { class: "pane" }, h("p", {}, active ? "Stran se ustvarja …" : "Stran še nima vsebine."), h("div", { class: "log" }, ...state.events.map((e) => h("div", { class: e.level === "error" ? "err" : "" }, `${e.stage}: ${e.message}`)))) : null,
    state.spec ? { content: contentPane, facts: factsPane, design: designPane, pages: pagesPane, ai: aiPane, versions: versionsPane }[tab]() : null,
  );

  const width = device === "mobile" ? 360 : 1280;
  const stage = h("div", { class: "stage" });
  if (state.spec) {
    const avail = Math.max(320, (stage.clientWidth || window.innerWidth - 460) - 32);
    const scale = device === "desktop" ? Math.min(1, avail / 1280) : 1;
    const f = frame && frame.dataset.width === String(width) ? frame : h("iframe", { title: "Predogled strani", "data-width": String(width), style: { width: `${width}px`, height: `${Math.round(820 / scale)}px`, border: "0", display: "block" } });
    f.style.transform = `scale(${scale})`;
    f.style.transformOrigin = "top left";
    if (f !== frame) {
      frame = f;
      f.addEventListener("load", attachEditing);
      f.src = previewUrl();
    }
    const wrap = h("div", { class: "frame-wrap", style: { width: `${width * scale}px`, height: `${820}px`, overflow: "hidden" } }, f);
    stage.append(wrap);
  }
  const shell = h("div", {}, h("style", {}, STYLE), top, h("div", { class: "ed" }, panel, stage));
  root.replaceChildren(shell);
  linkLabels(shell);
  if (frame) {
    // Keep the selection highlight in sync when the frame survives a re-render.
    const doc = frame.contentDocument;
    doc?.querySelectorAll("[data-sb-selected]").forEach((n) => n.removeAttribute("data-sb-selected"));
    if (selected && editMode) doc?.getElementById(selected)?.setAttribute("data-sb-selected", "");
  }
  showToast();
}

/** Undo = revert to the version before the current one (read at click time, not render time). */
async function undo(): Promise<void> {
  const target = (state.version ?? 0) - 1;
  if (target < 1) return;
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
