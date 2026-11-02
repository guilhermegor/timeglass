import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import { assertValidAccountName, saveStorageState } from './account-store.js';
import type { LoginSession } from './login-session.js';
import { openPlaywrightSession } from './playwright-session.js';
import { parseStorageState } from './storage-state.js';

const LOGIN_URL = 'https://claude.ai/login';
const LOGIN_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 2000;
const SETTLE_MS = 2000;

export interface AddAccountOptions {
  dir: string;
  openSession?: () => Promise<LoginSession>;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  logger?: LogEmitter;
}

export type AddAccountResult =
  | { state: 'added' }
  | { state: 'timeout' }
  | { state: 'failed'; message: string };

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLogin(
  session: LoginSession,
  sleep: (ms: number) => Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await session.isLoggedIn().catch(() => false)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function captureAndSave(
  session: LoginSession,
  dir: string,
  name: string,
  sleep: (ms: number) => Promise<void>,
): Promise<AddAccountResult> {
  await sleep(SETTLE_MS);
  if (!(await session.isLoggedIn().catch(() => false))) {
    return { state: 'failed', message: 'Login could not be verified after the browser settled.' };
  }
  const state = parseStorageState(await session.storageState());
  if (!state) return { state: 'failed', message: 'The browser returned no usable session.' };
  saveStorageState(dir, name, state);
  return { state: 'added' };
}

export async function addAccount(
  name: string,
  options: AddAccountOptions,
): Promise<AddAccountResult> {
  assertValidAccountName(name);
  const { dir, logger = NULL_EMITTER, sleep = pause, timeoutMs = LOGIN_TIMEOUT_MS } = options;
  let session: LoginSession;
  try {
    session = await (options.openSession ?? openPlaywrightSession)();
  } catch (error: unknown) {
    logger.error('could not open the login browser');
    return { state: 'failed', message: error instanceof Error ? error.message : 'unknown error' };
  }
  try {
    await session.open(LOGIN_URL);
    if (!(await waitForLogin(session, sleep, timeoutMs))) return { state: 'timeout' };
    const result = await captureAndSave(session, dir, name, sleep);
    logger.info('login finished', { state: result.state });
    return result;
  } catch (error: unknown) {
    logger.error('login failed');
    return { state: 'failed', message: error instanceof Error ? error.message : 'unknown error' };
  } finally {
    await session.close().catch(() => undefined);
  }
}
