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

const renderScreen = (shelter: KabinetShelterView) =>
  render(
    <AnimalListScreen
      page={{
        kind: "list",
        shelter,
        viewer: "admin",
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
  it("says the label and the end date, and swaps the pending note for the listed one", () => {
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
      screen.getByText(
        "Перевірку проводжу я: напишу або зателефоную, щоб домовитися. Поки її не завершено, ваші картки показуються з позначкою «на перевірці».",
      ),
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
