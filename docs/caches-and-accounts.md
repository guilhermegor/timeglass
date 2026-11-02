# Caches and accounts

How `timeglass` remembers billing facts per account, detects the active account, and stores
account labels. Security-relevant behaviour is also summarised in `SECURITY.md`.

> **See also:** [Usage](usage.md) · [FAQ](faq.md).

## What the billing cache stores

The billing cache holds one entry per account name. Each field is an absolute UTC timestamp or
a boolean, stored together with the time it was read (`readAt`):

- `renewalAt`: the next charge date, as an ISO-8601 UTC string.
- `autoRenew`: whether the subscription renews automatically.
- `managedByAdmin`: the account belongs to a team member who is not the billing admin.
- `weeklyResetAt`: the next weekly usage reset, as an ISO-8601 UTC string.

Nothing else is stored. Cookies, tokens, emails and page text are never written to the cache.

Mapping a `subscription_details` response follows these rules:

- HTTP 401 means the account is logged out.
- HTTP 403 with a `permission_error` body means a team member who is not the billing admin.
  That is a fact about the account, not a failure, so it sets `managedByAdmin`.
- Any other non-2xx status, or an unparsable `next_charge_at`, yields no billing facts.
- `autoRenew` is true when the response carries no `plan_ending_at`.

## Recording rules

`recordBilling` only records values that were actually read:

- A `null` never overwrites a good cached value.
- The `managedByAdmin` flag is dropped when a fresh renewal date arrives, or once the account
  is confirmed free (`paid === false`). A failed request carries neither, so it keeps the flag.

A fetch is needed (`needsFetch`) only when the renewal date is missing or already past, or
when `autoRenew` has never been read.

## Weekly resets are future-only

`recordWeeklyReset` remembers a reset time only if it is in the future. A past time must not
overwrite a good cached value. `effectiveWeeklyReset` prefers the live API reset when it is a
future time, else the cached one, else `null`.

## Refused account names

The names `__proto__`, `constructor` and `prototype` are refused as cache keys; recording
them is a silent no-op.

## Active account detection

`detectActiveAccount` matches the stable organization UUID in Claude Code's `.claude.json`
(`oauthAccount.organizationUuid`) against each account's `orgUuid`. A missing or malformed
file, no match, or an ambiguous match returns `"unknown"`. It never throws, and the UUID is
never logged or returned.

## Labels

`readLabels` drops non-string values and a corrupt file. `setLabel` sets a label, or clears
it when the label is empty, and returns `false` if the write failed. `renameLabel` moves a
label to a renamed account: it is a no-op (returns `true`) when the old account has no label,
and returns `false` when the write failed or the new name already carries a different label. Renaming onto an identical label succeeds.

## Files and locations

State files are written atomically with owner-only mode `0600`, because they name accounts and
billing dates. Unreadable or corrupt files read as empty; parse errors are logged by file path
only, since a parser message can quote file content.

| File | Location |
| --- | --- |
| Billing cache | `$CLAUDESTATUS_CACHE_FILE`, else `$XDG_CACHE_HOME` or `~/.cache`, plus `claudestatus/billing.json` |
| Labels | `$XDG_CONFIG_HOME` or `~/.config`, plus `claudestatus-bar/labels.json` |
| Claude Code config | `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json` |

Each path function takes `PathOptions` (`homeDir`, `env`) so tests never touch the real home.

## Known limits

- **Concurrent writers.** Each write reads, changes and rewrites the whole file with no lock,
  so two processes saving at once can drop each other's entries (last writer wins). Reload
  just before saving, and keep one writer per file where you can.
- **Atomic, not durable.** Writes go to a fresh `0600` temp file renamed over the target, so a
  reader never sees a half-written file. There is no `fsync`, so a power loss can still lose
  the latest write. Directories are created `0700`.
- **Symlinked state files are written through.** A write follows the link chain and renames
  the temp file over the final target, so the link survives. The temp file sits beside the
  target, so that directory must be writable, and it is created (`0700`) if missing. The target
  is replaced by a new `0600` file, so its original mode and hard links are not kept. A link
  loop, or a permission error while resolving, makes the write return `false` and changes nothing.
- **Unusable files are left alone.** A state file that is corrupt, or valid JSON that is not
  an object, is reported through the log emitter and read as empty. `setLabel` and
  `renameLabel` return `false` rather than overwrite it.
- **Dates must exist.** Timestamps are checked against the calendar, so `2026-02-30` is
  rejected instead of rolling over to 2 March.
- **Shape fixture.** `src/cache/claudestatus-billing.fixture.json` is a hand-made copy of
  the file the dotfiles `claudestatus` tool shares; a test loads it, so a shape change made in
  timeglass fails CI. A change made upstream in `claudestatus` is not caught.
- **Relative paths are ignored.** A relative `$CLAUDESTATUS_CACHE_FILE`, `$XDG_CACHE_HOME` or
  `$XDG_CONFIG_HOME` falls back to the default location, as the XDG spec requires.
- **Admin-managed accounts.** `managedByAdmin` is recorded for the caller's use but
  `needsFetch` does not consult it, because such an account has no renewal date to cache.
  A caller that wants to skip the repeat request should check that field itself.
- **Active account cost.** `detectActiveAccount` reads and parses `.claude.json` on each call;
  cache the result if you call it in a hot loop.
- **Dates.** Renewal and reset timestamps must be ISO 8601 with a `Z` or an offset; anything
  else is treated as missing.
- **Corrupt labels file.** `setLabel` and `renameLabel` return `false` and leave an
  unreadable or corrupt `labels.json` untouched, so a typo is never wiped by the next write.
  Values other tools keep in that file are preserved. The billing cache is derived data, so a
  corrupt one is rebuilt on the next save.
- **No TTL.** A cached entry is trusted until its renewal date passes; `readAt` is recorded
  for the caller. A cancellation or plan change made meanwhile is not seen until then, so
  refetch on demand when that matters.
- **Shared org.** Active-account detection matches the organization UUID only, so two
  accounts in one organization read as `unknown`.
- **Plain objects.** `loadBillingCache` and `readLabels` return objects without a prototype;
  use `Object.hasOwn`/`in` rather than `obj.hasOwnProperty`. `billingFromCache` throws on an
  entry for which `needsFetch` is true, so test that first.
