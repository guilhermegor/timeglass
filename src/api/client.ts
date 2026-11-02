import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import { requestJson, type JsonResult } from './http.js';
import { parseSubscription, parseUsage, pickOrganization, toOrganization } from './parse.js';
import type { AccountSnapshot, FetchLike, Reading, Subscription, UnknownReason } from './types.js';
import { USER_AGENT } from './user-agent.js';

const CLAUDE_URL = 'https://claude.ai';

export interface ClientOptions {
  cookieHeader: string;
  fetch?: FetchLike;
  logger?: LogEmitter;
}

function unknown<T>(reason: UnknownReason): Reading<T> {
  return { state: 'unknown', reason };
}

function interpret<T>(result: JsonResult, parse: (data: unknown) => T | null): Reading<T> {
  if (!result.ok) return unknown(result.reason);
  const value = parse(result.data);
  return value === null ? unknown('malformed') : { state: 'ok', value };
}

function interpretSubscription(result: JsonResult): Reading<Subscription> {
  if (!result.ok && result.permissionDenied) return { state: 'managed_by_admin' };
  return interpret(result, parseSubscription);
}

export async function fetchAccountSnapshot(options: ClientOptions): Promise<AccountSnapshot> {
  const fetchFn = options.fetch ?? (fetch as FetchLike);
  const logger = options.logger ?? NULL_EMITTER;
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    Cookie: options.cookieHeader,
  };
  const get = (endpoint: string, path: string): Promise<JsonResult> =>
    requestJson({ fetch: fetchFn, url: `${CLAUDE_URL}${path}`, headers, endpoint, logger });

  const orgs = await get('organizations', '/api/organizations');
  const org = orgs.ok ? pickOrganization(orgs.data) : null;
  if (!org) {
    const reason = orgs.ok ? 'malformed' : orgs.reason;
    return { organization: unknown(reason), subscription: unknown(reason), usage: unknown(reason) };
  }

  const base = `/api/organizations/${encodeURIComponent(org.uuid)}`;
  const [detail, subscription, usage] = await Promise.all([
    get('organization', base),
    get('subscription_details', `${base}/subscription_details`),
    get('usage', `${base}/usage`),
  ]);
  return {
    organization: { state: 'ok', value: toOrganization(org.plan, detail.ok ? detail.data : null) },
    subscription: interpretSubscription(subscription),
    usage: interpret(usage, parseUsage),
  };
}
