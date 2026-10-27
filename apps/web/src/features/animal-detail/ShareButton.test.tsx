import type { AnimalId } from "@opika/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "./ShareButton";

const ANIMAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as AnimalId;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareButton - navigator.share present", () => {
  it("calls navigator.share with the animal's name and the canonical URL, no query params", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });

    render(<ShareButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитись" }));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({
      title: "Мурчик",
      url: `https://opika.org.ua/tvaryny/${ANIMAL_ID}`,
    });
  });

  it("never reaches the clipboard when navigator.share exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });

    render(<ShareButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитись" }));

    expect(writeText).not.toHaveBeenCalled();
  });

  it("a cancelled share sheet (AbortError) announces nothing", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    vi.stubGlobal("navigator", { ...navigator, share });

    render(<ShareButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитись" }));
    await waitFor(() => expect(share).toHaveBeenCalled());

    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("ShareButton - fallback (no navigator.share)", () => {
  it("copies the canonical URL to the clipboard and announces his confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });

    render(<ShareButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитись" }));

    expect(writeText).toHaveBeenCalledWith(`https://opika.org.ua/tvaryny/${ANIMAL_ID}`);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Посилання скопійовано."),
    );
  });

  /**
   * Mutation proof: a version of this component that always announced
   * `shareCopied`, even before the clipboard write resolved or without
   * checking for the API at all, would still pass the test above. This
   * forces the no-clipboard path and checks the announcement never fires -
   * confirmed red against that mutation (always calling `setAnnouncement`
   * regardless of API presence) before being kept.
   */
  it("neither navigator.share nor navigator.clipboard present: no crash, no announcement", async () => {
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: undefined });

    render(<ShareButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитись" }));

    expect(screen.getByRole("status").textContent).toBe("");
  });
});
