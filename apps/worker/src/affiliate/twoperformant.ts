import type { TwoPerformantProgram } from '@pretoscop/db';

/**
 * 2Performant affiliate API client (M24), shaped after doc.2performant.com: devise-token sign-in
 * (`access-token`, `client`, `uid` headers), paginated `affiliate/programs` and
 * `affiliate/commissions`. 100 requests per minute: pages are fetched one after another with a
 * pause. Field names must be checked against a real response once the account exists (A6/A7);
 * unknown fields are ignored and missing ones read as null.
 */

export interface TwoPerformantCommission {
  id: number | string;
  status: string;
  amount: string | number;
  currency?: string | null;
  created_at: string;
  updated_at?: string | null;
  stats_tags?: string | null;
  program?: { id?: number; unique_code?: string | null } | null;
  public_action_data?: { amount?: string | number | null } | null;
}

interface Page<T> {
  items: T[];
  pages: number;
}

export class TwoPerformantClient {
  private headers: Record<string, string> | null = null;

  constructor(
    private readonly opts: { baseUrl: string; email: string; password: string; pauseMs?: number; fetchImpl?: typeof fetch },
  ) {}

  private get f(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  async signIn(): Promise<void> {
    const res = await this.f(`${this.opts.baseUrl}/users/sign_in.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'Pretoscop/1.0 (+https://pretoscop.ro)' },
      body: JSON.stringify({ user: { email: this.opts.email, password: this.opts.password } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`2Performant sign-in failed: HTTP ${res.status}`);
    const token = res.headers.get('access-token');
    const client = res.headers.get('client');
    const uid = res.headers.get('uid');
    if (!token || !client || !uid) throw new Error('2Performant sign-in: missing access-token/client/uid headers');
    this.headers = { 'access-token': token, client, uid, accept: 'application/json', 'user-agent': 'Pretoscop/1.0 (+https://pretoscop.ro)' };
  }

  private async page<T>(path: string, key: string, params: Record<string, string>, page: number): Promise<Page<T>> {
    if (!this.headers) await this.signIn();
    const q = new URLSearchParams({ ...params, page: String(page), perpage: '50' });
    const res = await this.f(`${this.opts.baseUrl}${path}?${q}`, { headers: this.headers!, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`2Performant ${path}: HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown> & { metadata?: { pagination?: { pages?: number } } };
    return { items: (body[key] as T[] | undefined) ?? [], pages: body.metadata?.pagination?.pages ?? 1 };
  }

  private async all<T>(path: string, key: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    for (let p = 1; ; p++) {
      const r = await this.page<T>(path, key, params, p);
      out.push(...r.items);
      if (p >= r.pages || r.items.length === 0 || p >= 200) break;
      await new Promise((res) => setTimeout(res, this.opts.pauseMs ?? 700));
    }
    return out;
  }

  /** Programs we applied to (any relation status), with traffic-source permissions. */
  programs(): Promise<TwoPerformantProgram[]> {
    return this.all<TwoPerformantProgram>('/affiliate/programs.json', 'programs', {});
  }

  /** Commissions created in [from, to] (YYYY-MM-DD); statuses change for weeks, so re-read a window. */
  commissions(from: string, to: string): Promise<TwoPerformantCommission[]> {
    return this.all<TwoPerformantCommission>('/affiliate/commissions.json', 'commissions', { 'filter[start_date]': from, 'filter[end_date]': to });
  }
}

const STATUS: Record<string, 'pending' | 'accepted' | 'rejected' | 'paid'> = {
  pending: 'pending',
  accepted: 'accepted',
  approved: 'accepted',
  rejected: 'rejected',
  canceled: 'rejected',
  cancelled: 'rejected',
  paid: 'paid',
};

export function commissionStatus(s: string): 'pending' | 'accepted' | 'rejected' | 'paid' {
  return STATUS[s.trim().toLowerCase()] ?? 'pending';
}

/** Our click id from a sub-id we set (`c123`), wherever the network echoes it. */
export function clickIdFromSub(sub: string | null | undefined): number | null {
  const m = /(?:^|[^a-z0-9])c(\d{1,15})(?:$|[^0-9])/i.exec(sub ?? '');
  return m ? Number(m[1]) : null;
}

/** "12,34" or "12.34" lei → bani. */
export function moneyToBani(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'number' ? String(v) : v.trim().replace(/\s/g, '');
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
