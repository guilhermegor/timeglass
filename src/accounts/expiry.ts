import { loadBillingCache, saveBillingCache } from '../cache/billing.js';
import type { PathOptions } from '../cache/json-file.js';
import { loadUsageSnapshot, saveUsageSnapshot } from '../popover/snapshot.js';
import { listAccounts, removeAccount } from '../store/account-store.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import { readLabels, setLabel } from './labels.js';
import { isExpired, readLifespans, todayOf, writeLifespans } from './lifespan.js';

export interface PurgeContext {
  dir: string;
  opts?: PathOptions;
  log?: LogEmitter;
  now?: Date;
  timeZone?: string;
}

function forgetCachedData(name: string, opts: PathOptions, log: LogEmitter): void {
  const billing = loadBillingCache(opts, log);
  if (name in billing) {
    delete billing[name];
    saveBillingCache(billing, opts, log);
  }
  if (readLabels(opts, log)[name] !== undefined) setLabel(name, '', opts, log);
  const usage = loadUsageSnapshot(opts, log);
  if (usage.accounts.some((account) => account.name === name)) {
    const accounts = usage.accounts.filter((account) => account.name !== name);
    saveUsageSnapshot({ ...usage, accounts }, opts, log);
  }
}

export function purgeExpired(ctx: PurgeContext): string[] {
  const log = ctx.log ?? NULL_EMITTER;
  const opts = ctx.opts ?? {};
  const today = todayOf(ctx.now ?? new Date(), ctx.timeZone);
  const records = readLifespans(ctx.dir, log);
  const expired = listAccounts(ctx.dir).filter((name) => isExpired(records[name], today));
  for (const name of expired) {
    forgetCachedData(name, opts, log);
    removeAccount(ctx.dir, name);
    delete records[name];
  }
  if (expired.length > 0) writeLifespans(ctx.dir, records, log);
  return expired;
}

export function expiredNotices(removed: readonly string[]): string[] {
  return removed.map((name) => `Removed expired temporary account "${name}" and its cached data.`);
}
