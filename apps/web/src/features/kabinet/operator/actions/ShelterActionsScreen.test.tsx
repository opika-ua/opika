import type { BlockedAddressesView, RegistryShelterView } from "@opika/contracts";
import type { ModeratorId, ShelterHistoryEntry } from "@opika/domain";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShelterActionsScreen } from "./ShelterActionsScreen";
import { ADMIN_ID, MODERATOR, registryView, withVerification } from "./test-fixtures";

/**
 * S4 as the page serves it: each R-UI 3 control sits in the section it acts
 * on, under one runner, beside R-UI 1's read-only sections. Next.js's router
 * and the browser client are replaced; the screen and the controls are the
 * real ones.
 */

const server = vi.hoisted(() => ({
  refresh: vi.fn(),
  approveDonation: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: server.refresh }) }));
vi.mock("./registry-actions-client", () => ({
  registryActionsBrowserClient: {
    registry: { donation: { approve: server.approveDonation } },
  },
}));

const NOW = new Date("2026-10-17T10:00:00Z");
const AT = new Date("2026-10-01T09:00:00Z");
const view: RegistryShelterView = withVerification(
  registryView({
    pendingDonation: {
      link: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as never,
      proposedAt: AT,
      proposedBy: ADMIN_ID,
    },
    admins: [
      {
        id: "a1000000-0000-4000-8000-000000000001" as never,
        name: "Олена",
        email: "olena@example.org",
        invite: { status: "accepted" },
      },
    ],
  }),
  {
    status: "verified",
    verifiedAt: AT,
    verifiedBy: MODERATOR,
    evidence: { items: [], submittedAt: AT },
  },
);
const created: ShelterHistoryEntry = {
  kind: "shelter_created",
  at: AT,
  moderatorId: MODERATOR,
  via: "registry",
};
const CHECKED_NONE: BlockedAddressesView = { kind: "checked", asOf: NOW, blocked: [] };

const screenWith = (items: readonly ShelterHistoryEntry[]) => (
  <ShelterActionsScreen
    view={view}
    cityName="Бровари"
    history={{ items, nextCursor: null }}
    blocked={CHECKED_NONE}
    me={MODERATOR as ModeratorId}
    now={NOW}
  />
);
const renderScreen = () => render(screenWith([created]));

const section = (name: string) => within(screen.getByRole("region", { name }));

describe("S4 with its actions", () => {
  it("places each control in the section it acts on", () => {
    renderScreen();
    expect(
      screen.getByRole("button", { name: "Переглянути як притулок · лише читання" }),
    ).toBeTruthy();
    expect(section("Рішення").getByRole("button", { name: "Призупинити…" })).toBeTruthy();
    expect(section("Збір коштів").getByRole("button", { name: "Схвалити" })).toBeTruthy();
    expect(section("Збір коштів").getByRole("button", { name: "Відхилити" })).toBeTruthy();
    const admins = section("Адміністратори");
    expect(admins.getByRole("button", { name: "Прибрати" })).toBeTruthy();
    expect(admins.getByRole("button", { name: "Запросити ще одного" })).toBeTruthy();
    // The actions list replaces the read-only one: each admin once.
    expect(admins.getAllByText("Олена")).toHaveLength(1);
    expect(section("Історія").getByText(/^Притулок створено/)).toBeTruthy();
  });

  it("a decision goes through the page's browser client, and the page re-reads itself", async () => {
    server.approveDonation.mockImplementation(async () => ({
      ...view,
      donation: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" },
      pendingDonation: null,
      version: view.version + 1,
    }));
    renderScreen();
    await act(async () => {
      await userEvent.click(section("Збір коштів").getByRole("button", { name: "Схвалити" }));
    });
    expect(server.approveDonation).toHaveBeenCalledExactlyOnceWith({
      shelterId: view.id,
      expectedVersion: view.version,
    });
    expect(server.refresh).toHaveBeenCalledOnce();
  });

  /**
   * The page's re-read after an action renders it again with a newer first
   * history page; the list, which keeps the pages it has shown, starts from
   * that one, so the line the action wrote appears without a reload.
   */
  it("a newer first history page, after a re-read, shows the new line", () => {
    const { rerender } = renderScreen();
    expect(section("Історія").queryByText(/^Взято на розгляд/)).toBeNull();
    const reviewed: ShelterHistoryEntry = {
      kind: "verification",
      event: { type: "start_review", at: new Date("2026-10-17T09:00:00Z"), reviewerId: MODERATOR },
      from: "pending",
      to: "under_review",
    };
    rerender(screenWith([reviewed, created]));
    expect(section("Історія").getByText(/^Взято на розгляд/)).toBeTruthy();
  });
});
