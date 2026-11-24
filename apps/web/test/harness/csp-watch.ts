/**
 * Audit B1: the kabinet specs and the public flows (the CSP trial) import `test` from here, so every
 * page they open, in any context they make, fails its test on a CSP violation (enforced or report-only). The browser logs each
 * violation to the console; the listener also catches the `securitypolicyviolation` event.
 */
import { type BrowserContext, test as base, expect } from "@playwright/test";

export { expect };

const MARK = "[csp-violation]";
const seen: string[] = [];

function watch(context: BrowserContext): void {
  void context.addInitScript((mark) => {
    document.addEventListener("securitypolicyviolation", (event) => {
      // biome-ignore lint/suspicious/noConsole: the page's console is how a violation reaches the test
      console.error(
        `${mark} ${event.effectiveDirective} ${event.blockedURI} (${event.disposition}) on ${location.pathname}`,
      );
    });
  }, MARK);
  context.on("console", (message) => {
    const text = message.text();
    if (text.startsWith(MARK) || text.includes("Content Security Policy")) seen.push(text);
  });
}

export const test = base.extend<{ cspClean: undefined }, { cspWatch: undefined }>({
  // Contexts made with `browser.newContext()` (most kabinet specs sign in that way) and the
  // default `context` fixture both come through here.
  cspWatch: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        watch(context);
        return context;
      };
      await use(undefined);
      browser.newContext = newContext;
      expect(seen.splice(0), "CSP violations after the last test").toEqual([]);
    },
    { scope: "worker", auto: true },
  ],
  // Checked after each test: a violation from a context made in `beforeAll` counts at the next test.
  cspClean: [
    async ({ cspWatch: _ }, use) => {
      await use(undefined);
      expect(seen.splice(0), "CSP violations").toEqual([]);
    },
    { auto: true },
  ],
});
