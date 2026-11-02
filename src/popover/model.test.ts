import type { BillingCache } from '../cache/billing.js';

import fixture from './fixture.json';
import { countdown, resetAt } from './format.js';
import { buildPopoverModel, recommend } from './model.js';
import type { SnapshotAccount, UsageSnapshot } from './snapshot.js';

const now = new Date(fixture.now);
const usage = fixture.usage as UsageSnapshot;
const cache = fixture.cache as BillingCache;

const model = buildPopoverModel(usage, cache, { now });
const text = (name: string): string => model.accounts.find((a) => a.name === name)?.text ?? '';

describe('buildPopoverModel', () => {
  it('shows the recommended account percent when none is active', () => {
    expect(model.recommended).toBe('personal');
    expect(model.bar).toBe('54%');
    expect(model.activeLine).toBe('active: unknown');
  });

  it('keeps accounts in input order', () => {
    expect(model.accounts.map((a) => a.name)).toEqual(['personal', 'work', 'lapsed', 'broken']);
  });

  it('renders bars, countdown, renewal and data age for an account', () => {
    const t = text('personal');
    expect(t).toMatch(/^personal {2}Pro\n/);
    expect(t).toMatch(/Session {2}█████░░░░░\s+54%\s+resets in 4h39m/);
    expect(t).toMatch(/Weekly\s+███░░░░░░░\s+30%\s+resets in 3d0h/);
    expect(t).toMatch(/Renews 5 Nov {2}· {2}updated 3 min ago/);
  });

  it('reads Ends when auto-renew is off', () => {
    expect(text('work')).toMatch(/Ends 5 Nov/);
  });

  it('flags a free plan and falls back to the cached weekly reset', () => {
    const t = text('lapsed');
    expect(t).toMatch(/⚠ unpaid/);
    expect(t).toMatch(/Weekly .*resets in 5d0h/);
    expect(t).toMatch(/Renewal unknown/);
  });

  it('shows an errored account without bars', () => {
    expect(text('broken')).toMatch(/✗ Session expired/);
    expect(text('broken')).not.toMatch(/Session {2}/);
  });
});

describe('buildPopoverModel overrides', () => {
  it('marks the active account and leads the bar with its name', () => {
    const active = buildPopoverModel(usage, cache, { now, activeName: 'work' });
    expect(active.bar).toBe('work 10%');
    expect(active.active).toBe('work');
    expect(active.accounts[1]?.text).toMatch(/● active/);
  });

  it('falls back to the recommended percent when the active account has no usage', () => {
    expect(buildPopoverModel(usage, cache, { now, activeName: 'broken' }).bar).toBe('54%');
  });

  it('shows the label in place of the account name', () => {
    const labelled = buildPopoverModel(usage, cache, { now, labels: { personal: 'Me' } });
    expect(labelled.accounts[0]?.label).toBe('Me');
    expect(labelled.accounts[0]?.text).toMatch(/^Me {2}Pro/);
  });

  it('renders an empty, safe model with no snapshot', () => {
    expect(buildPopoverModel({ at: null, accounts: [] }, {}, { now })).toEqual({
      bar: '—',
      recommended: null,
      active: null,
      activeLine: 'active: unknown',
      accounts: [],
    });
  });

  it('pairs the countdown with the absolute time and keeps unknown unknown', () => {
    expect(text('personal')).toMatch(/resets in 4h39m \((today|tomorrow|\w{3}) \d{2}:\d{2}\)/);
    const bad = { at: fixture.now, accounts: fixture.badReset } as UsageSnapshot;
    expect(buildPopoverModel(bad, {}, { now }).accounts[0]?.text).toMatch(/reset unknown/);
  });

  it('reads the admin note for a team member without billing access', () => {
    const managed = fixture.managedCache as BillingCache;
    const t = buildPopoverModel(usage, managed, { now }).accounts[2]?.text;
    expect(t).toMatch(/Billing managed by team admin/);
  });
});

describe('recommend', () => {
  it('picks the account that frees up first when all are exhausted', () => {
    const accounts = fixture.exhausted as SnapshotAccount[];
    expect(recommend(accounts, now)?.name).toBe('fast');
  });
});

describe('time formatting', () => {
  it('clamps a past time to now', () => {
    expect(countdown('2026-10-12T11:00:00Z', now)).toBe('now');
  });

  it('labels the calendar day in the given time zone', () => {
    const n = new Date('2026-10-12T10:00:00Z');
    expect(resetAt('2026-10-12T21:44:00Z', n, 'UTC')).toBe('today 21:44');
    expect(resetAt('2026-10-13T00:05:00Z', n, 'UTC')).toBe('tomorrow 00:05');
    expect(resetAt('2026-10-14T08:00:00Z', n, 'UTC')).toBe('Wed 08:00');
    expect(resetAt('2026-10-19T10:00:00Z', n, 'UTC')).toBe('Mon 19 Oct 10:00');
    expect(resetAt('2026-10-12T21:44:00Z', n, 'America/Sao_Paulo')).toBe('today 18:44');
  });

  it('reads the same instant as today in one zone and tomorrow in another', () => {
    const n = new Date('2026-10-12T22:00:00Z');
    expect(resetAt('2026-10-13T01:00:00Z', n, 'UTC')).toBe('tomorrow 01:00');
    expect(resetAt('2026-10-13T01:00:00Z', n, 'America/Sao_Paulo')).toBe('today 22:00');
  });
});
