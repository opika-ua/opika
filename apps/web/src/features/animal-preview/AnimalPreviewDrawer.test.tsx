import type { AnimalDetailView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { mockAppRouter, WithMockRouter } from "../gallery/test-router";
import { type AnimalPreviewContent, AnimalPreviewDrawer } from "./AnimalPreviewDrawer";

/**
 * Designer round 1, S4: the preview drawer's own behaviour, by role, label
 * and text. The route that renders it, and what a real browser does with
 * the URL and history, are `gallery-preview-drawer.harness.ts`'s.
 */

const ANIMAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as AnimalId;
const HREF = `/tvaryny/${ANIMAL_ID}`;
const AT = new Date("2026-09-01T00:00:00.000Z");

function makeAnimal(overrides: Partial<AnimalDetailView> = {}): AnimalDetailView {
  return {
    id: ANIMAL_ID as AnimalDetailView["id"],
    name: "Мурчик",
    species: "cat",
    sex: "male",
    size: "small",
    coatLength: null,
    publicLocation: null,
    description: { uk: "Лагідний кіт, любить сидіти на підвіконні.", en: null },
    photos: [],
    vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    documentReadiness: { kind: "unknown" },
    ageBucket: "young",
    freshness: { kind: "aging", confirmedAt: AT, ageDays: 5 },
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as AnimalDetailView["shelter"]["id"],
      displayName: "Тестовий притулок «Домівка»",
      publicLocation: { cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never },
      freshnessSentence: { uk: "Оновлюємо щосуботи.", en: null },
      verification: "verified",
    },
    ...overrides,
  };
}

const ANIMAL: AnimalPreviewContent = { kind: "animal", animal: makeAnimal(), cityName: "Бровари" };

function renderDrawer(content: AnimalPreviewContent = ANIMAL) {
  const router = mockAppRouter();
  const view = render(
    <WithMockRouter router={router}>
      <AnimalPreviewDrawer animalId={ANIMAL_ID} content={content} />
    </WithMockRouter>,
  );
  return { router, ...view, dialog: () => screen.getByRole("dialog") };
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("AnimalPreviewDrawer", () => {
  it("is a modal dialog named after the animal, with focus on its name", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Мурчик" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Мурчик" }));
  });

  it("shows the animal's details, its freshness as both pips and the day count in words, and its description", () => {
    const { dialog } = renderDrawer();
    const drawer = within(dialog());
    expect(drawer.getByText("Кіт · молодий · мала")).toBeTruthy();
    expect(drawer.getByText("м. Бровари")).toBeTruthy();
    expect(drawer.getByText("Оновлено 5 днів тому")).toBeTruthy();
    // The three pips beside the words (decorative, so hidden from the
    // accessibility tree, but they must be there: always both).
    const pips = drawer.getByTestId("freshness-block").querySelector('[aria-hidden="true"]');
    expect(pips?.children.length).toBe(3);
    expect(drawer.getByText("Лагідний кіт, любить сидіти на підвіконні.")).toBeTruthy();
  });

  // Oleksii, 2026-10-21 (DR1-S4-T10): the fur fact row, as on the animal page.
  it.each([
    ["short", "Коротка"],
    ["long", "Довга"],
  ] as const)("shows a %s coat as «Шерсть: %s», as the animal page does", (coatLength, value) => {
    const { dialog } = renderDrawer({
      kind: "animal",
      animal: makeAnimal({ coatLength }),
      cityName: "Бровари",
    });
    const drawer = within(dialog());
    expect(drawer.getByRole("term").textContent).toBe("Шерсть:");
    expect(drawer.getByRole("definition").textContent).toBe(value);
  });

  it("shows no fur row when fur isn't recorded", () => {
    const { dialog } = renderDrawer();
    expect(within(dialog()).queryByRole("term")).toBeNull();
    expect(dialog().textContent).not.toContain("Шерсть");
    expect(dialog().textContent).not.toContain("Не вказано");
  });

  it("names a fostered animal's city as a place, with no map", () => {
    const { dialog } = renderDrawer({
      kind: "animal",
      animal: makeAnimal({
        publicLocation: { cityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never },
      }),
      cityName: "Ірпінь",
    });
    expect(within(dialog()).getByText("м. Ірпінь · у домі волонтерки")).toBeTruthy();
  });

  it("names no shelter, offers no contact reveal, no donation, and doesn't quote the shelter's sentence", () => {
    const { dialog } = renderDrawer();
    const text = dialog().textContent ?? "";
    expect(text).not.toContain("Домівка");
    expect(text).not.toContain("Оновлюємо щосуботи");
    expect(text).not.toContain("Слова притулку");
    expect(within(dialog()).queryByRole("button", { name: "Написати притулку" })).toBeNull();
    expect(within(dialog()).queryByText(/Підтримати притулок/)).toBeNull();
  });

  it("links to the animal's full page with a plain link", () => {
    const { dialog } = renderDrawer();
    const link = within(dialog()).getByRole("link", { name: "Відкрити повну сторінку" });
    expect(link.getAttribute("href")).toBe(HREF);
  });

  it("goes back in history on Escape and on «Закрити»", () => {
    const { router, dialog } = renderDrawer();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(router.back).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Закрити" }));
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it("keeps Tab and Shift+Tab inside the drawer", () => {
    const { dialog } = renderDrawer();
    const drawer = within(dialog());
    const close = drawer.getByRole("button", { name: "Закрити" });
    const openFull = drawer.getByRole("link", { name: "Відкрити повну сторінку" });

    // From the name heading (tabindex -1, in no position of the list),
    // Shift+Tab wraps to the last control rather than leaking behind.
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(openFull);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(openFull);
  });

  it("gives focus back to the card that opened it", () => {
    const card = document.createElement("a");
    card.href = HREF;
    card.textContent = "Мурчик";
    document.body.append(card);
    card.focus();

    const { unmount } = renderDrawer();
    expect(document.activeElement).not.toBe(card);
    unmount();

    expect(document.activeElement).toBe(card);
    card.remove();
  });

  it("finds the card by its link when the click left focus on the page (Safari)", () => {
    const card = document.createElement("a");
    card.setAttribute("href", HREF);
    document.body.append(card);
    (document.activeElement as HTMLElement | null)?.blur();

    const { unmount } = renderDrawer();
    unmount();

    expect(document.activeElement).toBe(card);
    card.remove();
  });

  it("stops the page behind from scrolling, and lets it scroll again once closed", () => {
    const { unmount } = renderDrawer();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  /**
   * RF-F1's lesson, tested the way RF-F1 tested it: the drawer mounts when a
   * server navigation resolves, not inside the click, so a passive effect's
   * lock would land after the next paint. A `MutationObserver` reads the lock
   * at the exact mutation that inserts the dialog; mounting here goes
   * through an awaited promise, the shape that exposed the race.
   */
  it("has the scroll lock applied the moment the dialog node appears", async () => {
    let resolve: () => void = () => {};
    const loaded = new Promise<void>((r) => {
      resolve = r;
    });
    function AfterLoad() {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        void loaded.then(() => setReady(true));
      }, []);
      return ready ? <AnimalPreviewDrawer animalId={ANIMAL_ID} content={ANIMAL} /> : null;
    }

    let overflowAtFirstSight: string | null = null;
    const observer = new MutationObserver(() => {
      if (overflowAtFirstSight === null && document.querySelector('[role="dialog"]')) {
        overflowAtFirstSight = document.body.style.overflow;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    render(
      <WithMockRouter>
        <AfterLoad />
      </WithMockRouter>,
    );
    // Not inside `act`: `act` flushes passive effects before it returns,
    // which would hide the very window this test exists to catch.
    resolve();
    await screen.findByRole("dialog");
    observer.disconnect();

    expect(overflowAtFirstSight).toBe("hidden");
  });

  it("says the card is gone, with the close control and no link on, when the animal left the site", () => {
    const { dialog } = renderDrawer({ kind: "not_found" });
    expect(screen.getByRole("dialog", { name: "Цієї картки більше немає." })).toBeTruthy();
    expect(within(dialog()).getByRole("button", { name: "Закрити" })).toBeTruthy();
    expect(within(dialog()).queryByRole("link")).toBeNull();
  });
});
