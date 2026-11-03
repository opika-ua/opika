import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const REQUEST = new Request("https://opika.example/rate-limited?gate=x");

it("serves the branded screen's HTML as a 429", async () => {
  const fetchStub = vi.fn(async () => new Response("<h1>screen</h1>", { status: 200 }));
  vi.stubGlobal("fetch", fetchStub);
  const response = await GET(REQUEST);
  expect(response.status).toBe(429);
  expect(await response.text()).toBe("<h1>screen</h1>");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  const [url] = fetchStub.mock.calls[0] as unknown as [URL];
  expect(url.pathname).toBe("/rate-limited/screen");
});

it("is still a 429 with his sentence when the screen cannot be fetched", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("down");
  });
  const response = await GET(REQUEST);
  expect(response.status).toBe(429);
  expect(await response.text()).toContain("Забагато запитів. Спробуйте ще раз пізніше.");
});

it("fetches the screen from the configured origin, whatever Host or forwarded headers say", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://opika.example");
  const fetchStub = vi.fn(async () => new Response("<h1>screen</h1>", { status: 200 }));
  vi.stubGlobal("fetch", fetchStub);
  const spoofed = new Request("https://attacker.example/rate-limited", {
    headers: {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      forwarded: "host=attacker.example",
      cookie: "a=1",
    },
  });
  await GET(spoofed);
  const [url] = fetchStub.mock.calls[0] as unknown as [URL];
  expect(url.origin).toBe("https://opika.example");
  expect(url.pathname).toBe("/rate-limited/screen");
});

it("in production with no configured origin, makes no fetch and still answers 429", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", "");
  const fetchStub = vi.fn();
  vi.stubGlobal("fetch", fetchStub);
  const response = await GET(new Request("https://attacker.example/rate-limited"));
  expect(response.status).toBe(429);
  expect(fetchStub).not.toHaveBeenCalled();
});
