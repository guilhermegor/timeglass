export { greet } from './example.js';

export type { LogEmitter } from './utils/log-emitter.js';
export { NULL_EMITTER, CONSOLE_EMITTER } from './utils/log-emitter.js';

export type { PathOptions } from './cache/json-file.js';
export { billingCachePath, labelsPath, claudeJsonPath } from './cache/json-file.js';
export type {
  BillingCache,
  BillingPeriod,
  CacheEntry,
  SubscriptionBilling,
} from './cache/billing.js';
export {
  billingFromCache,
  billingFromSubscription,
  effectiveWeeklyReset,
  loadBillingCache,
  needsFetch,
  recordBilling,
  recordWeeklyReset,
  saveBillingCache,
} from './cache/billing.js';
export type { AccountRef } from './accounts/active.js';
export { UNKNOWN_ACCOUNT, detectActiveAccount } from './accounts/active.js';
export type { Labels } from './accounts/labels.js';
export { readLabels, renameLabel, setLabel } from './accounts/labels.js';
