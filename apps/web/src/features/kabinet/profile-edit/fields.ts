import {
  type ContactChannel,
  ContactChannelInputSchema,
  characterCount,
  DonationLinkSchema,
  FRESHNESS_SENTENCE_MAX_CHARACTERS,
  normalizeFreshnessSentenceText,
  normalizeUaPhone,
  type ShelterContact,
} from "@opika/domain";

/**
 * The K4 editor's pure half: what the form holds, how a shelter's typing is
 * normalised (K4 sheet, answer 4, Oleksii, verbatim: "Yes: accept @handle,
 * t.me/handle, spaced/dashed numbers; normalise silently."), and which of his
 * messages a field gets. No React, no I/O: the components call these, and the
 * server checks everything again (`ShelterContactInputSchema`,
 * `FreshnessSentenceInputSchema`), so these exist to tell a person what to fix
 * before a round trip, never to decide what is stored.
 */

export type ChannelKind = ContactChannel["kind"];

/**
 * What a *new* «other» row may be (answer 3, verbatim: "K4 = fixed phone and
 * Telegram fields (each optional) + up to 2 «other» rows (Viber / email /
 * website)"). A row holding an already-stored contact may be any kind (fix 3,
 * verbatim: "«other» rows accept any kind for already-stored extras
 * (editable); new additions stay Viber/email/website").
 */
export const NEW_OTHER_KINDS = [
  "viber",
  "email",
  "website",
] as const satisfies readonly ChannelKind[];
export const ALL_KINDS = [
  "phone",
  "telegram",
  "viber",
  "email",
  "website",
] as const satisfies readonly ChannelKind[];

/** The cap on adding rows (answer 3: "the 2-row cap applies to adding new ones"). */
export const MAX_OTHER_ROWS = 2;

export type OtherRow = {
  /** Stable React key; never sent. */
  id: string;
  kind: ChannelKind;
  value: string;
  /** Loaded from the stored contact, so its kind picker offers every kind (fix 3). */
  stored: boolean;
};

export type ContactsForm = { phone: string; telegram: string; others: readonly OtherRow[] };

/** A channel as the shelter reads and edits it: the stored value, with Telegram's @. */
export const channelText = (channel: ContactChannel): string => {
  switch (channel.kind) {
    case "phone":
    case "viber":
      return channel.e164;
    case "email":
      return channel.address;
    case "telegram":
      return `@${channel.handle}`;
    case "website":
      return channel.url;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled channel; unreachable at runtime */
    default: {
      const unreachable: never = channel;
      return unreachable;
    }
  }
};

/**
 * The stored contact as the form (answer 3): the first phone in the phone
 * field, the first Telegram in the Telegram field, and every other stored
 * channel, in stored order, as an «other» row, so nothing stored is hidden or
 * lost (two emails, a second phone, a website and a Viber all stay visible).
 */
export function contactsFormOf(contact: ShelterContact): ContactsForm {
  const channels = [contact.primary, ...contact.additional];
  const phoneIndex = channels.findIndex((channel) => channel.kind === "phone");
  const telegramIndex = channels.findIndex((channel) => channel.kind === "telegram");
  const phone = channels[phoneIndex];
  const telegram = channels[telegramIndex];
  return {
    phone: phone === undefined ? "" : channelText(phone),
    telegram: telegram === undefined ? "" : channelText(telegram),
    others: channels
      .map((channel, index) => ({ channel, index }))
      .filter(({ index }) => index !== phoneIndex && index !== telegramIndex)
      .map(({ channel, index }) => ({
        id: `stored-${index}`,
        kind: channel.kind,
        value: channelText(channel),
        stored: true,
      })),
  };
}

export const sameContactsForm = (a: ContactsForm, b: ContactsForm): boolean =>
  a.phone === b.phone &&
  a.telegram === b.telegram &&
  a.others.length === b.others.length &&
  a.others.every(
    (row, index) => row.kind === b.others[index]?.kind && row.value === b.others[index]?.value,
  );

export type FieldError =
  | "phoneFormat"
  | "telegramFormat"
  | "viberFormat"
  | "emailFormat"
  | "httpsOnly"
  | "notAUrl";

export type ParsedChannel =
  | { kind: "ok"; channel: ContactChannel }
  | { kind: "error"; error: FieldError };

/** Ukrainian forms (+380, 380, 0XX; spaces, dashes, brackets) become +380XXXXXXXXX; anything else stays as typed, so the schema refuses it. */
const normalizePhone = (raw: string): string => normalizeUaPhone(raw) ?? raw.trim();

/** «@handle», «t.me/handle» and «https://t.me/handle» all mean the handle. */
const normalizeTelegram = (raw: string): string =>
  raw
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "");

/**
 * Which message an https-only link field gets, or none. «example.org» with no
 * scheme reads as a link missing its https://, so it gets `httpsOnly` rather
 * than `notAUrl`; text that isn't shaped like an address at all gets `notAUrl`.
 */
export function linkProblem(raw: string): "httpsOnly" | "notAUrl" | null {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return /^[^\s/:]+\.[^\s.]{2,}(?:\/\S*)?$/.test(value) ? "httpsOnly" : "notAUrl";
  }
  if (url.protocol !== "https:") return url.protocol === "http:" ? "httpsOnly" : "notAUrl";
  return DonationLinkSchema.shape.url.safeParse(value).success ? null : "notAUrl";
}

/**
 * One typed channel, normalised as above. Exported for the operator's
 * evidence editor (R-UI 2), whose reference contact is one channel of any
 * kind and should accept the same typing a shelter's own contacts do.
 */
export function parseChannel(kind: ChannelKind, raw: string): ParsedChannel {
  const checked = (candidate: ContactChannel, error: FieldError): ParsedChannel =>
    ContactChannelInputSchema.safeParse(candidate).success
      ? { kind: "ok", channel: candidate }
      : { kind: "error", error };
  switch (kind) {
    case "phone":
      return checked({ kind: "phone", e164: normalizePhone(raw) }, "phoneFormat");
    case "viber":
      return checked({ kind: "viber", e164: normalizePhone(raw) }, "viberFormat");
    case "telegram":
      return checked({ kind: "telegram", handle: normalizeTelegram(raw) }, "telegramFormat");
    case "email":
      return checked({ kind: "email", address: raw.trim() }, "emailFormat");
    case "website": {
      const problem = linkProblem(raw);
      return problem === null
        ? checked({ kind: "website", url: raw.trim() }, "notAUrl")
        : { kind: "error", error: problem };
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled channel; unreachable at runtime */
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export type ContactsCheck =
  | { kind: "ok"; contact: ShelterContact }
  | {
      kind: "invalid";
      phone: FieldError | null;
      telegram: FieldError | null;
      /** By row id. */
      others: Readonly<Record<string, FieldError>>;
      /** Every field empty (answer 3: at least one channel). */
      atLeastOne: boolean;
    };

/**
 * The form as a `ShelterContact`, or what to say about it. Empty fields are
 * simply absent. Primary is the phone if there is one, else Telegram, else
 * the first «other» row (answer 3, verbatim: "Primary = phone if set, else
 * Telegram, else the first other"); everything else follows in form order.
 */
export function contactOfForm(form: ContactsForm): ContactsCheck {
  const rows: { key: "phone" | "telegram" | string; kind: ChannelKind; raw: string }[] = [
    { key: "phone", kind: "phone" as const, raw: form.phone },
    { key: "telegram", kind: "telegram" as const, raw: form.telegram },
    ...form.others.map((row) => ({ key: row.id, kind: row.kind, raw: row.value })),
  ].filter((row) => row.raw.trim() !== "");
  if (rows.length === 0) {
    return { kind: "invalid", phone: null, telegram: null, others: {}, atLeastOne: true };
  }
  const channels: ContactChannel[] = [];
  const errors: Record<string, FieldError> = {};
  for (const row of rows) {
    const parsed = parseChannel(row.kind, row.raw);
    if (parsed.kind === "ok") channels.push(parsed.channel);
    else errors[row.key] = parsed.error;
  }
  if (Object.keys(errors).length > 0) {
    const { phone = null, telegram = null, ...others } = errors;
    return { kind: "invalid", phone, telegram, others, atLeastOne: false };
  }
  const [primary, ...additional] = channels;
  if (primary === undefined) throw new Error("unreachable: rows were non-empty");
  return { kind: "ok", contact: { primary, additional } };
}

// ─── the voice sentence (N11) ───────────────────────────────────────────────

export type SentenceError =
  | { key: "sentenceTooLong" }
  /** DR1-Q5: `{імʼя}` in any spelling; the sentence shows on the shelter page now. */
  | { key: "nameTokenGone" }
  | { key: "unknownToken"; token: string }
  /** Answer 5: `{дата}` typed by habit gets its own explanation. */
  | { key: "dateTokenGone" }
  | { key: "strayBrace" };

export type SentenceCheck =
  | { kind: "ok"; text: string | null }
  | { kind: "invalid"; error: SentenceError };

/** `{дата}` in any case, with stray spaces inside the braces: the token the mock used to show. */
const DATE_TOKEN = /^\{\s*дата\s*\}$/iu;

/** The domain's own rule (K-Q6), mapped to his messages. */
export function sentenceCheck(raw: string): SentenceCheck {
  const normalized = normalizeFreshnessSentenceText(raw);
  switch (normalized.kind) {
    case "ok":
      return { kind: "ok", text: normalized.text };
    case "empty":
      return { kind: "ok", text: null };
    case "invalid": {
      const { problem } = normalized;
      switch (problem.kind) {
        case "too_long":
          return { kind: "invalid", error: { key: "sentenceTooLong" } };
        case "name_token":
          return { kind: "invalid", error: { key: "nameTokenGone" } };
        case "unknown_token":
          return DATE_TOKEN.test(problem.token)
            ? { kind: "invalid", error: { key: "dateTokenGone" } }
            : { kind: "invalid", error: { key: "unknownToken", token: problem.token } };
        case "stray_brace":
          return { kind: "invalid", error: { key: "strayBrace" } };
        /* v8 ignore next 4 -- exists so the compiler rejects an unhandled problem; unreachable at runtime */
        default: {
          const unreachable: never = problem;
          return unreachable;
        }
      }
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled case; unreachable at runtime */
    default: {
      const unreachable: never = normalized;
      return unreachable;
    }
  }
}

/** The counter's number: characters as the server counts them, after trimming. */
export const sentenceLength = (raw: string): number => characterCount(raw.trim());
export const SENTENCE_MAX = FRESHNESS_SENTENCE_MAX_CHARACTERS;
