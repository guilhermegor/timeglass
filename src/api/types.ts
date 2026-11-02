export type Plan = 'free' | 'pro' | 'max' | 'team' | 'unknown';

export type UnknownReason =
  | 'unauthorized'
  | 'forbidden'
  | 'challenge'
  | 'malformed'
  | 'network'
  | 'http_error';

export type Reading<T> =
  | { state: 'ok'; value: T }
  | { state: 'managed_by_admin' }
  | { state: 'unknown'; reason: UnknownReason };

export interface Organization {
  plan: Plan;
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

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<FetchResponse>;
