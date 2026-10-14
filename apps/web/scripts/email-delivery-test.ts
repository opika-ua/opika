import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DELIVERY_KEY_NAME,
  readSingleKey,
  runDeliveryTest,
} from "../src/kabinet/email-delivery-test";

/**
 * Sends the magic-link and invite emails once, through Brevo, to one address
 * (email setup handoff, 2026-10-13). Run by Oleksii, not by CI:
 *
 *   pnpm --filter @opika/web email:delivery-test --to <address> [--base <origin>] [--from-name <name>] [--reply-to <address>]
 *
 * The key is BREVO_API_KEY in the repo-root .env.local, and nothing else is
 * read from that file. The From name is app config (--from-name, else
 * EMAIL_FROM_NAME), never a literal here, and so is the Reply-To (--reply-to,
 * else EMAIL_REPLY_TO): without one, nothing is sent.
 */
const { values } = parseArgs({
  options: {
    to: { type: "string" },
    base: { type: "string", default: "http://localhost:3000" },
    "from-name": { type: "string" },
    "reply-to": { type: "string" },
  },
  strict: true,
});

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));

process.exitCode = await runDeliveryTest({
  to: values.to,
  apiKey: readSingleKey(envFile, DELIVERY_KEY_NAME),
  origin: process.env.PRODUCTION_ORIGIN ?? "https://opika.org.ua",
  base: values.base ?? "http://localhost:3000",
  fromName: values["from-name"] ?? process.env.EMAIL_FROM_NAME,
  replyTo: values["reply-to"] ?? process.env.EMAIL_REPLY_TO,
  random: () => randomBytes(12).toString("hex"),
  log: (line) => console.log(line),
});
