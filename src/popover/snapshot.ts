import path from 'node:path';

import type { Plan } from '../api/types.js';
import { billingCachePath, readJsonObject, writeJsonObject } from '../cache/json-file.js';
import type { PathOptions } from '../cache/json-file.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

export interface LimitReading {
  utilization: number;
  resetsAt: string | null;
}

export interface SnapshotAccount {
  name: string;
  orgUuid?: string;
  plan: Plan;
  session?: LimitReading;
  weekly?: LimitReading;
  error?: string;
}

export interface UsageSnapshot {
  at: string | null;
  accounts: SnapshotAccount[];
}

const PLANS: readonly string[] = ['free', 'pro', 'max', 'team', 'unknown'];

export function usageSnapshotPath(opts: PathOptions = {}): string {
  const env = opts.env ?? process.env;
  if (env.TIMEGLASS_USAGE_FILE) return env.TIMEGLASS_USAGE_FILE;
  return path.join(path.dirname(billingCachePath(opts)), 'usage.json');
}

function toLimit(raw: unknown): LimitReading | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { utilization, resetsAt } = raw as Record<string, unknown>;
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return undefined;
  return { utilization, resetsAt: typeof resetsAt === 'string' ? resetsAt : null };
}

function toAccount(raw: unknown): SnapshotAccount | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string') return undefined;
  const plan = PLANS.includes(String(r.plan)) ? (r.plan as Plan) : 'unknown';
  const account: SnapshotAccount = { name: r.name, plan };
  if (typeof r.orgUuid === 'string') account.orgUuid = r.orgUuid;
  if (typeof r.error === 'string') account.error = r.error;
  const session = toLimit(r.session);
  const weekly = toLimit(r.weekly);
  if (session) account.session = session;
  if (weekly) account.weekly = weekly;
  return account;
}

export function loadUsageSnapshot(
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): UsageSnapshot {
  const raw = readJsonObject(usageSnapshotPath(opts), log);
  const list = Array.isArray(raw.accounts) ? (raw.accounts as unknown[]) : [];
  return {
    at: typeof raw.at === 'string' ? raw.at : null,
    accounts: list.map(toAccount).filter((a): a is SnapshotAccount => a !== undefined),
  };
}

export function saveUsageSnapshot(
  snapshot: UsageSnapshot,
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): boolean {
  return writeJsonObject(usageSnapshotPath(opts), { ...snapshot }, log);
}
