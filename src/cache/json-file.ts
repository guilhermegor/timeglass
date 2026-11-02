import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { threadId } from 'node:worker_threads';

import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

export interface PathOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
}

export const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;
const TMP_SUFFIX_BYTES = 4;

export type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : 'unknown';
}

export function readJsonObject(file: string, log: LogEmitter = NULL_EMITTER): JsonObject {
  return readJsonObjectOrNull(file, log) ?? {};
}

export function readJsonObjectOrNull(
  file: string,
  log: LogEmitter = NULL_EMITTER,
): JsonObject | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err: unknown) {
    if (errorCode(err) === 'ENOENT') return {};
    log.warn('cannot read file', { file, code: errorCode(err) });
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed)) return parsed;
    log.warn('ignoring non-object file', { file });
    return null;
  } catch (err: unknown) {
    log.warn('ignoring corrupt file', {
      file,
      reason: err instanceof SyntaxError ? 'syntax' : 'other',
    });
    return null;
  }
}

function removeQuietly(file: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    return;
  }
}

const MAX_LINK_HOPS = 40;

function realParentDir(file: string): string {
  const dir = path.dirname(file);
  try {
    return fs.realpathSync(dir);
  } catch (err: unknown) {
    if (errorCode(err) === 'ENOENT') return dir;
    throw err;
  }
}

function resolveLinkTarget(link: string): string {
  let current = link;
  for (let hops = 0; hops < MAX_LINK_HOPS; hops += 1) {
    let target: string;
    try {
      target = fs.readlinkSync(current);
    } catch (err: unknown) {
      const code = errorCode(err);
      if (code === 'EINVAL' || code === 'ENOENT') return current;
      throw err;
    }
    current = path.resolve(realParentDir(current), target);
  }
  throw Object.assign(new Error('too many symlink hops'), { code: 'ELOOP' });
}

export function writeJsonObject(
  link: string,
  data: JsonObject,
  log: LogEmitter = NULL_EMITTER,
): boolean {
  let file = link;
  let tmp = '';
  try {
    file = resolveLinkTarget(link);
    tmp = `${file}.${process.pid}.${threadId}.${randomBytes(TMP_SUFFIX_BYTES).toString('hex')}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: PRIVATE_DIR_MODE });
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, {
      mode: PRIVATE_FILE_MODE,
      flag: 'wx',
    });
    fs.renameSync(tmp, file);
    return true;
  } catch (err: unknown) {
    if (tmp) removeQuietly(tmp);
    log.error('cannot write file', { file, code: errorCode(err) });
    return false;
  }
}

function homeOf(opts: PathOptions): string {
  return opts.homeDir ?? os.homedir();
}

function absoluteEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key];
  return value && path.isAbsolute(value) ? value : undefined;
}

function envOf(opts: PathOptions): Record<string, string | undefined> {
  return opts.env ?? process.env;
}

export function billingCachePath(opts: PathOptions = {}): string {
  const env = envOf(opts);
  const exact = absoluteEnv(env, 'CLAUDESTATUS_CACHE_FILE');
  if (exact) return exact;
  const base = absoluteEnv(env, 'XDG_CACHE_HOME') ?? path.join(homeOf(opts), '.cache');
  return path.join(base, 'claudestatus', 'billing.json');
}

export function labelsPath(opts: PathOptions = {}): string {
  const base = absoluteEnv(envOf(opts), 'XDG_CONFIG_HOME') ?? path.join(homeOf(opts), '.config');
  return path.join(base, 'claudestatus-bar', 'labels.json');
}

export function claudeJsonPath(opts: PathOptions = {}): string {
  const dir = absoluteEnv(envOf(opts), 'CLAUDE_CONFIG_DIR');
  return dir ? path.join(dir, '.claude.json') : path.join(homeOf(opts), '.claude.json');
}
