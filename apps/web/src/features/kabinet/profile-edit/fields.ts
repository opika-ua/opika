import {
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  type ContactChannel,
  ContactChannelInputSchema,
  characterCount,
  DonationLinkSchema,
  type DonationUrlProblem,
  donationUrlProblemOf,
  MAX_OTHER_CONTACTS,
  normalizeFacebook,
  normalizeInstagram,
  normalizeUaPhone,
  type ShelterContact,
} from "@opika/domain";

/**
 * The K4 editor's pure half: what the form holds, how a shelter's typing is
 * normalised (K4 sheet, answer 4, Oleksii, verbatim: "Yes: accept @handle,
 * t.me/handle, spaced/dashed numbers; normalise silently."), and which of his
 * messages a field gets. No React, no I/O: the components call these, and the
 * server checks everything again (`ShelterContactInputSchema`,
 * `ShelterDescriptionInputSchema`), so these exist to tell a person what to fix
 * before a round trip, never to decide what is stored.
 */

export type ChannelKind = ContactChannel["kind"];

/**
 * What a *new* «other» row may be (answer 3, verbatim: "K4 = fixed phone and
 * Telegram fields (each optional) + up to 2 «other» rows (Viber / email /
 * website)"). A row holding an already-stored contact may be any kind (fix 3,
 * verbatim: "«other» rows accept any kind for already-stored extras
 * (editable); new additions stay Viber/email/website"). Instagram and Facebook
 * joined them (2026-11-10), WhatsApp too (2026-11-11). A form is never an «other» row: it has
 * its own field (owner, 2026-11-11).
 */
export const NEW_OTHER_KINDS = [
  "viber",
  "whatsapp",
  "email",
  "website",
  "instagram",
  "facebook",
] as const satisfies readonly ChannelKind[];
export const ALL_KINDS = [
  "phone",
  "telegram",
  "viber",
  "whatsapp",
  "email",
  "website",
  "instagram",
  "facebook",
] as const satisfies readonly ChannelKind[];

/** The cap on adding rows: the domain's, so the editor and the input schema agree (2026-11-11). */
export const MAX_OTHER_ROWS = MAX_OTHER_CONTACTS;

export type OtherRow = {
  /** Stable React key; never sent. */
  id: string;
  kind: ChannelKind;
  value: string;
  /** Loaded from the stored contact, so its kind picker offers every kind (fix 3). */
  stored: boolean;
};

export type ContactsForm = {
  phone: string;
  telegram: string;
  form: string;
  others: readonly OtherRow[];
};

/** A channel as the shelter reads and edits it: the stored value, with Telegram's @. */
export const channelText = (channel: ContactChannel): string => {
  switch (channel.kind) {
    case "phone":
    case "viber":
    case "whatsapp":
      return channel.e164;
    case "email":
      return channel.address;
    case "telegram":
    case "instagram":
      return `@${channel.handle}`;
    case "website":
    case "facebook":
    case "form":
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
 * field, the first Telegram in the Telegram field, the first form in the form
 * field, and every other stored channel, in stored order, as an «other» row,
 * so nothing stored is hidden or lost (two emails, a second phone, a website and a Viber all stay visible).
 */
export function contactsFormOf(contact: ShelterContact): ContactsForm {
  const channels = [contact.primary, ...contact.additional];
  const phoneIndex = channels.findIndex((channel) => channel.kind === "phone");
  const telegramIndex = channels.findIndex((channel) => channel.kind === "telegram");
  const formIndex = channels.findIndex((channel) => channel.kind === "form");
  const phone = channels[phoneIndex];
  const telegram = channels[telegramIndex];
  const form = channels[formIndex];
  return {
    phone: phone === undefined ? "" : channelText(phone),
    telegram: telegram === undefined ? "" : channelText(telegram),
    form: form === undefined ? "" : channelText(form),
    others: channels
      .map((channel, index) => ({ channel, index }))
      .filter(({ index }) => index !== phoneIndex && index !== telegramIndex && index !== formIndex)
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
  a.form === b.form &&
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
  | "notAUrl"
  | "instagramFormat"
  | "facebookFormat";

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

const DONATION_FIELD_ERRORS = {
  userinfo: "donationUserinfo",
  idn: "donationIdn",
  checkout_session: "donationCheckoutSession",
} as const satisfies Record<DonationUrlProblem, string>;

/**
 * `linkProblem` plus the rules only a donation link has (userinfo, IDN hosts, a LiqPay checkout
 * session), from the same domain function the server applies, so the form refuses what the API would.
 */
export function donationLinkProblem(
  raw: string,
): "httpsOnly" | "notAUrl" | (typeof DONATION_FIELD_ERRORS)[DonationUrlProblem] | null {
  const problem = linkProblem(raw);
  if (problem !== null) return problem;
  const extra = donationUrlProblemOf(raw);
  return extra === null ? null : DONATION_FIELD_ERRORS[extra];
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
    case "whatsapp":
      return checked({ kind: "whatsapp", e164: normalizePhone(raw) }, "phoneFormat");
    case "telegram":
      return checked({ kind: "telegram", handle: normalizeTelegram(raw) }, "telegramFormat");
    case "email":
      return checked({ kind: "email", address: raw.trim() }, "emailFormat");
    case "website":
    case "form": {
      const problem = linkProblem(raw);
      return problem === null
        ? checked({ kind, url: raw.trim() }, "notAUrl")
        : { kind: "error", error: problem };
    }
    case "instagram": {
      const handle = normalizeInstagram(raw);
      if (handle !== null) return checked({ kind: "instagram", handle }, "instagramFormat");
      // An http:// profile link is the https rule, not a malformed handle.
      return {
        kind: "error",
        error: /^http:\/\//i.test(raw.trim()) ? "httpsOnly" : "instagramFormat",
      };
    }
    case "facebook": {
      const normalized = normalizeFacebook(raw);
      return normalized.kind === "ok"
        ? checked({ kind: "facebook", url: normalized.url }, "facebookFormat")
        : { kind: "error", error: normalized.error };
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled channel; unreachable at runtime */
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/**
 * More filled «other» rows than the editor allows: a contact stored before the cap. Within the
 * cap the input schema's `additional` limit always holds.
 */
export const tooManyOthers = (form: ContactsForm): boolean =>
  form.others.filter((row) => row.value.trim() !== "").length > MAX_OTHER_ROWS;

export type ContactsCheck =
  | { kind: "ok"; contact: ShelterContact }
  | {
      kind: "invalid";
      phone: FieldError | null;
      telegram: FieldError | null;
      form: FieldError | null;
      /** By row id. */
      others: Readonly<Record<string, FieldError>>;
      /** More filled «other» rows than `MAX_OTHER_ROWS` (`contacts.tooMany`). */
      tooMany: boolean;
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
  const rows: { key: "phone" | "telegram" | "form" | string; kind: ChannelKind; raw: string }[] = [
    { key: "phone", kind: "phone" as const, raw: form.phone },
    { key: "telegram", kind: "telegram" as const, raw: form.telegram },
    { key: "form", kind: "form" as const, raw: form.form },
    ...form.others.map((row) => ({ key: row.id, kind: row.kind, raw: row.value })),
  ].filter((row) => row.raw.trim() !== "");
  if (rows.length === 0) {
    return {
      kind: "invalid",
      phone: null,
      telegram: null,
      form: null,
      others: {},
      tooMany: false,
      atLeastOne: true,
    };
  }
  const channels: ContactChannel[] = [];
  const errors: Record<string, FieldError> = {};
  for (const row of rows) {
    const parsed = parseChannel(row.kind, row.raw);
    if (parsed.kind === "ok") channels.push(parsed.channel);
    else errors[row.key] = parsed.error;
  }
  const tooMany = tooManyOthers(form);
  if (Object.keys(errors).length > 0 || tooMany) {
    const { phone = null, telegram = null, form: formError = null, ...others } = errors;
    return {
      kind: "invalid",
      phone,
      telegram,
      form: formError,
      others,
      tooMany,
      atLeastOne: false,
    };
  }
  // A form is never the primary (the input schema's rule); a form alone is no way to call or write.
  const primaryIndex = channels.findIndex((channel) => channel.kind !== "form");
  const primary = channels[primaryIndex];
  if (primary === undefined) {
    return {
      kind: "invalid",
      phone: null,
      telegram: null,
      form: null,
      others: {},
      tooMany: false,
      atLeastOne: true,
    };
  }
  const additional = channels.filter((_, index) => index !== primaryIndex);
  return { kind: "ok", contact: { primary, additional } };
}

// ─── the shelter's text («Про притулок») ─────────────────────────────────────

/** What is saved for the typed text: trimmed, or null for a blank one (it clears the text). */
export const aboutTextOf = (raw: string): string | null => raw.trim() || null;

/** The counter's number: characters as the server counts them, after trimming. */
export const aboutLength = (raw: string): number => characterCount(raw.trim());

/** How many characters past the cap, 0 when it fits. */
export const aboutOverBy = (raw: string): number =>
  Math.max(0, aboutLength(raw) - ANIMAL_DESCRIPTION_MAX_CHARACTERS);
