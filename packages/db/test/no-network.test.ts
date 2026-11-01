import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The preload that keeps tests off real Neon: a spawned CLI with a fake Neon URL must fail on
 * anything beyond this machine, and loopback must keep working.
 */
const PRELOAD = resolve(fileURLToPath(import.meta.url), "../no-network.mjs");

const probe = (code: string) =>
  spawnSync(
    process.execPath,
    ["--import", pathToFileURL(PRELOAD).href, "--input-type=module", "-e", code],
    {
      encoding: "utf8",
      timeout: 20_000,
    },
  );

describe("test/no-network.mjs", () => {
  it("refuses a non-loopback TCP connection and fetch with its message", () => {
    const result = probe(`
      import net from "node:net";
      const tcp = await new Promise((done) => {
        const s = net.connect({ host: "ep-fake.eu-central-1.aws.neon.tech", port: 5432 });
        s.on("error", (e) => done(e.message));
        s.on("connect", () => done("CONNECTED"));
      });
      const positional = await new Promise((done) => {
        const s = new net.Socket();
        s.on("error", (e) => done(e.message));
        s.on("connect", () => done("CONNECTED"));
        s.connect(5432, "ep-fake.eu-central-1.aws.neon.tech");
      });
      const fetched = await fetch("https://example.test/").then(() => "FETCHED", (e) => e.message);
      console.log(JSON.stringify({ tcp, positional, fetched }));
    `);
    const seen = JSON.parse(result.stdout.trim()) as {
      tcp: string;
      positional: string;
      fetched: string;
    };
    expect(seen.tcp).toBe("network disabled by test/no-network.mjs");
    expect(seen.positional).toBe("network disabled by test/no-network.mjs");
    expect(seen.fetched).toBe("network disabled by test/no-network.mjs");
  });

  it("leaves loopback working", () => {
    const result = probe(`
      import net from "node:net";
      const server = net.createServer((c) => { c.on("error", () => {}); c.end("hi"); }).listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const { port } = server.address();
      const answer = await new Promise((done, fail) => {
        const s = net.connect({ host: "127.0.0.1", port });
        let data = "";
        s.on("data", (d) => (data += d));
        s.on("end", () => done(data));
        s.on("error", fail);
      });
      const noHost = await new Promise((done, fail) => {
        const s = net.connect(port);
        s.on("connect", () => done("ok"));
        s.on("data", () => {});
        s.on("error", fail);
      });
      console.log(JSON.stringify({ answer, noHost }));
      server.close();
    `);
    expect(JSON.parse(result.stdout.trim())).toEqual({ answer: "hi", noHost: "ok" });
  });
});
