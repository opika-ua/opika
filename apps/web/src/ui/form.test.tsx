import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox, Radio, SegmentedControl, Select, TextArea, TextField } from "./form";

describe("form controls", () => {
  it("TextField: label, hint and error are linked to the input", () => {
    render(<TextField id="n" label="Імʼя" hint="Як вас звати" error="Обовʼязкове поле" />);
    const input = screen.getByRole("textbox", { name: "Імʼя" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("n-hint n-error");
    expect(document.getElementById("n-error")?.textContent).toBe("Обовʼязкове поле");
    expect(document.getElementById("n-hint")?.textContent).toBe("Як вас звати");
  });

  it("TextField without error is not invalid", () => {
    render(<TextField id="n" label="Імʼя" />);
    const input = screen.getByRole("textbox", { name: "Імʼя" });
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("TextArea and Select are labelled", () => {
    render(
      <>
        <TextArea id="d" label="Опис" />
        <Select id="s" label="Місто">
          <option>Київ</option>
        </Select>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Опис" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Місто" })).toBeTruthy();
  });

  it("Radio and Checkbox rows are named by their label", () => {
    render(
      <>
        <Radio name="r" label="Так" />
        <Checkbox name="c" label="Привітний" />
      </>,
    );
    expect(screen.getByRole("radio", { name: "Так" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Привітний" })).toBeTruthy();
  });

  it("SegmentedControl: native radios in a named group; choosing calls onChange", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        name="size"
        legend="Розмір"
        segments={[
          { value: "s", label: "Малий" },
          { value: "m", label: "Середній" },
        ]}
        value="s"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Розмір" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Малий" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Середній" }));
    expect(onChange).toHaveBeenCalledWith("m");
  });

  it("SegmentedControl with null value selects nothing", () => {
    render(
      <SegmentedControl
        name="x"
        legend="L"
        segments={[{ value: "a", label: "A" }]}
        value={null}
        onChange={() => {}}
      />,
    );
    expect((screen.getByRole("radio", { name: "A" }) as HTMLInputElement).checked).toBe(false);
  });
});
