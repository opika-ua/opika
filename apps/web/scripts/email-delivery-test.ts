import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DELIVERY_KEY_NAME,
  DELIVERY_SIGN_IN_PROVIDERS,
  deliverySignInProviderOf,
  RESEND_DELIVERY_KEY_NAME,
  readSingleKey,
  runDeliveryTest,
} from "../src/kabinet/email-delivery-test";

/**
 * Sends the magic-link and invite emails once to one address (email setup
 * handoff, 2026-10-13), built by the real templates with the final Ukrainian
 * (IN-E15). The invite goes through Brevo; the magic link through Brevo, or
 * through Resend with `--sign-in-provider resend` (delivery test 4, EM-B6).
 * Run by Oleksii, not by CI:
 *
 *   pnpm --filter @opika/web email:delivery-test --to <address> [--sign-in-provider brevo|resend] [--base <origin>] [--from-name <name>] [--reply-to <address>] [--operator-name <name>]
 *
 * Keys come from the repo-root .env.local, one named key at a time and
 * nothing else from that file: BREVO_API_KEY, and RESEND_API_KEY only when
 * `--sign-in-provider resend` asks for it. The From name is app config (--from-name, else
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
    "sign-in-provider": { type: "string" },
  },
  strict: true,
});

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const signInProvider = deliverySignInProviderOf(values["sign-in-provider"]);

if (signInProvider === null) {
  console.log(
    `--sign-in-provider must be one of ${DELIVERY_SIGN_IN_PROVIDERS.join(", ")}. Nothing sent.`,
  );
  process.exit(1);
}

process.exitCode = await runDeliveryTest({
  to: values.to,
  apiKey: readSingleKey(envFile, DELIVERY_KEY_NAME),
  signInProvider,
  // Read only when asked for: a Brevo-only run never touches the Resend key.
  resendApiKey:
    signInProvider === "resend" ? readSingleKey(envFile, RESEND_DELIVERY_KEY_NAME) : undefined,
  origin: process.env.PRODUCTION_ORIGIN ?? "https://opika.org.ua",
  base: values.base ?? "http://localhost:3000",
  fromName: values["from-name"] ?? process.env.EMAIL_FROM_NAME,
  replyTo: values["reply-to"] ?? process.env.EMAIL_REPLY_TO,
  operatorName: values["operator-name"] ?? process.env.KABINET_OPERATOR_DISPLAY_NAME,
  random: () => randomBytes(12).toString("hex"),
  log: (line) => console.log(line),
});
