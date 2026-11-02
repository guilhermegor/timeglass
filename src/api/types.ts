export type Plan = 'free' | 'pro' | 'max' | 'team' | 'unknown';

/** Why a reading degraded to "unknown". Never carries a body, header, or id. */
export type UnknownReason =
  | 'unauthorized'
  | 'forbidden'
  | 'challenge'
  | 'malformed'
  | 'network'
  | 'http_error';

/**
 * One endpoint's outcome. Every failure is a value, never a throw: callers render
 * `unknown` (or "managed by the team admin") instead of guessing.
 */
export type Reading<T> =
  | { state: 'ok'; value: T }
  | { state: 'managed_by_admin' }
  | { state: 'unknown'; reason: UnknownReason };

export interface Organization {
  plan: Plan;
  /** `null` when claude.ai did not say. */
  paid: boolean | null;
}

export interface Subscription {
  nextChargeAt: string | null;
  planEndingAt: string | null;
  status: string | null;
  billingInterval: string | null;
}

export interface UsageWindow {
  utilization: number | null;
  resetsAt: string | null;
}

export interface Usage {
  session: UsageWindow;
  weekly: UsageWindow;
}

export interface AccountSnapshot {
  organization: Reading<Organization>;
  subscription: Reading<Subscription>;
  usage: Reading<Usage>;
}

/** The subset of `Response` this package reads; the global `fetch` satisfies it. */
export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<FetchResponse>;
