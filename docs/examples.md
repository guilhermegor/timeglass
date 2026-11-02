# Examples

Task-oriented, self-contained snippets. Each recipe stands alone — copy it and adjust.

> **See also:** [Usage](usage.md) for the basics.

## Recipe: greet a user by name

```ts
import { greet } from 'timeglass';

function welcomeMessage(str_userName: string): string {
  return greet(str_userName);
}

console.log(welcomeMessage('Ada')); // "Hello, Ada!"
```

## Recipe: add a new public export

Add the function to `src/`, then re-export it from `src/index.ts` — that barrel is the
only file consumers can import from (the shipped `exports` map exposes only `.`):

```ts
// src/index.ts
export { greet } from './example';
export { yourNewFunction } from './your-new-module';
```

Update `bin/smoke_pack.sh`'s require/import checks whenever the public API changes —
it is the gate that catches a broken `exports` map before publish.
