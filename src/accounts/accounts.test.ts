import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PRIVATE_FILE_MODE } from '../cache/json-file.js';

import { detectActiveAccount } from './active.js';
import { readLabels, renameLabel, setLabel } from './labels.js';

const ACCOUNTS = [
  { name: 'work', orgUuid: 'org-w' },
  { name: 'home', orgUuid: 'org-h' },
];

const PERMISSION_BITS = 0o777;
let home: string;
const opts = () => ({ homeDir: home, env: {} });

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-accounts-'));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe('detectActiveAccount', () => {
  const writeClaudeJson = (content: string, dir = home) =>
    fs.writeFileSync(path.join(dir, '.claude.json'), content);

  it('matches oauthAccount.organizationUuid to an account orgUuid', () => {
    writeClaudeJson(JSON.stringify({ oauthAccount: { organizationUuid: 'org-h' } }));
    expect(detectActiveAccount(ACCOUNTS, opts())).toBe('home');
  });

  it('reads $CLAUDE_CONFIG_DIR/.claude.json when set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cfg-'));
    try {
      writeClaudeJson(JSON.stringify({ oauthAccount: { organizationUuid: 'org-w' } }), dir);
      expect(
        detectActiveAccount(ACCOUNTS, { homeDir: home, env: { CLAUDE_CONFIG_DIR: dir } }),
      ).toBe('work');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['missing file', null],
    ['malformed JSON', '{nope'],
    ['JSON null', 'null'],
    ['no oauthAccount', '{}'],
    ['non-string uuid', '{"oauthAccount":{"organizationUuid":5}}'],
    ['no match', '{"oauthAccount":{"organizationUuid":"other"}}'],
  ])('is "unknown" for %s', (_label, content) => {
    if (content !== null) writeClaudeJson(content);
    expect(detectActiveAccount(ACCOUNTS, opts())).toBe('unknown');
  });

  it('is "unknown" when two accounts share the org', () => {
    writeClaudeJson(JSON.stringify({ oauthAccount: { organizationUuid: 'same' } }));
    const dup = ACCOUNTS.map((a) => ({ ...a, orgUuid: 'same' }));
    expect(detectActiveAccount(dup, opts())).toBe('unknown');
  });
});

describe('labels', () => {
  it('reads empty when absent or corrupt', () => {
    expect(readLabels(opts())).toEqual({});
    const file = path.join(home, '.config', 'claudestatus-bar', 'labels.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{oops');
    expect(readLabels(opts())).toEqual({});
  });

  it('sets, overwrites and clears a label, file mode 0600', () => {
    expect(setLabel('work', ' Day job ', opts())).toBe(true);
    expect(readLabels(opts())).toEqual({ work: 'Day job' });
    const file = path.join(home, '.config', 'claudestatus-bar', 'labels.json');
    expect(fs.statSync(file).mode & PERMISSION_BITS).toBe(PRIVATE_FILE_MODE);
    setLabel('work', 'Main', opts());
    expect(readLabels(opts())).toEqual({ work: 'Main' });
    setLabel('work', '  ', opts());
    expect(readLabels(opts())).toEqual({});
  });
});

describe('labels on unusual files', () => {
  it('refuses to edit a labels file holding non-object JSON, leaving it alone', () => {
    const file = path.join(home, '.config', 'claudestatus-bar', 'labels.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '["x"]');
    const warn = jest.fn();
    const log = { debug: jest.fn(), info: jest.fn(), warn, error: jest.fn() };
    expect(setLabel('work', 'W', opts(), log)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('["x"]');
    expect(warn).toHaveBeenCalledWith('ignoring non-object file', expect.any(Object));
  });

  it('refuses to rename in a labels file holding non-object JSON', () => {
    const file = path.join(home, '.config', 'claudestatus-bar', 'labels.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '["x"]');
    expect(renameLabel('work', 'other', opts())).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('["x"]');
  });

  it('writes a label through a symlinked labels.json', () => {
    const file = path.join(home, '.config', 'claudestatus-bar', 'labels.json');
    const real = path.join(home, 'real-labels.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(real, '{}');
    fs.symlinkSync(real, file);
    expect(setLabel('work', 'W', opts())).toBe(true);
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(JSON.parse(fs.readFileSync(real, 'utf8'))).toEqual({ work: 'W' });
  });
});

describe('label renames', () => {
  it('renames a label to a new account name, refusing to clobber another', () => {
    setLabel('a', 'A', opts());
    setLabel('b', 'B', opts());
    expect(renameLabel('a', 'b', opts())).toBe(false);
    expect(renameLabel('a', 'c', opts())).toBe(true);
    expect(readLabels(opts())).toEqual({ b: 'B', c: 'A' });
    expect(renameLabel('missing', 'x', opts())).toBe(true);
  });

  it('refuses to overwrite a corrupt labels file and keeps foreign values', () => {
    const file = path.join(home, '.config', 'claudestatus-bar', 'labels.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"a": "A",}');
    expect(setLabel('b', 'B', opts())).toBe(false);
    expect(renameLabel('a', 'c', opts())).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"a": "A",}');
    fs.writeFileSync(file, '{"a": "A", "meta": {"x": 1}}');
    expect(setLabel('b', 'B', opts())).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ a: 'A', meta: { x: 1 }, b: 'B' });
  });

  it('renames onto an identical label but not a different one', () => {
    setLabel('a', 'Same', opts());
    setLabel('b', 'Same', opts());
    expect(renameLabel('a', 'b', opts())).toBe(true);
    expect(readLabels(opts())).toEqual({ b: 'Same' });
  });

  it('treats __proto__ and constructor as ordinary account names', () => {
    expect(setLabel('__proto__', 'P', opts())).toBe(true);
    expect(readLabels(opts())).toEqual({ ['__proto__']: 'P' });
    setLabel('a', 'A', opts());
    expect(renameLabel('a', 'constructor', opts())).toBe(true);
    expect(Object.keys(readLabels(opts())).sort()).toEqual(['__proto__', 'constructor']);
  });
});
