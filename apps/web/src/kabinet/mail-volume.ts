import { sharedRedisStore } from "../api/rate-limit";

/**
 * Resend's Free plan sends 100 mails a day. Counts successful sends per UTC day on the shared
 * Upstash store (the in-process fallback elsewhere), and logs one warning when the day reaches 80
 * and another at 100. Counting never affects a send: every failure here is swallowed.
 */
export const MAIL_DAILY_WARN_AT = 80;
export const MAIL_DAILY_LIMIT = 100;

export type MailDayCounter = { increment(day: string): Promise<number> };

export type MailVolumeLine = {
  event: "mail_daily_volume";
  count: number;
  warnAt: number;
  limit: number;
};

const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/** Two days, so a key outlives its UTC day and then goes. */
const KEY_TTL_SECONDS = 2 * 24 * 3600;

function inMemoryCounter(): MailDayCounter {
  const counts = new Map<string, number>();
  return {
    async increment(day) {
      const next = (counts.get(day) ?? 0) + 1;
      counts.clear();
      counts.set(day, next);
      return next;
    },
  };
}

function sharedCounter(): MailDayCounter {
  const store = sharedRedisStore("mail-day");
  if (store === null) return inMemoryCounter();
  return {
    async increment(day) {
      const key = `${store.prefix}:${day}`;
      const count = await store.redis.incr(key);
      if (count === 1) await store.redis.expire(key, KEY_TTL_SECONDS);
      return count;
    },
  };
}

let defaultCounter: MailDayCounter | undefined;
const defaultMailCounter = (): MailDayCounter => {
  defaultCounter ??= sharedCounter();
  return defaultCounter;
};

export async function noteMailSent(
  now: Date,
  counter: MailDayCounter = defaultMailCounter(),
  // biome-ignore lint/suspicious/noConsole: the structured warning is the point of this module
  log: (line: MailVolumeLine) => void = (line) => console.warn(line),
): Promise<void> {
  try {
    const count = await counter.increment(utcDay(now));
    if (count === MAIL_DAILY_WARN_AT || count === MAIL_DAILY_LIMIT) {
      log({
        event: "mail_daily_volume",
        count,
        warnAt: MAIL_DAILY_WARN_AT,
        limit: MAIL_DAILY_LIMIT,
      });
    }
  } catch {
    // A counter problem must never fail a send that already went out.
  }
}
