import type { PathOptions } from '../cache/json-file.js';
import { listAccounts } from '../store/account-store.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import { setLabel } from './labels.js';
import {
  isValidDate,
  readLifespans,
  todayOf,
  writeLifespans,
  PERMANENT,
  type Lifespan,
} from './lifespan.js';

export interface EditChanges {
  label?: string;
  lifespan?: Lifespan;
  until?: string;
}

export interface EditContext {
  dir: string;
  opts?: PathOptions;
  log?: LogEmitter;
  now?: Date;
  timeZone?: string;
}

export const EDIT_USAGE =
  'Usage: timeglass edit <name> [--label <new>] [--lifespan permanent|temporary] [--until YYYY-MM-DD]';

const LIFESPANS: readonly string[] = ['permanent', 'temporary'];
const FLAGS = ['label', 'lifespan', 'until'] as const;

function splitFlag(arg: string): [string, string | undefined] {
  const at = arg.indexOf('=');
  return at < 0 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)];
}

function checkChange(key: (typeof FLAGS)[number], value: string): void {
  if (key === 'lifespan' && !LIFESPANS.includes(value)) {
    throw new Error('--lifespan must be "permanent" or "temporary".');
  }
  if (key === 'until' && !isValidDate(value)) {
    throw new Error('--until must be a real date in YYYY-MM-DD form.');
  }
}

export function parseEditArgs(args: readonly string[]): { name: string; changes: EditChanges } {
  const [name, ...flags] = args;
  if (!name || name.startsWith('--')) throw new Error(EDIT_USAGE);
  const changes: Record<string, string> = {};
  for (let i = 0; i < flags.length; i += 1) {
    const [flag, inline] = splitFlag(flags[i] as string);
    const key = FLAGS.find((known) => `--${known}` === flag);
    const value = inline ?? flags[i + 1];
    if (!key || value === undefined) throw new Error(EDIT_USAGE);
    if (inline === undefined) i += 1;
    checkChange(key, value);
    changes[key] = value;
  }
  if (Object.keys(changes).length === 0) throw new Error(EDIT_USAGE);
  return { name, changes: changes as EditChanges };
}

export function editAccount(name: string, changes: EditChanges, ctx: EditContext): void {
  const log = ctx.log ?? NULL_EMITTER;
  if (!listAccounts(ctx.dir).includes(name)) throw new Error(`Unknown account "${name}".`);
  const records = readLifespans(ctx.dir, log);
  const current = records[name] ?? PERMANENT;
  const lifespan = changes.lifespan ?? current.lifespan;
  if (changes.until !== undefined && lifespan !== 'temporary') {
    throw new Error('--until needs a temporary account: pass --lifespan temporary.');
  }
  const until = changes.until ?? current.until;
  if (changes.until !== undefined && changes.until < todayOf(ctx.now ?? new Date(), ctx.timeZone)) {
    throw new Error('--until is already in the past.');
  }
  if (changes.label !== undefined && !setLabel(name, changes.label, ctx.opts, log)) {
    throw new Error('Could not save the label.');
  }
  if (changes.lifespan === undefined && changes.until === undefined) return;
  if (lifespan === 'permanent') delete records[name];
  else records[name] = until === undefined ? { lifespan } : { lifespan, until };
  if (!writeLifespans(ctx.dir, records, log)) throw new Error('Could not save the lifespan.');
}
