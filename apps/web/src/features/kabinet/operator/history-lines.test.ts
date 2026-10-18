import {
  type ModeratorId,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  ShelterHistoryEntrySchema,
  VERIFICATION_EVENT_TYPES,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { type HistoryPeople, historyLineOf, historyLineText } from "./history-lines";

/**
 * Every history kind, and every verification move, renders one impersonal
 * line with its actor after « · » (his rule: "history lines are impersonal,
 * with the actor appended as « · {actor}»"). Expected lines are typed out
 * from his Ukrainian (`rui-copy-uk.md` §1.6) and his K3 words, never read from
 * the catalogue, so a drift in either fails here.
 */

const AT = new Date("2026-10-17T09:30:00.000Z");
const ME = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const OTHER_OPERATOR = "0ec0ec0e-0000-4000-8000-000000000002" as ModeratorId;
const OLENA = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const GONE = "44444444-4444-4444-8444-444444444444" as ShelterAdminId;
const ANIMAL = "55555555-5555-4555-8555-555555555555" as never;

const people: HistoryPeople = {
  me: ME,
  admins: [{ id: OLENA, name: "Олена", email: "olena@example.org" }],
};

const byMe = { kind: "moderator", moderatorId: ME } as const;
const byOlena = { kind: "shelter_admin", shelterAdminId: OLENA } as const;
const evidence = { items: [], submittedAt: AT };
const link = { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as const;
const legal = { kind: "unregistered_initiative", contactPersonName: "Олена" } as const;
const address = {
  line1: "вул. Київська, 1",
  line2: null,
  postalCode: null,
  cityId: "c1000000-0000-4000-8000-000000000001" as never,
  district: null,
  coordinates: { lat: 50.4, lng: 30.5 },
};

const verification = (
  event: Extract<ShelterHistoryEntry, { kind: "verification" }>["event"],
  from: Extract<ShelterHistoryEntry, { kind: "verification" }>["from"],
  to: Extract<ShelterHistoryEntry, { kind: "verification" }>["to"],
): ShelterHistoryEntry => ({ kind: "verification", event, from, to });

/** [what, entry, expected line], one row per kind and per verification move. */
const TABLE: [string, ShelterHistoryEntry, string][] = [
  [
    "start_review",
    verification({ type: "start_review", at: AT, reviewerId: ME }, "pending", "under_review"),
    "Взято на розгляд · ви",
  ],
  [
    "approve",
    verification({ type: "approve", at: AT, moderatorId: ME }, "under_review", "verified"),
    "Схвалено → «Перевірено» · ви",
  ],
  [
    "reject, with his note",
    verification(
      {
        type: "reject",
        at: AT,
        moderatorId: ME,
        reason: { code: "insufficient_evidence", note: "Бракує рекомендації." },
      },
      "under_review",
      "rejected",
    ),
    "Відхилено: Недостатньо доказів. Бракує рекомендації. · ви",
  ],
  [
    "suspend, with his note",
    verification(
      {
        type: "suspend",
        at: AT,
        moderatorId: ME,
        reason: { code: "unresponsive", note: "Не відповідають місяць." },
      },
      "verified",
      "suspended",
    ),
    "Призупинено: Немає звʼязку з притулком. Не відповідають місяць. · ви",
  ],
  [
    "reinstate, naming the status it returns to",
    verification({ type: "reinstate", at: AT, moderatorId: ME }, "suspended", "paused"),
    "Відновлено → «На паузі» · ви",
  ],
  [
    "resubmit, by the shelter",
    verification({ type: "resubmit", at: AT, actor: byOlena, evidence }, "rejected", "pending"),
    "Повернуто на перевірку · Олена",
  ],
  [
    "pause, by the shelter",
    verification(
      { type: "pause", at: AT, actor: byOlena, reason: { code: "relocation", note: null } },
      "verified",
      "paused",
    ),
    "Прийом тварин призупинено · Олена",
  ],
  [
    "resume, by the operator",
    verification({ type: "resume", at: AT, actor: byMe }, "paused", "verified"),
    "Паузу знято · ви",
  ],
  [
    "shelter_created in the screens",
    { kind: "shelter_created", at: AT, moderatorId: ME, via: "registry" },
    "Притулок створено · ви",
  ],
  [
    "shelter_created by the script",
    { kind: "shelter_created", at: AT, moderatorId: OTHER_OPERATOR, via: "script" },
    "Притулок додано з файлу · адміністратор сайту",
  ],
  [
    "admin_invited",
    { kind: "admin_invited", at: AT, moderatorId: ME, email: "olena@example.org" },
    "Надіслано запрошення: Олена, olena@example.org · ви",
  ],
  [
    "admin_invitation_resent",
    { kind: "admin_invitation_resent", at: AT, moderatorId: ME, email: "OLENA@example.org" },
    "Запрошення надіслано ще раз: Олена · ви",
  ],
  [
    "admin_joined",
    {
      kind: "admin_joined",
      at: AT,
      shelterAdminId: OLENA,
      invitationId: "66666666-6666-4666-8666-666666666666" as never,
      email: "olena@example.org",
    },
    "olena@example.org отримує доступ до кабінету · Олена",
  ],
  [
    "admin_removed, a signed-in admin",
    {
      kind: "admin_removed",
      at: AT,
      moderatorId: ME,
      email: "petro@example.org",
      wasPending: false,
    },
    "Доступ закрито: petro@example.org · ви",
  ],
  [
    "admin_removed, a withdrawn invitation",
    { kind: "admin_removed", at: AT, moderatorId: ME, email: "ivan@example.org", wasPending: true },
    "Запрошення скасовано: ivan@example.org · ви",
  ],
  [
    "contact_changed",
    {
      kind: "contact_changed",
      at: AT,
      actor: byOlena,
      previous: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      next: { primary: { kind: "phone", e164: "+380671234568" }, additional: [] },
    },
    "Змінено контакти · Олена",
  ],
  [
    "freshness_sentence_changed",
    { kind: "freshness_sentence_changed", at: AT, actor: byOlena, previous: null, next: null },
    "Змінено речення на картках · Олена",
  ],
  [
    "description_changed",
    {
      kind: "description_changed",
      at: AT,
      actor: byMe,
      previous: { uk: "Старий", en: null },
      next: { uk: "Новий", en: null },
    },
    "Змінено опис притулку · ви",
  ],
  [
    "donation_proposed",
    { kind: "donation_proposed", at: AT, actor: byOlena, link },
    "Запропоновано посилання на збір: send.monobank.ua · Олена",
  ],
  [
    "donation_proposal_cancelled",
    { kind: "donation_proposal_cancelled", at: AT, actor: byOlena },
    "Пропозицію посилання скасовано · Олена",
  ],
  [
    "donation_decided, approved",
    {
      kind: "donation_decided",
      at: AT,
      moderatorId: ME,
      decision: "approved",
      link,
      previousLive: null,
    },
    "Посилання на збір схвалено · ви",
  ],
  [
    "donation_decided, rejected",
    {
      kind: "donation_decided",
      at: AT,
      moderatorId: ME,
      decision: "rejected",
      link,
      previousLive: null,
    },
    "Посилання на збір відхилено · ви",
  ],
  [
    "verified_data_changed, legal entity",
    {
      kind: "verified_data_changed",
      at: AT,
      moderatorId: ME,
      change: { field: "legal_entity", previous: legal, next: legal },
    },
    "Змінено юридичні дані · ви",
  ],
  [
    "verified_data_changed, premises address",
    {
      kind: "verified_data_changed",
      at: AT,
      moderatorId: ME,
      change: { field: "exact_address", previous: address, next: address },
    },
    "Змінено адресу приміщення · ви",
  ],
  [
    "animals_imported",
    { kind: "animals_imported", at: AT, moderatorId: OTHER_OPERATOR, count: 12 },
    "Додано тварин з файлу: 12 · адміністратор сайту",
  ],
  [
    "animal_created",
    { kind: "animal_created", at: AT, actor: byOlena, animalId: ANIMAL, animalName: "Рекс" },
    "Створено картку: Рекс · Олена",
  ],
  [
    "animal_edited, every field",
    {
      kind: "animal_edited",
      at: AT,
      actor: byOlena,
      animalId: ANIMAL,
      animalName: "Рекс",
      fields: [
        "name",
        "species",
        "sex",
        "size",
        "age",
        "description",
        "vaccination",
        "spayNeuter",
        "photos",
      ],
    },
    "Змінено картку Рекс: Імʼя, Вид, Стать, Розмір, Вік, Опис, Комплексне щеплення, Стерилізація, Фото · Олена",
  ],
  [
    "animal_listing_changed",
    {
      kind: "animal_listing_changed",
      at: AT,
      actor: byOlena,
      animalId: ANIMAL,
      animalName: "Рекс",
      event: { type: "withdraw", reason: { code: "other" } } as never,
      from: "published",
      to: "withdrawn",
    },
    "Рекс: «Опубліковано» → «Знято з показу» · Олена",
  ],
  [
    "animal_deleted",
    { kind: "animal_deleted", at: AT, actor: byOlena, animalId: ANIMAL, animalName: "Рекс" },
    "Видалено чернетку: Рекс · Олена",
  ],
];

describe("historyLineOf: one line per entry, the actor after « · »", () => {
  it.each(TABLE)("%s", (_what, entry, expected) => {
    // Each row is a real entry: the table can't test a shape history never holds.
    expect(ShelterHistoryEntrySchema.safeParse(entry).success).toBe(true);
    const line = historyLineOf(entry, people);
    expect(historyLineText(line)).toBe(expected);
    expect(line.at).toEqual(AT);
  });

  it("covers every history kind and every verification move", () => {
    const kinds = new Set(TABLE.map(([, entry]) => entry.kind));
    expect([...kinds].sort()).toEqual(
      ShelterHistoryEntrySchema.options.map((option) => option.shape.kind.value).sort(),
    );
    const moves = new Set(
      TABLE.flatMap(([, entry]) => (entry.kind === "verification" ? [entry.event.type] : [])),
    );
    expect([...moves].sort()).toEqual([...VERIFICATION_EVENT_TYPES].sort());
  });
});

describe("historyLineOf: who the actor is", () => {
  const contactBy = (actor: Parameters<typeof historyLineOf>[0] & { kind: "contact_changed" }) =>
    historyLineText(historyLineOf(actor, people));
  const contact = { primary: { kind: "phone", e164: "+380671234567" }, additional: [] } as const;
  const changedBy = (
    actor: Extract<ShelterHistoryEntry, { kind: "contact_changed" }>["actor"],
  ): Extract<ShelterHistoryEntry, { kind: "contact_changed" }> => ({
    kind: "contact_changed",
    at: AT,
    actor,
    previous: contact,
    next: contact,
  });

  it("«ви» for the operator reading, the generic label for any other operator id", () => {
    expect(contactBy(changedBy(byMe))).toBe("Змінено контакти · ви");
    expect(contactBy(changedBy({ kind: "moderator", moderatorId: OTHER_OPERATOR }))).toBe(
      "Змінено контакти · адміністратор сайту",
    );
  });

  it("an admin by their current name, and «колишній адміністратор» once they are gone", () => {
    expect(contactBy(changedBy(byOlena))).toBe("Змінено контакти · Олена");
    expect(contactBy(changedBy({ kind: "shelter_admin", shelterAdminId: GONE }))).toBe(
      "Змінено контакти · колишній адміністратор",
    );
  });

  it("an operator line with no note leaves the note off, with no dangling space", () => {
    const line = historyLineOf(
      verification(
        { type: "reject", at: AT, moderatorId: ME, reason: { code: "spam", note: null } },
        "pending",
        "rejected",
      ),
      people,
    );
    expect(historyLineText(line)).toBe("Відхилено: Спам. · ви");
  });

  it("an invitee no longer on the shelter: «Не записано» beside the address, the address alone where there is no address slot", () => {
    expect(
      historyLineText(
        historyLineOf(
          { kind: "admin_invited", at: AT, moderatorId: ME, email: "petro@example.org" },
          people,
        ),
      ),
    ).toBe("Надіслано запрошення: Не записано, petro@example.org · ви");
    expect(
      historyLineText(
        historyLineOf(
          { kind: "admin_invitation_resent", at: AT, moderatorId: ME, email: "petro@example.org" },
          people,
        ),
      ),
    ).toBe("Запрошення надіслано ще раз: petro@example.org · ви");
  });

  it("the removal of a current invitee names them", () => {
    expect(
      historyLineText(
        historyLineOf(
          {
            kind: "admin_removed",
            at: AT,
            moderatorId: ME,
            email: "olena@example.org",
            wasPending: true,
          },
          people,
        ),
      ),
    ).toBe("Запрошення скасовано: Олена · ви");
  });

  it("a verification entry's instant is its event's", () => {
    const later = new Date(AT.getTime() + 60_000);
    expect(
      historyLineOf(
        verification({ type: "approve", at: later, moderatorId: ME }, "under_review", "verified"),
        people,
      ).at,
    ).toEqual(later);
  });
});
