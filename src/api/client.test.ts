import type { LogEmitter } from '../utils/log-emitter';

import { fetchAccountSnapshot } from './client';
import type { FetchLike, FetchResponse } from './types';

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SERVER_ERROR = 500;

const ORG_UUID = 'org-uuid-1234';
const COOKIE = 'sessionKey=sk-ant-secret-cookie-value';
const PAYMENT = 'payment_method-secret';
const SESSION_PERCENT = 12.5;
const WEEKLY_PERCENT = 40;

interface Stub {
  status?: number;
  body?: unknown;
  raw?: string;
  contentType?: string;
  headers?: Record<string, string>;
  throws?: boolean;
}

function respond(stub: Stub): FetchResponse {
  const headers: Record<string, string> = {
    'content-type': stub.contentType ?? 'application/json',
    ...stub.headers,
  };
  return {
    status: stub.status ?? HTTP_OK,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(stub.raw ?? JSON.stringify(stub.body ?? {})),
  };
}

const ORGS = [{ uuid: ORG_UUID, capabilities: ['chat', 'claude_pro'] }];
const DETAIL = { billing_type: 'stripe_subscription', payment_method: PAYMENT };
const SUBSCRIPTION = {
  next_charge_at: '2026-12-01T00:00:00Z',
  plan_ending_at: null,
  status: 'active',
  billing_interval: 'month',
  payment_method: PAYMENT,
};
const USAGE = {
  five_hour: { utilization: SESSION_PERCENT, resets_at: '2026-11-02T18:00:00Z' },
  seven_day: { utilization: WEEKLY_PERCENT, resets_at: '2026-11-07T00:00:00Z' },
};

type Routes = Partial<Record<'organizations' | 'detail' | 'subscription' | 'usage', Stub>>;

const DEFAULT_ROUTES: Routes = {
  organizations: { body: ORGS },
  detail: { body: DETAIL },
  subscription: { body: SUBSCRIPTION },
  usage: { body: USAGE },
};

function routeOf(url: string): keyof Routes {
  if (url.endsWith('/subscription_details')) return 'subscription';
  if (url.endsWith('/usage')) return 'usage';
  return url.endsWith('/api/organizations') ? 'organizations' : 'detail';
}

function fakeFetch(overrides: Routes = {}): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetch: FetchLike = (url) => {
    urls.push(url);
    const route = routeOf(url);
    const stub = overrides[route] ?? DEFAULT_ROUTES[route] ?? {};
    return stub.throws
      ? Promise.reject(new Error(`boom ${url} ${COOKIE}`))
      : Promise.resolve(respond(stub));
  };
  return { fetch, urls };
}

function snapshotOf(overrides: Routes = {}, logger?: LogEmitter) {
  return fetchAccountSnapshot({ cookieHeader: COOKIE, fetch: fakeFetch(overrides).fetch, logger });
}

function recordingLogger(): { logger: LogEmitter; lines: string[] } {
  const lines: string[] = [];
  const record = (message: string, context?: Record<string, unknown>): void => {
    lines.push(JSON.stringify([message, context]));
  };
  return { logger: { debug: record, info: record, warn: record, error: record }, lines };
}

describe('fetchAccountSnapshot happy path', () => {
  it('reads plan, billing and usage when every endpoint answers', async () => {
    const snapshot = await snapshotOf();

    expect(snapshot.organization).toEqual({ state: 'ok', value: { plan: 'pro', paid: true } });
    expect(snapshot.subscription).toEqual({
      state: 'ok',
      value: {
        nextChargeAt: '2026-12-01T00:00:00Z',
        planEndingAt: null,
        status: 'active',
        billingInterval: 'month',
      },
    });
    expect(snapshot.usage).toEqual({
      state: 'ok',
      value: {
        session: { utilization: SESSION_PERCENT, resetsAt: '2026-11-02T18:00:00Z' },
        weekly: { utilization: WEEKLY_PERCENT, resetsAt: '2026-11-07T00:00:00Z' },
      },
    });
  });

  it('calls the four endpoints, sending the saved cookie on each', async () => {
    const { fetch, urls } = fakeFetch();
    const cookies: string[] = [];
    const spy: FetchLike = (url, init) => {
      cookies.push(init.headers.Cookie);
      return fetch(url, init);
    };
    await fetchAccountSnapshot({ cookieHeader: COOKIE, fetch: spy });

    expect(urls).toEqual([
      'https://claude.ai/api/organizations',
      `https://claude.ai/api/organizations/${ORG_UUID}`,
      `https://claude.ai/api/organizations/${ORG_UUID}/subscription_details`,
      `https://claude.ai/api/organizations/${ORG_UUID}/usage`,
    ]);
    expect(cookies).toEqual([COOKIE, COOKIE, COOKIE, COOKIE]);
  });
});

describe('fetchAccountSnapshot subscription_details permission_error', () => {
  it('maps a 403 permission_error to managed_by_admin and keeps the other readings', async () => {
    const snapshot = await snapshotOf({
      subscription: { status: HTTP_FORBIDDEN, body: { error: { type: 'permission_error' } } },
    });

    expect(snapshot.subscription).toEqual({ state: 'managed_by_admin' });
    expect(snapshot.organization.state).toBe('ok');
    expect(snapshot.usage.state).toBe('ok');
  });

  it('leaves a 403 of another type as unknown', async () => {
    const snapshot = await snapshotOf({
      subscription: { status: HTTP_FORBIDDEN, body: { error: { type: 'other' } } },
    });
    expect(snapshot.subscription).toEqual({ state: 'unknown', reason: 'forbidden' });
  });
});

const FAILURES: [string, Stub, string][] = [
  ['401', { status: HTTP_UNAUTHORIZED, body: { error: {} } }, 'unauthorized'],
  ['403', { status: HTTP_FORBIDDEN, body: { error: { type: 'forbidden' } } }, 'forbidden'],
  ['malformed JSON', { raw: '{"uuid": ' }, 'malformed'],
  ['network error', { throws: true }, 'network'],
  [
    'Cloudflare challenge page',
    { status: HTTP_FORBIDDEN, contentType: 'text/html', raw: '<title>Just a moment...</title>' },
    'challenge',
  ],
  [
    'Cloudflare mitigation header',
    { status: HTTP_FORBIDDEN, headers: { 'cf-mitigated': 'challenge' } },
    'challenge',
  ],
  ['challenge page served as 200', { raw: '<div id="cf-turnstile"></div>' }, 'challenge'],
  ['server error', { status: HTTP_SERVER_ERROR, body: {} }, 'http_error'],
];

describe.each(FAILURES)('organizations endpoint: %s', (_label, stub, reason) => {
  it('degrades every reading to unknown and does not throw', async () => {
    const { fetch, urls } = fakeFetch({ organizations: stub });
    const snapshot = await fetchAccountSnapshot({ cookieHeader: COOKIE, fetch });
    const unknown = { state: 'unknown', reason };

    expect(snapshot).toEqual({ organization: unknown, subscription: unknown, usage: unknown });
    expect(urls).toHaveLength(1);
  });
});

describe.each(FAILURES)('subscription and usage endpoints: %s', (_label, stub, reason) => {
  it('degrades only the failing readings to unknown and does not throw', async () => {
    const snapshot = await snapshotOf({ subscription: stub, usage: stub });

    expect(snapshot.organization.state).toBe('ok');
    expect(snapshot.subscription).toEqual({ state: 'unknown', reason });
    expect(snapshot.usage).toEqual({ state: 'unknown', reason });
  });
});

describe('organization choice and request paths', () => {
  it('prefers the highest plan over an earlier free org', async () => {
    const organizations = {
      body: [
        { uuid: 'free-org', capabilities: ['chat'] },
        { uuid: 'team-org', capabilities: ['chat', 'raven'] },
        { uuid: 'max-org', capabilities: ['chat', 'claude_max'] },
        { uuid: 'max-late', capabilities: ['claude_max'] },
      ],
    };
    const { fetch, urls } = fakeFetch({ organizations });
    const snapshot = await fetchAccountSnapshot({ cookieHeader: COOKIE, fetch });

    expect(snapshot.organization).toMatchObject({ value: { plan: 'max' } });
    expect(urls.some((url) => url.endsWith('/max-org'))).toBe(true);
  });

  it('skips an org with no uuid even when its plan ranks highest', async () => {
    const organizations = {
      body: [
        { capabilities: ['claude_max'] },
        { uuid: '', capabilities: ['claude_max'] },
        { uuid: 'pro-org', capabilities: ['claude_pro'] },
      ],
    };
    const { fetch, urls } = fakeFetch({ organizations });
    const snapshot = await fetchAccountSnapshot({ cookieHeader: COOKIE, fetch });

    expect(snapshot.organization).toMatchObject({ value: { plan: 'pro' } });
    expect(urls[1]).toBe('https://claude.ai/api/organizations/pro-org');
  });

  it('percent-encodes the org uuid in the path', async () => {
    const organizations = { body: [{ uuid: 'a/b?c', capabilities: ['claude_pro'] }] };
    const { fetch, urls } = fakeFetch({ organizations });
    await fetchAccountSnapshot({ cookieHeader: COOKIE, fetch });

    expect(urls[1]).toBe('https://claude.ai/api/organizations/a%2Fb%3Fc');
  });

  it('does not call valid JSON a challenge because of a marker in a name', async () => {
    const organizations = {
      body: [{ uuid: ORG_UUID, name: 'Just a moment', capabilities: ['claude_pro'] }],
    };
    const snapshot = await snapshotOf({ organizations });

    expect(snapshot.organization.state).toBe('ok');
  });

  it('calls an HTML 200 without a marker malformed, not a challenge', async () => {
    const stub = { contentType: 'text/html', raw: '<html>hello</html>' };
    const snapshot = await snapshotOf({ usage: stub });

    expect(snapshot.usage).toEqual({ state: 'unknown', reason: 'malformed' });
  });
});

describe('fetchAccountSnapshot partial and malformed shapes', () => {
  it('keeps the plan but reports paid as null when the org detail call fails', async () => {
    const snapshot = await snapshotOf({ detail: { status: HTTP_UNAUTHORIZED } });
    expect(snapshot.organization).toEqual({ state: 'ok', value: { plan: 'pro', paid: null } });
  });

  it.each([
    ['empty org list', []],
    ['not a list', { uuid: ORG_UUID }],
    ['org without uuid', [{ capabilities: ['chat'] }]],
  ])('treats %s as malformed', async (_label, body) => {
    const snapshot = await snapshotOf({ organizations: { body } });
    expect(snapshot.organization).toEqual({ state: 'unknown', reason: 'malformed' });
  });

  it('treats a non-object subscription or usage body as malformed', async () => {
    const snapshot = await snapshotOf({ subscription: { body: [] }, usage: { body: 'text' } });
    expect(snapshot.subscription).toEqual({ state: 'unknown', reason: 'malformed' });
    expect(snapshot.usage).toEqual({ state: 'unknown', reason: 'malformed' });
  });
});

describe('fetchAccountSnapshot logging', () => {
  it('never leaks cookie, org uuid or payment_method to logs or the snapshot', async () => {
    const { logger, lines } = recordingLogger();
    const degraded = await snapshotOf(
      {
        subscription: { throws: true },
        usage: { status: HTTP_FORBIDDEN, contentType: 'text/html', raw: 'Just a moment' },
      },
      logger,
    );
    const healthy = await snapshotOf({}, logger);

    expect(lines.length).toBeGreaterThan(0);
    const output = JSON.stringify([lines, degraded, healthy]);
    for (const secret of [COOKIE, 'sk-ant-secret', ORG_UUID, PAYMENT, 'payment_method']) {
      expect(output).not.toContain(secret);
    }
  });

  it('defaults to a silent logger', async () => {
    const spies = (['debug', 'info', 'warn', 'error'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    );
    await snapshotOf({ organizations: { status: HTTP_UNAUTHORIZED } });
    spies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
