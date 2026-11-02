# FAQ

Answers to common questions about using and developing this library.

> **See also:** [Usage](usage.md) · [Examples](examples.md) · [Contributing](contributing.md).

## How do I install it?

```bash
npm install timeglass
```

## Why dual ESM + CommonJS instead of a bundler?

Three plain `tsc` invocations (`tsconfig.esm.json`, `tsconfig.cjs.json`,
`tsconfig.types.json`) cover ESM, CJS, and declarations without adding a bundler
(tsup/rollup/vite) — see `CLAUDE.md`'s "Do not" section before adding one.

## How is the version determined?

`package.json`'s `version` field is the source of truth (unlike the Python skeletons,
which derive it from the git tag). Bump it before cutting a GitHub release — the
release workflow refuses to republish a version already on the npm registry.

## How do I publish a new version?

See [Contributing](contributing.md#releasing-npm-oidc-trusted-publishing) for the full
npm OIDC trusted-publishing flow, including the one-time bootstrap steps required
before the first automated publish.

## Which Node/npm versions are supported?

See `engines` in `package.json`; CI pins the same versions via `.nvmrc`.
