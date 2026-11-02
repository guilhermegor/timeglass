import { USER_AGENT } from '../api/user-agent.js';

import type { LoginSession } from './login-session.js';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const SIGNED_IN_URL = /^https:\/\/claude\.ai\/(new|recents|chat|settings)([/?#]|$)/;
const ORGANIZATIONS_PROBE =
  "fetch('https://claude.ai/api/organizations', { signal: AbortSignal.timeout(5000) }).then((response) => response.ok).catch(() => false)";

export function isSignedInUrl(url: string): boolean {
  return SIGNED_IN_URL.test(url);
}

export async function openPlaywrightSession(): Promise<LoginSession> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const context = await browser
    .newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      locale: 'en-US',
      userAgent: USER_AGENT,
    })
    .catch(async (error: unknown) => {
      await browser.close();
      throw error;
    });
  const page = await context.newPage().catch(async (error: unknown) => {
    await browser.close();
    throw error;
  });

  return {
    open: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    isLoggedIn: async () =>
      isSignedInUrl(page.url()) || (await page.evaluate(ORGANIZATIONS_PROBE)) === true,
    storageState: () => context.storageState(),
    close: () => browser.close(),
  };
}
