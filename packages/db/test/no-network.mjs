/**
 * Preloaded (`--import`) into a CLI a test spawns with a fake Neon URL.
 *
 * A fake endpoint id under `*.aws.neon.tech` can still resolve to Neon's real
 * proxy, and the request would carry the fake credentials to it. Tests never
 * contact Neon, so both transports fail here instead: `fetch` (the Neon HTTP
 * driver) and any TCP connection beyond this machine (postgres-js, which
 * `db:migrate` uses in-process since PG-F3). Loopback stays open, so a local
 * database or a closed local port still behaves as it really does.
 */
import net from "node:net";

const DISABLED = "network disabled by test/no-network.mjs";

globalThis.fetch = async () => {
  throw new Error(DISABLED);
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const [first, second] = args;
  // connect(options) or connect(port, host?); no host means localhost, a `path` a local socket.
  const host = typeof first === "object" && first !== null ? first.host : second;
  if (host === undefined || typeof host !== "string" || LOOPBACK.has(host)) {
    return connect.apply(this, args);
  }
  process.nextTick(() => this.destroy(new Error(DISABLED)));
  return this;
};
