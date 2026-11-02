# API client and account store

How timeglass reads an account's plan, billing and usage from claude.ai, and where it keeps
the login session that makes this possible.

> **See also:** [Usage](usage.md) · [FAQ](faq.md) · the security assumptions in `SECURITY.md`.

## Logging in once

`login(name, ...)` opens a real, headed browser so you can sign in to claude.ai, then stores
the session under `name`. After that no browser is needed: every reading goes over plain HTTP.

- It resolves with a typed result instead of throwing. Only an invalid `name` throws, and it
  does so before any browser opens.
- The browser is real Chrome (not bundled Chromium) with the automation flags off. claude.ai
  sits behind Cloudflare, which blocks a default Playwright browser.
- Playwright is imported lazily, so reading usage over HTTP never loads it.
- The live login cannot be exercised unattended; everything around it is covered with fakes.
  `LoginSession` is the seam: Playwright backs the default and tests inject a fake. A session
  reports `true` once the browser holds a logged-in claude.ai session and exposes its cookies
  and local storage as Playwright's `storageState`.

## Account store

Sessions live in one JSON file per account.

- Directory: `$TIMEGLASS_ACCOUNTS_DIR`, else `$XDG_CONFIG_HOME/timeglass/accounts`, else
  `~/.config/timeglass/accounts`.
- Account names that could escape the directory or collide with its file suffix are rejected.
- Saves are atomic and use mode `0600`; the temp file is created `0600` so it is never wider.
- Only claude.ai cookies are kept, whatever the caller passes in (see `SECURITY.md`).
- Listing returns sorted account names that have a saved session. Deleting is idempotent: a
  missing session is not an error.
- Loading returns `null` when the file is missing, unreadable or not a storage state, and the
  cookie header is `null` when there is no usable session.
- A cookie with no expiry is stored by Playwright with `expires = -1`; it is treated as a
  session cookie and never counts as expired. Expired cookies are dropped from the header, so a
  stale session surfaces as a 401 reading.

## Reading usage

The client reads plan, billing and usage over HTTP with the saved cookie header. It never
throws: each of the four endpoints degrades on its own to `unknown`, and a failed organisation
lookup degrades all three readings because nothing else can be addressed.

- Each endpoint's outcome is a value (`JsonResult`), never a throw, so callers render
  `unknown` (or "managed by the team admin") instead of guessing. A degraded reading carries a
  reason only, never a body, header or id.
- A 403 `permission_error` means a Team member who is not the billing admin.
- `fetch` defaults to the global one; inject a fake in tests. Anything with the shape of
  `Response` that the package reads will do.
- Requests send a browser user agent because claude.ai's Cloudflare clearance cookie is bound
  to the browser's user agent.

### Parsing rules

- Plan: paid markers are checked before bare `chat`, since a paid organisation keeps its `chat`
  capability. The order is `claude_max`, `claude_pro`, `raven` (Team/Enterprise), then
  chat-only as free.
- Organisation: the first one with a recognised plan, else the first one; none without a
  usable uuid.
- Billing: `billing_type` is the only paid signal. Absent or non-string stays unknown (`null`),
  as does any field claude.ai did not state.
