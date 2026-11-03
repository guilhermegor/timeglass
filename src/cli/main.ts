import { editAccount, parseEditArgs, EDIT_USAGE } from '../accounts/edit.js';
import { expiredNotices, purgeExpired } from '../accounts/expiry.js';
import {
  expiryWarnings,
  lifespanBadge,
  readLifespans,
  todayOf,
  type Lifespans,
} from '../accounts/lifespan.js';
import type { FetchLike } from '../api/types.js';
import type { PathOptions } from '../cache/json-file.js';
import type { LoginSession } from '../store/login-session.js';
import { addAccount } from '../store/login.js';
import type { LogEmitter } from '../utils/log-emitter.js';

import { billingRow, usageRow, type FormatContext } from './format.js';
import { installExtension, type InstallExtensionOptions } from './install-extension.js';
import { collectReports, type Reports } from './report.js';
import { renderTable } from './table.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

const USAGE_HEADERS = ['Account', 'Session', 'Weekly'];
const BILLING_HEADERS = ['Account', 'Plan', 'Paid', 'Renewal', 'Auto-renew'];
const HELP = [
  'Usage: timeglass [command]',
  '',
  '  (none)        print usage and billing tables for every saved account',
  '  add <name>    log in to claude.ai in a browser and save the account',
  '  edit <name> [--label <new>] [--lifespan permanent|temporary] [--until YYYY-MM-DD]',
  '                edit an account label, lifespan and end date',
  '  install-extension  install the GNOME top-bar extension',
  '  --version     print the version',
  '  --help        print this help',
].join('\n');

export interface CliDeps {
  argv: readonly string[];
  version: string;
  dir: string;
  logger: LogEmitter;
  out: (text: string) => void;
  err: (text: string) => void;
  fetch?: FetchLike;
  paths?: PathOptions;
  now?: Date;
  timeZone?: string;
  openSession?: () => Promise<LoginSession>;
  extension?: InstallExtensionOptions;
}

type Command = (args: readonly string[], deps: CliDeps) => Promise<number> | number;

function formatContext(reports: Reports, name: string, now: Date, deps: CliDeps): FormatContext {
  return { now, timeZone: deps.timeZone, entry: reports.cache[name] };
}

function withBadge(row: string[], lifespans: Lifespans, today: string): string[] {
  const name = row[0] ?? '';
  const badge = lifespanBadge(lifespans[name], today);
  return badge ? [`${name} [${badge}]`, ...row.slice(1)] : row;
}

async function showTables(_args: readonly string[], deps: CliDeps): Promise<number> {
  const now = deps.now ?? new Date();
  const removed = purgeExpired({ ...deps, opts: deps.paths, log: deps.logger, now });
  expiredNotices(removed).forEach(deps.err);
  const reports = await collectReports({ ...deps, now });
  if (reports.reports.length === 0) {
    deps.out('No accounts saved. Run: timeglass add <name>');
    return EXIT_OK;
  }
  const lifespans = readLifespans(deps.dir, deps.logger);
  const today = todayOf(now, deps.timeZone);
  const rows = (build: typeof usageRow): string[][] =>
    reports.reports.map((report) =>
      withBadge(build(report, formatContext(reports, report.name, now, deps)), lifespans, today),
    );
  deps.out(renderTable(USAGE_HEADERS, rows(usageRow)));
  deps.out('');
  deps.out(renderTable(BILLING_HEADERS, rows(billingRow)));
  const names = reports.reports.map((report) => report.name);
  expiryWarnings(lifespans, names, today).forEach(deps.err);
  return EXIT_OK;
}

function edit(args: readonly string[], deps: CliDeps): number {
  let parsed: ReturnType<typeof parseEditArgs>;
  try {
    parsed = parseEditArgs(args);
  } catch (error: unknown) {
    deps.err(error instanceof Error ? error.message : EDIT_USAGE);
    return EXIT_USAGE;
  }
  try {
    editAccount(parsed.name, parsed.changes, {
      dir: deps.dir,
      opts: deps.paths,
      log: deps.logger,
      now: deps.now,
      timeZone: deps.timeZone,
    });
    deps.out(`Updated account "${parsed.name}".`);
    return EXIT_OK;
  } catch (error: unknown) {
    deps.err(error instanceof Error ? error.message : 'Could not edit the account.');
    return EXIT_FAILED;
  }
}

async function add(args: readonly string[], deps: CliDeps): Promise<number> {
  const [name, ...extra] = args;
  if (!name || extra.length > 0) {
    deps.err('Usage: timeglass add <name>');
    return EXIT_USAGE;
  }
  try {
    const result = await addAccount(name, { ...deps });
    if (result.state === 'added') deps.out(`Saved account "${name}".`);
    if (result.state === 'timeout') deps.err('Timed out waiting for the login to finish.');
    if (result.state === 'failed') deps.err(`Login failed: ${result.message}`);
    return result.state === 'added' ? EXIT_OK : EXIT_FAILED;
  } catch (error: unknown) {
    deps.err(error instanceof Error ? error.message : 'Invalid account name.');
    return EXIT_USAGE;
  }
}

function installGnomeExtension(_args: readonly string[], deps: CliDeps): number {
  try {
    deps.out(installExtension(deps.extension).instructions);
    return EXIT_OK;
  } catch (error: unknown) {
    deps.err(error instanceof Error ? error.message : 'Could not install the extension.');
    return EXIT_FAILED;
  }
}

const COMMANDS: Record<string, Command> = {
  add,
  edit,
  'install-extension': installGnomeExtension,
  '--version': (_args, deps) => {
    deps.out(deps.version);
    return EXIT_OK;
  },
  '--help': (_args, deps) => {
    deps.out(HELP);
    return EXIT_OK;
  },
};

COMMANDS['-v'] = COMMANDS['--version'] as Command;
COMMANDS['-h'] = COMMANDS['--help'] as Command;

export async function runCli(deps: CliDeps): Promise<number> {
  const [first, ...rest] = deps.argv;
  if (first === undefined) return showTables([], deps);
  const command = Object.prototype.hasOwnProperty.call(COMMANDS, first)
    ? COMMANDS[first]
    : undefined;
  if (!command) {
    deps.err(`Unknown command: ${first}\n${HELP}`);
    return EXIT_USAGE;
  }
  return command(rest, deps);
}
