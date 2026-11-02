# AGENTS.md

Guidance for agents working in this repository.

## Engineering principles

Read `PRINCIPLES.md` for the single-responsibility and function-design rules this project follows.

## What this is

`timeglass` is a publishable TypeScript library (npm), scaffolded by BlueprintX's
`ts-lib` skeleton. It ships dual ESM + CommonJS output plus bundled `.d.ts` declarations,
built with `tsc` alone (no bundler).

## Vendor allowlist (deny-by-default)

`eslint.config.mjs` carries a local `vendor-allowlist` ESLint rule: a third-party import in
`src/**/*.ts` is REJECTED unless `VENDOR_POLICY` names it, per layer, with a written reason
(an entry with a blank reason fails at config-load time, not silently). This is the TypeScript
mirror of the Python skeletons' `.layer-policy.yaml` + `check_layer_imports.py` — see the
vendor-policy notes in `CONTRIBUTING.md` (ESLint configs) for why the policy lives inline here
rather than in `templates/ts-common/`, and why there is no `boundaries` (layer-direction) entry for this
tier. Adding a new runtime dependency means adding it to the **allow map of the layer that imports
it**, with a reason, or `npm run lint` fails.

⚠️ **The layer is the first path component under `src/`, not always `__root__`.** A file
directly under `src/` (`src/index.ts`) resolves to `__root__`; a nested one
(`src/client/request.ts`) resolves to `client`, and needs `VENDOR_POLICY.client.allow`. Writing
the entry under `__root__` for a nested importer leaves lint failing on an entry that looks
correct — the per-layer split is the point of the policy, not an accident of its shape.

## Function length

`eslint.config.mjs` wires ESLint's built-in `max-lines-per-function` at **60**
for `src/**/*.ts` (blueprintx#439) — mirrors `templates/python-common`'s
60-line `check_function_length.py` ceiling. One block, one number: this
skeleton is a flat library with no `.tsx`/JSX (see the vendor-allowlist note
above), so there is no markup/logic split to make, unlike `react-spa-webpack`.
Measured with `--rule '{"max-lines-per-function":["warn",{"max":0}]}'`
(blueprintx#425's technique) against this scaffold's own source: longest
function today is 5 lines, so 60 costs zero findings.

⚠️ **Not the same options as Python's exclusion, and the gap is accepted, not
compensated.** `skipBlankLines: false` matches Python (its span counts blank
lines too). `skipComments: true` is the nearest ESLint has to "docstring
excluded" but is **not equivalent** — it skips every comment, including
inline ones — accepted rather than corrected with a lower number, since every
measured function sits 55+ lines under the ceiling either way. `IIFEs: true`:
an IIFE is still a function body that can grow unchecked.

## Catch safety

Two type-aware ESLint rules close the gap `strict: true` (`tsconfig.json`)
leaves open (blueprintx#440): `useUnknownInCatchVariables` covers a
`catch (err)` clause but **not** a promise `.catch(cb)` callback, whose
parameter stays `any` even under strict mode.

- `@typescript-eslint/use-unknown-in-catch-callback-variable` — forces the
  same `unknown`-and-narrow discipline onto `.catch(cb)` callbacks.
- `@typescript-eslint/only-throw-error` — only `Error` values may be thrown,
  so a catch's `instanceof Error` narrowing can actually succeed.

`no-empty` / `no-useless-catch` (an empty or pass-through catch) are already
covered by `js.configs.recommended` — not re-added here.

## Public API discipline

`src/index.ts` is the only barrel that matters: **only what it re-exports is public**.
Add a new export by adding it to `src/index.ts`, not by expecting consumers to deep-import
from `src/*`. Deep imports resolve locally but break at the package boundary — the shipped
`exports` map exposes only `.` (the barrel).

## Logging (`LogEmitter`)

`src/utils/log-emitter.ts` ships from `templates/ts-common/src/utils/` (blueprintx#436) — the
shared TS source tree, mirroring `templates/python-common/src/utils/`. It exports the
`LogEmitter` port and `NULL_EMITTER` (this package's default). A published library must not
write to a host's console on its own initiative, so every call site accepts a `LogEmitter`
and defaults to `NULL_EMITTER`; the host injects `CONSOLE_EMITTER` or its own implementation.
This file has no internal relative imports on purpose: one file cannot carry an extension
that satisfies both this package's Node-ESM output and
`react-spa-webpack`'s webpack resolution.

## Build

Three separate `tsc` invocations, one per concern:

- `tsconfig.esm.json` → `dist/esm` (ES modules; `postbuild:esm` drops a `dist/esm/package.json`
  with `"type": "module"` so Node treats those `.js` files as ESM without a bundler).
- `tsconfig.cjs.json` → `dist/cjs` (CommonJS; no marker needed — the root `package.json` has
  no `"type"` field, which Node treats identically to `"type": "commonjs"`. The field is left
  **absent rather than explicit** on purpose: an explicit `"type": "commonjs"` breaks the
  Docusaurus 3.x build in `docs/` with an opaque `sourceType: module` webpack parse error —
  bisected against a vanilla Docusaurus site with only that one field flipped.).
- `tsconfig.types.json` → `dist/types` (declarations only, `emitDeclarationOnly`).

`tsconfig.json` itself is `noEmit: true` — it exists for `type-check`, ESLint's type-aware
parser, and as the shared `extends` base for the three emit configs.

## Testing

Jest with `testEnvironment: 'node'` (this is a library, not a UI — no jsdom). Tests live
next to their subject: `src/example.test.ts` beside `src/example.ts`.

## Before publishing

`npm run pack:smoke` runs `npm pack`, installs the tarball into a throwaway consumer
project, then `require()`s and `import()`s the package **by its package name** (not by
reading `dist/` paths directly) — the only way to catch a broken `exports` map or a file
missing from `"files"` before it reaches npm. Update its require/import checks if you
change the public API.

## Documentation site

`docs/` is a [Docusaurus](https://docusaurus.io) site (docs-only mode, no blog),
built with `npm run docs:build` and deployed to GitHub Pages by
`.github/workflows/docs-deploy.yml` after a non-prerelease GitHub release publishes.
`.github/workflows/docs.yml` runs a build-only check on every push/PR so a broken
sidebar entry or dead link is caught before a release, not after. Versioning uses
Docusaurus's built-in `docs:version` command (run locally, its output committed) —
the analogue of `mike` on the Python skeletons, not something CI cuts automatically.

## Publishing (npm OIDC trusted publishing)

`.github/workflows/release-npm.yml` is `workflow_dispatch`-triggered (mirrors
`release-pypi.yaml`'s shape): tests → version-already-published guard → `npm stage
publish` (holds the package for a maintainer's 2FA approval — no `npm publish`, no
stored `NPM_TOKEN`) → a GitHub release carrying the named `npm pack` tarball. See
`docs/contributing.md` for the one-time bootstrap (npm has no pending-publisher
concept, so the package must be published manually once before a trusted publisher
can be configured for it). The `version` input is validated before anything else
runs: semver `X.Y.Z`, optionally `-<prerelease>` (`1.2.3`, `1.2.3-rc.1`) — matching
what `package.json`'s own `version` field must already satisfy.

`.github/workflows/pack-smoke.yml` runs on every PR: `npm run pack:smoke` (tarball
install + require/import) plus a Verdaccio rehearsal job that publishes to and
installs from a self-hosted registry — npm's stand-in for Test PyPI, since no
hosted test registry exists and published versions are immutable.

## Do not

- Do not deep-import from `dist/` or `src/` in consumer code — import from the package name.
- Do not add a bundler (tsup/rollup/vite) without first confirming plain `tsc` cannot do the
  job — dual ESM/CJS + declarations is the one case this skeleton already solves without one.
- Do not add an `NPM_TOKEN` secret as a publish fallback — the entire point of OIDC trusted
  publishing is removing the long-lived token. If OIDC breaks, fix the trusted-publisher
  configuration; do not reintroduce a stored token.
- Do not pass `--provenance` to `npm stage publish` — trusted publishing generates
  provenance automatically, and the flag is redundant.
