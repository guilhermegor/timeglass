import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { FetchLike } from '../api/types.js';
import { saveStorageState } from '../store/account-store.js';

import { runPopoverCommand } from './entry.js';
import { loadUsageSnapshot, saveUsageSnapshot } from './snapshot.js';

const HTTP_OK = 200;
const HTTP_ERROR = 500;

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-home-'));
  const accountsDir = path.join(home, 'accounts');
  fs.mkdirSync(accountsDir);
  const env = { TIMEGLASS_ACCOUNTS_DIR: accountsDir, XDG_CACHE_HOME: path.join(home, 'cache') };
  return { home, accountsDir, opts: { homeDir: home, env } };
}

function respond(body: unknown, status = HTTP_OK) {
  return {
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const fakeFetch: FetchLike = (url) => {
  if (url.endsWith('/api/organizations')) {
    return Promise.resolve(respond([{ uuid: 'org-1', name: 'x', capabilities: ['chat'] }]));
  }
  return Promise.resolve(respond({}, HTTP_ERROR));
};

describe('runPopoverCommand', () => {
  it('rejects an unknown command with the usage line', async () => {
    const result = await runPopoverCommand(['nope'], sandbox().opts);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/usage/);
  });

  it('renders an empty model before any refresh', async () => {
    const result = await runPopoverCommand(['model'], sandbox().opts);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ bar: '—', accounts: [] });
  });

  it('stores an edited label', async () => {
    const { opts } = sandbox();
    expect((await runPopoverCommand(['label', 'work', 'Work', 'laptop'], opts)).code).toBe(0);
    const labels = fs.readFileSync(
      path.join(opts.homeDir, '.config', 'claudestatus-bar', 'labels.json'),
      'utf8',
    );
    expect(JSON.parse(labels)).toEqual({ work: 'Work laptop' });
  });

  it('refresh marks an account with no stored login as an error, not a guess', async () => {
    const { accountsDir, opts } = sandbox();
    fs.writeFileSync(path.join(accountsDir, 'ghost.storage.json'), '{}');
    expect((await runPopoverCommand(['refresh'], opts)).code).toBe(0);
    const [account] = loadUsageSnapshot(opts).accounts;
    expect(account).toMatchObject({ name: 'ghost', plan: 'unknown' });
    expect(account?.error).toMatch(/Not logged in/);
  });

  it('refresh records a rejected request as a network error, not a crash', async () => {
    const { accountsDir, opts } = sandbox();
    const state = {
      cookies: [{ name: 's', value: 'v', domain: '.claude.ai', path: '/', expires: -1 }],
      origins: [],
    };
    fs.writeFileSync(path.join(accountsDir, 'acme.storage.json'), JSON.stringify(state));
    const down = (): Promise<never> => Promise.reject(new Error('getaddrinfo ENOTFOUND api.claude.ai'));
    expect((await runPopoverCommand(['refresh'], { ...opts, fetch: down })).code).toBe(0);
    const [account] = loadUsageSnapshot(opts).accounts;
    expect(account?.error).toMatch(/Usage unavailable \(network\)/);
  });

  it('refresh records a failed usage read as an error', async () => {
    const { accountsDir, opts } = sandbox();
    const state = {
      cookies: [{ name: 's', value: 'v', domain: '.claude.ai', path: '/', expires: -1 }],
      origins: [],
    };
    fs.writeFileSync(path.join(accountsDir, 'acme.storage.json'), JSON.stringify(state));
    await runPopoverCommand(['refresh'], { ...opts, fetch: fakeFetch });
    const [account] = loadUsageSnapshot(opts).accounts;
    expect(account?.name).toBe('acme');
    expect(account?.session).toBeUndefined();
    expect(account?.error).toMatch(/Usage unavailable/);
  });
});

describe('runPopoverCommand refresh persistence', () => {
  it('refresh exits non-zero when the results cannot be saved', async () => {
    const { home, opts } = sandbox();
    const blocker = path.join(home, 'blocker');
    fs.writeFileSync(blocker, 'x');
    const env = { ...opts.env, XDG_CACHE_HOME: path.join(blocker, 'cache') };
    const result = await runPopoverCommand(['refresh'], { ...opts, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Could not save/);
  });
});

describe('runPopoverCommand lifespan', () => {
  const SAVED = { cookies: [], origins: [] };
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('edit sets lifespan and the model carries badge, fields and warning', async () => {
    const { accountsDir, opts } = sandbox();
    saveStorageState(accountsDir, 'work', SAVED);
    const now = new Date('2026-11-03T12:00:00Z');
    const edit = ['edit', 'work', '--lifespan', 'temporary', '--until', '2026-11-05'];
    expect((await runPopoverCommand(edit, { ...opts, now })).code).toBe(0);
    saveUsageSnapshot({ at: null, accounts: [{ name: 'work', plan: 'pro' }] }, opts);
    const model = JSON.parse((await runPopoverCommand(['model'], { ...opts, now })).stdout);
    expect(model.accounts[0]).toMatchObject({ lifespan: 'temporary', until: '2026-11-05' });
    expect(model.accounts[0].text).toMatch(/temporary, expires (in \dd|today)/);
    expect(model.notices[0]).toContain('will be removed');
  });

  it('edit rejects until without temporary', async () => {
    const { accountsDir, opts } = sandbox();
    saveStorageState(accountsDir, 'work', SAVED);
    const result = await runPopoverCommand(['edit', 'work', '--until', '2030-01-01'], opts);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--lifespan temporary/);
  });

  it('model purges an expired account and reports a one-line notice', async () => {
    const { accountsDir, opts } = sandbox();
    saveStorageState(accountsDir, 'work', SAVED);
    const before = new Date('2026-11-01T12:00:00Z');
    const edit = ['edit', 'work', '--lifespan', 'temporary', '--until', '2026-11-02'];
    await runPopoverCommand(edit, { ...opts, now: before });
    const after = new Date('2026-11-03T12:00:00Z');
    const model = JSON.parse((await runPopoverCommand(['model'], { ...opts, now: after })).stdout);
    expect(model.notices).toEqual(['Removed expired temporary account "work" and its cached data.']);
    expect(fs.readdirSync(accountsDir).filter((f) => f.endsWith('.storage.json'))).toEqual([]);
  });
});
