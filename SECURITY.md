# Security

## API client and account store

timeglass keeps a logged-in claude.ai session on disk so it can read usage over plain HTTP.

- **Minimal storage.** Only claude.ai cookies are kept. Third-party cookies (Cloudflare,
  analytics, SSO) are dropped and every origin's localStorage is emptied, because the API calls
  need nothing else. This holds whatever the caller passes in.
- **File permissions.** The accounts directory is tightened to `0700`. The session file is written atomically with mode `0600`; the temp file is
  created `0600`, so it is never wider. The login browser uses a fresh, non-persistent context, but
  Chromium still creates a temporary user-data profile that can hold login cookies. It is removed when
  the browser closes and can remain on disk if the process exits unexpectedly; the `0600` guarantee
  covers only the session file.
- **Account names** that could escape the accounts directory or collide with its file suffix are
  rejected.
- **Fail closed.** A missing, unreadable or malformed session file yields no session. Expired
  cookies are never sent, so a stale session produces a 401 reading rather than transmitting a
  dead credential. With no usable session the loader returns no cookie header, so a caller has nothing to send.
- **No secrets in logs.** The cookie header is never logged and callers must not log it. The
  HTTP layer logs only an endpoint label, status and reason, never the URL (it carries the
  organisation uuid), headers or body. A degraded reading never carries a body, header or id.
