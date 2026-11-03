import path from 'node:path';

import { readJsonObject, writeJsonObject, type JsonObject } from '../cache/json-file.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

export type Lifespan = 'permanent' | 'temporary';

export interface AccountLifespan {
  lifespan: Lifespan;
  until?: string;
}

export type Lifespans = Record<string, AccountLifespan>;

export const PERMANENT: AccountLifespan = { lifespan: 'permanent' };
export const WARN_DAYS = 7;

const FILE = 'lifespans.json';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const DATE_LENGTH = 10;

export function lifespansPath(dir: string): string {
  return path.join(dir, FILE);
}

export function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, DATE_LENGTH) === value;
}

export function todayOf(now: Date, timeZone?: string): string {
  return now.toLocaleDateString('en-CA', { timeZone });
}

export function daysLeft(until: string, today: string): number {
  return Math.round((Date.parse(until) - Date.parse(today)) / MS_PER_DAY);
}

function toRecord(raw: unknown): AccountLifespan | undefined {
  const entry = raw as { lifespan?: unknown; until?: unknown } | null;
  if (typeof entry !== 'object' || entry === null || entry.lifespan !== 'temporary') {
    return undefined;
  }
  if (typeof entry.until === 'string' && isValidDate(entry.until)) {
    return { lifespan: 'temporary', until: entry.until };
  }
  return { lifespan: 'temporary' };
}

export function readLifespans(dir: string, log: LogEmitter = NULL_EMITTER): Lifespans {
  const records: Lifespans = Object.create(null) as Lifespans;
  for (const [name, raw] of Object.entries(readJsonObject(lifespansPath(dir), log))) {
    const record = toRecord(raw);
    if (record) records[name] = record;
  }
  return records;
}

export function writeLifespans(
  dir: string,
  records: Lifespans,
  log: LogEmitter = NULL_EMITTER,
): boolean {
  return writeJsonObject(lifespansPath(dir), { ...records } as unknown as JsonObject, log);
}

export function isExpired(record: AccountLifespan | undefined, today: string): boolean {
  return record?.lifespan === 'temporary' && record.until !== undefined && today > record.until;
}

export function lifespanBadge(record: AccountLifespan | undefined, today: string): string {
  if (record?.lifespan !== 'temporary') return '';
  if (record.until === undefined) return 'temporary';
  const days = daysLeft(record.until, today);
  return days === 0 ? 'temporary, expires today' : `temporary, expires in ${days}d`;
}

export function expiryWarnings(records: Lifespans, names: readonly string[], today: string) {
  return names.flatMap((name) => {
    const until = records[name]?.until;
    if (until === undefined || isExpired(records[name], today)) return [];
    const days = daysLeft(until, today);
    if (days > WARN_DAYS) return [];
    const when = days === 0 ? 'after today' : `after ${until}`;
    return [`Account "${name}" is temporary and will be removed ${when} (${days}d left).`];
  });
}
