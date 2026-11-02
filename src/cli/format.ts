import type { AccountSnapshot, Reading, UsageWindow } from '../api/types.js';
import {
  billingFromCache,
  effectiveWeeklyReset,
  needsFetch,
  type CacheEntry,
} from '../cache/billing.js';

export const UNKNOWN_CELL = 'unknown';
const MANAGED_CELL = 'managed by admin';

export interface AccountReport {
  name: string;
  snapshot: AccountSnapshot | null;
}

export interface FormatContext {
  now: Date;
  timeZone?: string;
  entry?: CacheEntry;
}

function okValue<T>(reading: Reading<T> | undefined): T | null {
  return reading?.state === 'ok' ? reading.value : null;
}

function yesNo(value: boolean | null | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return UNKNOWN_CELL;
}

export function formatReset(iso: string | null, timeZone?: string): string {
  const time = iso ? new Date(iso) : null;
  if (!time || Number.isNaN(time.getTime())) return UNKNOWN_CELL;
  return time.toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
}

function formatUtilization(value: number | null): string {
  return value === null ? UNKNOWN_CELL : `${Math.round(value)}%`;
}

export function formatWindow(
  window: UsageWindow | undefined,
  resetsAt: string | null,
  timeZone?: string,
): string {
  if (!window) return UNKNOWN_CELL;
  return `${formatUtilization(window.utilization)}  resets ${formatReset(resetsAt, timeZone)}`;
}

export function formatPlan(report: AccountReport): string {
  const plan = okValue(report.snapshot?.organization)?.plan;
  return plan && plan !== 'unknown' ? plan : UNKNOWN_CELL;
}

export function usageRow(report: AccountReport, ctx: FormatContext): string[] {
  const usage = okValue(report.snapshot?.usage);
  const weeklyReset = effectiveWeeklyReset(ctx.entry, usage?.weekly.resetsAt, ctx.now);
  return [
    report.name,
    formatWindow(usage?.session, usage?.session.resetsAt ?? null, ctx.timeZone),
    formatWindow(usage?.weekly, weeklyReset, ctx.timeZone),
  ];
}

function formatRenewal(entry: CacheEntry | undefined, now: Date, timeZone?: string): string {
  if (entry && !needsFetch(entry, now)) {
    const { billingDate, daysLeft } = billingFromCache(entry, now);
    const day = new Date(billingDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timeZone ?? 'UTC',
    });
    return `${day} (${daysLeft}d)`;
  }
  return entry?.managedByAdmin?.value ? MANAGED_CELL : UNKNOWN_CELL;
}

export function billingRow(report: AccountReport, ctx: FormatContext): string[] {
  const org = okValue(report.snapshot?.organization);
  return [
    report.name,
    formatPlan(report),
    yesNo(org?.paid),
    formatRenewal(ctx.entry, ctx.now, ctx.timeZone),
    yesNo(ctx.entry?.autoRenew?.value),
  ];
}
