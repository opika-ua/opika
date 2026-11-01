import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ComboboxMulti } from "./ComboboxMulti";
import type { MultiSelectRow } from "./MultiSelectRows";

const ALL = [
  { value: "a", label: "Бровари", count: 3 },
  { value: "b", label: "Ірпінь", count: 8 },
  { value: "c", label: "Буча", count: 1 },
  { value: "d", label: "Одеса", count: 0 },
];

const row = (
  option: (typeof ALL)[number],
  checked: boolean,
  query: string,
): MultiSelectRow | null => {
  if (query !== "" && !option.label.toLowerCase().includes(query.toLowerCase())) return null;
  return {
    value: option.value,
    label: [option.label, "", ""],
    detail: null,
    count: option.count,
    checked,
    disabled: option.count === 0 && !checked,
    name: `${option.label}, ${option.count}`,
    group: null,
  };
};

function Harness({ onToggle = () => undefined }: { onToggle?: (value: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <ComboboxMulti
        id="f"
        label="Місто"
        summary={selected.map((v) => ALL.find((o) => o.value === v)?.label).join(", ")}
        selectedValues={selected}
        rows={(query, pinned) =>
          ALL.map((o) => row(o, selected.includes(o.value), query))
            .filter((r): r is MultiSelectRow => r !== null)
            .sort((x, y) => Number(pinned.has(y.value)) - Number(pinned.has(x.value)))
        }
        onToggle={(value) => {
          onToggle(value);
          setSelected((cur) =>
            cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
          );
        }}
        onClear={() => setSelected([])}
        messages={{
          search: "Пошук міста",
          clear: "Очистити",
          selectedCount: (n) => `Вибрано: ${n}`,
          found: (n) => `Знайдено: ${n}`,
          noMatch: "Нічого не знайдено",
          noMatchHint: "Тут лише міста, де зараз є тварини.",
          clearField: "Скинути Місто",
        }}
      />
      <button type="button">Поза</button>
    </>
  );
}

const input = () => screen.getByRole("combobox");
const options = () => screen.queryAllByRole("option").map((o) => o.getAttribute("aria-label"));

describe("ComboboxMulti", () => {
  it("is a closed combobox named by its label, showing the label as its placeholder", () => {
    render(<Harness />);
    expect(input().getAttribute("aria-label")).toBe("Місто");
    expect(input().getAttribute("placeholder")).toBe("Місто");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on focus into a multiselectable listbox with the search hint", () => {
    render(<Harness />);
    fireEvent.focus(input());
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("placeholder")).toBe("Пошук міста");
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
    expect(options()).toHaveLength(4);
  });

  it("toggles with a click and stays open; the footer counts the choice", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole("option", { name: "Ірпінь, 8" }));
    expect(screen.getByRole("option", { name: "Ірпінь, 8" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Вибрано: 1")).toBeTruthy();
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  it("moves with the arrow keys over usable rows only, and toggles with Enter and with Space", () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toContain("opt-a");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onToggle).toHaveBeenLastCalledWith("a");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: " " });
    expect(onToggle).toHaveBeenLastCalledWith("b");
    // The empty «Одеса» is skipped: wrapping from the last usable row goes back to the first.
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toContain("opt-a");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-activedescendant")).toContain("opt-c");
  });

  it("Enter never submits a surrounding form while the list is open", () => {
    render(<Harness />);
    fireEvent.focus(input());
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
  });

  it("filters as you type; Space types a space instead of toggling once there is a query", () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "бр" } });
    expect(options()).toEqual(["Бровари, 3"]);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(fireEvent.keyDown(input(), { key: " " })).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("says nothing was found, with the hint, when no row matches", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "xyz" } });
    expect(screen.getAllByText("Нічого не знайдено").length).toBeGreaterThan(0);
    expect(screen.getByText("Тут лише міста, де зараз є тварини.")).toBeTruthy();
  });

  it("Escape closes the list and keeps focus on the field", () => {
    render(<Harness />);
    input().focus();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(input());
  });

  it("Backspace on an empty field removes the last chosen value", () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole("option", { name: "Бровари, 3" }));
    fireEvent.click(screen.getByRole("option", { name: "Буча, 1" }));
    fireEvent.keyDown(input(), { key: "Backspace" });
    expect(onToggle).toHaveBeenLastCalledWith("c");
  });

  it("typed text is never a value: on blur the field shows the choice again", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole("option", { name: "Ірпінь, 8" }));
    fireEvent.change(input(), { target: { value: "абв" } });
    fireEvent.blur(input(), { relatedTarget: screen.getByRole("button", { name: "Поза" }) });
    expect((input() as HTMLInputElement).value).toBe("");
    expect(input().getAttribute("placeholder")).toBe("Ірпінь");
    expect(input().getAttribute("aria-label")).toBe("Місто: Ірпінь");
  });

  it("shows a count badge with an accessible name from two choices on, and a ✕ that clears", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole("option", { name: "Бровари, 3" }));
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Ірпінь, 8" }));
    expect(screen.getByRole("img", { name: "Вибрано: 2" }).textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Скинути Місто" }));
    expect(input().getAttribute("placeholder")).toBe("Пошук міста");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps the order the list opened with while rows are ticked, then puts the chosen first on the next opening", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole("option", { name: "Буча, 1" }));
    expect(options()[0]).toBe("Бровари, 3");
    fireEvent.keyDown(input(), { key: "Escape" });
    fireEvent.click(input());
    expect(options()[0]).toBe("Буча, 1");
  });

  it("«Очистити» in the footer clears every choice", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole("option", { name: "Бровари, 3" }));
    const footer = screen.getByRole("button", { name: "Очистити" });
    fireEvent.click(footer);
    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .every((o) => o.getAttribute("aria-selected") === "false"),
    ).toBe(true);
  });

  describe("the whole field is the click target", () => {
    const chevron = () => {
      const el = input().parentElement?.querySelector<HTMLElement>("[aria-hidden='true']");
      if (!el) throw new Error("no chevron");
      return el;
    };

    it("a click on the chevron opens the list and focuses the input; a second click closes it", () => {
      render(<Harness />);
      fireEvent.click(chevron());
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(input());
      fireEvent.click(chevron());
      expect(input().getAttribute("aria-expanded")).toBe("false");
    });

    it("a click on the field's own padding does the same", () => {
      render(<Harness />);
      const field = input().parentElement as HTMLElement;
      fireEvent.click(field);
      expect(input().getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(field);
      expect(input().getAttribute("aria-expanded")).toBe("false");
    });

    it("pressing the chevron keeps focus in the input (no blur that would close the list first)", () => {
      render(<Harness />);
      expect(fireEvent.pointerDown(chevron())).toBe(false);
    });

    it("the ✕ only clears: it neither opens a closed list nor closes an open one", () => {
      render(<Harness />);
      fireEvent.focus(input());
      fireEvent.click(screen.getByRole("option", { name: "Буча, 1" }));
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(input().getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(screen.getByRole("button", { name: "Скинути Місто" }));
      expect(input().getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("button", { name: "Скинути Місто" })).toBeNull();

      fireEvent.focus(input());
      fireEvent.click(screen.getByRole("option", { name: "Буча, 1" }));
      fireEvent.click(screen.getByRole("button", { name: "Скинути Місто" }));
      expect(input().getAttribute("aria-expanded")).toBe("true");
    });
  });
});
