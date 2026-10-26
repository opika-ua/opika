import type { AnimalId } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_LIKES, toggleSavedAnimal } from "./likes-store";
import { SaveButton } from "./SaveButton";

const ANIMAL_ID = "a1" as AnimalId;

beforeEach(() => {
  window.localStorage.clear();
});

describe("SaveButton", () => {
  it("renders unsaved, named «Зберегти», for an animal not yet saved", async () => {
    render(<SaveButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    const button = await screen.findByRole("button", { name: "Зберегти" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders saved, named «Збережено», for an animal already saved", async () => {
    toggleSavedAnimal(ANIMAL_ID, new Date());
    render(<SaveButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    const button = await screen.findByRole("button", { name: "Збережено" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("a click saves it, flips the name and aria-pressed, and announces it", async () => {
    const user = userEvent.setup();
    render(<SaveButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    const button = await screen.findByRole("button", { name: "Зберегти" });

    await user.click(button);

    expect(await screen.findByRole("button", { name: "Збережено" })).toBeTruthy();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Мурчик: додано до збережених");
  });

  it("a second click undoes the save and announces it", async () => {
    const user = userEvent.setup();
    render(<SaveButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    const button = await screen.findByRole("button", { name: "Зберегти" });

    await user.click(button);
    await user.click(await screen.findByRole("button", { name: "Збережено" }));

    expect(await screen.findByRole("button", { name: "Зберегти" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Мурчик: прибрано зі збережених");
  });

  it("at the cap, a click refuses with the full-list message and stays unsaved", async () => {
    const now = new Date();
    for (let i = 0; i < MAX_LIKES; i++) toggleSavedAnimal(`other-${i}`, now);
    const user = userEvent.setup();
    render(<SaveButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    const button = await screen.findByRole("button", { name: "Зберегти" });

    await user.click(button);

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("status").textContent).toBe(
      "Список повний – у ньому може бути не більше 200 тварин. Щоб додати нову, приберіть когось зі списку.",
    );
  });

  it("follows a save made elsewhere (another tab) via the storage event", async () => {
    render(<SaveButton animalId={ANIMAL_ID} animalName="Мурчик" />);
    await screen.findByRole("button", { name: "Зберегти" });

    toggleSavedAnimal(ANIMAL_ID, new Date());
    window.dispatchEvent(new StorageEvent("storage", { key: "likes.v1" }));

    expect(await screen.findByRole("button", { name: "Збережено" })).toBeTruthy();
  });
});
