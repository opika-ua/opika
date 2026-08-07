import { cityRepo } from "@opika/db/repos";
import { makeCity } from "@opika/db/test";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../api/server-client";
import { createTestHarness, type TestHarness } from "../api/test-harness";
import { renderHome } from "./page";

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});

afterAll(async () => {
  await h.cleanup();
});

beforeEach(async () => {
  await h.truncate();
});

/**
 * The one thing no other test in this branch covers: that `/` itself — not
 * `anonymousRouterClient` in isolation (server-client.test.ts), not
 * `HomeScreen` given fabricated props (HomeScreen.test.tsx) — actually wires
 * a real database through to a real render. `force-dynamic` (page.tsx) means
 * `next build` never exercises this path either. Exactly the "compiles
 * clean, renders wrong" shape docs/standing-constraints.md exists to rule
 * out, so it gets a real DB and a real render, not a mock of either.
 */
describe("/ (renderHome)", () => {
  it("renders real seeded cities as chips, through the real anonymousRouterClient", async () => {
    const brovary = makeCity({ name: { uk: "Бровари", en: null } });
    const irpin = makeCity({ name: { uk: "Ірпінь", en: null } });
    await cityRepo(h.db).insert(brovary);
    await cityRepo(h.db).insert(irpin);

    const element = await renderHome(anonymousRouterClient(h.db));
    render(element);

    expect(screen.getByRole("button", { name: "Бровари" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ірпінь" })).toBeTruthy();
  });

  it("renders zero city chips beyond 'Уся Київщина' when the DB has none", async () => {
    const element = await renderHome(anonymousRouterClient(h.db));
    render(element);

    expect(screen.getByRole("button", { name: "Уся Київщина" })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(1);
  });
});
