/**
 * Preloaded (`--import`) into a CLI a test spawns with a fake Neon URL.
 *
 * A fake endpoint id under `*.aws.neon.tech` can still resolve to Neon's real
 * proxy, and the request would carry the fake credentials to it. Tests never
 * contact Neon, so the one transport the Neon driver uses fails here instead.
 */
globalThis.fetch = async () => {
  throw new Error("network disabled by test/no-network.mjs");
};
