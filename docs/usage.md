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

## Running tests and lint locally

```bash
npm install
npm run build       # emits dist/esm, dist/cjs, dist/types
npm test
npm run lint
npm run type-check
npm run pack:smoke   # npm pack -> install from the tarball -> require()/import() it
```
