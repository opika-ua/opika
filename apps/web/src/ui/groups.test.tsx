import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Chip } from "./Chip";
import { ChipGroup } from "./groups";

describe("ChipGroup", () => {
  it("is a fieldset named by its legend, with the hint and error linked", () => {
    render(
      <ChipGroup name="mood" legend="Характер" hint="Оберіть кілька" error="Оберіть хоч одне">
        <Chip kind="option" type="checkbox" name="mood" value="a">
          Лагідний
        </Chip>
      </ChipGroup>,
    );
    const group = screen.getByRole("group", { name: "Характер" });
    expect(group.getAttribute("aria-describedby")).toBe("mood-hint mood-error");
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Лагідний" })).toBeTruthy();
  });

  it("disabled disables every chip, and extra stays inside the group", () => {
    render(
      <ChipGroup name="m" legend="Q" disabled extra={<p>Своїми словами</p>}>
        <Chip kind="option" type="radio" name="m" value="a">
          А
        </Chip>
      </ChipGroup>,
    );
    expect(screen.getByRole<HTMLFieldSetElement>("group", { name: "Q" }).disabled).toBe(true);
    expect(screen.getByRole("group", { name: "Q" }).textContent).toContain("Своїми словами");
  });

  it("controlled chips still toggle through their own handlers", () => {
    let on = false;
    render(
      <ChipGroup name="m" legend="Q">
        <Chip
          kind="option"
          type="checkbox"
          name="m"
          value="a"
          checked={on}
          onChange={(e) => {
            on = e.currentTarget.checked;
          }}
        >
          А
        </Chip>
      </ChipGroup>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "А" }));
    expect(on).toBe(true);
  });
});
