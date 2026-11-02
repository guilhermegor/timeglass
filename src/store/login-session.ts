/** A headed browser the user logs in through. Playwright backs the default; tests use fakes. */
export interface LoginSession {
  open(url: string): Promise<void>;
  /** `true` once the browser holds a logged-in claude.ai session. */
  isLoggedIn(): Promise<boolean>;
  /** The session's cookies and local storage, as Playwright's `storageState`. */
  storageState(): Promise<unknown>;
  close(): Promise<void>;
}
