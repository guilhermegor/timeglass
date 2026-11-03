import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadBillingCache, recordBilling, saveBillingCache } from '../cache/billing';
import { loadUsageSnapshot, saveUsageSnapshot } from '../popover/snapshot';
import { listAccounts, saveStorageState } from '../store/account-store';

import { editAccount, parseEditArgs } from './edit';
import { purgeExpired } from './expiry';
import { readLabels, setLabel } from './labels';
import { expiryWarnings, isExpired, lifespanBadge, readLifespans } from './lifespan';

const NOW = new Date('2026-11-10T12:00:00Z');
const STATE = { cookies: [], origins: [] };

let root: string;
let dir: string;
let opts: { homeDir: string; env: Record<string, string> };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'timeglass-life-'));
  dir = path.join(root, 'accounts');
  opts = { homeDir: root, env: { XDG_CACHE_HOME: path.join(root, 'cache') } };
  saveStorageState(dir, 'work', STATE);
  saveStorageState(dir, 'side', STATE);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function ctx() {
  return { dir, opts, now: NOW, timeZone: 'UTC' };
}

describe('lifespan defaults', () => {
  it('readLifespans_noFile_everyAccountIsPermanent', () => {
    expect(readLifespans(dir)).toEqual({});
    expect(isExpired(readLifespans(dir).work, '2099-01-01')).toBe(false);
  });

  it('editAccount_labelOnly_keepsPermanentAndWritesNoRecord', () => {
    editAccount('work', { label: 'Day job' }, ctx());
    expect(readLifespans(dir)).toEqual({});
    expect(readLabels(opts).work).toBe('Day job');
  });
});

describe('edit validation', () => {
  it('editAccount_untilWithoutTemporary_throwsClearError', () => {
    expect(() => editAccount('work', { until: '2026-12-01' }, ctx())).toThrow(/--lifespan temporary/);
    expect(readLifespans(dir)).toEqual({});
  });

  it('editAccount_unknownAccount_throws', () => {
    expect(() => editAccount('nope', { lifespan: 'temporary' }, ctx())).toThrow(/Unknown account/);
  });

  it('editAccount_pastUntil_throws', () => {
    expect(() =>
      editAccount('work', { lifespan: 'temporary', until: '2026-11-09' }, ctx()),
    ).toThrow(/past/);
  });

  it('editAccount_temporaryWithUntil_persistsAndBackToPermanentClears', () => {
    editAccount('work', { lifespan: 'temporary', until: '2026-11-20' }, ctx());
    expect(readLifespans(dir).work).toEqual({ lifespan: 'temporary', until: '2026-11-20' });
    editAccount('work', { lifespan: 'permanent' }, ctx());
    expect(readLifespans(dir)).toEqual({});
  });

  it.each([['2026-13-01'], ['2026-02-30'], ['tomorrow'], ['2026-1-1']])(
    'parseEditArgs_badDate_%s_throws',
    (date) => {
      expect(() => parseEditArgs(['work', '--until', date])).toThrow(/YYYY-MM-DD/);
    },
  );

  it('parseEditArgs_equalsForm_andEmptyLabel_parse', () => {
    expect(parseEditArgs(['work', '--lifespan=temporary', '--label', ''])).toEqual({
      name: 'work',
      changes: { lifespan: 'temporary', label: '' },
    });
  });

  it('parseEditArgs_noChanges_throwsUsage', () => {
    expect(() => parseEditArgs(['work'])).toThrow(/Usage/);
  });
});

describe('expiry boundary', () => {
  const record = { lifespan: 'temporary' as const, until: '2026-11-10' };

  it('isExpired_untilDayItself_isNotExpired', () => {
    expect(isExpired(record, '2026-11-10')).toBe(false);
  });

  it('isExpired_dayAfterUntil_isExpired', () => {
    expect(isExpired(record, '2026-11-11')).toBe(true);
  });

  it('isExpired_permanentOrNoUntil_neverExpires', () => {
    expect(isExpired({ lifespan: 'permanent' }, '2099-01-01')).toBe(false);
    expect(isExpired({ lifespan: 'temporary' }, '2099-01-01')).toBe(false);
  });

  it('lifespanBadge_untilSet_countsDays', () => {
    expect(lifespanBadge(record, '2026-11-07')).toBe('temporary, expires in 3d');
    expect(lifespanBadge(record, '2026-11-10')).toBe('temporary, expires today');
    expect(lifespanBadge({ lifespan: 'temporary' }, '2026-11-10')).toBe('temporary');
    expect(lifespanBadge(undefined, '2026-11-10')).toBe('');
  });

  it('expiryWarnings_withinWindow_warnsOnlyThen', () => {
    const records = { work: record, side: { lifespan: 'temporary' as const, until: '2027-01-01' } };
    expect(expiryWarnings(records, ['work', 'side'], '2026-11-08')).toHaveLength(1);
  });
});

describe('purgeExpired', () => {
  function seed(): void {
    for (const name of ['work', 'side']) {
      const cache = loadBillingCache(opts);
      recordBilling(cache, name, { managedByAdmin: true }, NOW);
      saveBillingCache(cache, opts);
      setLabel(name, `label-${name}`, opts);
    }
    saveUsageSnapshot(
      {
        at: null,
        accounts: [
          { name: 'work', plan: 'pro' },
          { name: 'side', plan: 'pro' },
        ],
      },
      opts,
    );
    editAccount('work', { lifespan: 'temporary', until: '2026-11-12' }, ctx());
    editAccount('side', { lifespan: 'temporary', until: '2026-11-30' }, ctx());
  }

  it('purgeExpired_untilDayItself_keepsAccount', () => {
    seed();
    const day = new Date('2026-11-12T23:00:00Z');
    expect(purgeExpired({ ...ctx(), now: day })).toEqual([]);
    expect(listAccounts(dir)).toEqual(['side', 'work']);
  });

  it('purgeExpired_dayAfter_deletesOnlyThatAccountsFiles', () => {
    seed();
    const after = new Date('2026-11-13T00:00:00Z');
    expect(purgeExpired({ ...ctx(), now: after })).toEqual(['work']);
    expect(listAccounts(dir)).toEqual(['side']);
    expect(Object.keys(loadBillingCache(opts))).toEqual(['side']);
    expect(readLabels(opts)).toEqual({ side: 'label-side' });
    expect(loadUsageSnapshot(opts).accounts.map((a) => a.name)).toEqual(['side']);
    expect(Object.keys(readLifespans(dir))).toEqual(['side']);
  });

  it('purgeExpired_permanentAccountAndNoUntil_neverDeleted', () => {
    editAccount('side', { lifespan: 'temporary' }, ctx());
    const later = new Date('2099-01-01T00:00:00Z');
    expect(purgeExpired({ ...ctx(), now: later })).toEqual([]);
    expect(listAccounts(dir)).toEqual(['side', 'work']);
  });
});
