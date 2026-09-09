import type { ContactRevealView } from "@opika/contracts";
import { AnimalIdSchema, CityIdSchema, RevealIdSchema, ShelterIdSchema } from "@opika/domain";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReveal } from "./useReveal";

const bootstrap = vi.fn();
const revealCall = vi.fn();

vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: {
    session: { bootstrap: (...args: unknown[]) => bootstrap(...args) },
    animals: { reveal: (...args: unknown[]) => revealCall(...args) },
  },
}));

const ANIMAL_A = AnimalIdSchema.parse("11111111-2222-4333-8444-555555555555");
const ANIMAL_B = AnimalIdSchema.parse("aaaaaaaa-2222-4333-8444-666666666666");
const SHELTER_ID = ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa");
const CITY_ID = CityIdSchema.parse("12121212-3434-4565-8787-909090909090");
const REVEAL_ID = RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff");

function revealFor(animalId: typeof ANIMAL_A, name: string): ContactRevealView {
  return {
    id: REVEAL_ID,
    animalId,
    revealedAt: new Date("2026-08-08T10:00:00Z"),
    shelterSnapshot: {
      shelterId: SHELTER_ID,
      displayName: "Притулок «Домівка»",
      contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      exactAddress: {
        line1: "вул. Незалежності, 12",
        line2: null,
        postalCode: null,
        cityId: CITY_ID,
        district: null,
        coordinates: { lat: 50.5111, lng: 30.7903 },
      },
      publicLocation: { precision: "city", cityId: CITY_ID, district: null },
      verificationStatusAtReveal: "verified",
      donation: null,
    },
    animalSnapshot: { name, primaryPhoto: null },
  };
}

beforeEach(() => {
  bootstrap.mockReset().mockResolvedValue({});
  revealCall.mockReset();
});

/**
 * The generation guard's own reason to exist: `SwipeDeck.tsx` is one
 * long-lived component reusing the same `useReveal` instance across many
 * different animals, so a slow response to an *earlier* `open()` call
 * landing after a *later* one must never overwrite what the later call
 * already resolved to. Caught on review — the deck's own tests never
 * exercised two overlapping calls directly; these do.
 *
 * Each test drives the two overlapping calls in strict, deterministic
 * order (first call's own request registered, then the second call
 * fired, then the second call's own resolution awaited via `waitFor`,
 * only then the first call's own deferred promise settled) rather than
 * racing real timers — the guard is meant to hold regardless of timing,
 * and a fixed order is what makes a failure attributable to the guard
 * itself rather than to test flakiness.
 */
describe("useReveal's generation guard", () => {
  it("discards a slower first reveal response that resolves after a faster second one", async () => {
    let resolveFirst: (value: ContactRevealView) => void = () => {};
    const firstReveal = new Promise<ContactRevealView>((resolve) => {
      resolveFirst = resolve;
    });
    revealCall.mockReturnValueOnce(firstReveal);
    revealCall.mockResolvedValueOnce(revealFor(ANIMAL_B, "Барон"));

    const { result } = renderHook(() => useReveal());

    act(() => {
      result.current.open({ animalId: ANIMAL_A, animalName: "Мурчик", cityName: null });
    });
    await waitFor(() => expect(revealCall).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.open({ animalId: ANIMAL_B, animalName: "Барон", cityName: null });
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ kind: "open", animalName: "Барон" }),
    );

    // The first call's slow response lands now — it must not un-resolve
    // or overwrite the second call's already-applied result.
    act(() => {
      resolveFirst(revealFor(ANIMAL_A, "Мурчик"));
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.state).toMatchObject({ kind: "open", animalName: "Барон" });
  });

  it("discards a slower first reveal's rejection landing after a faster second one already succeeded", async () => {
    let rejectFirst: (error: Error) => void = () => {};
    const firstReveal = new Promise<ContactRevealView>((_resolve, reject) => {
      rejectFirst = reject;
    });
    revealCall.mockReturnValueOnce(firstReveal);
    revealCall.mockResolvedValueOnce(revealFor(ANIMAL_B, "Барон"));

    const { result } = renderHook(() => useReveal());

    act(() => {
      result.current.open({ animalId: ANIMAL_A, animalName: "Мурчик", cityName: null });
    });
    await waitFor(() => expect(revealCall).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.open({ animalId: ANIMAL_B, animalName: "Барон", cityName: null });
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ kind: "open", animalName: "Барон" }),
    );

    // The first call's failure lands after the second already succeeded —
    // it must not downgrade a real, already-shown result to an error.
    act(() => {
      rejectFirst(new Error("network error"));
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.state).toMatchObject({ kind: "open", animalName: "Барон" });
  });

  it("discards a slower first bootstrap's rejection landing after a faster second call already succeeded", async () => {
    let rejectFirstBootstrap: (error: Error) => void = () => {};
    const firstBootstrap = new Promise((_resolve, reject) => {
      rejectFirstBootstrap = reject;
    });
    bootstrap.mockReturnValueOnce(firstBootstrap);
    bootstrap.mockResolvedValueOnce({});
    revealCall.mockResolvedValueOnce(revealFor(ANIMAL_B, "Барон"));

    const { result } = renderHook(() => useReveal());

    act(() => {
      result.current.open({ animalId: ANIMAL_A, animalName: "Мурчик", cityName: null });
    });
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.open({ animalId: ANIMAL_B, animalName: "Барон", cityName: null });
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ kind: "open", animalName: "Барон" }),
    );

    act(() => {
      rejectFirstBootstrap(new Error("session bootstrap failed"));
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.state).toMatchObject({ kind: "open", animalName: "Барон" });
  });

  it("does not resurrect a dismissed dialog when an in-flight reveal resolves after close()", async () => {
    let resolveReveal: (value: ContactRevealView) => void = () => {};
    const pendingReveal = new Promise<ContactRevealView>((resolve) => {
      resolveReveal = resolve;
    });
    revealCall.mockReturnValueOnce(pendingReveal);

    const { result } = renderHook(() => useReveal());

    act(() => {
      result.current.open({ animalId: ANIMAL_A, animalName: "Мурчик", cityName: null });
    });
    await waitFor(() => expect(result.current.state.kind).toBe("loading"));

    act(() => {
      result.current.close();
    });
    expect(result.current.state).toEqual({ kind: "idle" });

    // The reveal this dialog was waiting on finally resolves, after the
    // user already dismissed it — must not reopen the dialog behind them.
    act(() => {
      resolveReveal(revealFor(ANIMAL_A, "Мурчик"));
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.state).toEqual({ kind: "idle" });
  });
});
