/**
 * Static mock data for local gesture testing.
 * Not used in production — the real feed comes from the oRPC client.
 */
import type { FeedCardView, ShelterSummaryView } from "@opika/contracts";
import type { AnimalId, Freshness, FreshnessKind, FuzzedCoordinates } from "@opika/domain";

function mockId(n: number): AnimalId {
  const hex = n.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-000000000000` as AnimalId;
}

const mockShelter: ShelterSummaryView = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as never,
  displayName: "Тестовий притулок",
  publicLocation: {
    precision: "fuzzed_address",
    cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
    district: null,
    approximate: {
      center: { lat: 49.99, lng: 36.23 },
      precisionMetres: 1000,
    } as FuzzedCoordinates,
  },
  freshnessSentence: {
    uk: "Ми оновлювали цю картку 25 червня. Напишіть — скажемо, чи тварина ще з нами.",
    en: null,
  },
  verification: "verified",
};

const mockShelterNoSentence: ShelterSummaryView = {
  ...mockShelter,
  displayName: "Другий притулок",
  freshnessSentence: null,
};

function mockFreshness(kind: FreshnessKind, ageDays: number): Freshness {
  const now = new Date();
  const updatedAt = new Date(now.getTime() - ageDays * 86_400_000);
  return { kind, updatedAt, ageDays };
}

const names = [
  "Мурчик",
  "Барсик",
  "Ластівка",
  "Шарік",
  "Рижик",
  "Соня",
  "Бім",
  "Граф",
  "Мотя",
  "Зірка",
  "Тайсон",
  "Мишка",
  "Лапка",
  "Джек",
  "Маня",
];

export function generateMockCards(count: number): FeedCardView[] {
  return Array.from({ length: count }, (_, i) => ({
    id: mockId(i + 1),
    name: names[i % names.length] ?? "Тварина",
    species: i % 3 === 0 ? ("cat" as const) : ("dog" as const),
    sex: i % 2 === 0 ? ("male" as const) : ("female" as const),
    size: (["small", "medium", "large"] as const)[i % 3] ?? ("medium" as const),
    publicLocation: null,
    ageBucket: (["baby", "young", "adult", "senior"] as const)[i % 4] ?? "young",
    freshness: mockFreshness(
      (["fresh", "aging", "stale"] as const)[i % 3] ?? "fresh",
      i % 3 === 0 ? 2 : i % 3 === 1 ? 19 : 41,
    ),
    primaryPhoto: null,
    // Always "published": the deck doesn't render the reserved badge yet
    // (filed as a follow-up alongside E1's own listingKind addition), so
    // there's nothing here for a "reserved" mock card to demonstrate.
    listingKind: "published" as const,
    shelter: i % 2 === 0 ? mockShelter : mockShelterNoSentence,
  }));
}
