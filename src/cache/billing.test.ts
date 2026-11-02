import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  billingFromCache,
  billingFromSubscription,
  effectiveWeeklyReset,
  loadBillingCache,
  needsFetch,
  recordBilling,
  recordWeeklyReset,
  saveBillingCache,
  type BillingCache,
} from './billing.js';
import { PRIVATE_FILE_MODE, billingCachePath } from './json-file.js';

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const SERVER_ERROR = 500;
const PERMISSION_BITS = 0o777;
const DAYS_LEFT = 24;
const BAD_VALUE = 5;
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const NOW = new Date('2026-10-12T12:00:00Z');

describe('billingFromSubscription', () => {
  it('maps a renewing monthly plan', () => {
    expect(
      billingFromSubscription(OK, {
        next_charge_at: '2026-11-06T09:30:00Z',
        plan_ending_at: null,
        billing_interval: 'month',
      }),
    ).toEqual({
      period: 'monthly',
      autoRenew: true,
      renewalAt: '2026-11-06T09:30:00.000Z',
      loggedOut: false,
      managedByAdmin: false,
    });
  });

  it('treats plan_ending_at as a cancelled annual plan', () => {
    const r = billingFromSubscription(OK, {
      next_charge_at: '2026-10-20T09:30:00Z',
      plan_ending_at: '2026-10-20T09:30:00Z',
      billing_interval: 'year',
    });
    expect([r.autoRenew, r.period]).toEqual([false, 'annual']);
  });

  it('flags a 403 permission_error as managed by admin, but not a bare 403', () => {
    expect(
      billingFromSubscription(FORBIDDEN, { error: { type: 'permission_error' } }).managedByAdmin,
    ).toBe(true);
    expect(billingFromSubscription(FORBIDDEN, null).managedByAdmin).toBe(false);
  });

  it('flags 401 as logged out', () => {
    expect(billingFromSubscription(UNAUTHORIZED, {}).loggedOut).toBe(true);
  });

  it.each([
    [SERVER_ERROR, null],
    [OK, {}],
    [OK, { next_charge_at: 'garbage' }],
  ])('degrades to nulls for status %s body %j', (status, body) => {
    const r = billingFromSubscription(status, body);
    expect([r.renewalAt, r.autoRenew, r.loggedOut, r.managedByAdmin]).toEqual([
      null,
      null,
      false,
      false,
    ]);
  });
});

describe('weekly reset', () => {
  it('ignores a past reset and prefers a future API value', () => {
    const cache: BillingCache = {};
    recordWeeklyReset(cache, 'a', '2026-10-15T09:00:00Z', NOW);
    recordWeeklyReset(cache, 'a', '2026-10-01T09:00:00Z', NOW);
    expect(cache.a?.weeklyResetAt?.value).toBe('2026-10-15T09:00:00.000Z');
    expect(effectiveWeeklyReset(cache.a, '2026-10-01T09:00:00Z', NOW)).toBe(
      '2026-10-15T09:00:00.000Z',
    );
    expect(effectiveWeeklyReset(cache.a, '2026-10-16T00:00:00Z', NOW)).toBe(
      '2026-10-16T00:00:00.000Z',
    );
    expect(effectiveWeeklyReset(cache.a, null, new Date('2026-10-16T00:00:00Z'))).toBeNull();
  });
});

describe('prototype-polluting account names', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('ignores %s', (name) => {
    const cache: BillingCache = {};
    recordBilling(cache, name, { renewalAt: '2026-11-05T12:00:00.000Z', autoRenew: true }, NOW);
    recordWeeklyReset(cache, name, '2026-10-15T09:00:00Z', NOW);
    expect(Object.keys(cache)).toEqual([]);
    expect(Object.getPrototypeOf(cache)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).renewalAt).toBeUndefined();
  });
});

describe('billing cache', () => {
  let home: string;
  const opts = () => ({ homeDir: home, env: {} });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-billing-'));
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('round-trips with mode 0600, readAt, and no extra keys', () => {
    expect(loadBillingCache(opts())).toEqual({});
    const cache: BillingCache = {};
    recordBilling(cache, 'work', { renewalAt: '2026-11-05T12:00:00.000Z', autoRenew: true }, NOW);
    recordWeeklyReset(cache, 'work', '2026-10-15T09:00:00Z', NOW);
    recordBilling(cache, 'work', { renewalAt: null, autoRenew: null }, NOW);
    expect(saveBillingCache(cache, opts())).toBe(true);
    expect(fs.statSync(billingCachePath(opts())).mode & PERMISSION_BITS).toBe(PRIVATE_FILE_MODE);
    const back = loadBillingCache(opts());
    expect(back.work?.renewalAt).toEqual({
      value: '2026-11-05T12:00:00.000Z',
      readAt: NOW.toISOString(),
    });
    expect(Object.keys(back.work ?? {}).sort()).toEqual([
      'autoRenew',
      'renewalAt',
      'weeklyResetAt',
    ]);
    expect(path.relative(home, billingCachePath(opts()))).toBe('.cache/claudestatus/billing.json');
  });

  it('degrades a corrupt cache file to an empty cache, logging the path only', () => {
    const file = billingCachePath(opts());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    const warn = jest.fn();
    const log = { debug: jest.fn(), info: jest.fn(), warn, error: jest.fn() };
    expect(loadBillingCache(opts(), log)).toEqual({});
    expect(warn).toHaveBeenCalledWith('ignoring corrupt file', { file, reason: 'syntax' });
  });

  it('degrades a non-object cache file to an empty cache', () => {
    const file = billingCachePath(opts());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '[1,2]');
    expect(loadBillingCache(opts())).toEqual({});
  });
});

describe('billing cache decisions', () => {
  it('decides staleness and derives days left', () => {
    const cache: BillingCache = {};
    recordBilling(cache, 'w', { renewalAt: '2026-11-05T12:00:00.000Z', autoRenew: true }, NOW);
    const entry = cache.w;
    expect(needsFetch(entry, NOW)).toBe(false);
    expect(needsFetch(undefined, NOW)).toBe(true);
    expect(needsFetch(entry, new Date('2026-11-06T00:00:00Z'))).toBe(true);
    expect(needsFetch({ renewalAt: entry?.renewalAt }, NOW)).toBe(true);
    expect(billingFromCache(entry ?? {}, NOW)).toMatchObject({
      daysLeft: DAYS_LEFT,
      autoRenew: true,
    });
  });

  it('records and drops the team-admin flag', () => {
    const team: BillingCache = {};
    recordBilling(team, 'w', { managedByAdmin: true }, NOW);
    expect(team.w?.managedByAdmin?.value).toBe(true);
    recordBilling(team, 'w', { renewalAt: '2026-11-05T12:00:00.000Z', autoRenew: true }, NOW);
    expect(team.w?.managedByAdmin).toBeUndefined();

    recordBilling(team, 'f', { managedByAdmin: true }, NOW);
    recordBilling(team, 'f', { managedByAdmin: false, paid: null }, NOW);
    expect(team.f?.managedByAdmin?.value).toBe(true);
    recordBilling(team, 'f', { managedByAdmin: false, paid: false }, NOW);
    expect(team.f?.managedByAdmin).toBeUndefined();
  });
});

describe('billing cache hardening', () => {
  let home: string;
  const opts = () => ({ homeDir: home, env: {} });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-billing-'));
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('drops malformed cache entries so recording never throws', () => {
    const file = billingCachePath(opts());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        str: 'x',
        arr: [],
        bad: { renewalAt: { value: BAD_VALUE, readAt: 'r' }, autoRenew: 'yes' },
        ok: { autoRenew: { value: true, readAt: 'r' } },
      }),
    );
    const cache = loadBillingCache(opts());
    expect(cache.str).toBeUndefined();
    expect(cache.arr).toBeUndefined();
    expect(cache.bad).toEqual({});
    expect(cache.ok?.autoRenew?.value).toBe(true);
    expect(() =>
      recordBilling(cache, 'str', { renewalAt: '2026-11-05T12:00:00.000Z' }, NOW),
    ).not.toThrow();
  });

  it('never writes billing fields onto inherited Object.prototype members', () => {
    const cache: BillingCache = {};
    recordBilling(cache, 'toString', { renewalAt: '2026-11-05T12:00:00.000Z' }, NOW);
    expect(own(Object.prototype.toString, 'renewalAt')).toBe(false);
    expect(own(cache, 'toString')).toBe(true);
  });
});

describe('billing cache input strictness', () => {
  let home: string;
  const opts = () => ({ homeDir: home, env: {} });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-billing-'));
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('accepts only zoned ISO dates as renewal times', () => {
    expect(billingFromSubscription(OK, { next_charge_at: BAD_VALUE }).renewalAt).toBeNull();
    expect(
      billingFromSubscription(OK, { next_charge_at: '2026-11-06 09:30' }).renewalAt,
    ).toBeNull();
    const cache: BillingCache = {};
    recordBilling(cache, 'a', { renewalAt: 'garbage', managedByAdmin: true }, NOW);
    expect(cache.a?.renewalAt).toBeUndefined();
    expect(cache.a?.managedByAdmin?.value).toBe(true);
  });

  it('ignores relative cache paths and leaves no temp file behind', () => {
    const rel = {
      homeDir: home,
      env: { XDG_CACHE_HOME: 'rel', CLAUDESTATUS_CACHE_FILE: 'x.json' },
    };
    expect(billingCachePath(rel)).toBe(path.join(home, '.cache', 'claudestatus', 'billing.json'));
    saveBillingCache({}, opts());
    const dir = path.dirname(billingCachePath(opts()));
    expect(fs.readdirSync(dir)).toEqual(['billing.json']);
  });

  it('maps prototype-named billing intervals to unknown and rejects zone-less cached dates', () => {
    const body = { next_charge_at: '2026-11-06T09:30:00Z', billing_interval: 'constructor' };
    expect(billingFromSubscription(OK, body).period).toBe('unknown');
    const entry = { renewalAt: { value: '2999-01-01', readAt: 'r' } };
    expect(needsFetch(entry, NOW)).toBe(true);
  });
});

describe('review follow-ups (#32)', () => {
  let dir: string;
  const file = (name: string): string => path.join(dir, name);
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-followups-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects dates that only parse by rolling over', () => {
    const body = { next_charge_at: '2026-02-30T00:00Z', billing_interval: 'month' };
    expect(billingFromSubscription(OK, body).period).toBe('unknown');
    expect(billingFromSubscription(OK, body).renewalAt).toBeNull();
    const leap = { next_charge_at: '2028-02-29T00:00Z', billing_interval: 'month' };
    expect(billingFromSubscription(OK, leap).renewalAt).toBe('2028-02-29T00:00:00.000Z');
  });

  it('writes through a symlinked state file instead of replacing the link', () => {
    const real = file('real.json');
    const link = file('billing.json');
    fs.writeFileSync(real, '{}');
    fs.symlinkSync(real, link);
    const env = { CLAUDESTATUS_CACHE_FILE: link };
    saveBillingCache({ work: { autoRenew: { value: true, readAt: 'r' } } }, { env });
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(JSON.parse(fs.readFileSync(real, 'utf8'))).toHaveProperty('work');
  });

  it('writes through a dangling symlink to its target', () => {
    const real = file('later.json');
    const link = file('billing.json');
    fs.symlinkSync(real, link);
    saveBillingCache({}, { env: { CLAUDESTATUS_CACHE_FILE: link } });
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(real)).toBe(true);
  });

  it('resolves ".." through a symlinked parent directory like the kernel', () => {
    const realDir = file('dotfiles');
    fs.mkdirSync(path.join(realDir, 'cfg'), { recursive: true });
    fs.symlinkSync(path.join(realDir, 'cfg'), file('cfg-link'));
    fs.writeFileSync(path.join(realDir, 'real.json'), '{}');
    fs.symlinkSync('../real.json', path.join(realDir, 'cfg', 'billing.json'));
    const link = path.join(file('cfg-link'), 'billing.json');
    saveBillingCache({ work: { autoRenew: { value: true, readAt: 'r' } } }, { env: { CLAUDESTATUS_CACHE_FILE: link } });
    expect(JSON.parse(fs.readFileSync(path.join(realDir, 'real.json'), 'utf8'))).toHaveProperty('work');
    expect(fs.existsSync(file('real.json'))).toBe(false);
  });

  it('leaves a symlink loop untouched and writes nothing', () => {
    const a = file('a.json');
    const b = file('b.json');
    fs.symlinkSync(b, a);
    fs.symlinkSync(a, b);
    saveBillingCache({}, { env: { CLAUDESTATUS_CACHE_FILE: a } });
    expect(fs.lstatSync(a).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(b).isSymbolicLink()).toBe(true);
  });
});

describe('state file shape (#32)', () => {
  let dir: string;
  const file = (name: string): string => path.join(dir, name);
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-shape-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warns on a state file holding valid non-object JSON', () => {
    const warn = jest.fn();
    const log = { debug: jest.fn(), info: jest.fn(), warn, error: jest.fn() };
    fs.writeFileSync(file('billing.json'), '[1, 2]');
    const env = { CLAUDESTATUS_CACHE_FILE: file('billing.json') };
    expect(loadBillingCache({ env }, log)).toEqual({});
    expect(warn).toHaveBeenCalledWith('ignoring non-object file', expect.any(Object));
  });

  it('reads the shared claudestatus billing.json fixture', () => {
    const fixture = path.join(process.cwd(), 'src', 'cache', 'claudestatus-billing.fixture.json');
    const cache = loadBillingCache({ env: { CLAUDESTATUS_CACHE_FILE: fixture } });
    expect(Object.keys(cache)).toEqual(['work', 'home']);
    expect(needsFetch(cache.work, NOW)).toBe(false);
    expect(billingFromCache(cache.work, NOW)).toEqual({
      billingDate: '2999-01-01T09:30:00.000Z',
      daysLeft: expect.any(Number),
      autoRenew: true,
    });
    expect(effectiveWeeklyReset(cache.work, null, NOW)).toBe('2999-01-05T00:00:00.000Z');
    expect(cache.home.managedByAdmin?.value).toBe(true);
    expect(needsFetch(cache.home, NOW)).toBe(true);
  });
});
