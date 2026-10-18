import { afterEach, describe, expect, it, vi } from "vitest";
import KabinetHomePage from "./page";
import OperatorShelterPage from "./prytulky/[id]/page";
import NewShelterPage from "./prytulky/novyi/page";
import OperatorSheltersPage from "./prytulky/page";
import AnimalEditPage, { generateMetadata as animalEditMetadata } from "./tvaryny/[id]/page";
import NewAnimalPage from "./tvaryny/nova/page";
import AnimalListPage from "./tvaryny/page";
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

/** The operator's pages (R-UI 1, and S2 from R-UI 2). */
const operatorList = () => OperatorSheltersPage({ searchParams: Promise.resolve({}) });
const operatorShelter = () =>
  OperatorShelterPage({ params: Promise.resolve({ id: crypto.randomUUID() }) });

/** K3's animal pages (PR 4). */
const animalParams = () => ({ params: Promise.resolve({ id: crypto.randomUUID() }) });

/**
 * The invite landing (IN-T10) shares K1's route, so its 404 is the same
 * page's: listed separately, because its GET is the one that would send an
 * email if it ever ran while sign-in is unavailable.
 */
describe.each([
  ["/kabinet", () => KabinetHomePage()],
  ["/kabinet/vkhid", signIn({})],
  ["/kabinet/vkhid?zaproshennia=<id>", signIn({ zaproshennia: crypto.randomUUID() })],
  ["/kabinet/prytulky", operatorList],
  ["/kabinet/prytulky/<id>", operatorShelter],
  ["/kabinet/prytulky/novyi", () => NewShelterPage()],
  // K2's list (PR 5).
  ["/kabinet/tvaryny", () => AnimalListPage()],
  // K3's two pages, and the edit page's title, which reads the same animal.
  ["/kabinet/tvaryny/nova", () => NewAnimalPage()],
  ["/kabinet/tvaryny/<id>", () => AnimalEditPage(animalParams())],
  ["/kabinet/tvaryny/<id> (its <title>)", () => animalEditMetadata(animalParams())],
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

/**
 * RU-T5: without `LOCATION_HMAC_SECRET` the registry API answers 503 to every
 * call (RG-Q10), so the operator's pages answer 404 rather than half-work,
 * checked before auth or the database. Sign-in is available here (dev config),
 * so the key is the only reason; with the key set the same page goes on past
 * the guard (and fails outside a request, which is not a 404).
 */
describe.each([
  ["/kabinet/prytulky", operatorList],
  ["/kabinet/prytulky/<id>", operatorShelter],
  ["/kabinet/prytulky/novyi", () => NewShelterPage()],
])("%s without the location key", (_route, page) => {
  const thrownWith = async (locationKey: string) => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("LOCATION_HMAC_SECRET", locationKey);
    return page().then(
      () => undefined,
      (error: unknown) => error,
    );
  };

  it("answers 404 itself while sign-in is otherwise available", async () => {
    expect(digestOf(await thrownWith(""))).toContain("404");
  });

  it("goes past the guard once the key is set (control)", async () => {
    expect(digestOf(await thrownWith("l".repeat(32)))).not.toContain("404");
  });
});
