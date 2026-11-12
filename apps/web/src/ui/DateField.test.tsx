import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateField, type DateFieldLabels } from "./DateField";
import { type DateFieldValue, dateValue, EMPTY_DATE, monthNamesOf } from "./date-field";

const LABELS: DateFieldLabels = {
  day: "День",
  month: "Місяць",
  year: "Рік",
  months: monthNamesOf("uk"),
};
const TODAY = "2026-11-12";

/** The field as a form holds it: the value in state, every change recorded. */
function Held({
  start = EMPTY_DATE,
  min,
  error,
  onValue = () => {},
}: {
  start?: DateFieldValue;
  min?: string;
  error?: string;
  onValue?: (value: DateFieldValue) => void;
}) {
  const [value, setValue] = useState(start);
  return (
    <DateField
      id="birth"
      legend="Дата народження"
      labels={LABELS}
      value={value}
      today={TODAY}
      min={min}
      error={error}
      hint="Коли тварина народилася."
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const descriptionOf = (element: Element): string =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("DateField", () => {
  it("is one named group with a labelled day, month and year", () => {
    render(<Held />);
    const group = screen.getByRole("group", { name: "Дата народження" });
    expect(within(group).getByRole("textbox", { name: "День" })).toBeTruthy();
    expect(within(group).getByRole("combobox", { name: "Місяць" })).toBeTruthy();
    expect(within(group).getByRole("textbox", { name: "Рік" })).toBeTruthy();
    expect(descriptionOf(group)).toBe("Коли тварина народилася.");
  });

  it("offers the twelve months by name, after an empty choice", () => {
    render(<Held />);
    const options = within(screen.getByRole("combobox", { name: "Місяць" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["", ...monthNamesOf("uk")]);
    expect(options[11]?.textContent).toBe("листопада");
  });

  it("the field's id is the first part's, so a link to it lands on the day", () => {
    render(<Held />);
    expect(document.getElementById("birth")).toBe(screen.getByRole("textbox", { name: "День" }));
  });

  it("typed in order, the three parts give the ISO date", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Held onValue={onValue} />);
    await user.type(screen.getByRole("textbox", { name: "День" }), "5");
    expect(onValue).toHaveBeenLastCalledWith({
      kind: "invalid",
      reason: "incomplete",
      parts: { day: "5", month: "", year: "" },
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Місяць" }), "листопада");
    await user.type(screen.getByRole("textbox", { name: "Рік" }), "2024");
    expect(onValue).toHaveBeenLastCalledWith(dateValue("2024-11-05"));
  });

  it("a five-digit year cannot be typed, nor anything but digits", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Held start={dateValue("2024-11-05")} onValue={onValue} />);
    const year = screen.getByRole("textbox", { name: "Рік" }) as HTMLInputElement;
    await user.clear(year);
    await user.type(year, "2o0245");
    expect(year.value).toBe("2024");
    expect(onValue).toHaveBeenLastCalledWith(dateValue("2024-11-05"));
    const day = screen.getByRole("textbox", { name: "День" }) as HTMLInputElement;
    await user.clear(day);
    await user.type(day, "1x23");
    expect(day.value).toBe("12");
  });

  it("30 February is refused as no such date, and shows what was typed", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Held start={dateValue("2024-02-01")} onValue={onValue} />);
    const day = screen.getByRole("textbox", { name: "День" }) as HTMLInputElement;
    await user.clear(day);
    await user.type(day, "30");
    expect(day.value).toBe("30");
    expect(onValue).toHaveBeenLastCalledWith({
      kind: "invalid",
      reason: "no_such_date",
      parts: { day: "30", month: "2", year: "2024" },
    });
  });

  it("checks the bounds it is given: after today, before the minimum", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Held start={dateValue("2026-11-12")} min="1996-11-12" onValue={onValue} />);
    const day = screen.getByRole("textbox", { name: "День" });
    const year = screen.getByRole("textbox", { name: "Рік" });
    await user.clear(day);
    await user.type(day, "13");
    expect(onValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "invalid", reason: "after_max" }),
    );
    await user.clear(year);
    await user.type(year, "1996");
    expect(onValue).toHaveBeenLastCalledWith(dateValue("1996-11-13"));
    await user.clear(day);
    await user.type(day, "11");
    expect(onValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "invalid", reason: "before_min" }),
    );
  });

  it("shows a stored date in its parts, and gives it back unchanged", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Held start={dateValue("2024-02-29")} onValue={onValue} />);
    const day = screen.getByRole("textbox", { name: "День" }) as HTMLInputElement;
    const month = screen.getByRole("combobox", { name: "Місяць" }) as HTMLSelectElement;
    const year = screen.getByRole("textbox", { name: "Рік" }) as HTMLInputElement;
    expect([day.value, month.selectedOptions[0]?.textContent, year.value]).toEqual([
      "29",
      "лютого",
      "2024",
    ]);
    await user.clear(day);
    await user.type(day, "29");
    expect(onValue).toHaveBeenLastCalledWith(dateValue("2024-02-29"));
  });

  it("an error is one message for the group, announced on every part", () => {
    render(<Held error="Такої дати в календарі немає." />);
    expect(screen.getAllByText("Такої дати в календарі немає.")).toHaveLength(1);
    const group = screen.getByRole("group", { name: "Дата народження" });
    expect(descriptionOf(group)).toBe("Коли тварина народилася. Такої дати в календарі немає.");
    for (const part of [
      screen.getByRole("textbox", { name: "День" }),
      screen.getByRole("combobox", { name: "Місяць" }),
      screen.getByRole("textbox", { name: "Рік" }),
    ]) {
      expect(part.getAttribute("aria-invalid")).toBe("true");
      expect(descriptionOf(part)).toBe("Такої дати в календарі немає.");
    }
  });

  it("without an error no part is invalid", () => {
    render(<Held />);
    for (const part of [
      screen.getByRole("textbox", { name: "День" }),
      screen.getByRole("combobox", { name: "Місяць" }),
      screen.getByRole("textbox", { name: "Рік" }),
    ]) {
      expect(part.hasAttribute("aria-invalid")).toBe(false);
      expect(part.hasAttribute("aria-describedby")).toBe(false);
    }
  });

  it("disabled: the whole group is disabled and nothing typed reaches the form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateField
        id="d"
        legend="Станом на"
        labels={LABELS}
        value={dateValue("2025-01-01")}
        today={TODAY}
        disabled
        onChange={onChange}
      />,
    );
    const group = screen.getByRole("group", { name: "Станом на" }) as HTMLFieldSetElement;
    // The fieldset disables its parts (the platform's rule, which happy-dom does not apply to :disabled).
    expect(group.disabled).toBe(true);
    await user.type(within(group).getByRole("textbox", { name: "День" }), "2");
    expect(onChange).not.toHaveBeenCalled();
  });
});
