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

## Running tests and lint locally

```bash
npm install
npm run build       # emits dist/esm, dist/cjs, dist/types
npm test
npm run lint
npm run type-check
npm run pack:smoke   # npm pack -> install from the tarball -> require()/import() it
```
