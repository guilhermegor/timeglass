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

## Running tests and lint locally

```bash
npm install
npm run build       # emits dist/esm, dist/cjs, dist/types
npm test
npm run lint
npm run type-check
npm run pack:smoke   # npm pack -> install from the tarball -> require()/import() it
```
