export { greet } from './example.js';

export type { LogEmitter } from './utils/log-emitter.js';
export { NULL_EMITTER, CONSOLE_EMITTER } from './utils/log-emitter.js';

export { fetchAccountSnapshot } from './api/client.js';
export type { ClientOptions } from './api/client.js';
export type {
  AccountSnapshot,
  FetchLike,
  FetchResponse,
  Organization,
  Plan,
  Reading,
  Subscription,
  UnknownReason,
  Usage,
  UsageWindow,
} from './api/types.js';

export {
  defaultAccountsDir,
  listAccounts,
  loadCookieHeader,
  removeAccount,
} from './store/account-store.js';
export { addAccount } from './store/login.js';
export type { AddAccountOptions, AddAccountResult } from './store/login.js';
export type { LoginSession } from './store/login-session.js';
