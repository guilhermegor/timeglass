<!-- readme-archetype: library -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/timeglass-lockup-dark.svg">
    <img src="assets/logo/timeglass-lockup.svg" alt="timeglass" height="64">
  </picture>
</p>

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

Command line:

```bash
npx timeglass add work   # one-time browser login
npx timeglass            # usage and billing tables for every saved account
npx timeglass edit work --lifespan temporary --until 2026-12-01   # auto-removed after that day
npx timeglass --version
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

<!-- slug: logo -->
## Logo

The mark is an hourglass of tokens: the top bulb holds the tokens remaining (amber), one token
falls through the neck, and the bottom bulb holds the tokens spent (muted). It nods to the
session and weekly resets. It was chosen in
[guilhermegor/dotfiles-linux-dev#753](https://github.com/guilhermegor/dotfiles-linux-dev/issues/753)
(option B) and is released under the MIT licence, the same as the code.

| File | Use |
|---|---|
| `assets/logo/timeglass.svg` | full-colour mark, 64 px and up |
| `assets/logo/timeglass-symbolic.svg` | 16 px black icon for the GNOME top bar (also in `extension/icons/`) |
| `assets/logo/timeglass-lockup.svg`, `-lockup-dark.svg` | mark + wordmark, text outlined to paths |
| `assets/logo/timeglass-dark.svg` | mark in `#F1ECE2` on `#17202A` |
| `assets/logo/timeglass-on-dark.svg` | mark in `#F1ECE2`, transparent background (docs dark navbar) |
| `assets/logo/timeglass-{16,32,64,128,256,512}.png`, `timeglass-dark-*.png` | PNG renders |

Wordmark: [Space Grotesk](https://github.com/floriankarsten/space-grotesk) 700, lowercase,
letter-spacing -0.02em, outlined so no font is needed at render time (the font is SIL OFL 1.1).
Colours: ink `#17202A`, amber `#E8A33D`, paper `#F1ECE2`.

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
