# Security

## Caches and account state

- The billing cache stores only absolute UTC timestamps and booleans, each with the time it
  was read. Cookies, tokens, emails and page text are never cached.
- The organization UUID read from `.claude.json` to detect the active account is never logged
  or returned.
- Cache and label files are written atomically with owner-only mode `0600`, because they name
  accounts and billing dates.
- Parse errors are logged by file path only; a parser message can quote file content, and
  these files can hold account identifiers.
- Account names `__proto__`, `constructor` and `prototype` are refused as billing cache keys,
  so a hostile account name cannot reach `Object.prototype`.

See [Caches and accounts](docs/caches-and-accounts.md) for the full behaviour.
