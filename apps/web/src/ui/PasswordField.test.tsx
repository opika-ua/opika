import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordField } from "./PasswordField";

const field = (props: Partial<Parameters<typeof PasswordField>[0]> = {}) =>
  render(
    <PasswordField
      id="pw"
      name="password"
      label="Пароль"
      autoComplete="new-password"
      showLabel="Показати пароль"
      hideLabel="Сховати пароль"
      {...props}
    />,
  );

describe("PasswordField", () => {
  it("is a labelled password input whose toggle shows and hides it, keeping the value", () => {
    field({ defaultValue: "ялинка-під-вікном" });
    const input = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("new-password");

    fireEvent.click(screen.getByRole("button", { name: "Показати пароль" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("ялинка-під-вікном");

    const hide = screen.getByRole("button", { name: "Сховати пароль" });
    expect(hide.getAttribute("aria-controls")).toBe("pw");
    // The swapping name is the state; no aria-pressed on top (owner, 2026-11-19).
    expect(hide.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(hide);
    expect(input.type).toBe("password");
    expect(screen.getByRole("button", { name: "Показати пароль" })).toBeTruthy();
  });

  it("a pointer press on the eye leaves focus in the input", () => {
    field();
    const input = screen.getByLabelText("Пароль");
    input.focus();
    const eye = screen.getByRole("button", { name: "Показати пароль" });
    // A prevented pointerdown is what keeps the browser from moving focus to the button.
    expect(fireEvent.pointerDown(eye)).toBe(false);
    fireEvent.click(eye);
    expect(document.activeElement).toBe(input);
  });

  it("announces the live status line politely, outside the description", () => {
    field({ hint: "Щонайменше 10 символів.", status: "Ще 3 символи." });
    const status = screen.getByText("Ще 3 символи.");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByLabelText("Пароль").getAttribute("aria-describedby")).toBe("pw-hint");
  });

  it("the toggle never submits the form", () => {
    let submitted = false;
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = true;
        }}
      >
        <PasswordField
          id="pw"
          label="Пароль"
          autoComplete="current-password"
          showLabel="Показати пароль"
          hideLabel="Сховати пароль"
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Показати пароль" }));
    expect(submitted).toBe(false);
  });

  it("links the hint and the error, and marks the input invalid", () => {
    field({ hint: "Щонайменше 10 символів.", error: "Паролі не збігаються." });
    const input = screen.getByLabelText("Пароль");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("pw-hint pw-error");
    expect(document.getElementById("pw-error")?.textContent).toBe("Паролі не збігаються.");
  });
});
