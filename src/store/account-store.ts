import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCookieHeader,
  parseStorageState,
  restrictToClaude,
  type StorageState,
} from './storage-state.js';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const STATE_SUFFIX = '.storage.json';
const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** `$TIMEGLASS_ACCOUNTS_DIR`, else `$XDG_CONFIG_HOME/timeglass/accounts`, else `~/.config/...`. */
export function defaultAccountsDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TIMEGLASS_ACCOUNTS_DIR) return env.TIMEGLASS_ACCOUNTS_DIR;
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(config, 'timeglass', 'accounts');
}

/** Reject names that could escape the accounts directory or collide with its file suffix. */
export function assertValidAccountName(name: string): void {
  if (!ACCOUNT_NAME.test(name)) {
    throw new Error('Invalid account name: use 1-64 letters, digits, dot, dash or underscore.');
  }
}

export function storageStatePath(dir: string, name: string): string {
  assertValidAccountName(name);
  return path.join(dir, `${name}${STATE_SUFFIX}`);
}

/**
 * Write atomically with mode 0600; the temp file is created 0600 so it is never wider. Only
 * claude.ai cookies are kept (see `restrictToClaude`), whatever the caller passes in.
 */
export function saveStorageState(dir: string, name: string, state: StorageState): void {
  const target = storageStatePath(dir, name);
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(restrictToClaude(state)), { mode: FILE_MODE });
  fs.chmodSync(temp, FILE_MODE);
  fs.renameSync(temp, target);
}

/** `null` when the file is missing, unreadable or not a storage state: fails closed. */
export function loadStorageState(dir: string, name: string): StorageState | null {
  try {
    const raw = fs.readFileSync(storageStatePath(dir, name), 'utf8');
    return parseStorageState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Sorted account names that have a saved session. */
export function listAccounts(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(STATE_SUFFIX))
      .map((file) => file.slice(0, -STATE_SUFFIX.length))
      .filter((name) => ACCOUNT_NAME.test(name))
      .sort();
  } catch {
    return [];
  }
}

/** Delete a saved session; idempotent, a missing one is not an error. */
export function removeAccount(dir: string, name: string): void {
  fs.rmSync(storageStatePath(dir, name), { force: true });
}

/** Cookie header for the API client, or `null` (fail closed) when there is no usable session. */
export function loadCookieHeader(dir: string, name: string, nowMs?: number): string | null {
  const state = loadStorageState(dir, name);
  if (!state) return null;
  return buildCookieHeader(state, nowMs) || null;
}
