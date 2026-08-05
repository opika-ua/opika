#!/usr/bin/env node
/**
 * PostToolUse gate: lints and formats the single file that was just written.
 *
 * Scoped to one file on purpose. A full `pnpm check` after every edit would add
 * seconds to every write in a monorepo and the agent would start batching edits to
 * avoid it, which is the opposite of the intent. Biome on one file is milliseconds.
 *
 * Typecheck and tests are not run here — they are gates in the /milestone workflow,
 * where a failure is actionable, rather than after a half-finished edit where it is
 * just noise.
 */

const CHECKED = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/;

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }

  const filePath = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath;
  if (typeof filePath !== "string" || !CHECKED.test(filePath)) process.exit(0);

  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    "pnpm",
    ["-s", "exec", "biome", "check", "--write", "--no-errors-on-unmatched", filePath],
    { encoding: "utf8", shell: process.platform === "win32" },
  );

  // Biome is missing or unrunnable — surface nothing and let CI be the backstop.
  if (result.error) process.exit(0);

  if (result.status !== 0) {
    process.stderr.write(
      `Biome reported problems in ${filePath} that it could not fix automatically:\n\n` +
        `${result.stdout ?? ""}${result.stderr ?? ""}\n` +
        "Fix these before continuing.\n",
    );
    process.exit(2);
  }

  process.exit(0);
};

await main();
