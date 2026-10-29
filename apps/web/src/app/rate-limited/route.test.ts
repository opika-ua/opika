import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

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
