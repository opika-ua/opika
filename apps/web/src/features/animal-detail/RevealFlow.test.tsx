import type { ContactRevealView } from "@opika/contracts";
import {
  AnimalIdSchema,
  CityIdSchema,
  RevealIdSchema,
  type ShelterContact,
  ShelterIdSchema,
} from "@opika/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevealFlow } from "./RevealFlow";

/**
 * The reveal dialog had no rendered assertion of its own outside the
 * Playwright harness, and the harness only ever exercises one shelter from
 * seed data — which is how "the dialog renders nothing for a shelter whose
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
    shelterSnapshot: {
      shelterId: SHELTER_ID,
      displayName: "Притулок «Домівка»",
      contact,
      exactAddress: {
        line1: "вул. Незалежності, 12",
        line2: null,
        postalCode: null,
        cityId: CITY_ID,
        district: null,
        coordinates: { lat: 50.5111, lng: 30.7903 },
      },
      // `city` precision rather than `fuzzed_address`: the dialog never
      // renders coordinates, and this variant needs no branded
      // `FuzzedCoordinates`, which only `fuzzCoordinates` may construct.
      publicLocation: { precision: "city", cityId: CITY_ID, district: null },
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
  it("calls nothing at all until the trigger is pressed — no session is minted by opening the page", () => {
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
    // — this order is the whole reason two calls exist rather than one.
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

describe("RevealFlow's dialog semantics", () => {
  it("names the dialog and moves focus into it on success", async () => {
    revealCall.mockResolvedValue(
      revealFor({ primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("reveal-trigger"));
    await screen.findByTestId("reveal-dialog");

    const dialog = screen.getByRole("dialog", { name: "Ось як зв'язатися з притулком." });
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
    expect(screen.getByRole("dialog", { name: "Щось не спрацювало на нашому боці." })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe("reveal-heading"));
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
