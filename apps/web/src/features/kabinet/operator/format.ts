import { type EvidenceGap, type EvidenceKind, KYIV_TIME_ZONE } from "@opika/domain";
import { uk } from "@opika/i18n";

/**
 * Dates and times on the operator's pages: native `Intl`, never a hand-rolled
 * month list (standing rule), in Kyiv time, so a date is the day it was in
 * Ukraine whatever zone the server renders in. `formatDate` is the profile's
 * own (`ProfileParts`), re-exported so both read the same day.
 */
export { formatDate } from "../ProfileParts";

type KyivFormatOptions = Omit<Intl.DateTimeFormatOptions, "timeZone">;

/**
 * A Ukrainian formatter on Kyiv's clock. S2's success state runs these in the
 * browser, and a browser whose time-zone data predates the 2022 rename knows
 * only `Europe/Kiev`: asked for `Europe/Kyiv` it throws, which would break the
 * page just after the shelter was written. The two names are the same zone;
 * `@opika/domain`'s `kyivCalendarDateOf` falls back the same way.
 */
export function kyivDateTimeFormat(options: KyivFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("uk-UA", { ...options, timeZone: KYIV_TIME_ZONE });
  } catch {
    return new Intl.DateTimeFormat("uk-UA", { ...options, timeZone: "Europe/Kiev" });
  }
}

/**
 * Built on first use, not at module load: a module that throws while loading
 * takes the whole page with it, the fallback above included.
 */
const lazyFormat = (options: KyivFormatOptions) => {
  let format: Intl.DateTimeFormat | undefined;
  return (date: Date): string => {
    format ??= kyivDateTimeFormat(options);
    return format.format(date);
  };
};

/** «листопад 2026 р.»: a document's month (`YYYY-MM`), read at its first day in Kyiv. */
const monthYear = lazyFormat({ month: "long", year: "numeric" });
export const formatYearMonth = (month: string): string =>
  monthYear(new Date(`${month}-01T00:00:00.000Z`));

/** HH:mm, Kyiv. */
export const formatTime = lazyFormat({ hour: "2-digit", minute: "2-digit" });

/** «16 жовтня», Kyiv: a day within the next few, where the year goes without saying. */
export const formatDayMonth = lazyFormat({ day: "numeric", month: "long" });

/** A history line's moment: the day and the time, Kyiv. */
export const formatDateTime = lazyFormat({
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

let disjunction: Intl.ListFormat | undefined;

/** The kinds a registry entry can come in (`holdsRegistryEntry`), as the gap names them. */
const REGISTRY_ENTRY_KINDS = ["edrpou_registration", "open_sources_review"] as const;

/** An any-of line's kinds as one set, order aside. */
const sameKinds = (a: readonly EvidenceKind[], b: readonly EvidenceKind[]): boolean =>
  a.length === b.length && a.every((kind) => b.includes(kind));

/** The initiative's reference-or-record line, which has its own label (owner, 2026-11-24, row 8). */
const REFERENCE_OR_ONGOING_WORK = ["reference_contact", "ongoing_work_record"] as const;

/** A label as it reads inside a sentence, after a colon: its first letter lowercase. */
const inSentence = (label: string): string =>
  label.charAt(0).toLocaleLowerCase("uk") + label.slice(1);

/**
 * What an evidence gap asks for, by name: one kind, or several joined with «або» by
 * `Intl.ListFormat` («Відеодзвінок або Відкриті джерела»), or a line's own label. `sentence`
 * starts each name lowercase, for a line that names it after a colon (owner, 2026-11-24); a list
 * item keeps the label as written.
 */
export function evidenceGapKinds(gap: EvidenceGap, as: "label" | "sentence" = "label"): string {
  const kind = uk.kabinet.operator.evidence.kind;
  const name = (label: string): string => (as === "sentence" ? inSentence(label) : label);
  const either = (kinds: readonly EvidenceKind[]): string => {
    disjunction ??= new Intl.ListFormat("uk", { type: "disjunction" });
    return disjunction.format(kinds.map((each) => name(kind[each])));
  };
  switch (gap.rule) {
    case "kind":
      return name(kind[gap.kind]);
    case "any_of":
      return sameKinds(gap.kinds, REFERENCE_OR_ONGOING_WORK)
        ? name(uk.kabinet.operator.verification.gap.referenceOrOngoingWork)
        : either(gap.kinds);
    case "registry_entry":
      return either(REGISTRY_ENTRY_KINDS);
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled rule; unreachable at runtime */
    default: {
      const unreachable: never = gap;
      return unreachable;
    }
  }
}

/** A stable key for a gap line. */
export function evidenceGapKey(gap: EvidenceGap): string {
  switch (gap.rule) {
    case "kind":
      return gap.kind;
    case "any_of":
      return gap.kinds.join("|");
    case "registry_entry":
      return gap.rule;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled rule; unreachable at runtime */
    default: {
      const unreachable: never = gap;
      return unreachable;
    }
  }
}
