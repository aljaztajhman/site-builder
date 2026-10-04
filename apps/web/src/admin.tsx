import type { Context, Hono } from "hono";
import { PLAN_KEYS, type AppConfig, type PlanKey } from "@sb/config";
import { POOLS, isDisposableEmailDomain, normaliseEmail, type AccountListRow, type AllowListRow, type Pool, type Repo } from "@sb/platform";
import { csrfOk, hashToken, newToken, type AppEnv } from "./access.ts";
import { Doc, TopBar, html } from "./pages.tsx";
import { formatDate, formatDateTime, formatEur } from "./ui/labels.ts";

/**
 * The admin's page (ACCESS_PASSWORD only, see access.ts): the allow-list of emails with paid-tier
 * rights before billing (sb-full-access) and the list of accounts.
 */

export interface AdminDeps {
  repo: Repo;
  config: AppConfig;
  appUrl?: string;
}

export function registerAdminRoutes(app: Hono<AppEnv>, deps: AdminDeps): void {
  const { repo, config } = deps;

  const show = async (c: Context<AppEnv>, flash?: { text: string; bad?: boolean }, status: 200 | 400 | 403 = 200) => {
    const cap = config.limits.dailyModelSpendCapEur;
    const pools = [];
    for (const pool of POOLS) pools.push({ pool, size: config.tiers.pools[pool] * cap, ...(await repo.usage.pool(pool)) });
    return c.html(
      adminPage({
        csrf: c.get("csrf"),
        allowList: await repo.accounts.allowList(),
        accounts: await repo.accounts.list(),
        spendToday: await repo.spendToday(),
        cap,
        pools,
        holds: await repo.usage.holds(),
        warnAt: config.tiers.pools.warnAt,
        plans: { standard: config.plans.standard.name, premium: config.plans.premium.name },
        planPrices: { standard: config.plans.standard.monthlyEur, premium: config.plans.premium.monthlyEur },
        allowances: { standard: config.plans.standard.ai.allowanceEurPerMonth, premium: config.plans.premium.ai.allowanceEurPerMonth },
        freeLifetimeEur: config.tiers.free.lifetimeEur,
        founding: config.plans.standard.foundingOffer ? { ...config.plans.standard.foundingOffer, taken: await repo.accounts.foundingTaken() } : null,
        ...(flash ? { flash } : {}),
      }),
      status,
    );
  };

  app.get("/admin", (c) => show(c));

  // Pause a pool for some hours (a hold the size of the pool), or end the holds. The deployed smoke test
  // uses this to empty the free pools and check that paid jobs still run.
  app.post("/admin/pools/hold", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    if (!csrfOk(c, body)) return show(c, { text: "Obrazec je potekel. Poskusite znova.", bad: true }, 403);
    const pool = POOLS.find((p) => p === body.pool);
    const hours = Number(body.hours ?? 1);
    if (!pool || !Number.isFinite(hours) || hours <= 0 || hours > 48) return show(c, { text: "Neveljaven bazen ali čas.", bad: true }, 400);
    await repo.usage.hold(pool, config.tiers.pools[pool] * config.limits.dailyModelSpendCapEur, Math.round(hours * 60));
    console.log(`[admin] pool ${pool} held for ${hours} h`);
    return show(c, { text: `Bazen »${POOL_LABEL[pool]}« je ustavljen za ${hours} h.` });
  });
  app.post("/admin/pools/release", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    if (!csrfOk(c, body)) return show(c, { text: "Obrazec je potekel. Poskusite znova.", bad: true }, 403);
    const pool = POOLS.find((p) => p === body.pool);
    const n = await repo.usage.releaseHolds(pool);
    console.log(`[admin] ${n} pool hold(s) released${pool ? ` (${pool})` : ""}`);
    return show(c, { text: n ? "Bazen spet deluje." : "Ni bilo ustavljenih bazenov." });
  });

  app.post("/admin/allow-list", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    if (!csrfOk(c, body)) return show(c, { text: "Obrazec je potekel. Poskusite znova.", bad: true }, 403);
    const email = normaliseEmail(body.email);
    if (!email) return show(c, { text: "To ni veljaven e-poštni naslov.", bad: true }, 400);
    if (isDisposableEmailDomain(email.domain)) return show(c, { text: "Naslov za enkratno uporabo ne more biti na seznamu.", bad: true }, 400);
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
    const plan = body.plan === "premium" ? "premium" : "standard";
    // One of the founding offer's places (it-upsells): only for the plan that has the offer.
    const founding = body.founding === "on" && !!config.plans[plan].foundingOffer;
    await repo.accounts.allow(email.email, email.key, note, plan, founding);
    return show(c, { text: `${email.email} ima zdaj paket ${config.plans[plan].name}${founding ? " z ustanovno ceno" : ""}.` });
  });

  app.post("/admin/allow-list/remove", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    if (!csrfOk(c, body)) return show(c, { text: "Obrazec je potekel. Poskusite znova.", bad: true }, 403);
    const key = typeof body.key === "string" ? body.key : "";
    const removed = await repo.accounts.disallow(key);
    return show(c, removed ? { text: `${key} ni več na seznamu.` } : { text: "Tega naslova ni na seznamu.", bad: true });
  });

  // A sign-in link for an address, made by the admin (support, and the deployed smoke test, which has no inbox).
  app.post("/admin/login-link", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown; next?: unknown };
    const email = normaliseEmail(body.email);
    if (!email) return c.json({ error: "invalid email" }, 400);
    const base = deps.appUrl ?? new URL(c.req.url).origin;
    const token = newToken();
    await repo.accounts.createLoginToken({
      tokenHash: hashToken(token),
      email: email.email,
      emailKey: email.key,
      next: typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : null,
      deviceId: null,
      ipKey: "",
      ttlMinutes: config.accounts.magicLink.ttlMinutes,
    });
    console.log(`[admin] sign-in link made for ${email.key}`);
    return c.json({ url: `${base.replace(/\/$/, "")}/login/link?t=${token}` });
  });
}

const POOL_LABEL: Record<Pool, string> = { anonymous: "brez prijave", free: "brezplačni računi", paid: "naročniki in skrbnik" };

interface AdminProps {
  csrf: string;
  allowList: AllowListRow[];
  accounts: AccountListRow[];
  spendToday: number;
  cap: number;
  pools: { pool: Pool; size: number; spent: number; held: number }[];
  warnAt: number;
  holds: { pool: Pool; eur: number; until: string }[];
  /** Plan names (config), for the allow-list's plan choice. */
  plans: Record<PlanKey, string>;
  /** Monthly prices (VAT included) and monthly AI allowances per plan, for the summary and each account. */
  planPrices: Record<PlanKey, number>;
  allowances: Record<PlanKey, number>;
  freeLifetimeEur: number;
  /** The founding offer (Osnovni's first year) and how many of its places are taken; null without an offer. */
  founding?: { customers: number; firstYearEur: number; taken: number } | null;
  flash?: { text: string; bad?: boolean };
}

export function adminPage({ csrf, allowList, accounts, spendToday, cap, pools, holds, warnAt, plans, planPrices, allowances, freeLifetimeEur, founding = null, flash }: AdminProps): string {
  // Accounts per plan and what they bring and cost this month (planned prices while billing is off).
  const byPlan = (p: PlanKey | null) => accounts.filter((a) => a.plan === p);
  const monthlyRevenue = PLAN_KEYS.reduce((sum, k) => sum + byPlan(k).length * planPrices[k], 0);
  const aiMonth = accounts.reduce((sum, a) => sum + a.ai_month_eur, 0);
  const planLabel = (p: PlanKey | null) => (p ? plans[p] : "Brezplačno");
  return html(
    <Doc title="Skrbnik">
      <TopBar spend={{ today: spendToday, cap }} csrf={csrf} admin>
        <a className="btn quiet sm" href="/sites">
          Strani
        </a>
      </TopBar>
      <main className="messages">
        <h1>Skrbnik</h1>
        {flash && (
          <p className={flash.bad ? "note bad" : "note"} role={flash.bad ? "alert" : "status"}>
            {flash.text}
          </p>
        )}
        <h2>Poraba danes</h2>
        <p className="muted">{`Vsak bazen je delež dnevne omejitve (${formatEur(cap)}). »Zadržano« je ocena za opravila, ki še tečejo. Ko porabljeno doseže ${Math.round(warnAt * 100)} % bazena, delavec to zapiše v dnevnik.`}</p>
        {pools.map((p) => {
          const hold = holds.find((h) => h.pool === p.pool);
          return (
            <article className="message" key={p.pool}>
              <dl>
                <dt>Bazen</dt>
                <dd>{POOL_LABEL[p.pool]}</dd>
                <dt>Porabljeno</dt>
                <dd className="num">{`${formatEur(p.spent)} od ${formatEur(p.size)}`}</dd>
                <dt>Zadržano</dt>
                <dd className="num">{formatEur(p.held)}</dd>
                {hold && (
                  <>
                    <dt>Ustavljen</dt>
                    <dd>{`do ${formatDateTime(hold.until)}`}</dd>
                  </>
                )}
              </dl>
              <form method="post" action={hold ? "/admin/pools/release" : "/admin/pools/hold"}>
                <input type="hidden" name="_csrf" value={csrf} />
                <input type="hidden" name="pool" value={p.pool} />
                {!hold && <input type="hidden" name="hours" value="24" />}
                <button className={hold ? "btn sm" : "btn sm danger"} type="submit">
                  {hold ? "Spet zaženi" : "Ustavi za 24 h"}
                </button>
              </form>
            </article>
          );
        })}
        <h2>Dostop do celotne strani</h2>
        <p className="muted">Naslovi s tega seznama dobijo pravice naročnine (celotna stran, objava, prenos), dokler plačevanja še ni. Velja za račun s tem naslovom, tudi če se še ni prijavil.</p>
        <form method="post" action="/admin/allow-list" className="message">
          <input type="hidden" name="_csrf" value={csrf} />
          <label htmlFor="al-email">E-poštni naslov</label>
          <input id="al-email" type="email" name="email" required autoComplete="off" />
          <label htmlFor="al-plan">Paket</label>
          <select id="al-plan" name="plan">
            {PLAN_KEYS.map((k) => (
              <option key={k} value={k}>
                {plans[k]}
              </option>
            ))}
          </select>
          <label htmlFor="al-note">Opomba (neobvezno)</label>
          <input id="al-note" type="text" name="note" maxLength={200} />
          {founding && (
            <label>
              <input type="checkbox" name="founding" />
              {` Ustanovna cena (${plans.standard}: prvo leto ${founding.firstYearEur} €; zasedenih ${founding.taken} od ${founding.customers} mest)`}
            </label>
          )}
          <button className="btn primary" type="submit">
            Dodaj
          </button>
        </form>
        {allowList.map((a) => (
          <article className="message" key={a.email_key}>
            <p className="when num">{`Od ${formatDate(a.added_at)}`}</p>
            <dl>
              <dt>E-pošta</dt>
              <dd>{a.email}</dd>
              <dt>Paket</dt>
              <dd>{`${plans[a.plan]}${a.founding_at ? ", ustanovna cena" : ""}`}</dd>
              {a.note && (
                <>
                  <dt>Opomba</dt>
                  <dd>{a.note}</dd>
                </>
              )}
            </dl>
            <form method="post" action="/admin/allow-list/remove">
              <input type="hidden" name="_csrf" value={csrf} />
              <input type="hidden" name="key" value={a.email_key} />
              <button className="btn sm danger" type="submit">
                Odstrani
              </button>
            </form>
          </article>
        ))}
        <h2>
          Računi <span className="muted num">{accounts.length}</span>
        </h2>
        <p className="muted num" id="plan-summary">
          {`${[null, ...PLAN_KEYS].map((k) => `${planLabel(k as PlanKey | null)} ${byPlan(k as PlanKey | null).length}`).join(" · ")}. Mesečno po načrtovanih cenah ${formatEur(monthlyRevenue)} z DDV, pomočnik ta mesec ${formatEur(aiMonth)}.`}
        </p>
        {accounts.length === 0 && <p className="muted">Še nihče se ni prijavil.</p>}
        {accounts.map((a) => {
          // Over its plan's monthly allowance (or a free account over its lifetime €): worth a look.
          const limit = a.plan ? allowances[a.plan] : freeLifetimeEur;
          const spent = a.plan ? a.ai_month_eur : a.ai_total_eur;
          return (
            <article className="message" key={a.id}>
              <p className="when num">{`Od ${formatDate(a.created_at)}${a.last_login_at ? `, zadnja prijava ${formatDateTime(a.last_login_at)}` : ""}`}</p>
              <dl>
                <dt>E-pošta</dt>
                <dd>{a.email}</dd>
                <dt>Paket</dt>
                <dd>{a.plan && a.allowed_since ? `${planLabel(a.plan)} od ${formatDate(a.allowed_since)}` : planLabel(null)}</dd>
                <dt>Strani</dt>
                <dd className="num">{`${a.sites}, objavljenih ${a.published}`}</dd>
                <dt>Pomočnik</dt>
                <dd className={`num${spent > limit ? " bad" : ""}`}>
                  {a.plan
                    ? `${formatEur(a.ai_month_eur)} ta mesec od ${formatEur(limit)}, skupaj ${formatEur(a.ai_total_eur)}`
                    : `${formatEur(a.ai_total_eur)} skupaj od ${formatEur(limit)} brezplačnega`}
                </dd>
              </dl>
              <form method="post" action="/admin/allow-list" className="row">
                <input type="hidden" name="_csrf" value={csrf} />
                <input type="hidden" name="email" value={a.email} />
                <label htmlFor={`plan-${a.id}`}>Paket</label>
                <select id={`plan-${a.id}`} name="plan">
                  {PLAN_KEYS.map((k) => (
                    <option key={k} value={k} selected={a.plan === k}>
                      {plans[k]}
                    </option>
                  ))}
                </select>
                <button className="btn sm" type="submit">
                  {a.plan ? "Zamenjaj paket" : "Dodeli paket"}
                </button>
              </form>
            </article>
          );
        })}
      </main>
    </Doc>,
  );
}
