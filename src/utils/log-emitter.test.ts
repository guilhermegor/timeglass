import { CONSOLE_EMITTER, NULL_EMITTER } from './log-emitter';

describe('LogEmitter defaults', () => {
  const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

  it.each(LEVELS)('NULL_EMITTER.%s writes nothing to console', (level) => {
    const spy = jest.spyOn(console, level).mockImplementation(() => {});
    NULL_EMITTER[level]('message', { key: 'value' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each(LEVELS)('CONSOLE_EMITTER.%s delegates to console.%s', (level) => {
    const spy = jest.spyOn(console, level).mockImplementation(() => {});
    CONSOLE_EMITTER[level]('message', { key: 'value' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('message', { key: 'value' });
    spy.mockRestore();
  });

  it('CONSOLE_EMITTER omits the context argument when none is given', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    CONSOLE_EMITTER.info('message');
    expect(spy).toHaveBeenCalledWith('message');
    spy.mockRestore();
  });
});
