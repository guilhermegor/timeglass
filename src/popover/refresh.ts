import { fetchAccountSnapshot } from '../api/client.js';
import type { AccountSnapshot, FetchLike, Reading, Usage } from '../api/types.js';
import {
  loadBillingCache,
  recordBilling,
  recordWeeklyReset,
  saveBillingCache,
  type BillingCache,
} from '../cache/billing.js';
import type { PathOptions } from '../cache/json-file.js';
import { defaultAccountsDir, listAccounts, loadCookieHeader } from '../store/account-store.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import { saveUsageSnapshot, type SnapshotAccount, type UsageSnapshot } from './snapshot.js';

export interface RefreshOptions extends PathOptions {
  accountsDir?: string;
  fetch?: FetchLike;
  now?: Date;
  logger?: LogEmitter;
}

function limit(window: { utilization: number | null; resetsAt: string | null }) {
  return window.utilization === null
    ? undefined
    : { utilization: window.utilization, resetsAt: window.resetsAt };
}

function usageFields(reading: Reading<Usage>): Partial<SnapshotAccount> {
  if (reading.state !== 'ok') {
    const why = reading.state === 'unknown' ? reading.reason : 'managed by admin';
    return { error: `Usage unavailable (${why})` };
  }
  const session = limit(reading.value.session);
  const weekly = limit(reading.value.weekly);
  return { ...(session && { session }), ...(weekly && { weekly }) };
}

function toSnapshotAccount(name: string, snap: AccountSnapshot): SnapshotAccount {
  const plan = snap.organization.state === 'ok' ? snap.organization.value.plan : 'unknown';
  return { name, plan, ...usageFields(snap.usage) };
}

function recordSnapshot(cache: BillingCache, name: string, snap: AccountSnapshot, now: Date) {
  const sub = snap.subscription;
  if (sub.state === 'ok') {
    const paid = snap.organization.state === 'ok' ? snap.organization.value.paid : null;
    recordBilling(
      cache,
      name,
      { renewalAt: sub.value.nextChargeAt, autoRenew: sub.value.planEndingAt === null, paid },
      now,
    );
  } else if (sub.state === 'managed_by_admin') {
    recordBilling(cache, name, { managedByAdmin: true }, now);
  }
  if (snap.usage.state === 'ok') {
    recordWeeklyReset(cache, name, snap.usage.value.weekly.resetsAt, now);
  }
}

async function refreshAccount(
  name: string,
  cache: BillingCache,
  options: RefreshOptions,
  dir: string,
): Promise<SnapshotAccount> {
  const now = options.now ?? new Date();
  const cookieHeader = loadCookieHeader(dir, name);
  if (cookieHeader === null) {
    return { name, plan: 'unknown', error: 'Not logged in. Run add-account.' };
  }
  const snap = await fetchAccountSnapshot({
    cookieHeader,
    ...(options.fetch && { fetch: options.fetch }),
    ...(options.logger && { logger: options.logger }),
  });
  recordSnapshot(cache, name, snap, now);
  return toSnapshotAccount(name, snap);
}

export async function refreshUsage(options: RefreshOptions = {}): Promise<UsageSnapshot> {
  const log = options.logger ?? NULL_EMITTER;
  const dir = options.accountsDir ?? defaultAccountsDir(options.env);
  const cache = loadBillingCache(options, log);
  const accounts: SnapshotAccount[] = [];
  for (const name of listAccounts(dir)) {
    accounts.push(await refreshAccount(name, cache, options, dir));
  }
  const snapshot = { at: (options.now ?? new Date()).toISOString(), accounts };
  if (!saveBillingCache(cache, options, log) || !saveUsageSnapshot(snapshot, options, log)) {
    throw new Error('Could not save the refreshed usage data.');
  }
  return snapshot;
}
