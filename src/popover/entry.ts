import { detectActiveAccount } from '../accounts/active.js';
import { readLabels, setLabel } from '../accounts/labels.js';
import { loadBillingCache } from '../cache/billing.js';
import { defaultAccountsDir } from '../store/account-store.js';
import { addAccount } from '../store/login.js';
import { NULL_EMITTER } from '../utils/log-emitter.js';

import { buildPopoverModel } from './model.js';
import { refreshUsage, type RefreshOptions } from './refresh.js';
import { loadUsageSnapshot } from './snapshot.js';

export interface EntryResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type EntryOptions = RefreshOptions;

const USAGE = 'usage: model | refresh | add <name> | label <name> [text]';

function ok(stdout = ''): EntryResult {
  return { code: 0, stdout, stderr: '' };
}

function fail(stderr: string): EntryResult {
  return { code: 1, stdout: '', stderr };
}

function showModel(options: EntryOptions): EntryResult {
  const log = options.logger ?? NULL_EMITTER;
  const usage = loadUsageSnapshot(options, log);
  const model = buildPopoverModel(usage, loadBillingCache(options, log), {
    ...(options.now && { now: options.now }),
    activeName: detectActiveAccount(usage.accounts, options),
    labels: readLabels(options, log),
  });
  return ok(JSON.stringify(model));
}

async function addByName(name: string, options: EntryOptions): Promise<EntryResult> {
  const result = await addAccount(name, {
    dir: defaultAccountsDir(options.env),
    ...(options.logger && { logger: options.logger }),
  });
  if (result.state === 'added') return ok();
  return fail(result.state === 'failed' ? result.message : 'Login timed out.');
}

export async function runPopoverCommand(
  argv: readonly string[],
  options: EntryOptions = {},
): Promise<EntryResult> {
  const [command, name, ...rest] = argv;
  try {
    if (command === 'model') return showModel(options);
    if (command === 'refresh') {
      await refreshUsage(options);
      return ok();
    }
    if (command === 'add' && name) return await addByName(name, options);
    if (command === 'label' && name) {
      return setLabel(name, rest.join(' '), options, options.logger)
        ? ok()
        : fail('Could not save the label.');
    }
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'unknown error');
  }
  return { code: 2, stdout: '', stderr: USAGE };
}
