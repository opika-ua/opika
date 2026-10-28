import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KabinetHome } from "./KabinetHome";

/**
 * Головна (kabinet redesign Phase 2 PR 1): the new landing page. Covers what
 * moved here from `ShelterProfile.test.tsx` (the pending-review note and the
 * rejected/suspended notice) plus the new "needs attention" cards and the
 * shortcut. `VerificationDecision.test.tsx` and `profile-edit/PausedStatus`'s
 * own tests cover those components' content exhaustively; this file checks
 * only that Головна mounts them under the right condition.
 */

const view = (overrides: Partial<KabinetShelterView> = {}): KabinetShelterView => ({
  id: "51000000-0000-4000-8000-000000000001" as KabinetShelterView["id"],
  displayName: "Притулок «Домівка»",
  description: { uk: "Опис", en: null },
  legalEntity: {
    kind: "registered_ngo",
    legalName: "ГО «Домівка для хвостатих»",
    edrpou: "43218765" as never,
    registeredAt: new Date("2020-01-01T00:00:00Z"),
  },
  exactAddress: {
    line1: "вул. Київська, 300",
    line2: null,
    postalCode: "07400",
    cityId: "c1000000-0000-4000-8000-000000000001" as never,
    district: null,
    coordinates: { lat: 50.5, lng: 30.8 },
  },
  contact: {
    primary: { kind: "phone", e164: "+380671234567" },
    additional: [],
  },
  donation: null,
  pendingDonation: null,
  freshnessSentence: null,
  logo: null,
  version: 3,
  verification: { status: "verified", since: new Date("2025-03-14T10:00:00Z") },
  ...overrides,
});

const renderHome = (
  overrides: {
    view?: Partial<KabinetShelterView>;
    viewer?: "admin" | "support";
    draftCount?: number;
    staleCount?: number;
    animalListShown?: boolean;
    canWrite?: boolean;
  } = {},
) =>
  render(
    <KabinetHome
      view={view(overrides.view)}
      viewer={overrides.viewer ?? "admin"}
      operator={{ kind: "configured", name: "Олексій" }}
      draftCount={overrides.draftCount ?? 0}
      staleCount={overrides.staleCount ?? 0}
      animalListShown={overrides.animalListShown ?? true}
      canWrite={overrides.canWrite ?? true}
    />,
  );

describe("KabinetHome (Головна)", () => {
  const nav = () => screen.getByRole("navigation", { name: "Розділи кабінету" });

  it("is the nav's current item, with «Тварини» and «Притулок» alongside it", () => {
    renderHome();
    const links = within(nav()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Головна", "Тварини", "Притулок"]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(links[1]?.getAttribute("href")).toBe("/kabinet/tvaryny");
    expect(links[2]?.getAttribute("href")).toBe("/kabinet/prytulok");
  });

  it("drops «Тварини» when the list isn't shown to this viewer", () => {
    renderHome({ animalListShown: false });
    expect(
      within(nav())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Головна", "Притулок"]);
  });

  // Moved from ShelterProfile.test.tsx (G3, audit 2026-10-22).
  const PENDING_NOTE =
    "Перевірку проводжу я: напишу або зателефоную, щоб домовитися. Поки її не завершено, ваших тварин бачите лише ви.";

  it.each([
    ["pending", { status: "pending", since: new Date("2025-03-14T10:00:00Z") }],
    ["under_review", { status: "under_review", since: new Date("2025-03-14T10:00:00Z") }],
  ] as const)(
    "tells a %s shelter's admin how verification goes, under its status heading",
    (status, verification) => {
      renderHome({ view: { verification } });
      expect(screen.getByText(PENDING_NOTE)).toBeTruthy();
      // Hierarchy: a shelter-wide status gets its own heading (level 2), not a bare caption.
      expect(
        screen.getByRole("heading", { level: 2, name: uk.kabinet.profileStatus[status] }),
      ).toBeTruthy();
    },
  );

  it("says nothing about verification to a verified shelter", () => {
    renderHome();
    expect(screen.queryByText(PENDING_NOTE)).toBeNull();
  });

  it("does not show the note in the support view, where «я» would be the operator talking to themselves", () => {
    renderHome({
      view: { verification: { status: "pending", since: new Date("2025-03-14T10:00:00Z") } },
      viewer: "support",
    });
    expect(screen.queryByText(PENDING_NOTE)).toBeNull();
  });

  // Moved from ShelterProfile.test.tsx (K5, RU-Q7).
  it("shows the operator's reason to a rejected shelter", () => {
    renderHome({
      view: {
        verification: {
          status: "rejected",
          at: new Date("2025-03-14T10:00:00Z"),
          reason: { code: "spam", note: "Ні" },
        },
      },
    });
    expect(
      screen.getByRole("region", { name: uk.kabinet.verificationDecision.rejectedTitle }),
    ).toBeTruthy();
  });

  it("shows the paused line and reason when the shelter is paused", () => {
    renderHome({
      view: {
        verification: {
          status: "paused",
          since: new Date("2026-10-10T09:00:00Z"),
          reason: { code: "relocation", note: null },
        },
      },
    });
    expect(screen.getByText(/· Переїзд$/)).toBeTruthy();
    // Hierarchy: paused gets its own status heading too, same tier as pending/rejected.
    expect(
      screen.getByRole("heading", { level: 2, name: uk.kabinet.profileStatus.paused }),
    ).toBeTruthy();
  });

  it("shows a draft count card linking to the list, only when there are any and the list is shown", () => {
    renderHome({ draftCount: 3 });
    expect(screen.getByText("Чернетки · 3")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Тварини" })
        .some((link) => link.getAttribute("href") === "/kabinet/tvaryny"),
    ).toBe(true);
  });

  it("shows no draft card when there are none", () => {
    renderHome({ draftCount: 0 });
    expect(screen.queryByText(/^Чернетки ·/)).toBeNull();
  });

  it("shows no draft card when the list isn't shown to this viewer, even with a count", () => {
    renderHome({ draftCount: 3, animalListShown: false });
    expect(screen.queryByText(/^Чернетки ·/)).toBeNull();
  });

  // Data hierarchy (owner's direction, 2026-10-28): a stale card is already
  // public and quietly losing trust; a draft isn't public at all yet. Stale
  // outranks drafts, so it renders first when both exist.
  it("puts the stale card before the draft card when both exist", () => {
    renderHome({ draftCount: 1, staleCount: 1 });
    const stale = screen.getByText(/не підтверджували понад/);
    const draft = screen.getByText(/^Чернетки ·/);
    expect(stale.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the stale strip's own sentence when any cards are stale", () => {
    renderHome({ staleCount: 2 });
    expect(screen.getByText("2 картки ви не підтверджували понад 30 днів.")).toBeTruthy();
  });

  it("shows no stale card when nothing is stale", () => {
    renderHome({ staleCount: 0 });
    expect(screen.queryByText(/не підтверджували понад/)).toBeNull();
  });

  it("offers «Додати тварину» when writes are open for this admin", () => {
    renderHome({ canWrite: true });
    expect(screen.getByRole("link", { name: "Додати тварину" })).toBeTruthy();
  });

  it("offers no «Додати тварину» to a support view", () => {
    renderHome({ canWrite: false, viewer: "support" });
    expect(screen.queryByRole("link", { name: "Додати тварину" })).toBeNull();
  });

  it("a support view gets the banner, not sign-out", () => {
    renderHome({ viewer: "support" });
    expect(
      screen.getByRole("region", {
        name: uk.kabinet.support.title.replaceAll("{shelter}", "Притулок «Домівка»"),
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: uk.kabinet.profile.signOut })).toBeNull();
  });
});
