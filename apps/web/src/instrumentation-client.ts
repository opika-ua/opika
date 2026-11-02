import { z } from "zod";
import { startClientMonitoring } from "./observability/load-client";

// Audit F5: zod 4 probes `new Function("")` when it builds its first object schema, which the
// Content-Security-Policy reports as eval. Runs before any app module, so no schema is built
// first; zod's plain parser gives the same results as its compiled one.
z.config({ jitless: true });

// H5: the error reporter loads after idle and only when a DSN was built in; see load-client.ts.
startClientMonitoring();
