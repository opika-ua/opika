import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KabinetPrincipal } from "../../../../kabinet/actor";

/**
 * Who gets `/kabinet/prytulky/novyi` (`docs/r-ui-plan.md` §4): the real page
 * module, with the real sign-in availability and the real access decision;
 * only the session lookup (which principal), the request headers and the
 * public city list are stand-ins. Every principal the kabinet knows is a row.
 */

const identity = vi.fn(
  async (): Promise<{ principal: KabinetPrincipal; userId: string | null }> => ({
    principal: { kind: "anonymous" },
    userId: null,
  }),
);
const cities = vi.fn(async () => [
  {
    id: "c1000000-0000-4000-8000-000000000001",
    name: { uk: "Вишгород", en: null },
    slug: "vyshhorod",
  },
]);

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../../../../api/db", () => ({ getDb: () => ({}) }));
vi.mock("../../../../kabinet/runtime", () => ({ kabinetAuth: () => ({}) }));
vi.mock("../../../../kabinet/principal", () => ({ kabinetIdentityOf: identity }));
vi.mock("../../../../api/server-client", () => ({
  anonymousRouterClient: () => ({ cities: { list: cities } }),
}));

const { default: NewShelterPage } = await import("./page");

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const SHELTER = "51000000-0000-4000-8000-000000000001" as ShelterId;

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("LOCATION_HMAC_SECRET", "l".repeat(32));
  identity.mockReset();
  identity.mockResolvedValue({ principal: { kind: "anonymous" }, userId: null });
  cities.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const as = (principal: KabinetPrincipal) =>
  identity.mockResolvedValue({
    principal,
    userId: principal.kind === "anonymous" ? null : "u",
  });

const digestOf = (error: unknown) =>
  typeof error === "object" && error !== null
    ? String((error as { digest?: unknown }).digest)
    : String(error);

const outcome = () =>
  NewShelterPage().then(
    (tree) => ({ kind: "rendered" as const, tree }),
    (error: unknown) => ({ kind: "thrown" as const, digest: digestOf(error) }),
  );

describe("/kabinet/prytulky/novyi, by who is asking", () => {
  it("renders the create form for a super_admin outside support mode, with the public city list", async () => {
    as({ kind: "super_admin", moderatorId: OPERATOR });
    const result = await outcome();
    expect(result.kind).toBe("rendered");
    expect(cities).toHaveBeenCalledTimes(1);
    const tree = JSON.stringify(result.kind === "rendered" ? result.tree : null);
    expect(tree).toContain(
      '"cities":[{"id":"c1000000-0000-4000-8000-000000000001","name":"Вишгород"}]',
    );
  });

  it("sends an anonymous visitor to sign in", async () => {
    as({ kind: "anonymous" });
    const result = await outcome();
    expect(result.kind === "thrown" && result.digest).toContain("NEXT_REDIRECT");
    expect(result.kind === "thrown" && result.digest).toContain("/kabinet/vkhid");
    expect(cities).not.toHaveBeenCalled();
  });

  it.each<[string, KabinetPrincipal]>([
    [
      "a shelter admin",
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: SHELTER,
      },
    ],
    [
      "the operator in support mode",
      { kind: "support_view", moderatorId: OPERATOR, shelterId: SHELTER },
    ],
    ["a signed-in user with no role", { kind: "no_role" }],
    ["a user with conflicting roles", { kind: "conflicting_roles" }],
  ])("answers 404 to %s", async (_who, principal) => {
    as(principal);
    const result = await outcome();
    expect(result.kind === "thrown" && result.digest).toContain("404");
    expect(cities).not.toHaveBeenCalled();
  });
});

describe("/kabinet/prytulky/novyi, by what the deployment has", () => {
  it("answers 404 while sign-in is unavailable, before any session is looked up", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    const result = await outcome();
    expect(result.kind === "thrown" && result.digest).toContain("404");
    expect(identity).not.toHaveBeenCalled();
  });

  it("answers 404 in production, which has no email sender here", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await outcome();
    expect(result.kind === "thrown" && result.digest).toContain("404");
    expect(identity).not.toHaveBeenCalled();
  });

  it("answers 404 without LOCATION_HMAC_SECRET, even to the operator (RU-T5, the API's 503)", async () => {
    vi.stubEnv("LOCATION_HMAC_SECRET", "");
    as({ kind: "super_admin", moderatorId: OPERATOR });
    const result = await outcome();
    expect(result.kind === "thrown" && result.digest).toContain("404");
    expect(identity).not.toHaveBeenCalled();
  });
});
