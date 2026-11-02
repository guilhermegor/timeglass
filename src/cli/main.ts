import type { FetchLike } from '../api/types.js';
import type { PathOptions } from '../cache/json-file.js';
import type { LoginSession } from '../store/login-session.js';
import { addAccount } from '../store/login.js';
import type { LogEmitter } from '../utils/log-emitter.js';

import { billingRow, usageRow, type FormatContext } from './format.js';
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
}

type Command = (args: readonly string[], deps: CliDeps) => Promise<number> | number;

function formatContext(reports: Reports, name: string, now: Date, deps: CliDeps): FormatContext {
  return { now, timeZone: deps.timeZone, entry: reports.cache[name] };
}

async function showTables(_args: readonly string[], deps: CliDeps): Promise<number> {
  const now = deps.now ?? new Date();
  const reports = await collectReports({ ...deps, now });
  if (reports.reports.length === 0) {
    deps.out('No accounts saved. Run: timeglass add <name>');
    return EXIT_OK;
  }
  const rows = (build: typeof usageRow): string[][] =>
    reports.reports.map((report) => build(report, formatContext(reports, report.name, now, deps)));
  deps.out(renderTable(USAGE_HEADERS, rows(usageRow)));
  deps.out('');
  deps.out(renderTable(BILLING_HEADERS, rows(billingRow)));
  return EXIT_OK;
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

const COMMANDS: Record<string, Command> = {
  add,
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
