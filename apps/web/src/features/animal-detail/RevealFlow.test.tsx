import type { ContactRevealView } from "@opika/contracts";
import {
  AnimalIdSchema,
  CityIdSchema,
  RevealIdSchema,
  type ShelterContact,
  ShelterIdSchema,
} from "@opika/domain";
import { ORPCError } from "@orpc/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevealFlow } from "./RevealFlow";

/**
 * The reveal dialog had no rendered assertion of its own outside the
 * Playwright harness, and the harness only ever exercises one shelter from
 * seed data - which is how "the dialog renders nothing for a shelter whose
 * primary channel isn't Telegram" survived to a screenshot, and how "the
 * Telegram handle in `additional` is silently dropped" survived past that
 * fix. These are the cases seed data cannot reach.
 *
 * The client is mocked at the module boundary, the same way
 * `use-feed-deck.test.tsx` does it: what is under test is this component's
 * own call order and rendering, not the RPC transport (that is the
 * harness's job, against a real server).
 */
const callOrder: string[] = [];
const bootstrap = vi.fn();
const revealCall = vi.fn();

vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: {
    session: {
      bootstrap: (...args: unknown[]) => {
        callOrder.push("session.bootstrap");
        return bootstrap(...args);
      },
    },
    animals: {
      reveal: (...args: unknown[]) => {
        callOrder.push("animals.reveal");
        return revealCall(...args);
      },
    },
  },
}));

const ANIMAL_ID = AnimalIdSchema.parse("11111111-2222-4333-8444-555555555555");
const SHELTER_ID = ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa");
const REVEAL_ID = RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff");
const CITY_ID = CityIdSchema.parse("12121212-3434-4565-8787-909090909090");

function revealFor(contact: ShelterContact): ContactRevealView {
  return {
    id: REVEAL_ID,
    animalId: ANIMAL_ID,
    revealedAt: new Date("2026-08-08T10:00:00Z"),
    shelterContact: { source: "current", displayName: "Притулок «Домівка»", contact },
    shelterAtFirstReveal: {
      shelterId: SHELTER_ID,
      // City only, as the served reveal carries it (EM-D1): no exact
      // address, district or point ever reaches the client.
      publicLocation: { cityId: CITY_ID },
      verificationStatusAtReveal: "verified",
      donation: null,
    },
    animalSnapshot: { name: "Ластівка", primaryPhoto: null },
  };
}

function renderFlow() {
  return render(<RevealFlow animalId={ANIMAL_ID} animalName="Ластівка" cityName="Бровари" />);
}

beforeEach(() => {
  callOrder.length = 0;
  bootstrap.mockReset();
  revealCall.mockReset();
  bootstrap.mockResolvedValue({});
});

describe("RevealFlow's session handling", () => {
  it("calls nothing at all until the trigger is pressed - no session is minted by opening the page", () => {
    renderFlow();
    expect(callOrder).toEqual([]);
  });

  it("mints a session before asking for the reveal, in that order", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    renderFlow();

    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    // `animals.reveal` is gated on `context.adopterId` server-side, so a
    // reveal fired before bootstrap resolves is a guaranteed UNAUTHENTICATED
    // - this order is the whole reason two calls exist rather than one.
    expect(callOrder).toEqual(["session.bootstrap", "animals.reveal"]);
    expect(revealCall).toHaveBeenCalledWith({ animalId: ANIMAL_ID });
  });

  it("does not call reveal at all when the session cannot be minted", async () => {
    bootstrap.mockRejectedValue(new Error("no session"));
    renderFlow();

    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    expect(callOrder).toEqual(["session.bootstrap"]);
    expect(revealCall).not.toHaveBeenCalled();
  });
});

describe("RevealFlow's contact rows", () => {
  it("shows every channel the shelter gave, not only the primary one", async () => {
    revealCall.mockResolvedValue(
      revealFor({
        primary: { kind: "phone", e164: "+380671234567" },
        additional: [{ kind: "telegram", handle: "domivka_brovary" }],
      }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    // Both rows, in the mock's own order (R1/R2 of `Opika Registry
    // Frames.dc.html` show "+380 67 123 45 67" above "@domivka_brovary").
    // Every seeded shelter has exactly this shape, so a regression here is
    // invisible to any test that only checks "some contact appeared".
    const rows = screen.getAllByTestId("reveal-contact-row").map((row) => row.textContent);
    expect(rows).toEqual(["+380671234567", "@domivka_brovary"]);
  });

  it("still shows the details for a shelter whose primary channel has no action button", async () => {
    revealCall.mockResolvedValue(
      revealFor({
        primary: { kind: "website", url: "https://domivka.example" },
        additional: [{ kind: "viber", e164: "+380671234567" }],
      }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    // The reveal has already been spent against the adopter's 30-per-day
    // limit by this point. A dialog with no contact details in it would be
    // the worst possible outcome of that trade.
    const rows = screen.getAllByTestId("reveal-contact-row").map((row) => row.textContent);
    expect(rows).toEqual(["https://domivka.example", "Viber · +380671234567"]);
    expect(screen.queryByTestId("reveal-primary-action")).toBeNull();
  });

  it("offers a tel: action for a phone-primary shelter and a t.me link for a Telegram-primary one", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    const phoneOnly = renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    const call = screen.getByTestId("reveal-primary-action");
    expect(call.getAttribute("href")).toBe("tel:+380671234567");
    expect(call.textContent).toBe("Подзвонити");
    phoneOnly.unmount();

    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "telegram", handle: "domivka_brovary" }, additional: [] }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    const write = screen.getByTestId("reveal-primary-action");
    expect(write.getAttribute("href")).toBe("https://t.me/domivka_brovary");
    // Transcribed from the mock's R1 frame, not read back from `uk.reveal`.
    expect(write.textContent).toBe("Написати в Telegram");
  });
});

/**
 * EM-D1 (Oleksii, 2026-10-15, verbatim: "the exact address never leaves the
 * server for adopters; the meeting place is agreed with the shelter (matches
 * the live copy)"). The served view can no longer carry it
 * (`pre-reveal-location.test.ts`, both halves); this pins the other side: even
 * handed an over-wide snapshot (a regressed server), the dialog reads no
 * address field, and says the meeting place is agreed in correspondence.
 */
describe("RevealFlow's location line (EM-D1)", () => {
  it("shows the city and «місце узгодите в листуванні», never an address it was handed", async () => {
    const overWide = revealFor({
      primary: { kind: "phone", e164: "+380671234567" },
      additional: [],
    });
    revealCall.mockResolvedValue({
      ...overWide,
      shelterAtFirstReveal: {
        ...overWide.shelterAtFirstReveal,
        exactAddress: {
          line1: "вул. Незалежності, 12",
          line2: "кв. 3",
          postalCode: "07400",
          cityId: CITY_ID,
          district: { uk: "Броварський район", en: null },
          coordinates: { lat: 50.5111, lng: 30.7903 },
        },
      },
    });
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    const dialog = await screen.findByTestId("reveal-dialog");

    const text = dialog.textContent ?? "";
    expect(text).toContain("м. Бровари · місце узгодите в листуванні");
    for (const leaked of ["Незалежності", "кв. 3", "07400", "Броварський", "50.5111", "30.7903"]) {
      expect(text, leaked).not.toContain(leaked);
    }
  });
});

describe("RevealFlow's dialog semantics", () => {
  it("names the dialog and moves focus into it on success", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    const dialog = screen.getByRole("dialog", { name: "Ось як звʼязатися з притулком." });
    expect(dialog).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe("reveal-heading"));
  });

  it("names the dialog and moves focus into it in the error state too", async () => {
    revealCall.mockRejectedValue(new Error("boom"));
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    // Without a `#reveal-heading` in this branch the dialog's own
    // `aria-labelledby` dangles: an unnamed modal, with focus left on the
    // trigger button behind the overlay.
    expect(screen.getByRole("dialog", { name: "Збій на боці сайту." })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe("reveal-heading"));
  });

  /**
   * Oleksii's own words, 2026-09-13 (`docs/decisions-pending-review.md`) -
   * the honest replacement for the generic "Щось не спрацювало" copy the
   * dialog rendered for every error, this one included, until now. A
   * rendered assertion, not a markup check: `docs/standing-constraints.md`'s
   * "a UI item may not be marked done on the basis of inspecting markup."
   */
  it("shows the reveal-budget copy, not the generic error, when animals.reveal is RATE_LIMITED - and offers no retry", async () => {
    revealCall.mockRejectedValue(new ORPCError("RATE_LIMITED", { defined: true }));
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    expect(
      screen.getByRole("dialog", {
        name: "За останню добу ви відкрили контакти багатьох притулків.",
      }),
    ).toBeTruthy();
    // Audit 2026-10-22 #6: the window is a rolling day, and a shelter already opened is free.
    expect(
      screen.getByText(
        "Притулки, чиї контакти ви вже відкривали, можна відкрити знову. Нові - пізніше, коли мине доба від перших.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("reveal-retry")).toBeNull();
    await waitFor(() => expect(document.activeElement?.id).toBe("reveal-heading"));
  });

  /**
   * Parked in `docs/decisions-pending-review.md`'s PARKED section (R3) and
   * picked up here: a genuine network failure during `animals.reveal` used
   * to collapse into the same "Щось не спрацювало на нашому боці" copy as
   * every other error, which is false for this case specifically - neither
   * the app's fault nor the shelter's. `uk.errors.offline` was already
   * approved and already wired for the same signal in the deck
   * (`SwipeDeck.tsx`'s `DeckErrorReason`); this only extends the existing
   * wiring to the detail page's reveal flow.
   */
  it("shows the offline copy, with a retry, when animals.reveal never reaches a server at all", async () => {
    revealCall.mockRejectedValue(new TypeError("Failed to fetch"));
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    expect(
      screen.getByRole("dialog", {
        name: "Немає звʼязку із сайтом. Перевірте інтернет і спробуйте ще раз.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("БЕЗ ЗВʼЯЗКУ")).toBeTruthy();
    // `uk.errors.offline` has no `body` field - the only text in this dialog
    // is the eyebrow, the title (the dialog's own accessible name, asserted
    // above) and the retry button; a stray loadFailed-style body line would
    // mean the `"body" in copy` guard regressed.
    expect(screen.queryByText("Це не ваша помилка і не помилка притулку.")).toBeNull();
    const retry = screen.getByTestId("reveal-retry");
    expect(retry.textContent).toBe("Спробувати ще раз");
    await waitFor(() => expect(document.activeElement?.id).toBe("reveal-heading"));
  });

  /**
   * Reviewer-found gap (`docs/reviews/chore/finish-line-block-1/b22b7c1.md`):
   * the test above only proves the `animals.reveal` call's own offline path.
   * `RevealFlow.tsx` calls `useReveal()` with no `ensureSession`, so
   * `session.bootstrap` runs *first* on every open - a real outage is at
   * least as likely to be caught there as at the reveal call, and the
   * sibling test just above it (`beforeEach`'s `bootstrap.mockResolvedValue`)
   * never exercises that path at all.
   */
  it("shows the offline copy when the session bootstrap itself never reaches a server", async () => {
    bootstrap.mockRejectedValue(new TypeError("Failed to fetch"));
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    expect(
      screen.getByRole("dialog", {
        name: "Немає звʼязку із сайтом. Перевірте інтернет і спробуйте ще раз.",
      }),
    ).toBeTruthy();
    expect(revealCall).not.toHaveBeenCalled();
  });

  /**
   * G1 (audit 2026-10-22): the per-IP limiter answers a plain 429, which the client reports
   * as `TOO_MANY_REQUESTS` (an undefined, non-contract error). It used to read «Щось не
   * спрацювало на нашому боці», blaming the site for a limit; it reads `detail.rateLimited`.
   * Unlike the reveal budget above, it keeps a retry: the limit clears by itself.
   */
  it("shows «Забагато запитів…» with a retry for the per-IP 429, not the site's failure", async () => {
    revealCall.mockRejectedValue(new ORPCError("TOO_MANY_REQUESTS"));
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    expect(
      screen.getByRole("dialog", { name: "Забагато запитів. Спробуйте ще раз пізніше." }),
    ).toBeTruthy();
    expect(screen.queryByText("Збій на боці сайту.")).toBeNull();
    expect(screen.getByTestId("reveal-retry").textContent).toBe("Спробувати ще раз");
  });

  it("Escape closes the dialog, restores focus to the trigger, and unlocks page scroll", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    renderFlow();
    const trigger = screen.getByTestId("reveal-trigger");
    fireEvent.click(trigger);
    await screen.findByTestId("reveal-dialog");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByTestId("reveal-dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  /**
   * RF-F1's regression guard. The assertion above (`toBe("hidden")` read
   * right after `findByTestId`) only catches the race if the test run
   * happens to land in the unlucky scheduling window: the passive original
   * passed it in every local run and failed it once in CI. This test forces
   * the window open deterministically instead of hoping to land in it: a
   * `MutationObserver` fires on the exact DOM mutation that inserts the
   * dialog, and its callback reads `document.body.style.overflow` after the
   * commit's layout effects and before any later-scheduled passive effect
   * runs. The dialog mounts only after an
   * awaited `animals.reveal` resolves, so nothing about this update is a
   * plain discrete click; that's exactly the shape that exposed the race.
   */
  it("has the scroll lock applied at the exact moment the dialog node appears, not merely by the time it's queried", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    renderFlow();

    let overflowAtFirstSight: string | null = null;
    const observer = new MutationObserver(() => {
      if (overflowAtFirstSight !== null) return;
      if (document.querySelector('[data-testid="reveal-dialog"]')) {
        overflowAtFirstSight = document.body.style.overflow;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");
    observer.disconnect();

    expect(overflowAtFirstSight).toBe("hidden");
  });

  it("wraps Shift+Tab from the heading back to the last control instead of leaking to the page behind", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");
    await waitFor(() => expect(document.activeElement?.id).toBe("reveal-heading"));

    // The heading carries tabindex="-1", so it is not in the trap's own
    // focusable list: comparing the active element against `first` alone
    // matched nothing here and let the browser walk backwards out of the
    // dialog onto the trigger button.
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByTestId("reveal-back-to-gallery"));
  });
});
