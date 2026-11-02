import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  RESEND_DELIVERY_KEY_NAME,
  readSingleKey,
  runDeliveryTest,
} from "../src/kabinet/email-delivery-test";

/**
 * Sends the magic-link and invite emails once to one address (email setup
 * handoff, 2026-10-13), built by the real templates with the final Ukrainian
 * (IN-E15). Both go through Resend, as production sends them since delivery
 * test 5 (EM-B10); auth emails are locked to Resend (PW1-Q4). Tracking is checked by hand, by the runbook's two steps for each
 * delivery test (PW1-Q5, `docs/onboarding-a-shelter.md`). Run by Oleksii,
 * not by CI:
 *
 *   pnpm --filter @opika/web email:delivery-test --to <address> [--base <origin>] [--from-name <name>] [--reply-to <address>] [--operator-name <name>]
 *
 * The key comes from the repo-root .env.local, that one named key and nothing
 * else from that file (`readSingleKey`): RESEND_API_KEY, read once, a
 * sending-only key (PW1-Q5). The From name is app config (--from-name, else
 * EMAIL_FROM_NAME), never a literal here, and so is the Reply-To (--reply-to,
 * else EMAIL_REPLY_TO): without one, nothing is sent. Both emails are
 * signed with --operator-name, else KABINET_OPERATOR_DISPLAY_NAME, else the
 * catalogue fallback, as in the app (the sign-in email since 2026-10-14).
 */
const { values } = parseArgs({
  options: {
    to: { type: "string" },
    base: { type: "string", default: "http://localhost:3000" },
    "from-name": { type: "string" },
    "reply-to": { type: "string" },
    "operator-name": { type: "string" },
  },
  strict: true,
});

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));
// Only the one key the sends need, read once.
const resendApiKey = readSingleKey(envFile, RESEND_DELIVERY_KEY_NAME);

process.exitCode = await runDeliveryTest({
  to: values.to,
  resendApiKey,
  origin: process.env.PRODUCTION_ORIGIN ?? "https://opika.org.ua",
  base: values.base ?? "http://localhost:3000",
  fromName: values["from-name"] ?? process.env.EMAIL_FROM_NAME,
  replyTo: values["reply-to"] ?? process.env.EMAIL_REPLY_TO,
  operatorName: values["operator-name"] ?? process.env.KABINET_OPERATOR_DISPLAY_NAME,
  random: () => randomBytes(12).toString("hex"),
  log: (line) => console.log(line),
});
