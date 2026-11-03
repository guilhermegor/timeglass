import { bootstrap, type EntryModule, type Host } from './bootstrap';

const USAGE_CODE = 2;

interface FakeHost extends Host {
  out: string[];
  err: string[];
  listeners: Array<() => void>;
}

function fakeHost(): FakeHost {
  const host: FakeHost = {
    out: [],
    err: [],
    listeners: [],
    stdout: { write: (t) => host.out.push(t) },
    stderr: { write: (t) => host.err.push(t) },
    once: (_event, listener) => host.listeners.push(listener),
  };
  return host;
}

function entry(run: EntryModule['runPopoverCommand']): () => Promise<EntryModule> {
  return () => Promise.resolve({ runPopoverCommand: run });
}

describe('bootstrap', () => {
  it('prints the result and sets the exit code', async () => {
    const host = fakeHost();
    const run = jest.fn().mockResolvedValue({ code: USAGE_CODE, stdout: 'out', stderr: 'err' });
    await bootstrap(['model'], entry(run), host);
    expect(host.out).toEqual(['out\n']);
    expect(host.err).toEqual(['err\n']);
    expect(host.exitCode).toBe(USAGE_CODE);
  });

  it('turns a module-load failure into one diagnostic line and a non-zero exit', async () => {
    const host = fakeHost();
    const load = (): Promise<EntryModule> => Promise.reject(new Error('Cannot find x\nstack'));
    await bootstrap(['model'], load, host);
    expect(host.err).toEqual(['timeglass: Cannot find x\n']);
    expect(host.out).toEqual([]);
    expect(host.exitCode).toBe(1);
  });

  it('reports a throw from the command runner, including a non-Error rejection', async () => {
    const host = fakeHost();
    await bootstrap(['model'], entry(jest.fn().mockRejectedValue('boom')), host);
    expect(host.err).toEqual(['timeglass: boom\n']);
    expect(host.exitCode).toBe(1);
  });

  it('aborts the add command on SIGTERM so its cleanup can run', async () => {
    const host = fakeHost();
    let seen: AbortSignal | undefined;
    const run = jest.fn((_argv: readonly string[], options?: { signal?: AbortSignal }) => {
      seen = options?.signal;
      host.listeners.forEach((fire) => fire());
      return Promise.resolve({ code: 1, stdout: '', stderr: 'Login cancelled.' });
    });
    await bootstrap(['add', 'work'], entry(run), host);
    expect(seen?.aborted).toBe(true);
    expect(host.err).toEqual(['Login cancelled.\n']);
  });

  it('leaves SIGTERM at its default for commands with nothing to clean up', async () => {
    const host = fakeHost();
    const run = jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    await bootstrap(['refresh'], entry(run), host);
    expect(host.listeners).toHaveLength(0);
    expect(run).toHaveBeenCalledWith(['refresh'], {});
  });
});
