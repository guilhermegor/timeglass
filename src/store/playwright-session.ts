import type { LoginSession } from './login-session.js';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const SIGNED_IN_URL = /claude\.ai\/(new|recents|chat|settings)/;
const ORGANIZATIONS_PROBE =
  "fetch('https://claude.ai/api/organizations').then((response) => response.ok).catch(() => false)";

/**
 * Real Chrome (not bundled Chromium) with the automation flags off: claude.ai sits behind
 * Cloudflare, which blocks a default Playwright browser. A fresh, non-persistent context, so
 * the only thing that reaches disk is the `storageState` the caller writes with mode 0600.
 *
 * Playwright is imported lazily so reading usage over HTTP never loads it. The live login
 * cannot be exercised unattended; everything around it is covered with fakes.
 */
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
