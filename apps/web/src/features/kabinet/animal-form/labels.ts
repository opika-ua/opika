import {
  AGE_BUCKET_MAX_YEARS,
  AGE_BUCKET_MIN_YEARS,
  type AgeBucket,
  KYIV_TIME_ZONE,
  kyivCalendarDateOf,
  type PublishGap,
  SIZE_BUCKET_WEIGHT_HINTS_KG,
  type SizeBucket,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";

/**
 * The form's words that depend on a value: every number through `Intl`
 * (Ukrainian prints «1,2», not «1.2»), every list through `Intl.ListFormat`,
 * every date on Kyiv's calendar. Pure; the copy is his (`kabinet.animalForm`).
 */

const t = uk.kabinet.animalForm;

/** «Щоб опублікувати, ще потрібно: розмір, вік і фото.», the gaps in form order. */
export const missingSentence = (gaps: readonly PublishGap[]): string =>
  fillTemplate(t.publish.missing, {
    list: new Intl.ListFormat("uk", { type: "conjunction" }).format(
      gaps.map((gap) => t.publish.gap[gap.kind]),
    ),
  });

const integer = new Intl.NumberFormat("uk");

/** The weight hint under each size segment (decision #3: guidance only, never stored). */
export const sizeHint = (size: SizeBucket): string => {
  const { minKg, maxKg } = SIZE_BUCKET_WEIGHT_HINTS_KG[size];
  if (minKg === 0 && maxKg !== null)
    return fillTemplate(t.who.sizeHintUpTo, { max: integer.format(maxKg) });
  if (maxKg === null) return fillTemplate(t.who.sizeHintFrom, { min: integer.format(minKg) });
  return fillTemplate(t.who.sizeHintRange, {
    min: integer.format(minKg),
    max: integer.format(maxKg),
  });
};

/** The range after a bucket's name: «до 1», «1–3», «8+». */
export const bucketRange = (bucket: AgeBucket): string => {
  const min = AGE_BUCKET_MIN_YEARS[bucket];
  const max = AGE_BUCKET_MAX_YEARS[bucket];
  if (min === 0 && max !== null)
    return fillTemplate(t.age.bucketRangeUnder, { max: integer.format(max) });
  if (max === null) return fillTemplate(t.age.bucketRangeFrom, { min: integer.format(min) });
  return fillTemplate(t.age.bucketRange, { min: integer.format(min), max: integer.format(max) });
};

/** HH:mm on the shelter's own clock, whatever the browser's zone (K4's `SaveBar` rule). */
export const timeOf = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: KYIV_TIME_ZONE,
  }).format(date);

/**
 * A calendar date in words, for «Вік указано станом на {when}.»: Kyiv's
 * calendar, `Intl`'s own words. `Intl` ends a Ukrainian date with the
 * abbreviation «р.», and his sentence puts its own full stop straight after
 * `{when}`; one stop ends both, as Ukrainian punctuation has it, so the
 * abbreviation's is dropped here rather than printing «р..».
 */
export const dateEndingSentenceOf = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: KYIV_TIME_ZONE,
  })
    .format(date)
    .replace(/\.$/, "");

const MS_PER_DAY = 86_400_000;

/**
 * «сьогодні», «учора», «3 дні тому» for «Створено {when}»: whole days between
 * the two Kyiv calendar dates, through `Intl.RelativeTimeFormat` with a
 * negative offset and the day unit (the contract `formatFreshnessRelative`
 * keeps for freshness).
 */
export const createdWhen = (createdAt: Date, now: Date): string => {
  const days = Math.round(
    (Date.parse(kyivCalendarDateOf(now)) - Date.parse(kyivCalendarDateOf(createdAt))) / MS_PER_DAY,
  );
  return new Intl.RelativeTimeFormat("uk", { numeric: "auto" }).format(-Math.max(0, days), "day");
};

const megabytes = new Intl.NumberFormat("uk", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("uk", { style: "percent", maximumFractionDigits: 0 });

/** «Завантаження · 64 % · 1,2 з 1,9 МБ», from the bytes sent and the request's size. */
export const uploadProgressText = (sent: number, total: number): string =>
  fillTemplate(t.photos.uploadingProgress, {
    percent: percent.format(total === 0 ? 0 : sent / total),
    sent: megabytes.format(sent / 1_048_576),
    total: megabytes.format(total / 1_048_576),
  });
