import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DELIVERY_PROVIDERS,
  deliveryKeysOf,
  deliveryLockRefusalOf,
  deliveryProviderOf,
  readSingleKey,
  runDeliveryTest,
} from "../src/kabinet/email-delivery-test";

/**
 * Sends the magic-link and invite emails once to one address (email setup
 * handoff, 2026-10-13), built by the real templates with the final Ukrainian
 * (IN-E15). Both go through Resend, as production sends them since delivery
 * test 5 (EM-B10). `--sign-in-provider brevo` and `--invite-provider brevo`
 * are refused before any key is read: auth emails are locked to Resend
 * (PW1-Q4). Tracking is checked by hand, by the runbook's two steps for each
 * delivery test (PW1-Q5, `docs/onboarding-a-shelter.md`). Run by Oleksii,
 * not by CI:
 *
 *   pnpm --filter @opika/web email:delivery-test --to <address> [--base <origin>] [--from-name <name>] [--reply-to <address>] [--operator-name <name>]
 *
 * The key comes from the repo-root .env.local, that one named key and nothing
 * else from that file (`deliveryKeysOf`): RESEND_API_KEY, read once, a
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
    "sign-in-provider": { type: "string" },
    "invite-provider": { type: "string" },
  },
  strict: true,
});

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const signInProvider = deliveryProviderOf(values["sign-in-provider"]);
const inviteProvider = deliveryProviderOf(values["invite-provider"]);

const routing =
  signInProvider === null || inviteProvider === null
    ? null
    : { signIn: signInProvider, invite: inviteProvider };

// PW1-Q4: a Brevo run is refused here, before .env.local is opened, so its key is never read.
const refusal =
  routing === null
    ? `--sign-in-provider and --invite-provider must each be one of ${DELIVERY_PROVIDERS.join(", ")}. Nothing sent.`
    : deliveryLockRefusalOf(routing);
if (routing === null || refusal !== null) {
  console.log(refusal);
  process.exit(1);
}

// Only the keys the sends need, each read once: RESEND_API_KEY, now that no email may go
// through Brevo.
const { brevoApiKey, resendApiKey } = deliveryKeysOf(routing, (name) =>
  readSingleKey(envFile, name),
);

process.exitCode = await runDeliveryTest({
  to: values.to,
  brevoApiKey,
  signInProvider: routing.signIn,
  inviteProvider: routing.invite,
  resendApiKey,
  origin: process.env.PRODUCTION_ORIGIN ?? "https://opika.org.ua",
  base: values.base ?? "http://localhost:3000",
  fromName: values["from-name"] ?? process.env.EMAIL_FROM_NAME,
  replyTo: values["reply-to"] ?? process.env.EMAIL_REPLY_TO,
  operatorName: values["operator-name"] ?? process.env.KABINET_OPERATOR_DISPLAY_NAME,
  random: () => randomBytes(12).toString("hex"),
  log: (line) => console.log(line),
});
