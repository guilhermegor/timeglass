import { fetchAccountSnapshot } from '../api/client.js';
import type { FetchLike } from '../api/types.js';
import {
  loadBillingCache,
  recordBilling,
  recordWeeklyReset,
  saveBillingCache,
  type BillingCache,
} from '../cache/billing.js';
import type { PathOptions } from '../cache/json-file.js';
import { listAccounts, loadCookieHeader } from '../store/account-store.js';
import type { LogEmitter } from '../utils/log-emitter.js';

import type { AccountReport } from './format.js';

export interface ReportOptions {
  dir: string;
  logger: LogEmitter;
  fetch?: FetchLike;
  paths?: PathOptions;
  now?: Date;
}

export interface Reports {
  reports: AccountReport[];
  cache: BillingCache;
}

async function readReport(name: string, options: ReportOptions): Promise<AccountReport> {
  const cookieHeader = loadCookieHeader(options.dir, name, options.now?.getTime());
  if (cookieHeader === null) return { name, snapshot: null };
  const snapshot = await fetchAccountSnapshot({
    cookieHeader,
    fetch: options.fetch,
    logger: options.logger,
  });
  return { name, snapshot };
}

function recordReport(cache: BillingCache, report: AccountReport, now: Date): void {
  const { snapshot } = report;
  if (!snapshot) return;
  const { subscription, usage, organization } = snapshot;
  const paid = organization.state === 'ok' ? organization.value.paid : null;
  if (subscription.state === 'ok') {
    const { nextChargeAt, planEndingAt } = subscription.value;
    recordBilling(
      cache,
      report.name,
      { renewalAt: nextChargeAt, autoRenew: planEndingAt === null, paid },
      now,
    );
  } else if (subscription.state === 'managed_by_admin') {
    recordBilling(cache, report.name, { managedByAdmin: true, paid }, now);
  }
  if (usage.state === 'ok') recordWeeklyReset(cache, report.name, usage.value.weekly.resetsAt, now);
}

export async function collectReports(options: ReportOptions): Promise<Reports> {
  const now = options.now ?? new Date();
  const names = listAccounts(options.dir);
  const reports = await Promise.all(names.map((name) => readReport(name, options)));
  const cache = loadBillingCache(options.paths, options.logger);
  for (const report of reports) recordReport(cache, report, now);
  saveBillingCache(cache, options.paths, options.logger);
  return { reports, cache };
}
