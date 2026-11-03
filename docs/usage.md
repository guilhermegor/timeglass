# Usage

Installing and importing this library.

## Installation

```bash
npm install timeglass
```

## Basic usage

```ts
import { greet } from 'timeglass';

greet('World'); // "Hello, World!"
```

Only what `src/index.ts` re-exports is part of the published surface — everything else
under `src/` is an implementation detail and may change without notice.

## Module formats

The package ships both ESM and CommonJS builds plus bundled `.d.ts` declarations, so
either import style resolves correctly:

```ts
// ESM
import { greet } from 'timeglass';
```

```js
// CommonJS
const { greet } = require('timeglass');
```

## Caches, active account and labels

State is kept in the same files the dotfiles `claudestatus` tooling already uses, so
switching over loses nothing:

| What | Path (override) |
| --- | --- |
| Billing and weekly-reset cache | `~/.cache/claudestatus/billing.json` (`$XDG_CACHE_HOME`, or `$CLAUDESTATUS_CACHE_FILE` for the exact file) |
| Account labels | `~/.config/claudestatus-bar/labels.json` (`$XDG_CONFIG_HOME`) |
| Active account (read-only) | `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json` |

timeglass writes the first two (atomically, mode `0600`) and only reads the third. The billing
cache holds absolute UTC timestamps and booleans, each with a `readAt`; no cookies, tokens or
emails. `labels.json` is a flat `{ "<account name>": "<label>" }` object.

```ts
import { detectActiveAccount, loadBillingCache, needsFetch, setLabel } from 'timeglass';

const accounts = [{ name: 'work', orgUuid: '...' }];
detectActiveAccount(accounts); // 'work', or 'unknown' (missing/malformed file, no or ambiguous match)
needsFetch(loadBillingCache().work); // true when the renewal date is missing or past
setLabel('work', 'Day job');
```

Path-touching functions take an optional `{ homeDir, env }` argument, so tests never touch
the real home. A missing or corrupt file degrades to an empty cache or `'unknown'`; it
never throws. Loggers default to `NULL_EMITTER`, and organization UUIDs are never logged.

## Accounts and the claude.ai API client

Each Claude account is one Playwright `storageState` file, written with mode `0600` under
`$TIMEGLASS_ACCOUNTS_DIR`, else `$XDG_CONFIG_HOME/timeglass/accounts`, else
`~/.config/timeglass/accounts` (`defaultAccountsDir()`). Only claude.ai cookies are kept:
third-party cookies and the local storage the browser picked up during login are dropped
before anything is written. A real browser opens once per
account to log in; every read afterwards is plain HTTP, so no window appears.

```ts
import {
  addAccount,
  defaultAccountsDir,
  fetchAccountSnapshot,
  loadCookieHeader,
  CONSOLE_EMITTER,
} from 'timeglass';

const dir = defaultAccountsDir();

// One-time login: opens Chrome at claude.ai/login, saves the session once you are signed in.
const added = await addAccount('work', { dir, logger: CONSOLE_EMITTER });
// -> { state: 'added' } | { state: 'timeout' } | { state: 'failed', message }

// Afterwards, plain HTTP:
const cookieHeader = loadCookieHeader(dir, 'work'); // null when there is no usable session
if (cookieHeader) {
  const snapshot = await fetchAccountSnapshot({ cookieHeader });
  // snapshot.organization, snapshot.subscription, snapshot.usage
}
```

`fetchAccountSnapshot` calls `/api/organizations`, `/api/organizations/<org>`,
`.../subscription_details` and `.../usage`, and **never throws**. Each part of the snapshot is a
`Reading`:

| `state`            | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `ok`               | `value` holds the parsed data                                        |
| `managed_by_admin` | `subscription_details` answered 403 `permission_error` (Team member) |
| `unknown`          | `reason` is `unauthorized`, `forbidden`, `challenge`, `malformed`, `network` or `http_error` |

A 401, a 403, malformed JSON, a network error and a Cloudflare challenge page each become
`unknown` with the matching `reason`; a failed organisation lookup makes all three readings
`unknown` because nothing else can be addressed. Render `unknown` as "unknown", never as a guess.
`unauthorized` is the cue to run `addAccount` again.

Calls accept a `logger` (a `LogEmitter`, default `NULL_EMITTER`) and an injectable `fetch`.
Log lines carry only the endpoint label, HTTP status and reason: never a cookie, token,
`payment_method` field or org uuid. The saved session is also never refreshed from response
`Set-Cookie` headers; when claude.ai rotates it, the reading turns `unauthorized` and the
account needs `addAccount` again.

The browser login uses your installed Chrome (`channel: 'chrome'`) with a fresh, non-persistent
profile. Chromium's temporary user-data profile may hold login cookies, is removed when the browser
closes and can remain on disk if the process exits unexpectedly; only the session file is guaranteed
`0600`. `playwright` is loaded
lazily and only by `addAccount`.

## Command line

Installing the package puts a `timeglass` binary on the path (`bin` in `package.json`,
pointing at `dist/cjs/cli/bin.js`).

| Command | What it does |
| --- | --- |
| `timeglass` | prints a usage table (session and weekly utilisation, reset day and time) and a billing table (plan, paid, renewal, auto-renew) for every saved account |
| `timeglass add <name>` | opens a browser to log in to claude.ai and saves the account |
| `timeglass --version` (`-v`) | prints the package version |
| `timeglass --help` (`-h`) | prints the command list |

```text
Account  Session                Weekly
-------  ---------------------  ---------------------
work     12%  resets Mon 18:00  40%  resets Sat 09:30
```

No window opens for the default command: it reads every account over plain HTTP.
Anything that could not be read prints as `unknown` (an expired session, a network error,
a missing field), never as a guess; a Team member whose subscription is managed by an admin
shows `managed by admin` in the renewal column. Reset times are shown in the local time zone.

Renewal and auto-renew come from the billing cache described above: each run records what
the API returned, so a later failed read still shows the last known renewal date while it is
in the future. The weekly reset falls back to the cached value the same way.

The CLI is the one call site that passes `CONSOLE_EMITTER`; library functions keep
`NULL_EMITTER` unless the host injects a logger. Exit codes: `0` success, `1` login
failed or timed out, `2` bad usage (unknown command, missing or invalid account name).

## Running tests and lint locally

```bash
npm install
npm run build       # emits dist/esm, dist/cjs, dist/types
npm test
npm run lint
npm run type-check
npm run pack:smoke   # npm pack -> install from the tarball -> require()/import() it
```
