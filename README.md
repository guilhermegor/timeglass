<!-- readme-archetype: library -->
# timeglass

[![Project Status: Active](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-6.x-3178C6?logo=typescript&logoColor=white)
[![Linting](https://img.shields.io/badge/linting-eslint_|_prettier-blue)](https://eslint.org)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Open Issues](https://img.shields.io/github/issues/guilhermegor/timeglass)

<!-- slug: overview -->
## Overview

AI subscription usage and billing across vendors and accounts: CLI + GNOME top-bar

<!-- slug: documentation -->
## Documentation

The documentation site lives at https://guilhermegor.github.io/timeglass/. Serve it locally with `npm run docs:start`.

<!-- slug: getting-started -->
## Getting Started

<!-- slug: install -->
### Install

```bash
npm install timeglass
```

<!-- slug: usage -->
### Usage

```ts
import { greet } from 'timeglass';

greet('World'); // "Hello, World!"
```

<!-- slug: project-structure -->
## Project Structure

```text
timeglass/
├── src/          library source; src/index.ts is the public entry point
├── tests/        Jest suites
├── docs/         Docusaurus site
├── .specs/       feature specs and backlog trackers
└── package.json  exports map for ESM, CJS and .d.ts
```

Feature specs live under `.specs/features/`; `.specs/CLAUDE.md` holds the layout rules and
the template with its `US-`/`AC-`/`ASM-`/`Q-XXX` id conventions.

A [Docusaurus](https://docusaurus.io) site lives in `docs/`, with native version support
(the npm-ecosystem analogue of `mike` on the Python skeletons):

```bash
npm run docs:start   # serve the docs site locally
npm run docs:build   # build the static site into docs-build/
```

<!-- slug: development -->
## Development

```bash
npm install
npm run build       # emits dist/esm, dist/cjs, dist/types
npm test
npm run lint
npm run type-check
npm run pack:smoke  # npm pack -> install from the tarball -> require()/import() it
```

<!-- slug: public-api -->
## Public API

Only what `src/index.ts` re-exports is part of the published surface — everything
else under `src/` is an implementation detail and may change without notice.

<!-- slug: publishing -->
## Publishing

Packaged as dual ESM + CommonJS with bundled `.d.ts` declarations (see `exports`
in `package.json`). Releases publish via **npm OIDC trusted publishing** — no
long-lived `NPM_TOKEN` is stored. See `docs/contributing.md` for the release
workflow and the one-time bootstrap steps required before the first automated
publish. The path from 0.x to 1.0.0, and the release gate that guards it, is in
`docs/releasing-1-0-0.md`.

<!-- slug: contributing -->
## Contributing

See `docs/contributing.md` for the branch, commit and release rules.

<!-- slug: license -->
## License

MIT; see [LICENSE](LICENSE).

<!-- slug: authors -->
## Authors

- guilhermegor — [GitHub](https://github.com/guilhermegor) | [LinkedIn](https://www.linkedin.com/in/your-linkedin-handle)

<!-- slug: useful-links -->
## Useful Links

- [GitHub Repository](https://github.com/guilhermegor/timeglass)
- [Issue Tracker](https://github.com/guilhermegor/timeglass/issues)
