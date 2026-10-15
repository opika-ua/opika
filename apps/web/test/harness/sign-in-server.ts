import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { expect } from "@playwright/test";
import {
  CURSOR_HMAC_SECRET,
  HARNESS_BETTER_AUTH_SECRET,
  HARNESS_PRELAUNCH_GATE_SECRET,
  R2_PUBLIC_BASE_URL,
} from "../harness-env";

/**
 * A second server on the same build, with kabinet sign-in available (KS-T3,
 * the confirm spec's pattern; shared since the wiring commit).
 *
 * **Why a second server.** The harness's main server runs `next start` in
 * production mode with no `VERCEL_ENV`, so `productionSignInOf` can't identify
 * the deployment and production sign-in stays off (fail closed, IN-R2): every
 * `/kabinet` page there is a 404, and the specs pin that. Turning production
 * sign-in on in the harness would need a real email provider (its request
 * URLs are fixed, so a send would leave the machine), which the harness must
 * never do. So this server runs the same build with `NODE_ENV=test` and
 * `BETTER_AUTH_*` set, where sign-in is available with the development
 * console sender, and a spec reads the link from this server's stdout,
 * exactly the channel local development uses. Nothing in the app is patched
 * or bypassed; the production gate is untouched (and asserted by the main
 * server's 404s).
 *
 * The link is a credential, even a test one: callers never print it or put it
 * in a failure message, and keep tracing off.
 */
export type SignInServer = {
  origin: string;
  /** Everything this server has written to stdout so far. */
  stdout: () => string;
  /** The magic link the console sender printed for `email`, once it appears. */
  linkFor: (email: string) => Promise<string>;
  stop: () => Promise<void>;
};

/** Transcribed from `src/kabinet/auth.ts` (`CONFIRM_PATH`), not imported. */
export const CONFIRM_PATH = "/kabinet/vkhid/pidtverdzhennia";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function startSignInServer(databaseUrl: string): Promise<SignInServer> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  let stdout = "";
  const server: ChildProcess = spawn(
    process.execPath,
    [nextBin, "start", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        CURSOR_HMAC_SECRET,
        NEXT_PUBLIC_R2_PUBLIC_BASE_URL: R2_PUBLIC_BASE_URL,
        PRELAUNCH_GATE_SECRET: HARNESS_PRELAUNCH_GATE_SECRET,
        BETTER_AUTH_SECRET: HARNESS_BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  server.stderr?.resume();

  // If the server never becomes ready, kill it before rethrowing: the caller
  // has no handle yet, so its stop() can't, and a server left on this random
  // port is invisible to the post-run orphan check (review of the #99 merge,
  // finding 2; follow-up WI-F4).
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${origin}${CONFIRM_PATH}`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 60_000, intervals: [250] },
      )
      // A missing token renders the "link not valid" state: 400, not the 404
      // the production-mode server gives. So sign-in is really on here.
      .toBe(400);
  } catch (error) {
    server.kill();
    throw error;
  }

  return {
    origin,
    stdout: () => stdout,
    async linkFor(email) {
      const marker = `[kabinet] magic link for ${email}: `;
      await expect.poll(() => stdout.includes(marker), { timeout: 10_000 }).toBe(true);
      return stdout.slice(stdout.indexOf(marker) + marker.length).split(/\s/, 1)[0] ?? "";
    },
    // Waits for the exit rather than only signalling it, so the run never
    // ends with this server still shutting down. `next start` serves in this
    // one process (no child), so killing it ends the whole server.
    async stop() {
      if (server.exitCode !== null || server.signalCode !== null) return;
      const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
      server.kill();
      await exited;
    },
  };
}
