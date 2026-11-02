# GNOME extension

The top-bar extension shows the active account's session usage and a stacked popover with every
account. It ships inside the npm package under `extension/` and is installed with one command.

> **See also:** [Usage](usage.md) · [Caches and accounts](caches-and-accounts.md).

## Install

```bash
timeglass install-extension
```

This copies `extension/` to `~/.local/share/gnome-shell/extensions/timeglass@guilhermegor/`
(honouring `XDG_DATA_HOME`) and writes `helper.json` beside it, holding the absolute path of the
built `dist/esm/popover/main.js`. The command fails if the package has not been built or the
extension files are missing, and replaces a previous install rather than merging into it.

Then restart GNOME Shell (log out and back in on Wayland) and run
`gnome-extensions enable timeglass@guilhermegor`. Supported shells: 46, 47, 48.

## What the popover shows

Per account, in the order the accounts were added:

- Session and weekly usage bars with a countdown and the absolute reset time, for example
  `resets in 4h39m (today 21:44)`. Days are labelled `today`, `tomorrow`, the weekday, and from
  seven days out the full date.
- A renewal line (`Renews 5 Nov`, `Ends 5 Nov` when auto-renew is off, `Billing managed by team
  admin`, or `Renewal unknown`) and the age of the data.
- A `free` plan is flagged as unpaid; an account whose read failed shows the error and no bars.

Above the list the popover shows the active account (`active: unknown` when it cannot be matched
to a stored account) and `switch to: <name>`, the recommended account. The panel text is the
active account and its session percent, falling back to the recommended account's percent.

Recommendation skips errored and `free` accounts. Among accounts usable now it takes the lowest
session plus weekly sum; when all are exhausted it takes the one that frees up first.

## Actions

- **Refresh** fetches every stored account and rewrites `usage.json` (next to the billing cache,
  or `TIMEGLASS_USAGE_FILE`) and the billing cache in a single pass.
- **Add account** opens a dialog for the name and runs the browser login.
- The pencil button on an account edits its display label inline; an empty label removes it.

Opening the popover only reads local files: it never calls the API. Only Refresh does.

## How the extension talks to the library

The extension runs `node <main.js> model|refresh|add <name>|label <name> [text]`, where `main.js`
is `dist/esm/popover/main.js` from `helper.json`. Output is a JSON model on stdout; failures
come back as the last stderr line and exit code. The same entry point is `runPopoverCommand`
in `src/popover/entry.ts` (internal, not re-exported from the package barrel); it never writes to
the console itself: only `main.js` prints. A shell-local `node` must be on `PATH` (an asdf shim is the fallback).

## Known limits

- The refresh stores no organisation UUID, so the active account is reported as unknown until the
  API client exposes it.
- The icon is `extension/icons/timeglass-symbolic.svg`.
