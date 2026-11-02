# Contributing

## Branch naming

`<N>` is the issue number; the `branch-has-issue` workflow rejects a branch without it
(`release/`, `dependabot/` and `renovate/` are exempt).

| Type | Pattern |
|------|---------|
| Feature | `feat/<N>-<short-description>` |
| Bug fix | `fix/<N>-<short-description>` |
| Docs | `docs/<N>-<short-description>` |
| Refactor | `refactor/<N>-<short-description>` |
| Chore | `chore/<N>-<short-description>` |

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add user authentication
fix(api): handle null response from /users
docs: update README setup steps
```

## Code style

- Prettier formats on save (`.prettierrc.js`)
- ESLint enforces rules on save (`eslint.config.js`)
- TypeScript strict mode is enabled — no `any` without justification
- Functions are capped at 60 lines via `max-lines-per-function` — 100 for
  *every* function in a `.tsx`/`.jsx` file, not only a component body, since
  the rule is scoped by file glob (`src/**/*.{tsx,jsx}`) and a helper defined
  alongside a component gets the same ceiling
- Errors must narrow before use: this covers a `catch (err)` clause **and** a
  promise `.catch(cb)` parameter, which `strict` mode alone leaves as `any` —
  see `CLAUDE.md`'s "Function length" / "Catch safety" sections for the reasoning

## Test order and seed-specific failures

Jest runs tests in a **randomised order** (`randomize: true` in `jest.config.cjs`) so a test
that only passes because an earlier one ran first fails instead of passing silently. Every
run reports the seed it used; reproduce that order by passing the number back yourself as
`jest --seed=<N>`. Jest reports the seed, not a ready-made re-run command.

**A test that fails only under a particular seed is a real defect, never flakiness to
re-run away.** Re-running until it goes green hides the exact bug this exists to catch —
report the seed and the failing test instead of retrying.

## Pull requests

1. Open an issue first, using the repository's issue template. State what you want to change
   and why, and list the files it will touch. For non-trivial work, wait for the issue to be
   accepted before writing code.
2. Branch off the default branch as `<type>/<issue-number>-<slug>` (for example
   `feat/42-user-authentication`); see "Branch naming" above.
3. Put `Closes #<N>` in the PR body so the issue closes when the PR merges.

Then:

- Keep PRs focused: one logical change per PR.
- All CI checks must pass before merging.
- Direct commits to `main` are not allowed.
