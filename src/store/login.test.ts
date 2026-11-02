import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { LogEmitter } from '../utils/log-emitter';

import { loadStorageState, storageStatePath } from './account-store';
import { addAccount } from './login';
import type { LoginSession } from './login-session';

const OWNER_ONLY = 0o600;
const MODE_MASK = 0o777;
const POLL_MS = 2000;
const LOGIN_TIMEOUT_MS = 10_000;
const STATE = {
  cookies: [
    { name: 'sessionKey', value: 'sk-secret', domain: '.claude.ai', path: '/', expires: -1 },
  ],
  origins: [],
};

interface FakeSession extends LoginSession {
  opened: string[];
  closed: boolean;
  probes: number;
}

function fakeSession(loggedInAfter: number, storageState: unknown = STATE): FakeSession {
  const session: FakeSession = {
    opened: [],
    closed: false,
    probes: 0,
    open: (url) => {
      session.opened.push(url);
      return Promise.resolve();
    },
    isLoggedIn: () => {
      session.probes += 1;
      return Promise.resolve(session.probes > loggedInAfter);
    },
    storageState: () => Promise.resolve(storageState),
    close: () => {
      session.closed = true;
      return Promise.resolve();
    },
  };
  return session;
}

let dir: string;
const sleeps: number[] = [];
const sleep = (ms: number): Promise<void> => {
  sleeps.push(ms);
  return Promise.resolve();
};

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timeglass-login-')), 'accounts');
  sleeps.length = 0;
});

afterEach(() => {
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe('addAccount', () => {
  it('opens the login page, waits for sign-in, saves the session 0600 and closes the browser', async () => {
    const session = fakeSession(2);
    const result = await addAccount('work', {
      dir,
      sleep,
      openSession: () => Promise.resolve(session),
    });

    expect(result).toEqual({ state: 'added' });
    expect(session.opened).toEqual(['https://claude.ai/login']);
    expect(session.closed).toBe(true);
    expect(loadStorageState(dir, 'work')).toEqual(STATE);
    expect(fs.statSync(storageStatePath(dir, 'work')).mode & MODE_MASK).toBe(OWNER_ONLY);
    expect(sleeps.slice(0, 2)).toEqual([POLL_MS, POLL_MS]);
  });

  it('times out without saving anything, and still closes the browser', async () => {
    const session = fakeSession(Infinity);
    const result = await addAccount('work', {
      dir,
      sleep,
      timeoutMs: LOGIN_TIMEOUT_MS,
      openSession: () => Promise.resolve(session),
    });

    expect(result).toEqual({ state: 'timeout' });
    expect(session.closed).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('fails without saving when the browser returns no usable session', async () => {
    const session = fakeSession(0, { not: 'a state' });
    const result = await addAccount('work', {
      dir,
      sleep,
      openSession: () => Promise.resolve(session),
    });

    expect(result).toMatchObject({ state: 'failed' });
    expect(loadStorageState(dir, 'work')).toBeNull();
    expect(session.closed).toBe(true);
  });

});

describe('addAccount degraded paths', () => {
  it('reports a browser that cannot launch instead of throwing', async () => {
    const result = await addAccount('work', {
      dir,
      sleep,
      openSession: () => Promise.reject(new Error('Chrome is not installed')),
    });
    expect(result).toEqual({ state: 'failed', message: 'Chrome is not installed' });
  });

  it('keeps polling through a probe that throws mid-navigation', async () => {
    const session = fakeSession(0);
    let calls = 0;
    session.isLoggedIn = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('navigation')) : Promise.resolve(true);
    };
    const result = await addAccount('work', {
      dir,
      sleep,
      openSession: () => Promise.resolve(session),
    });
    expect(result).toEqual({ state: 'added' });
  });

  it('rejects an invalid name before opening a browser', async () => {
    const openSession = jest.fn();
    await expect(addAccount('../evil', { dir, sleep, openSession })).rejects.toThrow(
      'Invalid account name',
    );
    expect(openSession).not.toHaveBeenCalled();
  });

  it('logs the outcome but never the session contents', async () => {
    const lines: string[] = [];
    const record = (message: string, context?: Record<string, unknown>): void => {
      lines.push(JSON.stringify([message, context]));
    };
    const logger: LogEmitter = { debug: record, info: record, warn: record, error: record };
    await addAccount('work', {
      dir,
      sleep,
      logger,
      openSession: () => Promise.resolve(fakeSession(0)),
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('')).not.toContain('sk-secret');
  });
});
