import { z } from "zod";

// Audit F5: zod 4 probes `new Function("")` when it builds its first object schema, which the
// Content-Security-Policy reports as eval. Runs before any app module, so no schema is built
// first; zod's plain parser gives the same results as its compiled one.
z.config({ jitless: true });
