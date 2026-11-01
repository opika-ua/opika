import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("option: a real checkbox or radio inside a label, so a GET form submits it", () => {
    render(
      <>
        <Chip kind="option" type="checkbox" name="age" value="baby" defaultChecked>
          Малюки
        </Chip>
        <Chip kind="option" type="radio" name="sex" value="male">
          Хлопчик
        </Chip>
      </>,
    );
    const box = screen.getByRole("checkbox", { name: "Малюки" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.name).toBe("age");
    expect(box.value).toBe("baby");
    expect(screen.getByRole("radio", { name: "Хлопчик" })).toBeTruthy();
  });

  it("toggle: state is aria-pressed and the press reaches the handler", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Chip kind="toggle" pressed={false} onClick={onClick}>
        Тільки собаки
      </Chip>,
    );
    const button = screen.getByRole("button", { name: "Тільки собаки" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Chip kind="toggle" pressed onClick={onClick}>
        Тільки собаки
      </Chip>,
    );
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("choice button: aria-pressed, the count in the pill, the full name from accessibleName", () => {
    const onPress = vi.fn();
    render(
      <Chip
        kind="choice"
        control="button"
        pressed={false}
        count={34}
        accessibleName="Київ, 34 тварини"
        onPress={onPress}
      >
        Київ
      </Chip>,
    );
    const pill = screen.getByRole("button", { name: "Київ, 34 тварини" });
    expect(pill.getAttribute("aria-pressed")).toBe("false");
    expect(pill.textContent).toBe("Київ34");
    fireEvent.click(pill);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("choice button, disabled: stays focusable, says so, and ignores a press", () => {
    const onPress = vi.fn();
    render(
      <Chip kind="choice" control="button" pressed={false} count={0} disabled onPress={onPress}>
        Буча
      </Chip>,
    );
    const pill = screen.getByRole("button", { name: /^Буча/ });
    expect(pill.getAttribute("aria-disabled")).toBe("true");
    expect(pill.hasAttribute("disabled")).toBe(false);
    fireEvent.click(pill);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("choice checkbox: a real input a GET form submits; disabled natively, so it never is", () => {
    render(
      <>
        <Chip kind="choice" control="checkbox" name="rozmir" value="small" count={5} defaultChecked>
          Малий
        </Chip>
        <Chip kind="choice" control="checkbox" name="rozmir" value="large" count={0} disabled>
          Великий
        </Chip>
      </>,
    );
    const small = screen.getByRole("checkbox", { name: /^Малий/ }) as HTMLInputElement;
    expect([small.name, small.value, small.checked]).toEqual(["rozmir", "small", true]);
    expect((screen.getByRole("checkbox", { name: /^Великий/ }) as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it("link: marks the current page", () => {
    render(
      <>
        <Chip kind="link" href="/a" current>
          A
        </Chip>
        <Chip kind="link" href="/b">
          B
        </Chip>
      </>,
    );
    expect(screen.getByRole("link", { name: "A" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "B" }).hasAttribute("aria-current")).toBe(false);
  });

  it("info and status are text, not controls", () => {
    render(
      <>
        <Chip kind="info">Середній</Chip>
        <Chip kind="status" tone="ink">
          Резерв
        </Chip>
      </>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Середній")).toBeTruthy();
    expect(screen.getByText("Резерв")).toBeTruthy();
  });

  it("fact: plain text, or a link whose accessible name is the aria-label", () => {
    render(
      <>
        <Chip kind="fact">Спокійний</Chip>
        <Chip kind="fact" href="/tvaryny?stat=male" aria-label="Показати схожих котів: хлопчик">
          Хлопчик
        </Chip>
      </>,
    );
    expect(screen.getByText("Спокійний").closest("a")).toBeNull();
    const link = screen.getByRole("link", { name: "Показати схожих котів: хлопчик" });
    expect(link.textContent).toBe("Хлопчик");
  });
});
