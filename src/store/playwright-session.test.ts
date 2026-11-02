import { isSignedInUrl } from './playwright-session';

describe('isSignedInUrl', () => {
  it.each([
    'https://claude.ai/new',
    'https://claude.ai/chat/abc',
    'https://claude.ai/settings?x=1',
  ])('accepts %s', (url) => {
    expect(isSignedInUrl(url)).toBe(true);
  });

  it.each([
    'https://evil.example/?next=claude.ai/new',
    'https://claude.ai.evil.example/new',
    'https://claude.ai/newsletter',
    'https://claude.ai/login',
  ])('rejects %s', (url) => {
    expect(isSignedInUrl(url)).toBe(false);
  });
});
