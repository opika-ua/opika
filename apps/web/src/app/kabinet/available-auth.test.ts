import { afterEach, describe, expect, it, vi } from "vitest";
import KabinetHomePage from "./page";
import SignInPage from "./vkhid/page";

/**
 * Each page answers its own 404 while sign-in is unavailable, before
 * `kabinetAuth()` can throw: the layout's 404 runs concurrently with the
 * page and cannot stop it (review of #93, 2146c34 note 1).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const digestOf = (error: unknown) =>
  typeof error === "object" && error !== null
    ? String((error as { digest?: unknown }).digest)
    : String(error);

const signIn = (search: Record<string, string>) => () =>
  SignInPage({ searchParams: Promise.resolve(search) });

/**
 * The invite landing (IN-T10) shares K1's route, so its 404 is the same
 * page's: listed separately, because its GET is the one that would send an
 * email if it ever ran while sign-in is unavailable.
 */
describe.each([
  ["/kabinet", () => KabinetHomePage()],
  ["/kabinet/vkhid", signIn({})],
  ["/kabinet/vkhid?zaproshennia=<id>", signIn({ zaproshennia: crypto.randomUUID() })],
])("%s while sign-in is unavailable", (_route, page) => {
  it("answers 404 itself, never reaching the auth instance", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    const thrown = await page().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(digestOf(thrown)).toContain("404");
  });

  it("answers 404 in production, which has no email sender yet", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "https://example.org");
    const thrown = await page().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(digestOf(thrown)).toContain("404");
  });
});
