import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { FetchLike, FetchResponse } from '../api/types';
import { saveStorageState } from '../store/account-store';
import { NULL_EMITTER } from '../utils/log-emitter';

import { EXIT_OK, EXIT_USAGE, runCli, type CliDeps } from './main';
import { renderTable } from './table';

const MS_PER_SECOND = 1000;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const NOW = new Date('2026-11-02T00:00:00Z');
const NOW_S = NOW.getTime() / MS_PER_SECOND;
const DAY_S = 86_400;
const SESSION_PERCENT = 12.4;
const WEEKLY_PERCENT = 40;

const BODIES: Record<string, unknown> = {
  organizations: [{ uuid: 'org-1', capabilities: ['chat', 'claude_pro'] }],
  detail: { billing_type: 'stripe_subscription' },
  subscription: {
    next_charge_at: '2026-12-01T00:00:00Z',
    plan_ending_at: null,
    billing_interval: 'month',
  },
  usage: {
    five_hour: { utilization: SESSION_PERCENT, resets_at: '2026-11-02T18:00:00Z' },
    seven_day: { utilization: WEEKLY_PERCENT, resets_at: '2026-11-07T09:30:00Z' },
  },
};

function reply(status: number, body: unknown): FetchResponse {
  return {
    status,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function routeOf(url: string): string {
  if (url.endsWith('/subscription_details')) return 'subscription';
  if (url.endsWith('/usage')) return 'usage';
  return url.endsWith('/api/organizations') ? 'organizations' : 'detail';
}

const okFetch: FetchLike = (url) => Promise.resolve(reply(HTTP_OK, BODIES[routeOf(url)]));
const deniedFetch: FetchLike = () => Promise.resolve(reply(HTTP_UNAUTHORIZED, {}));

let root: string;
let out: string[];
let err: string[];

function deps(argv: string[], fetch?: FetchLike): CliDeps {
  return {
    argv,
    version: '9.9.9',
    dir: path.join(root, 'accounts'),
    logger: NULL_EMITTER,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    fetch,
    now: NOW,
    timeZone: 'UTC',
    paths: { homeDir: root, env: { XDG_CACHE_HOME: path.join(root, 'cache') } },
  };
}

function saveAccount(name: string): void {
  const cookie = {
    name: 'sessionKey',
    value: 'secret',
    domain: '.claude.ai',
    path: '/',
    expires: NOW_S + DAY_S,
  };
  saveStorageState(path.join(root, 'accounts'), name, { cookies: [cookie], origins: [] });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'timeglass-cli-'));
  out = [];
  err = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('renderTable', () => {
  it('renderTable_widerCell_padsColumns', () => {
    expect(renderTable(['A', 'B'], [['long', 'x']]).split('\n')).toEqual([
      'A     B',
      '----  -',
      'long  x',
    ]);
  });
});

describe('runCli', () => {
  it('runCli_version_printsVersion', async () => {
    expect(await runCli(deps(['--version']))).toBe(EXIT_OK);
    expect(out).toEqual(['9.9.9']);
  });

  it('runCli_unknownCommand_exitsUsage', async () => {
    expect(await runCli(deps(['bogus']))).toBe(EXIT_USAGE);
    expect(err.join('\n')).toContain('Unknown command: bogus');
  });

  it('runCli_inheritedKeyAsCommand_exitsUsage', async () => {
    expect(await runCli(deps(['constructor']))).toBe(EXIT_USAGE);
  });

  it('runCli_noAccounts_hintsAdd', async () => {
    expect(await runCli(deps([], okFetch))).toBe(EXIT_OK);
    expect(out.join('\n')).toContain('timeglass add <name>');
  });

  it('runCli_savedAccount_printsUsageAndBillingTables', async () => {
    saveAccount('work');
    expect(await runCli(deps([], okFetch))).toBe(EXIT_OK);
    const text = out.join('\n');
    expect(text).toContain('12%  resets Mon 18:00');
    expect(text).toContain('40%  resets Sat 09:30');
    expect(text).toMatch(/work\s+pro\s+\S+\s+1 Dec 2026 \(29d\)\s+yes/);
  });

  it('runCli_unauthorized_rendersUnknownCells', async () => {
    saveAccount('work');
    expect(await runCli(deps([], deniedFetch))).toBe(EXIT_OK);
    const text = out.join('\n');
    expect(text).toMatch(/work\s+unknown\s+unknown/);
    expect(text).toMatch(/work\s+unknown\s+unknown\s+unknown\s+unknown/);
  });

  it('runCli_accountWithoutSession_rendersUnknownCells', async () => {
    saveAccount('work');
    const expired = { name: 'sessionKey', value: 's', domain: '.claude.ai', path: '/', expires: 1 };
    saveStorageState(path.join(root, 'accounts'), 'old', { cookies: [expired], origins: [] });
    await runCli(deps([], okFetch));
    expect(out.join('\n')).toMatch(/old\s+unknown\s+unknown/);
  });

});

describe('runCli add', () => {
  it('runCli_addWithoutName_exitsUsage', async () => {
    expect(await runCli(deps(['add']))).toBe(EXIT_USAGE);
  });

  it('runCli_addInvalidName_exitsUsage', async () => {
    expect(await runCli(deps(['add', '../evil']))).toBe(EXIT_USAGE);
    expect(err.join('\n')).toContain('Invalid account name');
  });

  it('runCli_addFailingBrowser_exitsFailed', async () => {
    const failing = deps(['add', 'work']);
    failing.openSession = () => Promise.reject(new Error('no chrome'));
    expect(await runCli(failing)).toBe(1);
    expect(err.join('\n')).toContain('Login failed: no chrome');
  });
});
