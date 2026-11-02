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
and returns `false` when the write failed or the new name already carries a different label.

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
