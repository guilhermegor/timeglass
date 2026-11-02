const CLAUDE_DOMAIN = 'claude.ai';
const MS_PER_SECOND = 1000;
const SESSION_COOKIE = -1;

export interface StorageCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  [extra: string]: unknown;
}

export interface StorageState {
  cookies: StorageCookie[];
  origins: unknown[];
}

function isCookie(value: unknown): value is StorageCookie {
  const cookie = value as Partial<Record<keyof StorageCookie, unknown>> | null;
  return (
    typeof cookie === 'object' &&
    cookie !== null &&
    typeof cookie.name === 'string' &&
    typeof cookie.value === 'string' &&
    typeof cookie.domain === 'string' &&
    typeof cookie.expires === 'number'
  );
}

export function parseStorageState(data: unknown): StorageState | null {
  const state = data as { cookies?: unknown; origins?: unknown } | null;
  if (typeof state !== 'object' || state === null) return null;
  if (!Array.isArray(state.cookies) || !state.cookies.every(isCookie)) return null;
  const origins: unknown[] = Array.isArray(state.origins) ? state.origins : [];
  return { cookies: state.cookies, origins };
}

function isClaudeCookie(cookie: StorageCookie): boolean {
  const domain = cookie.domain.replace(/^\./, '');
  return domain === CLAUDE_DOMAIN || domain.endsWith(`.${CLAUDE_DOMAIN}`);
}

export function restrictToClaude(state: StorageState): StorageState {
  return { cookies: state.cookies.filter(isClaudeCookie), origins: [] };
}

function isFresh(cookie: StorageCookie, nowMs: number): boolean {
  return cookie.expires === SESSION_COOKIE || cookie.expires * MS_PER_SECOND > nowMs;
}

export function buildCookieHeader(state: StorageState, nowMs: number = Date.now()): string {
  return state.cookies
    .filter((cookie) => isClaudeCookie(cookie) && isFresh(cookie, nowMs))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}
