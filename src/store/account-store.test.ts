import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  defaultAccountsDir,
  listAccounts,
  loadCookieHeader,
  loadStorageState,
  removeAccount,
  saveStorageState,
  storageStatePath,
} from './account-store';
import { buildCookieHeader, type StorageCookie, type StorageState } from './storage-state';

const MS_PER_SECOND = 1000;
const NOW_MS = Date.parse('2026-11-02T00:00:00Z');
const NOW_S = NOW_MS / MS_PER_SECOND;
const BAD_PATH = 7;
const WIDE_MODE = 0o644;
const WIDE_DIR_MODE = 0o755;
const NAME_TOO_LONG = 65;
const SECONDS_PER_DAY = 86_400;
const MODE_MASK = 0o777;
const OWNER_ONLY = 0o600;
const OWNER_ONLY_DIR = 0o700;

function cookie(overrides: Partial<StorageCookie>): StorageCookie {
  return {
    name: 'sessionKey',
    value: 'secret',
    domain: '.claude.ai',
    path: '/',
    expires: NOW_S + SECONDS_PER_DAY,
    ...overrides,
  };
}

function stateWith(...cookies: StorageCookie[]): StorageState {
  return { cookies, origins: [] };
}

let dir: string;

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timeglass-store-')), 'accounts');
});

afterEach(() => {
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe('saveStorageState', () => {
  it('writes the file with mode 0600 and round-trips the state', () => {
    const state = stateWith(cookie({}));
    saveStorageState(dir, 'work', state);

    const file = storageStatePath(dir, 'work');
    expect(fs.statSync(file).mode & MODE_MASK).toBe(OWNER_ONLY);
    expect(loadStorageState(dir, 'work')).toEqual(state);
  });

  it('keeps only claude.ai cookies and drops foreign cookies and every origin', () => {
    const origins = [
      { origin: 'https://claude.ai', localStorage: [] },
      { origin: 'https://evil.example' },
    ];
    saveStorageState(dir, 'work', {
      cookies: [
        cookie({ name: 'keep', domain: '.claude.ai' }),
        cookie({ name: 'cf_clearance', domain: '.claude.ai' }),
        cookie({ name: 'suffix', domain: 'claude.ai.evil.example' }),
        cookie({ name: 'cf', domain: '.cloudflare.com' }),
        cookie({ name: 'sso', domain: 'accounts.google.com' }),
        cookie({ name: 'lookalike', domain: 'notclaude.ai' }),
      ],
      origins,
    });

    const raw = fs.readFileSync(storageStatePath(dir, 'work'), 'utf8');
    expect(JSON.parse(raw)).toEqual({
      cookies: [cookie({ name: 'keep' }), cookie({ name: 'cf_clearance' })],
      origins: [],
    });
    expect(raw).not.toContain('evil.example');
  });

  it('tightens an existing wider file back to 0600 and leaves no temp file', () => {
    saveStorageState(dir, 'work', stateWith(cookie({})));
    fs.chmodSync(storageStatePath(dir, 'work'), WIDE_MODE);
    saveStorageState(dir, 'work', stateWith(cookie({ value: 'rotated' })));

    expect(fs.statSync(storageStatePath(dir, 'work')).mode & MODE_MASK).toBe(OWNER_ONLY);
    expect(fs.readdirSync(dir)).toEqual(['work.storage.json']);
  });
});

describe('loadStorageState fails closed', () => {
  it('returns null for a missing account', () => {
    expect(loadStorageState(dir, 'nobody')).toBeNull();
  });

  it.each([
    ['not JSON', '{nope'],
    ['a JSON array', '[]'],
    ['cookies not a list', '{"cookies":"x"}'],
    ['a cookie without a value', '{"cookies":[{"name":"a","domain":"claude.ai","expires":1}]}'],
  ])('returns null for %s', (_label, content) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storageStatePath(dir, 'bad'), content);
    expect(loadStorageState(dir, 'bad')).toBeNull();
  });
});

describe('account names', () => {
  it.each(['../evil', 'a/b', '', '.hidden', 'x'.repeat(NAME_TOO_LONG), 'name\0', 'a b'])(
    'rejects %j before touching the filesystem',
    (name) => {
      expect(() => saveStorageState(dir, name, stateWith())).toThrow('Invalid account name');
      expect(fs.existsSync(dir)).toBe(false);
    },
  );
});

describe('account name guards', () => {
  it('rejects names ending in the state-file suffix', () => {
    expect(() => saveStorageState(dir, 'work.storage.json', stateWith())).toThrow(
      'Invalid account name',
    );
  });

  it('makes load reject an invalid name exactly like save', () => {
    expect(() => loadStorageState(dir, '../evil')).toThrow('Invalid account name');
  });

  it('rejects a cookie whose path is not a string', () => {
    fs.mkdirSync(dir, { recursive: true });
    const bad = {
      cookies: [{ name: 'a', value: 'b', domain: 'claude.ai', path: BAD_PATH, expires: 1 }],
    };
    fs.writeFileSync(storageStatePath(dir, 'bad'), JSON.stringify(bad));
    expect(loadStorageState(dir, 'bad')).toBeNull();
  });

  it('replaces a stale temp file left by a crashed write', () => {
    saveStorageState(dir, 'work', stateWith(cookie({})));
    const temp = `${storageStatePath(dir, 'work')}.${process.pid}.tmp`;
    fs.writeFileSync(temp, 'stale');
    saveStorageState(dir, 'work', stateWith(cookie({ value: 'fresh' })));

    expect(fs.existsSync(temp)).toBe(false);
    expect(loadStorageState(dir, 'work')?.cookies[0]?.value).toBe('fresh');
  });

  it('leaves the mode of a caller-supplied existing directory alone', () => {
    fs.mkdirSync(dir, { recursive: true, mode: WIDE_DIR_MODE });
    fs.chmodSync(dir, WIDE_DIR_MODE);
    saveStorageState(dir, 'work', stateWith(cookie({})));

    expect(fs.statSync(dir).mode & MODE_MASK).toBe(WIDE_DIR_MODE);
  });

  it('creates a new directory owner-only', () => {
    saveStorageState(dir, 'work', stateWith(cookie({})));
    expect(fs.statSync(dir).mode & MODE_MASK).toBe(OWNER_ONLY_DIR);
  });
});

describe('listAccounts and removeAccount', () => {
  it('lists saved accounts sorted, ignoring unrelated files', () => {
    saveStorageState(dir, 'zeta', stateWith());
    saveStorageState(dir, 'alpha', stateWith());
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');

    expect(listAccounts(dir)).toEqual(['alpha', 'zeta']);
  });

  it('lists nothing when the directory does not exist', () => {
    expect(listAccounts(dir)).toEqual([]);
  });

  it('rethrows a directory read failure that is not a missing directory', () => {
    fs.writeFileSync(dir, 'x');
    expect(() => listAccounts(dir)).toThrow();
  });

  it('removes a session and tolerates removing it twice', () => {
    saveStorageState(dir, 'work', stateWith());
    removeAccount(dir, 'work');
    removeAccount(dir, 'work');
    expect(listAccounts(dir)).toEqual([]);
  });
});

describe('buildCookieHeader', () => {
  it('joins claude.ai cookies and drops other domains and expired cookies', () => {
    const header = buildCookieHeader(
      stateWith(
        cookie({ name: 'a', value: '1' }),
        cookie({ name: 'b', value: '2', domain: 'claude.ai' }),
        cookie({ name: 'session', value: '3', expires: -1 }),
        cookie({ name: 'expired', value: '4', expires: NOW_S - 1 }),
        cookie({ name: 'other', value: '5', domain: '.example.com' }),
        cookie({ name: 'lookalike', value: '6', domain: 'notclaude.ai' }),
      ),
      NOW_MS,
    );
    expect(header).toBe('a=1; b=2; session=3');
  });

  it('is empty when every cookie has expired', () => {
    expect(buildCookieHeader(stateWith(cookie({ expires: NOW_S - 1 })), NOW_MS)).toBe('');
  });
});

describe('loadCookieHeader', () => {
  it('returns the header for a saved session', () => {
    saveStorageState(dir, 'work', stateWith(cookie({ name: 'k', value: 'v' })));
    expect(loadCookieHeader(dir, 'work', NOW_MS)).toBe('k=v');
  });

  it('returns null for a missing session or one with no fresh cookie', () => {
    saveStorageState(dir, 'stale', stateWith(cookie({ expires: NOW_S - 1 })));
    expect(loadCookieHeader(dir, 'nobody', NOW_MS)).toBeNull();
    expect(loadCookieHeader(dir, 'stale', NOW_MS)).toBeNull();
  });
});

describe('defaultAccountsDir', () => {
  it('prefers TIMEGLASS_ACCOUNTS_DIR, then XDG_CONFIG_HOME, then the home config dir', () => {
    expect(defaultAccountsDir({ TIMEGLASS_ACCOUNTS_DIR: '/a', XDG_CONFIG_HOME: '/x' })).toBe('/a');
    expect(defaultAccountsDir({ XDG_CONFIG_HOME: '/x' })).toBe('/x/timeglass/accounts');
    expect(defaultAccountsDir({})).toBe(path.join(os.homedir(), '.config/timeglass/accounts'));
  });
});
