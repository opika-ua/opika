import { z } from "zod";

// Audit F5: zod 4 probes `new Function("")` when it builds its first object schema, which the
// Content-Security-Policy reports as eval. Only kabinet client code still builds schemas in the
// browser, and each such file imports this first (pinned by `client-bundle-guard.test.ts`), so
// no schema is built before it runs; zod's plain parser gives the same results as its compiled
// one. Browser only: on the server it would switch off the compiled parser the API handlers use.
if (typeof window !== "undefined") z.config({ jitless: true });
