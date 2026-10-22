import type { ContactRevealView } from "@opika/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAnimalOverlay } from "../../app/tvaryny/@preview/(.)[animalId]/page";
import { AnimalDetailScreen } from "../animal-detail/AnimalDetailScreen";
import {
  ANIMAL_ID,
  makeDetailAnimal,
  makeDetailShelter,
  SHELTER_ID,
  stubAnimalPageClient,
} from "../animal-detail/test-fixtures";
import { mockAppRouter, WithMockRouter } from "../gallery/test-router";

/**
 * The gallery's animal overlay (designer round 1, §2, S4b), by role, label
 * and text, through the intercepting route's own render with the page's
 * loader stubbed. Oleksii, 2026-10-21, verbatim: "One component: the gallery
 * opens the same AnimalDetailScreen in an overlay." and, for the stacked
 * dialogs: "with the reveal open over the overlay, the first Escape closes
 * only the reveal, and focus returns to «Написати притулку» inside the
 * overlay. The second Escape closes the overlay, and focus returns to the
 * gallery card it came from." What a real browser does with the URL and
 * history is `gallery-animal-overlay.harness.ts`'s.
 *
 * The reveal client is stubbed at the module boundary, as in
 * `RevealFlow.test.tsx`: what is counted is the calls this surface makes.
 */
const bootstrap = vi.fn();
const reveal = vi.fn();
vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: {
    session: { bootstrap: (...args: unknown[]) => bootstrap(...args) },
    animals: { reveal: (...args: unknown[]) => reveal(...args) },
  },
}));

const CARD_HREF = `/tvaryny/${ANIMAL_ID}`;

const REVEAL: ContactRevealView = {
  id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" as ContactRevealView["id"],
  animalId: ANIMAL_ID as ContactRevealView["animalId"],
  revealedAt: new Date("2026-10-01T10:00:00Z"),
  shelterContact: {
    source: "current",
    displayName: "Тестовий притулок «Домівка»",
    contact: { primary: { kind: "phone", number: "+380441234567" }, additional: [] } as never,
  },
  shelterAtFirstReveal: {
    shelterId: SHELTER_ID as ContactRevealView["shelterAtFirstReveal"]["shelterId"],
    publicLocation: { cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never },
    verificationStatusAtReveal: "verified",
    donation: null,
  },
  animalSnapshot: { name: "Мурчик", primaryPhoto: null },
};

/** The gallery card the overlay opened from, focused, as a click leaves it. */
function GalleryCard() {
  return <a href={CARD_HREF}>Мурчик</a>;
}

async function openOverlay() {
  const router = mockAppRouter();
  const { client } = stubAnimalPageClient();
  const overlay = await renderAnimalOverlay(ANIMAL_ID, client);
  const card = render(
    <WithMockRouter router={router}>
      <GalleryCard />
    </WithMockRouter>,
  );
  screen.getByRole("link", { name: "Мурчик" }).focus();
  const view = render(<WithMockRouter router={router}>{overlay}</WithMockRouter>);
  const dialog = screen.getByRole("dialog", { name: "Мурчик" });
  return { router, dialog, view, card };
}

async function openReveal(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Написати притулку" }));
  return screen.findByTestId("reveal-dialog");
}

beforeEach(() => {
  bootstrap.mockReset().mockResolvedValue({});
  reveal.mockReset().mockResolvedValue(REVEAL);
});

afterEach(() => {
  document.body.style.overflow = "";
});

describe("the gallery's animal overlay", () => {
  it("is a modal dialog named after the animal, with focus inside it", async () => {
    const { dialog } = await openOverlay();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("shows what the animal page shows: the shelter, «Написати притулку», the donation link, fur, photos, freshness", async () => {
    const { dialog } = await openOverlay();
    const inside = within(dialog);
    expect(inside.getByRole("heading", { level: 1, name: "Мурчик" })).toBeTruthy();
    expect(inside.getAllByText("Тестовий притулок «Домівка»").length).toBeGreaterThan(0);
    expect(inside.getByRole("button", { name: "Написати притулку" })).toBeTruthy();
    expect(inside.getByRole("link", { name: /Підтримати притулок/ }).getAttribute("href")).toBe(
      "https://pay.example.org/domivka",
    );
    expect(inside.getByText("Довга")).toBeTruthy();
    expect(inside.getByRole("button", { name: "Переглянути фото 2" })).toBeTruthy();
    expect(inside.getByText("Оновлено 5 днів тому")).toBeTruthy();
  });

  it("has no «Відкрити повну сторінку»: the overlay is the page (his Q2)", async () => {
    const { dialog } = await openOverlay();
    expect(within(dialog).queryByText("Відкрити повну сторінку")).toBeNull();
  });

  it("✕ and Escape each close it by going back in history", async () => {
    const { router, dialog } = await openOverlay();
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрити" }));
    expect(router.back).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it("closing gives focus back to the gallery card and the page its scroll", async () => {
    const { view } = await openOverlay();
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Мурчик" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("with the reveal open, the first Escape closes only the reveal and focus goes to «Написати притулку»; the second closes the overlay", async () => {
    const { router, dialog } = await openOverlay();
    await openReveal(dialog);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("reveal-dialog")).toBeNull());
    expect(router.back, "the overlay stays open").not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Написати притулку" }),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("back with the reveal open closes both: focus on the card, the page scrolls, no dialog left", async () => {
    const { view } = await openOverlay();
    await openReveal(screen.getByRole("dialog", { name: "Мурчик" }));

    // Back pops the overlay's history entry: the slot unmounts with the
    // reveal still open inside it.
    view.unmount();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Мурчик" }));
    expect(document.body.style.overflow, "no scroll lock left behind").toBe("");
  });
});

/**
 * His condition, verbatim: "The reveal’s rate limit and one-request
 * behaviour are unchanged whether it opens from the page or the overlay.
 * Pin that with a test." The per-day distinct-shelter limit (decision 14)
 * is the server's, keyed on the adopter's session and the request's
 * animal; so "unchanged" is: the same one request, with the same input,
 * from either surface. `reveal-rate-limit` tests count it from there.
 */
describe("the reveal from the overlay and from the page", () => {
  async function revealCallsFrom(surface: ReactNode) {
    const { unmount } = render(<WithMockRouter>{surface}</WithMockRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Написати притулку" }));
    await screen.findByTestId("reveal-dialog");
    unmount();
    const calls = { bootstrap: bootstrap.mock.calls, reveal: reveal.mock.calls };
    const copy = structuredClone(calls);
    bootstrap.mockClear();
    reveal.mockClear();
    return copy;
  }

  it("is one `animals.reveal` request with the same input, either way", async () => {
    const { client } = stubAnimalPageClient();
    const fromOverlay = await revealCallsFrom(await renderAnimalOverlay(ANIMAL_ID, client));
    const fromPage = await revealCallsFrom(
      <AnimalDetailScreen
        animal={makeDetailAnimal()}
        shelter={makeDetailShelter()}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    expect(fromOverlay.reveal).toEqual([[{ animalId: ANIMAL_ID }]]);
    expect(fromOverlay).toEqual(fromPage);
  });
});
