import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

import type { FetchLike, FetchResponse, UnknownReason } from './types.js';

const REQUEST_TIMEOUT_MS = 15_000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 300;

const CHALLENGE_MARKERS = ['Just a moment', 'challenge-platform', 'cf-turnstile'];

export type JsonResult =
  { ok: true; data: unknown } | { ok: false; reason: UnknownReason; permissionDenied: boolean };

export interface JsonRequest {
  fetch: FetchLike;
  url: string;
  headers: Record<string, string>;
  endpoint: string;
  logger?: LogEmitter;
}

function failure(reason: UnknownReason, permissionDenied = false): JsonResult {
  return { ok: false, reason, permissionDenied };
}

function isChallenge(response: FetchResponse, body: string, isJson: boolean): boolean {
  if (response.headers.get('cf-mitigated') === 'challenge') return true;
  return !isJson && CHALLENGE_MARKERS.some((marker) => body.includes(marker));
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
  if (response.status === HTTP_UNAUTHORIZED) return failure('unauthorized');
  const json = parseJson(body);
  if (isChallenge(response, body, json.parsed)) return failure('challenge');

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
    const response = await request.fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    return { ...classify(response, body), status: response.status };
  } catch {
    return failure('network');
  }
}

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
