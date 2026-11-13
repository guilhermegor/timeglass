import type { Labels } from '../accounts/labels.js';
import { effectiveWeeklyReset, type BillingCache, type CacheEntry } from '../cache/billing.js';

import { ago, countdown, resetAt, usageBar } from './format.js';
import type { LimitReading, SnapshotAccount, UsageSnapshot } from './snapshot.js';

const FULL = 100;
const PCT_WIDTH = 3;

export interface PopoverAccount {
  name: string;
  label: string;
  text: string;
}

export interface PopoverModel {
  bar: string;
  recommended: string | null;
  active: string | null;
  activeLine: string;
  accounts: PopoverAccount[];
}

function sessionPercent(account: SnapshotAccount): number {
  return account.session?.utilization ?? 0;
}

function waitMs(account: SnapshotAccount, now: Date): number {
  const waits = [account.weekly, account.session]
    .filter((l): l is LimitReading => l !== undefined && l.utilization >= FULL)
    .map((l) => {
      const t = Date.parse(String(l.resetsAt));
      return Number.isNaN(t) ? Infinity : Math.max(0, t - now.getTime());
    });
  return waits.length ? Math.max(...waits) : 0;
}

interface Scored {
  account: SnapshotAccount;
  score: number;
  wait: number;
}

function pickBest(pool: Scored[], open: boolean): Scored | undefined {
  return pool.reduce<Scored | undefined>((best, x) => {
    if (!best) return x;
    if (!open && x.wait !== best.wait) return x.wait < best.wait ? x : best;
    return best.score <= x.score ? best : x;
  }, undefined);
}

export function recommend(
  accounts: readonly SnapshotAccount[],
  now: Date = new Date(),
): SnapshotAccount | null {
  const scored = accounts
    .filter((a) => !a.error && a.plan !== 'free' && (a.session || a.weekly))
    .map((account) => ({
      account,
      score: sessionPercent(account) + (account.weekly?.utilization ?? 0),
      wait: waitMs(account, now),
    }));
  const open = scored.filter((x) => x.wait <= 0);
  return pickBest(open.length ? open : scored, open.length > 0)?.account ?? null;
}

interface Clock {
  now: Date;
  timeZone?: string | undefined;
}

function limitLine(
  label: string,
  limit: LimitReading | undefined,
  reset: string | null,
  clock: Clock,
) {
  if (!limit) return `${label}  —`;
  const known = reset !== null && Number.isFinite(Date.parse(reset));
  const when = known
    ? `resets in ${countdown(reset, clock.now)} (${resetAt(reset, clock.now, clock.timeZone)})`
    : 'reset unknown';
  const pct = String(limit.utilization).padStart(PCT_WIDTH);
  return `${label}  ${usageBar(limit.utilization)} ${pct}%  ${when}`;
}

function renewalLine(entry: CacheEntry | undefined, clock: Clock): string {
  const { now, timeZone } = clock;
  const at = entry?.renewalAt ? Date.parse(entry.renewalAt.value) : Number.NaN;
  if (!(at > now.getTime())) {
    return entry?.managedByAdmin?.value ? 'Billing managed by team admin' : 'Renewal unknown';
  }
  const date = new Date(at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone,
  });
  return entry?.autoRenew?.value === false ? `Ends ${date}` : `Renews ${date}`;
}

function planName(account: SnapshotAccount): string {
  if (account.plan === 'unknown') return '?';
  return account.plan.charAt(0).toUpperCase() + account.plan.slice(1);
}

function accountText(
  account: SnapshotAccount,
  label: string,
  entry: CacheEntry | undefined,
  context: { at: string | null; clock: Clock; active: boolean },
): string {
  const { at, clock, active } = context;
  const { now } = clock;
  const badge = (account.plan === 'free' ? '  ⚠ unpaid' : '') + (active ? '  ● active' : '');
  const head = `${label}  ${planName(account)}${badge}`;
  if (account.error) return `${head}\n✗ ${account.error}`;
  const weeklyReset = effectiveWeeklyReset(entry, account.weekly?.resetsAt, now);
  return [
    head,
    limitLine('Session', account.session, account.session?.resetsAt ?? null, clock),
    limitLine('Weekly ', account.weekly, weeklyReset, clock),
    `${renewalLine(entry, clock)}  ·  updated ${at ? ago(at, now) : 'never'}`,
  ].join('\n');
}

function barText(shown: SnapshotAccount | undefined, fallback: SnapshotAccount | null): string {
  const pick = shown ?? fallback;
  const pct = pick?.session?.utilization;
  if (pct === undefined) return '—';
  return shown ? `${shown.name} ${pct}%` : `${pct}%`;
}

export function buildPopoverModel(
  usage: UsageSnapshot,
  cache: BillingCache,
  options: { now?: Date; activeName?: string | null; labels?: Labels; timeZone?: string } = {},
): PopoverModel {
  const { now = new Date(), activeName = null, labels = {}, timeZone } = options;
  const clock: Clock = { now, timeZone };
  const best = recommend(usage.accounts, now);
  const act = usage.accounts.find((a) => a.name === activeName);
  const shown = act?.session ? act : undefined;
  return {
    bar: barText(shown, best),
    recommended: best?.name ?? null,
    active: act?.name ?? null,
    activeLine: act ? `active: ${act.name}` : 'active: unknown',
    accounts: usage.accounts.map((a) => {
      const label = labels[a.name] ?? a.name;
      const text = accountText(a, label, cache[a.name], { at: usage.at, clock, active: a === act });
      return { name: a.name, label, text };
    }),
  };
}
