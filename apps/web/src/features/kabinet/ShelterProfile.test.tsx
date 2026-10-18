import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileEditing } from "./home";
import { ShelterProfile } from "./ShelterProfile";

/**
 * The read-only "your shelter" page (KS-Q1, Oleksii: "A"). Its strings are
 * Oleksii's final Ukrainian (2026-10-14); elements are found by catalogue key and what's
 * asserted is structure and data: every value a label–value row, nothing
 * editable, the verification block apart, the support mode signals.
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
    additional: [{ kind: "telegram", handle: "domivka_brovary" }],
  },
  donation: null,
  pendingDonation: null,
  freshnessSentence: null,
  version: 3,
  verification: { status: "verified", since: new Date("2025-03-14T10:00:00Z") },
  ...overrides,
});

const renderProfile = (
  overrides: Partial<KabinetShelterView> = {},
  viewer: "admin" | "support" = "admin",
) =>
  render(
    <ShelterProfile
      view={view(overrides)}
      cityName="Бровари"
      viewer={viewer}
      operator={{ kind: "configured", name: "Олексій" }}
    />,
  );

/** The row whose label is `label`: its value element. */
const rowValue = (label: string): string => {
  const term = screen.getByText(label, { selector: "dt" });
  const value = term.nextElementSibling;
  if (value === null || value.tagName !== "DD") throw new Error(`no value for ${label}`);
  return value.textContent ?? "";
};

const t = uk.kabinet.profile;

describe("ShelterProfile (K4, read-only)", () => {
  it("shows every contact channel as a row, primary first, labelled by kind", () => {
    renderProfile();
    expect(rowValue(uk.kabinet.profileChannel.phone)).toBe("+380671234567");
    expect(rowValue(uk.kabinet.profileChannel.telegram)).toBe("@domivka_brovary");
  });

  it("has nothing editable: no inputs, no textareas, no save button", () => {
    const { container } = renderProfile();
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([t.signOut]);
  });

  it("reads «Не записано» for a value the record doesn't hold, never blank", () => {
    renderProfile();
    expect(rowValue(t.donationLink)).toBe("Не записано");
    expect(rowValue(t.voiceLabel)).toBe("Не записано");
  });

  // The caption once promised that the registry fills {date} and {name} into the
  // sentence. Nothing filled either. Since K-Q6 the deck and the animal page fill
  // {імʼя}, but this screen shows the sentence as written (the tests below), and
  // the caption is pinned to its whole literal text: any claim about substitution
  // is new copy for the copy gate, not something to slip in here (review of
  // a4fe384, note 1).
  it("the voice caption claims no substitution: exactly the first-person sentence", () => {
    renderProfile();
    const voice = screen.getByRole("region", { name: t.voiceTitle });
    const caption = voice.querySelector("p");
    if (caption === null) throw new Error("the voice card has no caption");
    expect(caption.textContent).toBe("Одне речення від першої особи, написане вами.");
  });

  // CB-B1, items 1 and 2: his replacements, transcribed (no «реєстр»).
  it("captions contacts and fundraising with his text", () => {
    renderProfile();
    expect(
      within(screen.getByRole("region", { name: t.contactsTitle })).getByText(
        "Ці контакти бачить людина, коли натискає «Написати притулку», — і пише вам сама. Листування йде напряму, без посередників.",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: t.donationTitle })).getByText(
        "Лише https. Через сайт гроші не проходять — це зовнішнє посилання.",
      ),
    ).toBeTruthy();
  });

  it("shows the live link, the proposal waiting for approval, and the shelter's sentence when set", () => {
    renderProfile({
      donation: { url: "https://dobro.ua/fund/domivka", provider: "dobro_ua" as never },
      pendingDonation: {
        link: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" as never },
        proposedAt: new Date(),
        proposedBy: "33333333-3333-4333-8333-333333333333" as never,
      },
      freshnessSentence: { uk: "Ми оновлювали цю картку {дата}.", en: null },
    });
    expect(rowValue(t.donationLink)).toBe("https://dobro.ua/fund/domivka");
    expect(rowValue(t.donationPending)).toBe("https://send.monobank.ua/jar/abc");
    expect(rowValue(t.voiceLabel)).toBe("Ми оновлювали цю картку {дата}.");
  });

  // K-Q6: only the deck and the animal page fill the token. Here the shelter
  // reads its sentence exactly as it wrote it, token included.
  it("shows {імʼя} as written: the kabinet never fills in an animal's name", () => {
    renderProfile({
      freshnessSentence: { uk: "Напишіть, і ми скажемо, чи {імʼя} ще з нами.", en: null },
    });
    expect(rowValue(t.voiceLabel)).toBe("Напишіть, і ми скажемо, чи {імʼя} ще з нами.");
  });

  it("keeps the verified details in the dashed block: legal name, grouped EDRPOU, status with its date, address", () => {
    renderProfile();
    const block = screen.getByRole("region", { name: t.lockedTitle });
    expect(block.className).toContain("border-dashed");
    expect(rowValue(t.legalName)).toBe("ГО «Домівка для хвостатих»");
    expect(rowValue(t.edrpou)).toBe("43 218 765");
    expect(rowValue(t.registrationStatus)).toContain("14 березня 2025");
    expect(rowValue(t.registrationStatus)).toContain(uk.kabinet.profileStatus.verified);
    // His «{status} · з {date}» (row 55), filled: transcribed, not read from the catalogue.
    // Native Intl uk-UA (long date) appends «р.», which his example «14 березня 2025» omits
    // (inbox EM-T13).
    expect(rowValue(t.registrationStatus)).toBe("Перевірено · з 14 березня 2025 р.");
    expect(rowValue(t.address)).toBe("Бровари, вул. Київська, 300");
    // Row 57, his replacement (2026-10-14), transcribed: the caption under the
    // address, inside the same block.
    expect(
      within(block).getByText("Ті, хто шукає тварину, не бачать точної адреси — лише місто."),
    ).toBeTruthy();
    // Only the verification block is dashed: contacts are not "not yours to edit".
    expect(screen.getByRole("region", { name: t.contactsTitle }).className).not.toContain(
      "border-dashed",
    );
  });

  it("names the operator in the block's note, without an instruction it gives no channel for", () => {
    renderProfile();
    const block = screen.getByRole("region", { name: t.lockedTitle });
    const note = within(block).getByText(t.lockedNote.replaceAll("{operator}", "Олексій"));
    // KS-T10: no operator address is configured, so the note may not tell the
    // shelter to write to anyone (review of #93, finding 6).
    expect(note.textContent).not.toMatch(/write to|напишіть/i);
  });

  it("prints an operator name carrying $& and $1 literally (review finding 2)", () => {
    render(
      <ShelterProfile
        view={view()}
        cityName="Бровари"
        viewer="admin"
        operator={{ kind: "configured", name: "Олексій $& $1" }}
      />,
    );
    expect(
      screen.getByText(
        "Ці дані встановлює Олексій $& $1 під час перевірки притулку. Тут вони лише для перегляду.",
      ),
    ).toBeTruthy();
  });

  it("puts the status chip after the note, in K4 360's order", () => {
    renderProfile();
    const block = screen.getByRole("region", { name: t.lockedTitle });
    const note = within(block).getByText(t.lockedNote.replaceAll("{operator}", "Олексій"));
    const chip = within(block).getByText(uk.kabinet.profileStatus.verified, { selector: "span" });
    const title = within(block).getByRole("heading", { name: t.lockedTitle });
    expect(title.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows an unregistered initiative's contact person, and no EDRPOU row", () => {
    renderProfile({
      legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена Коваль" },
    });
    expect(rowValue(t.contactPerson)).toBe("Олена Коваль");
    expect(screen.queryByText(t.edrpou, { selector: "dt" })).toBeNull();
  });

  it.each([
    ["pending", { status: "pending", since: new Date("2025-03-14T10:00:00Z") }],
    ["under_review", { status: "under_review", since: new Date("2025-03-14T10:00:00Z") }],
    [
      "paused",
      {
        status: "paused",
        since: new Date("2025-03-14T10:00:00Z"),
        reason: { code: "relocation", note: null },
      },
    ],
    [
      "rejected",
      {
        status: "rejected",
        at: new Date("2025-03-14T10:00:00Z"),
        reason: { code: "spam", note: "Ні" },
      },
    ],
    [
      "suspended",
      {
        status: "suspended",
        at: new Date("2025-03-14T10:00:00Z"),
        reason: { code: "other", note: "Ні" },
      },
    ],
  ] as const)(
    "labels a %s shelter's chip and status row by its own state",
    (status, verification) => {
      renderProfile({ verification: verification as KabinetShelterView["verification"] });
      const label = uk.kabinet.profileStatus[status];
      expect(rowValue(t.registrationStatus)).toContain(label);
      expect(rowValue(t.registrationStatus)).toContain("14 березня 2025");
    },
  );

  it("dates a status by the day it was in Kyiv, not the server's zone", () => {
    // 22:30 UTC on 13 March is already 14 March in Kyiv.
    renderProfile({
      verification: { status: "verified", since: new Date("2025-03-13T22:30:00Z") },
    });
    expect(rowValue(t.registrationStatus)).toContain("14 березня 2025");
  });

  /** The banner's title, filled the way `SupportBanner` fills it (EM-Q2). */
  const bannerTitle = uk.kabinet.support.title.replaceAll("{shelter}", "Притулок «Домівка»");

  it("an admin gets sign-out and no support banner", () => {
    renderProfile();
    expect(screen.getByRole("button", { name: t.signOut })).toBeDefined();
    expect(screen.queryByRole("region", { name: bannerTitle })).toBeNull();
  });

  it("a support view gets the banner and the frame, sign-out disabled, and no sign-out button", () => {
    const { container } = renderProfile({}, "support");
    const banner = screen.getByRole("region", { name: bannerTitle });
    expect(within(banner).getByRole("button", { name: uk.kabinet.support.exit })).toBeDefined();
    expect(
      within(banner).getByText(
        uk.kabinet.support.body.replaceAll("{shelter}", "Притулок «Домівка»"),
      ),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: t.signOut })).toBeNull();
    expect(screen.getByText(uk.kabinet.support.signOutDisabled)).toBeDefined();
    expect((container.firstElementChild as HTMLElement).className).toContain("outline-4");
  });

  it("every interactive element carries focus-visible styling and a 48px target", () => {
    renderProfile({}, "support");
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("focus-visible:outline");
      expect(button.className).toMatch(/min-h-1[2-9]/);
    }
    renderProfile();
    const signOut = screen.getByRole("button", { name: t.signOut });
    expect(signOut.className).toContain("focus-visible:outline");
    expect(signOut.className).toContain("min-h-12");
  });
});

/**
 * K4: the page shows the editor exactly when `kabinetHomeOf` opened editing
 * for this viewer, and is the read-only page otherwise.
 */
describe("ShelterProfile with K4 editing", () => {
  const open = {
    kind: "open",
    previewAnimal: null,
    donationDeclined: false,
  } as const;

  it("open for the admin: the editor's fields are there", () => {
    render(
      <ShelterProfile
        view={view()}
        cityName="Бровари"
        viewer="admin"
        operator={{ kind: "configured", name: "Олексій" }}
        editing={open}
      />,
    );
    expect(screen.getByLabelText(/^Телефон/)).toBeTruthy();
    expect(screen.getByLabelText("Ваші слова на картках")).toBeTruthy();
  });

  it("a support view stays read-only even if editing were open", () => {
    const { container } = render(
      <ShelterProfile
        view={view()}
        cityName="Бровари"
        viewer="support"
        operator={{ kind: "configured", name: "Олексій" }}
        editing={open}
      />,
    );
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
  });

  it("read-only editing: no field at all", () => {
    const { container } = render(
      <ShelterProfile
        view={view()}
        cityName="Бровари"
        viewer="admin"
        operator={{ kind: "configured", name: "Олексій" }}
        editing={{ kind: "read_only" }}
      />,
    );
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
  });
});

/**
 * K4-B4, answer 2 (Oleksii, verbatim: "show the pause note under the paused
 * line, labelled «Коментар», visible only to that shelter's admins (and
 * operator/support)."): the read-only page shows it too, so the support view
 * and a read-only admin see what the shelter wrote.
 */
describe("the pause note on the read-only page (K4-B4)", () => {
  const paused = view({
    verification: {
      status: "paused",
      since: new Date("2026-10-10T09:00:00Z"),
      reason: { code: "capacity_reached", note: "Повні вольєри" },
    },
  });

  it.each(["support", "admin"] as const)(
    "%s: the paused line, then «Коментар» and the note",
    (viewer) => {
      render(
        <ShelterProfile
          view={paused}
          cityName="Бровари"
          viewer={viewer}
          operator={{ kind: "configured", name: "Олексій" }}
        />,
      );
      expect(
        screen.getByText(/^Прийом на паузі з \d+ жовтня 2026 р?\.? ?· Немає місця$/),
      ).toBeTruthy();
      const note = screen.getByText("Повні вольєри");
      expect(note.previousElementSibling?.textContent).toBe("Коментар");
    },
  );

  it("no note: the paused line alone", () => {
    render(
      <ShelterProfile
        view={view({
          verification: {
            status: "paused",
            since: new Date("2026-10-10T09:00:00Z"),
            reason: { code: "relocation", note: null },
          },
        })}
        cityName="Бровари"
        viewer="admin"
        operator={{ kind: "configured", name: "Олексій" }}
      />,
    );
    expect(screen.getByText(/· Переїзд$/)).toBeTruthy();
    expect(screen.queryByText("Коментар")).toBeNull();
  });
});

/**
 * K2 (PR 5): the section nav («Розділи кабінету») holds «Тварини», K2's list
 * and the way into K3 now, wherever the list is shown to this viewer (P1):
 * the shelter's own admin with writes open, and the support view, read-only.
 * A shelter whose writes are refused gets a 404 at `/kabinet/tvaryny`
 * (`animal-list-page.test.ts`), so its nav holds the profile alone, as
 * before. The «Нова тварина» link that stood in for the list until PR 5 is
 * gone; the list's «Додати тварину» is its successor.
 */
describe("the section nav (K2)", () => {
  const open = { kind: "open", previewAnimal: null, donationDeclined: false } as const;
  const renderWith = (viewer: "admin" | "support", editing: ProfileEditing) =>
    render(
      <ShelterProfile
        view={view()}
        cityName="Бровари"
        viewer={viewer}
        operator={{ kind: "configured", name: "Олексій" }}
        editing={editing}
      />,
    );
  const nav = () => screen.getByRole("navigation", { name: "Розділи кабінету" });

  it.each([
    ["the admin with writes open", "admin", open],
    ["the support view", "support", { kind: "read_only" }],
  ] as const)(
    "%s gets «Тварини», pointing at the list, before the current profile",
    (_who, viewer, editing) => {
      const { unmount } = renderWith(viewer, editing);
      const links = within(nav()).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Тварини", "Профіль притулку"]);
      expect(links[0]?.getAttribute("href")).toBe("/kabinet/tvaryny");
      expect(links[1]?.getAttribute("aria-current")).toBe("page");
      expect(screen.queryByRole("link", { name: "Нова тварина" })).toBeNull();
      unmount();
    },
  );

  it("a shelter whose writes are refused: the profile alone, no way to a list that 404s", () => {
    renderWith("admin", { kind: "read_only" });
    expect(
      within(nav())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Профіль притулку"]);
    expect(screen.queryByRole("link", { name: "Тварини" })).toBeNull();
  });
});
