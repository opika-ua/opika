// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FILTERED, MAX_KEYS, scrubBreadcrumb, scrubEvent } from "./scrub";

const scrub = (event: object) =>
  scrubEvent(event) as {
    extra: Record<string, unknown>;
    tags: Record<string, unknown>;
    request?: { method?: string };
  };

describe("object keys", () => {
  it.each([
    ["a UA phone", "user +380501234567 failed", "+380501234567"],
    ["an email", "mail olena@example.ua sent", "olena@example.ua"],
    ["a t.me link", "see t.me/olena_k now", "olena_k"],
    ["a telegram handle", "telegram @olena_k here", "olena_k"],
  ])("redacts %s in extra and tags keys, and in nested keys", (_n, key, secret) => {
    const out = scrub({ extra: { [key]: 1, nested: { [key]: 2 } }, tags: { [key]: "v" } });
    const all = JSON.stringify(out);
    expect(all).not.toContain(secret);
    expect(all).toContain(FILTERED);
    expect(Object.keys(out.tags)).toHaveLength(1);
  });

  it("keeps the first of colliding keys and suffixes the later ones", () => {
    const out = scrub({
      extra: { "a@example.ua": 1, "b@example.ua": 2, [FILTERED]: 3 },
    });
    expect(out.extra).toEqual({ [FILTERED]: 1, [`${FILTERED}#2`]: 2, [`${FILTERED}#3`]: 3 });
  });

  it("caps a key at the string limit and treats __proto__ as data", () => {
    const out = scrub({ extra: JSON.parse('{"__proto__": 1}') });
    expect(Object.getPrototypeOf(out.extra)).toBe(Object.prototype);
    expect(Object.keys(out.extra)).toEqual(["__proto__"]);
    const long = scrub({ extra: { ["k".repeat(5000)]: 1 } });
    expect(Object.keys(long.extra)[0]?.length).toBeLessThan(1100);
  });

  it("still filters the value under a sensitive key and leaves plain keys alone", () => {
    const out = scrub({ extra: { token: "x", route: "/tvaryny" } });
    expect(out.extra).toEqual({ token: FILTERED, route: "/tvaryny" });
  });

  it("stays fast for 10k keys of 8 KB each, and drops those past the cap", () => {
    const extra: Record<string, number> = {};
    for (let i = 0; i < 10_000; i += 1) extra[`${i}${"вул. ".repeat(1600)}`] = i;
    const start = performance.now();
    const out = scrub({ extra });
    expect(performance.now() - start).toBeLessThan(2000);
    expect(Object.keys(out.extra)).toHaveLength(MAX_KEYS);
  });

  it("scrubs breadcrumb data keys", () => {
    const crumb = scrubBreadcrumb({ category: "navigation", data: { "t.me/olena_k": 1 } }) as {
      data: Record<string, unknown>;
    };
    expect(JSON.stringify(crumb)).not.toContain("olena_k");
  });
});

describe("closed sets for method and debug image type", () => {
  it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("keeps %s", (m) => {
    expect(scrub({ request: { url: "https://x.example/", method: m } }).request?.method).toBe(m);
  });

  it.each(["get", "Post"])("normalises case: %s", (m) => {
    expect(scrub({ request: { method: m } }).request?.method).toBe(m.toUpperCase());
  });

  it.each(["olena@example.ua", "+380501234567", "TRACE", ""])("maps %j to other", (m) => {
    expect(scrub({ request: { method: m } }).request?.method).toBe("other");
  });

  it.each(["sourcemap", "wasm", "macho", "elf", "pe", "proguard"])("keeps image type %s", (t) => {
    const out = scrubEvent({ debug_meta: { images: [{ debug_id: "d", type: t }] } }) as {
      debug_meta: { images: { type: string }[] };
    };
    expect(out.debug_meta.images[0]?.type).toBe(t);
  });

  it("maps an unknown image type to other", () => {
    const out = scrubEvent({
      debug_meta: { images: [{ debug_id: "d", type: "call me on 0501234567" }] },
    }) as { debug_meta: { images: { type: string }[] } };
    expect(out.debug_meta.images[0]?.type).toBe("other");
  });

  it("maps a breadcrumb network method the same way", () => {
    const crumb = scrubBreadcrumb({ category: "fetch", data: { method: "x@example.ua" } }) as {
      data: { method: string };
    };
    expect(crumb.data.method).toBe("other");
  });
});
