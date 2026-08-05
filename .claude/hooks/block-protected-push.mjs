#!/usr/bin/env node
/**
 * PreToolUse guard: refuses any push to a protected branch.
 *
 * The milestone workflow is branch-and-PR. Without this, a single confused turn can
 * put unreviewed work on main, and on a solo project there is nobody to catch it.
 *
 * This is a convenience gate, not the real one. A hook lives in a file the agent can
 * edit, so GitHub branch protection on `main` is the authority — this exists to fail
 * early and loudly with an explanation, rather than at the remote with a rejection.
 *
 * Written in Node rather than shell because development happens on Windows, where a
 * .sh hook needs git-bash on PATH to run at all.
 */

const PROTECTED = ["main", "master"];

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const isPush = (command) => /(^|[;&|]\s*)git\s+(-\S+\s+)*push\b/.test(command);

/**
 * Matches an explicit protected ref anywhere in the push arguments, so
 * `git push origin main`, `git push -f origin HEAD:main` and
 * `git push origin main:main` are all caught.
 */
const targetsProtected = (command) =>
  PROTECTED.some((branch) =>
    new RegExp(`(^|[\\s:])${branch}(\\s|:|$)`).test(command.replace(/^.*?git\s+push/, "")),
  );

/** A bare `git push` follows the upstream of whatever is checked out. */
const isBarePush = (command) => {
  const args = command
    .replace(/^.*?git\s+push/, "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !token.startsWith("-"));
  return args.length === 0;
};

const currentBranch = async () => {
  const { execSync } = await import("node:child_process");
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const deny = (reason) => {
  process.stderr.write(
    `${reason}\n\n` +
      "Opika uses a branch-and-PR workflow. Create a feature branch, push that, and " +
      "open a pull request:\n" +
      "  git switch -c feat/<milestone>-<slug>\n" +
      "  git push -u origin feat/<milestone>-<slug>\n" +
      "  gh pr create --fill\n",
  );
  process.exit(2);
};

const main = async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    // A hook that cannot parse its input must not block legitimate work.
    process.exit(0);
  }

  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || !isPush(command)) process.exit(0);

  if (targetsProtected(command)) {
    deny(`Refusing to push to a protected branch.\n\n  ${command}`);
  }

  if (isBarePush(command)) {
    const branch = await currentBranch();
    if (branch !== null && PROTECTED.includes(branch)) {
      deny(`Refusing bare 'git push' while on protected branch '${branch}'.\n\n  ${command}`);
    }
  }

  process.exit(0);
};

await main();
