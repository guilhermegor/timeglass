import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import type { FetchLike, FetchResponse, UnknownReason } from './types.js';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 300;

const CHALLENGE_MARKERS = ['Just a moment', 'challenge-platform', 'cf-turnstile'];

export type JsonResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: UnknownReason; permissionDenied: boolean };

export interface JsonRequest {
  fetch: FetchLike;
  url: string;
  headers: Record<string, string>;
  /** Short fixed label for logs; the URL itself carries the org uuid and is never logged. */
  endpoint: string;
  logger?: LogEmitter;
}

function failure(reason: UnknownReason, permissionDenied = false): JsonResult {
  return { ok: false, reason, permissionDenied };
}

function isChallenge(response: FetchResponse, body: string): boolean {
  if (response.headers.get('cf-mitigated') === 'challenge') return true;
  if ((response.headers.get('content-type') ?? '').includes('text/html')) return true;
  return CHALLENGE_MARKERS.some((marker) => body.includes(marker));
}

function parseJson(body: string): { parsed: true; data: unknown } | { parsed: false } {
  try {
    return { parsed: true, data: JSON.parse(body) as unknown };
  } catch {
    return { parsed: false };
  }
}

function isPermissionError(data: unknown): boolean {
  const error = (data as { error?: { type?: unknown } } | null)?.error;
  return error?.type === 'permission_error';
}

function classify(response: FetchResponse, body: string): JsonResult {
  if (isChallenge(response, body)) return failure('challenge');
  if (response.status === HTTP_UNAUTHORIZED) return failure('unauthorized');

  const json = parseJson(body);
  if (response.status === HTTP_FORBIDDEN) {
    return failure('forbidden', json.parsed && isPermissionError(json.data));
  }
  if (response.status < HTTP_SUCCESS_MIN || response.status >= HTTP_SUCCESS_MAX) {
    return failure('http_error');
  }
  return json.parsed ? { ok: true, data: json.data } : failure('malformed');
}

async function readResponse(request: JsonRequest): Promise<JsonResult & { status?: number }> {
  try {
    const response = await request.fetch(request.url, { headers: request.headers });
    const body = await response.text();
    return { ...classify(response, body), status: response.status };
  } catch {
    return failure('network');
  }
}

/**
 * GET a JSON document. Never throws: every failure is a typed `JsonResult`.
 * Logs only the endpoint label, status and reason, never the URL, headers or body.
 */
export async function requestJson(request: JsonRequest): Promise<JsonResult> {
  const logger = request.logger ?? NULL_EMITTER;
  const { status, ...result } = await readResponse(request);
  if (!result.ok) {
    logger.warn('claude.ai request degraded to unknown', {
      endpoint: request.endpoint,
      reason: result.reason,
      status,
    });
  }
  return result;
}
