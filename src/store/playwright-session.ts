import type { LoginSession } from './login-session.js';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const SIGNED_IN_URL = /claude\.ai\/(new|recents|chat|settings)/;
const ORGANIZATIONS_PROBE =
  "fetch('https://claude.ai/api/organizations').then((response) => response.ok).catch(() => false)";

export async function openPlaywrightSession(): Promise<LoginSession> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    locale: 'en-US',
  });
  const page = await context.newPage();

  return {
    open: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    isLoggedIn: async () =>
      SIGNED_IN_URL.test(page.url()) || (await page.evaluate(ORGANIZATIONS_PROBE)) === true,
    storageState: () => context.storageState(),
    close: () => browser.close(),
  };
}
