import { test } from "@playwright/test";
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.91" } });
test("zz animal page html bytes", async ({ request }) => {
  const g = await (await request.get("/tvaryny")).text();
  const hrefs = [
    ...new Set([...g.matchAll(/href="(\/tvaryny\/[^"/?]+\/[^"/?]+)"/g)].map((m) => m[1] as string)),
  ];
  const out: string[] = [];
  for (const h of hrefs.slice(0, 5))
    out.push(`${h} ${(await (await request.get(h)).body()).length}`);
  throw new Error(`ZZBYTES ${JSON.stringify(out)}`);
});
