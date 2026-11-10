import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnimalListScreen } from "./AnimalListScreen";

vi.mock("next/navigation", () => ({
  usePathname: () => "/kabinet/tvaryny",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** The shelter's landing page: the banner and the pending note while cards are shown early (N13, B5). */

const AT = new Date("2026-10-04T09:00:00Z");
const shelterIn = (
  verification: KabinetShelterView["verification"],
  earlyListing: KabinetShelterView["earlyListing"],
) =>
  ({
    id: "s",
    displayName: "Домівка",
    verification,
    earlyListing,
  }) as unknown as KabinetShelterView;

const renderScreen = (shelter: KabinetShelterView, viewer: "admin" | "support" = "admin") =>
  render(
    <AnimalListScreen
      page={{
        kind: "list",
        shelter,
        viewer,
        editing: { kind: "open" },
        first: {
          items: [],
          nextCursor: null,
          counts: { draft: 0, published: 0, reserved: 0, adopted: 0, withdrawn: 0 },
          staleCount: 0,
        },
      }}
      operatorName="Олексій"
      person={null}
    />,
  );

describe("the kabinet banner while cards are shown before verification", () => {
  it("says «на перевірці» exactly once on the page: the dated banner, not the note or the list line", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "running",
        expiresAt: new Date("2026-12-01T09:00:00Z"),
      }),
    );
    expect(screen.queryAllByText(/на перевірці/)).toHaveLength(1);
  });

  it("says the end date, and cuts the pending note to its first sentence", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "running",
        expiresAt: new Date("2026-12-01T09:00:00Z"),
      }),
    );
    expect(
      screen.getByText("Ваші картки показуються з позначкою «на перевірці» до 1 грудня."),
    ).toBeTruthy();
    expect(
      screen.getByText("Перевірку проводжу я: напишу або зателефоную, щоб домовитися."),
    ).toBeTruthy();
    expect(screen.queryByText(/ваших тварин бачите лише ви/)).toBeNull();
  });

  it("without a permission there is no banner and the original note stays", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "none",
      }),
    );
    expect(screen.queryByText(/до 1 грудня/)).toBeNull();
    expect(screen.queryByText(/позначкою «на перевірці»/)).toBeNull();
    expect(screen.getByText(/ваших тварин бачите лише ви/)).toBeTruthy();
  });
});

describe("the kabinet line once the period has ended, review still open (gap 6)", () => {
  const ended = () =>
    shelterIn({ status: "under_review", since: AT } as KabinetShelterView["verification"], {
      kind: "ended",
      endedAt: new Date("2026-12-01T09:00:00Z"),
    });

  it("says when it ended, keeps the full pending note, and shows no running banner", () => {
    renderScreen(ended());
    expect(
      screen.getByText("Показ ваших карток з позначкою «на перевірці» завершився 1 грудня."),
    ).toBeTruthy();
    expect(screen.getByText(/ваших тварин бачите лише ви/)).toBeTruthy();
    expect(screen.queryByText(/показуються з позначкою/)).toBeNull();
  });

  it("in the support view still omits the «я» panel, and the dated line stays", () => {
    renderScreen(ended(), "support");
    expect(screen.queryByText(/Перевірку проводжу я/)).toBeNull();
    expect(screen.getByText(/завершився 1 грудня/)).toBeTruthy();
  });
});
