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

export function detectActiveAccount(
  accounts: readonly AccountRef[],
  opts: PathOptions = {},
): string {
  const org = readOrganizationUuid(claudeJsonPath(opts));
  if (org === null) return UNKNOWN_ACCOUNT;
  const hits = accounts.filter((a) => a.orgUuid === org);
  return hits.length === 1 && hits[0] ? hits[0].name : UNKNOWN_ACCOUNT;
}
