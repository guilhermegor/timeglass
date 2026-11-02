import type { Organization, Plan, Subscription, Usage, UsageWindow } from './types.js';

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Paid markers are checked before bare `chat`: a paid org keeps its `chat` capability.
 * Order is claude_max, claude_pro, raven (Team/Enterprise), then chat-only as free.
 */
export function classifyPlan(capabilities: unknown): Plan {
  const list = Array.isArray(capabilities) ? capabilities : [];
  if (list.includes('claude_max')) return 'max';
  if (list.includes('claude_pro')) return 'pro';
  if (list.includes('raven')) return 'team';
  if (list.includes('chat')) return 'free';
  return 'unknown';
}

/** The first org with a recognised plan, else the first one; `null` without a usable uuid. */
export function pickOrganization(data: unknown): { uuid: string; plan: Plan } | null {
  if (!Array.isArray(data)) return null;
  const orgs = data.map(asObject).filter((org): org is Json => org !== null);
  const chosen =
    orgs.find((org) => classifyPlan(org.capabilities) !== 'unknown') ?? orgs[0];
  const uuid = asString(chosen?.uuid);
  return chosen && uuid ? { uuid, plan: classifyPlan(chosen.capabilities) } : null;
}

/** `billing_type` is the only paid signal; absent or non-string stays unknown (`null`). */
export function parsePaid(detail: unknown, plan: Plan): boolean | null {
  const billingType = asString(asObject(detail)?.billing_type);
  if (billingType !== null) return billingType !== 'none';
  return plan === 'free' ? false : null;
}

export function toOrganization(plan: Plan, detail: unknown): Organization {
  return { plan, paid: parsePaid(detail, plan) };
}

export function parseSubscription(data: unknown): Subscription | null {
  const body = asObject(data);
  if (!body) return null;
  return {
    nextChargeAt: asString(body.next_charge_at),
    planEndingAt: asString(body.plan_ending_at),
    status: asString(body.status),
    billingInterval: asString(body.billing_interval),
  };
}

function parseWindow(data: unknown): UsageWindow {
  const window = asObject(data);
  return {
    utilization: asNumber(window?.utilization),
    resetsAt: asString(window?.resets_at),
  };
}

export function parseUsage(data: unknown): Usage | null {
  const body = asObject(data);
  if (!body) return null;
  return { session: parseWindow(body.five_hour), weekly: parseWindow(body.seven_day) };
}
