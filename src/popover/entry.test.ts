import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { FetchLike } from '../api/types.js';

import { runPopoverCommand } from './entry.js';
import { loadUsageSnapshot } from './snapshot.js';

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

  it('stores and shows an edited label', async () => {
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
