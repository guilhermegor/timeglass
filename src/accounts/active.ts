import fs from 'node:fs';

import { claudeJsonPath, type PathOptions } from '../cache/json-file.js';

export const UNKNOWN_ACCOUNT = 'unknown';

export interface AccountRef {
  name: string;
  orgUuid?: string;
}

function readOrganizationUuid(file: string): string | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const org = (parsed as { oauthAccount?: { organizationUuid?: unknown } } | null)?.oauthAccount
      ?.organizationUuid;
    return typeof org === 'string' && org !== '' ? org : null;
  } catch {
    return null;
  }
}

/**
 * Name of the account Claude Code is logged in as, matched on the stable org UUID
 * (`oauthAccount.organizationUuid` in `.claude.json` vs each account's `orgUuid`).
 * A missing or malformed file, no match, or an ambiguous match is `"unknown"`; never throws.
 * The UUID is never logged or returned.
 */
export function detectActiveAccount(
  accounts: readonly AccountRef[],
  opts: PathOptions = {},
): string {
  const org = readOrganizationUuid(claudeJsonPath(opts));
  if (org === null) return UNKNOWN_ACCOUNT;
  const hits = accounts.filter((a) => a.orgUuid === org);
  return hits.length === 1 && hits[0] ? hits[0].name : UNKNOWN_ACCOUNT;
}
