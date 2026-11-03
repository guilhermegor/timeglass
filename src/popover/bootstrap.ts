import type { runPopoverCommand } from './entry.js';

export interface EntryModule {
  runPopoverCommand: typeof runPopoverCommand;
}

export interface Host {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  exitCode?: number | string | null | undefined;
  once(event: 'SIGTERM', listener: () => void): unknown;
}

const COOPERATIVE_COMMAND = 'add';

function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `timeglass: ${message.split('\n')[0] || 'unknown error'}`;
}

function watchTermination(argv: readonly string[], host: Host): AbortSignal | undefined {
  if (argv[0] !== COOPERATIVE_COMMAND) return undefined;
  const controller = new AbortController();
  host.once('SIGTERM', () => controller.abort());
  return controller.signal;
}

export async function bootstrap(
  argv: readonly string[],
  loadEntry: () => Promise<EntryModule>,
  host: Host,
): Promise<void> {
  try {
    const { runPopoverCommand: run } = await loadEntry();
    const signal = watchTermination(argv, host);
    const result = await run(argv, signal ? { signal } : {});
    if (result.stdout) host.stdout.write(`${result.stdout}\n`);
    if (result.stderr) host.stderr.write(`${result.stderr}\n`);
    host.exitCode = result.code;
  } catch (error: unknown) {
    host.stderr.write(`${describeFailure(error)}\n`);
    host.exitCode = 1;
  }
}
