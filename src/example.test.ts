import { greet } from './example';

describe('greet', () => {
  it('returns a greeting containing the given name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
});
