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
    fireEvent.click(hide);
    expect(input.type).toBe("password");
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
