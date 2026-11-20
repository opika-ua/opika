// Sends the five branded account emails (plan step 3) once each to one address, for the owner's
// own inboxes, through Resend with production's routing rules. Fixture data only: links carry
// TEST tokens that mean nothing, the shelter is fictional, and no database is opened.
//
//   pnpm --filter @opika/web email:test-send --to <address> --confirm-test-send
//
// Reads RESEND_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_REPLY_TO, PRODUCTION_ORIGIN and the optional
// EMAIL_FROM_NAME and KABINET_OPERATOR_DISPLAY_NAME from the environment. Never prints the key.
import { parseArgs } from "node:util";
import { COPY_PENDING } from "@opika/i18n";
import {
  emailProviderConfigOf,
  fetchEmailSender,
  type OutgoingEmail,
} from "../src/kabinet/email-provider";
import {
  passwordResetEmail,
  registrationKitEmail,
  signInEmail,
} from "../src/kabinet/emails/account-mail";
import { EMAIL_FIXTURES } from "../src/kabinet/emails/fixtures";
import { operatorDisplayName } from "../src/kabinet/operator";

const TEST_PREFIX = "[ТЕСТ] ";

const { values } = parseArgs({
  options: { to: { type: "string" }, "confirm-test-send": { type: "boolean", default: false } },
  strict: true,
});
const to = values.to?.trim() ?? "";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !values["confirm-test-send"]) {
  process.stderr.write(
    "Usage: --to <address> --confirm-test-send (both required). Nothing sent.\n",
  );
  process.exit(1);
}

const env = process.env;
const route = emailProviderConfigOf({
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: env.RESEND_API_KEY,
  EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
  EMAIL_FROM_NAME: env.EMAIL_FROM_NAME,
  EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
  PRODUCTION_ORIGIN: env.PRODUCTION_ORIGIN,
});
if (route.kind !== "configured") {
  const why = route.kind === "missing" ? `missing ${route.missing.join(", ")}` : route.reason;
  process.stderr.write(`Not configured: ${why}. Nothing sent.\n`);
  process.exit(1);
}

const operatorName = operatorDisplayName({
  KABINET_OPERATOR_DISPLAY_NAME: env.KABINET_OPERATOR_DISPLAY_NAME,
});
const f = EMAIL_FIXTURES;
const built: [string, OutgoingEmail][] = [
  [
    "application_confirm",
    await registrationKitEmail({ ...f.application_confirm, operatorName }, to),
  ],
  ["application_approved", await registrationKitEmail(f.application_approved, to)],
  ["application_rejected", await registrationKitEmail(f.application_rejected, to)],
  ["sign_in", await signInEmail({ ...f.sign_in, to, operatorName })],
  ["password_reset", await passwordResetEmail({ ...f.password_reset, to, operatorName })],
];

if (
  built.some(([, email]) =>
    [email.subject, email.html, email.text].some((part) => part.includes(COPY_PENDING)),
  )
) {
  process.stderr.write("A built email still holds [COPY PENDING] text. Nothing sent.\n");
  process.exit(1);
}

const sender = fetchEmailSender(route.config);
let failed = false;
for (const [template, email] of built) {
  try {
    const sent = await sender.send({ ...email, subject: `${TEST_PREFIX}${email.subject}` });
    process.stdout.write(
      `${template}: status ${sent.status}, message id ${sent.messageId ?? "(none)"}\n`,
    );
  } catch (error) {
    // The provider module's message names the provider and status only.
    process.stdout.write(`${template}: FAILED (${(error as Error).message})\n`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
