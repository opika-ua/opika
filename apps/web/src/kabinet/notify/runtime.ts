import type { Database } from "@opika/db";
import { after } from "next/server";
import { maskAddress, type ProviderMail } from "../email-senders";
import { kabinetDb } from "../kabinet-db";
import { operatorDisplayName } from "../operator";
import { notificationMailFor } from "../production-mail";
import { productionSignInOf } from "../production-sign-in";
import { notifyAfterWrite } from "./after-write";
import type { ComposeContext } from "./compose";
import type { NotifyDeps } from "./deliver";
import type { ShelterNotifier } from "./intents";

/** The one place a notification warning reaches the console. */
function warn(line: string): void {
  // biome-ignore lint/suspicious/noConsole: the masked line is the only trace of an unsent mail
  console.warn(line);
}

/** Event mails a Kyiv day may send in all, unless `NOTIFICATION_DAILY_EVENT_CAP` says otherwise. */
export const DEFAULT_DAILY_EVENT_CAP = 40;

let reportedBadCap = false;

/**
 * `NOTIFICATION_DAILY_EVENT_CAP` as a positive integer, or the default. A bad value is ignored
 * with one line per process that names the variable and never its value.
 */
export function eventCapOf(
  env: Readonly<Record<string, string | undefined>>,
  log: (line: string) => void = warn,
): number {
  const raw = env.NOTIFICATION_DAILY_EVENT_CAP?.trim();
  if (raw === undefined || raw === "") return DEFAULT_DAILY_EVENT_CAP;
  const value = Number(raw);
  if (/^\d+$/.test(raw) && Number.isSafeInteger(value) && value > 0) return value;
  if (!reportedBadCap) {
    reportedBadCap = true;
    log(
      `[kabinet] NOTIFICATION_DAILY_EVENT_CAP is not a positive integer; using ${DEFAULT_DAILY_EVENT_CAP}`,
    );
  }
  return DEFAULT_DAILY_EVENT_CAP;
}

/** Whether this deployment can send notification emails at all, and how. */
export type NotifyRuntime =
  | { kind: "on"; mail: ProviderMail; context: ComposeContext; eventCap: number }
  | { kind: "off" };

/** Development prints the subject and a masked address, never the body: nothing leaves the machine. */
const consoleMail: ProviderMail = {
  sender: {
    async send(email) {
      // biome-ignore lint/suspicious/noConsole: development has no provider, so this line is the mail
      console.info(`[kabinet] notification to ${maskAddress(email.to)}: ${email.subject}`);
      return { status: 200, messageId: null };
    },
  },
  blockedStatus: async () => ({ kind: "unknown", why: "provider_suppresses" }),
  refuseCopyPending: false,
};

/**
 * Production sends through the invite's Resend route and only while production sign-in is on
 * (the same gate as every kabinet mail: no preview ever sends, no pending copy ships). Anywhere
 * else it follows the sign-in rule for development, the console.
 */
export function notifyRuntimeOf(env: Readonly<Record<string, string | undefined>>): NotifyRuntime {
  if (env.NODE_ENV === "production") {
    const signIn = productionSignInOf(env);
    if (signIn.kind !== "on") return { kind: "off" };
    return {
      kind: "on",
      mail: notificationMailFor(signIn),
      context: { baseURL: signIn.baseURL, operatorName: signIn.operatorName },
      eventCap: eventCapOf(env),
    };
  }
  if (!env.BETTER_AUTH_URL) return { kind: "off" };
  return {
    kind: "on",
    mail: consoleMail,
    context: { baseURL: env.BETTER_AUTH_URL, operatorName: operatorDisplayName(env) },
    eventCap: eventCapOf(env),
  };
}

export const notifyDepsOf = (
  runtime: Extract<NotifyRuntime, { kind: "on" }>,
  db: Database,
): NotifyDeps => ({
  db,
  mail: runtime.mail,
  context: runtime.context,
  eventCap: runtime.eventCap,
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: warn,
});

/**
 * The served route's notifier: schedules the mails with `after()`, so the response never waits
 * for them. Off (no provider, preview) schedules nothing.
 */
export const afterResponseNotifier =
  (env: Readonly<Record<string, string | undefined>>): ShelterNotifier =>
  (shelter, lines) => {
    const runtime = notifyRuntimeOf(env);
    if (runtime.kind === "off") return;
    after(() => notifyAfterWrite(notifyDepsOf(runtime, kabinetDb()), shelter, lines));
  };
