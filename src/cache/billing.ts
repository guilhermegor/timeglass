import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import {
  billingCachePath,
  readJsonObject,
  writeJsonObject,
  type PathOptions,
} from './json-file.js';

const DAY_MS = 86_400_000;

export type BillingPeriod = 'monthly' | 'annual' | 'unknown';

export interface Stamped<T> {
  value: T;
  readAt: string;
}

export interface CacheEntry {
  renewalAt?: Stamped<string>;
  autoRenew?: Stamped<boolean>;
  managedByAdmin?: Stamped<boolean>;
  weeklyResetAt?: Stamped<string>;
}

export type BillingCache = Record<string, CacheEntry>;

export interface SubscriptionBilling {
  period: BillingPeriod;
  autoRenew: boolean | null;
  renewalAt: string | null;
  loggedOut: boolean;
  managedByAdmin: boolean;
}

export interface BillingRead {
  renewalAt?: string | null;
  autoRenew?: boolean | null;
  managedByAdmin?: boolean;
  paid?: boolean | null;
}

const PERIODS: Record<string, BillingPeriod> = {
  month: 'monthly',
  monthly: 'monthly',
  year: 'annual',
  yearly: 'annual',
  annual: 'annual',
};

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_OK = 200;
const HTTP_MULTIPLE_CHOICES = 300;

interface SubscriptionBody {
  next_charge_at?: unknown;
  plan_ending_at?: unknown;
  billing_interval?: unknown;
  error?: { type?: unknown };
}

export function billingFromSubscription(status: number, body: unknown): SubscriptionBilling {
  const none: SubscriptionBilling = {
    period: 'unknown',
    autoRenew: null,
    renewalAt: null,
    loggedOut: false,
    managedByAdmin: false,
  };
  const b = (typeof body === 'object' && body !== null ? body : {}) as SubscriptionBody;
  if (status === HTTP_UNAUTHORIZED) return { ...none, loggedOut: true };
  if (status === HTTP_FORBIDDEN && b.error?.type === 'permission_error') {
    return { ...none, managedByAdmin: true };
  }
  const charge = Date.parse(String(b.next_charge_at));
  if (status < HTTP_OK || status >= HTTP_MULTIPLE_CHOICES || Number.isNaN(charge)) return none;
  return {
    ...none,
    period: PERIODS[String(b.billing_interval).toLowerCase()] ?? 'unknown',
    autoRenew: b.plan_ending_at == null,
    renewalAt: new Date(charge).toISOString(),
  };
}

function stamp<T>(value: T, now: Date): Stamped<T> {
  return { value, readAt: now.toISOString() };
}

function isUnsafeKey(name: string): boolean {
  return name === '__proto__' || name === 'constructor' || name === 'prototype';
}

function ownEntry(cache: BillingCache, name: string): CacheEntry {
  return (Object.prototype.hasOwnProperty.call(cache, name) ? cache[name] : undefined) ?? {};
}

export function recordBilling(
  cache: BillingCache,
  name: string,
  read: BillingRead,
  now: Date = new Date(),
): void {
  if (isUnsafeKey(name)) return;
  const entry = ownEntry(cache, name);
  if (read.renewalAt || read.paid === false) delete entry.managedByAdmin;
  if (read.renewalAt) entry.renewalAt = stamp(read.renewalAt, now);
  else if (read.managedByAdmin === true) entry.managedByAdmin = stamp(true, now);
  if (typeof read.autoRenew === 'boolean') entry.autoRenew = stamp(read.autoRenew, now);
  cache[name] = entry;
}

export function recordWeeklyReset(
  cache: BillingCache,
  name: string,
  resetsAt: string | null | undefined,
  now: Date = new Date(),
): void {
  if (isUnsafeKey(name) || !resetsAt || !(Date.parse(resetsAt) > now.getTime())) return;
  cache[name] = {
    ...ownEntry(cache, name),
    weeklyResetAt: stamp(new Date(resetsAt).toISOString(), now),
  };
}

function futureTime(field: Stamped<string> | undefined, now: Date): number | null {
  const t = field ? Date.parse(field.value) : Number.NaN;
  return t > now.getTime() ? t : null;
}

export function needsFetch(entry: CacheEntry | undefined, now: Date = new Date()): boolean {
  if (!entry) return true;
  return futureTime(entry.renewalAt, now) === null || typeof entry.autoRenew?.value !== 'boolean';
}

export function billingFromCache(entry: CacheEntry, now: Date = new Date()) {
  const t = futureTime(entry.renewalAt, now);
  if (t === null || typeof entry.autoRenew?.value !== 'boolean') {
    throw new Error('billingFromCache called on an entry that needs a fetch');
  }
  return {
    billingDate: new Date(t).toISOString(),
    daysLeft: Math.ceil((t - now.getTime()) / DAY_MS),
    autoRenew: entry.autoRenew.value,
  };
}

export function effectiveWeeklyReset(
  entry: CacheEntry | undefined,
  apiResetsAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const api = apiResetsAt ? Date.parse(apiResetsAt) : Number.NaN;
  if (apiResetsAt && api > now.getTime()) return apiResetsAt;
  const cached = futureTime(entry?.weeklyResetAt, now);
  return cached === null ? null : new Date(cached).toISOString();
}

const STAMPED_FIELD_TYPES = {
  renewalAt: 'string',
  autoRenew: 'boolean',
  managedByAdmin: 'boolean',
  weeklyResetAt: 'string',
} as const;

function isStamped(field: unknown, type: string): field is Stamped<string | boolean> {
  if (typeof field !== 'object' || field === null) return false;
  const { value, readAt } = field as Partial<Stamped<unknown>>;
  return typeof value === type && typeof readAt === 'string';
}

function sanitizeEntry(raw: unknown): CacheEntry | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const entry: Record<string, Stamped<string | boolean>> = {};
  for (const [key, type] of Object.entries(STAMPED_FIELD_TYPES)) {
    const field = source[key];
    if (isStamped(field, type)) entry[key] = { value: field.value, readAt: field.readAt };
  }
  return entry as CacheEntry;
}

export function loadBillingCache(
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): BillingCache {
  const cache: BillingCache = Object.create(null) as BillingCache;
  for (const [name, raw] of Object.entries(readJsonObject(billingCachePath(opts), log))) {
    const entry = isUnsafeKey(name) ? undefined : sanitizeEntry(raw);
    if (entry) cache[name] = entry;
  }
  return cache;
}

export function saveBillingCache(
  cache: BillingCache,
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): boolean {
  return writeJsonObject(billingCachePath(opts), cache, log);
}
