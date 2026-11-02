import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

export interface PathOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
}

export const PRIVATE_FILE_MODE = 0o600;

export type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(err: unknown): string {
  return err instanceof Error && 'code' in err ? String(err.code) : 'unknown';
}

export function readJsonObject(file: string, log: LogEmitter = NULL_EMITTER): JsonObject {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err: unknown) {
    if (errorCode(err) !== 'ENOENT') log.warn('cannot read file', { file, code: errorCode(err) });
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (err: unknown) {
    log.warn('ignoring corrupt file', {
      file,
      reason: err instanceof SyntaxError ? 'syntax' : 'other',
    });
    return {};
  }
}

export function writeJsonObject(
  file: string,
  data: JsonObject,
  log: LogEmitter = NULL_EMITTER,
): boolean {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: PRIVATE_FILE_MODE });
    fs.renameSync(tmp, file);
    return true;
  } catch (err: unknown) {
    log.error('cannot write file', { file, code: errorCode(err) });
    return false;
  }
}

function homeOf(opts: PathOptions): string {
  return opts.homeDir ?? os.homedir();
}

function envOf(opts: PathOptions): Record<string, string | undefined> {
  return opts.env ?? process.env;
}

export function billingCachePath(opts: PathOptions = {}): string {
  const env = envOf(opts);
  if (env.CLAUDESTATUS_CACHE_FILE) return env.CLAUDESTATUS_CACHE_FILE;
  const base = env.XDG_CACHE_HOME || path.join(homeOf(opts), '.cache');
  return path.join(base, 'claudestatus', 'billing.json');
}

export function labelsPath(opts: PathOptions = {}): string {
  const base = envOf(opts).XDG_CONFIG_HOME || path.join(homeOf(opts), '.config');
  return path.join(base, 'claudestatus-bar', 'labels.json');
}

export function claudeJsonPath(opts: PathOptions = {}): string {
  const dir = envOf(opts).CLAUDE_CONFIG_DIR;
  return dir ? path.join(dir, '.claude.json') : path.join(homeOf(opts), '.claude.json');
}
