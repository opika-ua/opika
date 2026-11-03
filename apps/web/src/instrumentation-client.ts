import { startClientMonitoring } from "./observability/load-client";

// H5: the error reporter loads after the page settles and only when a DSN was built in; see load-client.ts.
startClientMonitoring();
