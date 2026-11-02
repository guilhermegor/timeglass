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

export function defaultAccountsDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TIMEGLASS_ACCOUNTS_DIR) return env.TIMEGLASS_ACCOUNTS_DIR;
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(config, 'timeglass', 'accounts');
}

export function assertValidAccountName(name: string): void {
  if (!ACCOUNT_NAME.test(name)) {
    throw new Error('Invalid account name: use 1-64 letters, digits, dot, dash or underscore.');
  }
}

export function storageStatePath(dir: string, name: string): string {
  assertValidAccountName(name);
  return path.join(dir, `${name}${STATE_SUFFIX}`);
}

export function saveStorageState(dir: string, name: string, state: StorageState): void {
  const target = storageStatePath(dir, name);
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(restrictToClaude(state)), { mode: FILE_MODE });
  fs.chmodSync(temp, FILE_MODE);
  fs.renameSync(temp, target);
}

export function loadStorageState(dir: string, name: string): StorageState | null {
  try {
    const raw = fs.readFileSync(storageStatePath(dir, name), 'utf8');
    return parseStorageState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

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

export function removeAccount(dir: string, name: string): void {
  fs.rmSync(storageStatePath(dir, name), { force: true });
}

export function loadCookieHeader(dir: string, name: string, nowMs?: number): string | null {
  const state = loadStorageState(dir, name);
  if (!state) return null;
  return buildCookieHeader(state, nowMs) || null;
}
