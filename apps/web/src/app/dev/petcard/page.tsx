import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MedicalStatus } from "../../../features/animal-detail/MedicalStatus";
import type { MedicalRow } from "../../../features/animal-detail/medical-labels";
import { Chip } from "../../../ui/Chip";
import { Container } from "../../../ui/Container";
import { Heading } from "../../../ui/Heading";
import { Text } from "../../../ui/Text";

/**
 * The pet card's «Про мене» chips and «Медичний стан» block in every mock case (owner's sketch,
 * 2026-10-31), for the harness and for screenshots. Dev only, like /dev/ui: a 404 in a production
 * build unless OPIKA_DEV_UI=1; not indexed, not in the sitemap.
 */
export const metadata: Metadata = {
  title: "Pet card cases",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SHELTER = (value: MedicalRow["value"], label: string): MedicalRow => ({
  label,
  value,
  source: "shelter",
});
const VACC = "Комплексне щеплення";
const SPAY = "Стерилізація";
const BASIC = ["Доросла", "Дівчинка", "Мала", "Спокійна", "Енергійна", "Плямиста", "Короткошерсті"];
const SHORT = ["Молодий", "Хлопчик", "Великий", "Грайливий"];
const LONG_NOTES =
  "Має хронічний гастрит, тому їсть лише лікувальний корм двічі на день. Раз на пів року потрібен огляд у ветеринара та аналіз крові. Ліки не потрібні, але зміну корму варто робити поступово, протягом тижня. Притулок передасть картку з усіма обстеженнями та порадить ветеринара у вашому місті.";

type Case = {
  id: string;
  title: string;
  chips: string[];
  story: string;
  rows: MedicalRow[];
  notes: string | null;
};

const CASES: Case[] = [
  {
    id: "known",
    title: "Everything known",
    chips: BASIC,
    story: "Любить спати на сонці й одразу йде на руки.",
    rows: [SHELTER("done", VACC), SHELTER("done", SPAY)],
    notes: "Потребує гіпоалергенного корму.",
  },
  {
    id: "unknown",
    title: "Not done and unknown, with notes",
    chips: SHORT,
    story: "Знайшли біля траси, швидко звикає до людей.",
    rows: [SHELTER("not_done", VACC), SHELTER("unknown", SPAY)],
    notes: "Щеплення заплановане на наступний тиждень. Після нього можна забирати.",
  },
  {
    id: "longest",
    title: "Longest chips",
    chips: [
      "Літня",
      "Дівчинка",
      "Середня",
      "Боїться гучних звуків, але любить дітей",
      "Димчасто-кремова з білими лапками",
      "Довгошерсті",
    ],
    story: "Жила в сім’ї 8 років.",
    rows: [SHELTER("done", VACC), SHELTER("not_done", SPAY)],
    notes: null,
  },
  {
    id: "overlong",
    title: "A chip wider than its column",
    chips: [
      "Доросла",
      "Темперамент, який описали надзвичайно докладно, довше за будь-який екран телефона",
    ],
    story: "Спокійна.",
    rows: [SHELTER("done", VACC), SHELTER("done", SPAY)],
    notes: null,
  },
  {
    id: "long-notes",
    title: "Long medical notes",
    chips: BASIC,
    story: "Любить спати на сонці.",
    rows: [SHELTER("done", VACC), SHELTER("done", SPAY)],
    notes: LONG_NOTES,
  },
  {
    id: "statuses-only",
    title: "Statuses only, no notes",
    chips: SHORT,
    story: "Знайшли біля траси.",
    rows: [SHELTER("done", VACC), SHELTER("unknown", SPAY)],
    notes: null,
  },
  {
    id: "mixed-source",
    title: "Mixed source: one registry row, one shelter row",
    chips: SHORT,
    story: "Знайшли біля траси.",
    rows: [
      { label: "Щеплення від сказу", value: "done", source: "registry" },
      SHELTER("not_done", SPAY),
    ],
    notes: "Стерилізацію заплановано на наступний місяць.",
  },
];

export default function PetCardCasesPage() {
  if (process.env.NODE_ENV === "production" && process.env.OPIKA_DEV_UI !== "1") notFound();
  return (
    <Container as="main" className="flex flex-col gap-10 pb-16">
      <Heading level={1} look="display-l" className="py-6">
        Pet card cases
      </Heading>
      {CASES.map((c) => (
        <section
          key={c.id}
          aria-label={c.title}
          data-testid={`case-${c.id}`}
          className="flex max-w-160 flex-col gap-6 desktop:max-w-271"
        >
          <Text look="hint">{c.title}</Text>
          <div className="flex flex-col gap-4">
            <Heading level={2}>Про мене</Heading>
            <div className="flex flex-wrap gap-2" data-testid="chips">
              {c.chips.map((chip) => (
                <Chip key={chip} kind="fact">
                  {chip}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-13 desktop:flex-row">
            <div className="flex flex-1 flex-col gap-3">
              <Heading level={2}>Моя історія</Heading>
              <Text look="lead" className="text-ink-2">
                {c.story}
              </Text>
            </div>
            <MedicalStatus rows={c.rows} notes={c.notes} />
          </div>
        </section>
      ))}
    </Container>
  );
}
