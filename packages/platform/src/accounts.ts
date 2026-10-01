import { randomBytes } from "node:crypto";
import type { Db } from "./db.ts";

export interface AccountRow {
  id: string;
  email: string;
  email_key: string;
  created_at: string;
  last_login_at: string | null;
}

export interface AllowListRow {
  email_key: string;
  email: string;
  note: string | null;
  added_at: string;
}

export interface LoginTokenRow {
  token_hash: string;
  email: string;
  email_key: string;
  next: string | null;
  device_id: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

/** Accounts, the owner's allow-list, magic-link tokens and sessions. Tokens arrive here already hashed. */
export class Accounts {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<AccountRow | null> {
    const { rows } = await this.db.query<AccountRow>("select * from accounts where id = $1", [id]);
    return rows[0] ?? null;
  }

  async byKey(emailKey: string): Promise<AccountRow | null> {
    const { rows } = await this.db.query<AccountRow>("select * from accounts where email_key = $1", [emailKey]);
    return rows[0] ?? null;
  }

  /** The account for this inbox, created on its first sign-in; the address mail goes to is the one used last. */
  async signIn(email: string, emailKey: string): Promise<AccountRow> {
    const id = `acct_${randomBytes(8).toString("hex")}`;
    const { rows } = await this.db.query<AccountRow>(
      `insert into accounts (id, email, email_key, last_login_at) values ($1, $2, $3, now())
       on conflict (email_key) do update set email = excluded.email, last_login_at = now()
       returning *`,
      [id, email, emailKey],
    );
    return rows[0]!;
  }

  /** Every account with its allow-list entry (if any) and number of sites, newest first (admin view). */
  async list(): Promise<(AccountRow & { allowed_since: string | null; sites: number })[]> {
    const { rows } = await this.db.query<AccountRow & { allowed_since: string | null; sites: string | number }>(
      `select a.*, l.added_at as allowed_since, (select count(*) from sites s where s.account_id = a.id) as sites
         from accounts a left join allow_list l on l.email_key = a.email_key
        order by a.created_at desc limit 500`,
    );
    return rows.map((r) => ({ ...r, sites: Number(r.sites) }));
  }

  // ---------- Allow-list (full sites before billing, sb-full-access) ----------

  async allowed(emailKey: string): Promise<AllowListRow | null> {
    const { rows } = await this.db.query<AllowListRow>("select * from allow_list where email_key = $1", [emailKey]);
    return rows[0] ?? null;
  }

  async allowList(): Promise<AllowListRow[]> {
    const { rows } = await this.db.query<AllowListRow>("select * from allow_list order by added_at desc");
    return rows;
  }

  async allow(email: string, emailKey: string, note: string | null): Promise<void> {
    await this.db.query(
      "insert into allow_list (email_key, email, note) values ($1, $2, $3) on conflict (email_key) do update set note = coalesce(excluded.note, allow_list.note)",
      [emailKey, email, note],
    );
  }

  async disallow(emailKey: string): Promise<boolean> {
    const { rows } = await this.db.query("delete from allow_list where email_key = $1 returning email_key", [emailKey]);
    return rows.length > 0;
  }

  // ---------- Magic-link tokens ----------

  async createLoginToken(t: { tokenHash: string; email: string; emailKey: string; next: string | null; deviceId: string | null; ipKey: string; ttlMinutes: number }): Promise<void> {
    await this.db.query(
      `insert into login_tokens (token_hash, email, email_key, next, device_id, ip_key, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::double precision))`,
      [t.tokenHash, t.email, t.emailKey, t.next, t.deviceId, t.ipKey, t.ttlMinutes * 60],
    );
  }

  /** Magic links requested in the last `minutes`, for one inbox or one keyed IP (rate limits). */
  async countLoginTokens(by: { emailKey: string } | { ipKey: string }, minutes: number): Promise<number> {
    const [col, val] = "emailKey" in by ? ["email_key", by.emailKey] : ["ip_key", by.ipKey];
    const { rows } = await this.db.query<{ n: string | number }>(
      `select count(*) as n from login_tokens where ${col} = $1 and created_at > now() - make_interval(mins => $2::integer)`,
      [val, minutes],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** The token if it can still be used (unused, not expired); doesn't use it. */
  async peekLoginToken(tokenHash: string): Promise<LoginTokenRow | null> {
    const { rows } = await this.db.query<LoginTokenRow>("select * from login_tokens where token_hash = $1 and used_at is null and expires_at > now()", [tokenHash]);
    return rows[0] ?? null;
  }

  /** Uses the token: one statement, so two clicks at once can't both sign in. */
  async useLoginToken(tokenHash: string): Promise<LoginTokenRow | null> {
    const { rows } = await this.db.query<LoginTokenRow>(
      "update login_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning *",
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  // ---------- Sessions ----------

  async createSession(tokenHash: string, accountId: string, days: number): Promise<void> {
    await this.db.query("insert into sessions (token_hash, account_id, expires_at) values ($1, $2, now() + make_interval(secs => $3::double precision))", [
      tokenHash,
      accountId,
      days * 86400,
    ]);
  }

  async sessionAccount(tokenHash: string): Promise<AccountRow | null> {
    const { rows } = await this.db.query<AccountRow>(
      "select a.* from sessions s join accounts a on a.id = s.account_id where s.token_hash = $1 and s.expires_at > now()",
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async endSession(tokenHash: string): Promise<void> {
    await this.db.query("delete from sessions where token_hash = $1", [tokenHash]);
  }

  /** Housekeeping: expired sessions and old tokens go; IP keys are cleared after a day (privacy policy). */
  async cleanup(): Promise<void> {
    await this.db.query("delete from sessions where expires_at <= now()");
    await this.db.query("delete from login_tokens where created_at < now() - interval '2 days'");
    await this.db.query("update login_tokens set ip_key = '' where ip_key <> '' and created_at < now() - interval '1 day'");
  }
}
