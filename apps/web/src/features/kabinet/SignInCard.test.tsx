import { uk } from "@opika/i18n";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESEND_LOCKOUT_SECONDS, SignInCard } from "./SignInCard";

/**
 * K1 (KABINET N1). The strings are `[COPY PENDING]`, so these tests assert
 * behaviour and structure, never the copy's wording: elements are found by the
 * catalogue keys, and what's asserted is what happens to them. The literal
 * format checked is the mock's own countdown, «· 0:42».
 */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const setup = (send: (email: string) => Promise<boolean> = async () => true) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const spy = vi.fn(send);
  render(<SignInCard send={spy} />);
  return { user, send: spy };
};

const emailField = () => screen.getByLabelText(uk.kabinet.signIn.emailLabel);
const sendButton = () => screen.getByRole("button", { name: uk.kabinet.signIn.send });
/** The resend button in either form: «Send again», or «Send again · m:ss» while locked. */
const resendButton = () => {
  const lockedPrefix = uk.kabinet.signIn.resendIn.split("{time}")[0] ?? "";
  const match = screen
    .getAllByRole("button")
    .find(
      (button) =>
        button.textContent === uk.kabinet.signIn.resend ||
        (button.textContent ?? "").startsWith(lockedPrefix),
    );
  if (match === undefined) throw new Error("no resend button");
  return match;
};

async function signIn(user: ReturnType<typeof userEvent.setup>, address = "  Olena@Example.org ") {
  await user.type(emailField(), address);
  await user.click(sendButton());
}

describe("K1 · enter email", () => {
  it("has one heading, a labelled email field and the send button", () => {
    setup();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(emailField().getAttribute("type")).toBe("email");
    expect(emailField().getAttribute("autocomplete")).toBe("email");
    expect(sendButton().getAttribute("type")).toBe("submit");
  });

  it("sends the trimmed address and moves to «check your email», focus on its heading", async () => {
    const { user, send } = setup();
    await signIn(user);
    expect(send).toHaveBeenCalledWith("Olena@Example.org");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(uk.kabinet.signIn.sentTitle);
    await act(async () => {});
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Olena@Example.org").tagName).toBe("STRONG");
  });

  it("looks the same for any address: nothing in the card depends on who is registered", async () => {
    const known = setup(async () => true);
    await signIn(known.user, "known@example.org");
    const first = document.body.innerHTML.replaceAll("known@example.org", "ADDRESS");
    document.body.innerHTML = "";
    const unknown = setup(async () => true);
    await signIn(unknown.user, "nobody@example.org");
    const second = document.body.innerHTML.replaceAll("nobody@example.org", "ADDRESS");
    // useId differs between renders; compare with the ids normalised.
    const ids = (html: string) => html.replace(/_r_[0-9a-z]+_/g, "_id_");
    expect(ids(second)).toBe(ids(first));
  });

  it("says when the request itself failed, on the field, and stays on the form", async () => {
    const { user } = setup(async () => false);
    await signIn(user);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(uk.kabinet.signIn.title);
    const error = screen.getByText(uk.kabinet.signIn.sendFailed);
    expect(emailField().getAttribute("aria-invalid")).toBe("true");
    expect(emailField().getAttribute("aria-describedby")).toBe(error.id);
  });
});

describe("K1 · check your email", () => {
  it("locks resend for 60s, the countdown in the label, focusable and inert", async () => {
    const { user, send } = setup();
    await signIn(user);
    const button = resendButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.textContent).toContain("· 1:00");
    await act(async () => {
      vi.advanceTimersByTime(18_000);
    });
    expect(resendButton().textContent).toContain("· 0:42");
    resendButton().focus();
    expect(document.activeElement).toBe(resendButton());
    await user.click(resendButton());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("unlocks after 60s, sends again to the same address, and locks again", async () => {
    const { user, send } = setup();
    await signIn(user);
    await act(async () => {
      vi.advanceTimersByTime(RESEND_LOCKOUT_SECONDS * 1000);
    });
    const button = resendButton();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.textContent).toBe(uk.kabinet.signIn.resend);
    await user.click(button);
    expect(send).toHaveBeenLastCalledWith("Olena@Example.org");
    expect(send).toHaveBeenCalledTimes(2);
    expect(resendButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("«a different address» goes back to the form, the address kept and focused", async () => {
    const { user } = setup();
    await signIn(user);
    await user.click(screen.getByRole("button", { name: uk.kabinet.signIn.otherAddress }));
    await act(async () => {});
    expect(document.activeElement).toBe(emailField());
    // A type="email" field holds its value sanitised (trimmed), as browsers do.
    expect((emailField() as HTMLInputElement).value).toBe("Olena@Example.org");
  });
});

describe("K1 · focus and targets", () => {
  it("every interactive element carries focus-visible styling and a 56px target", async () => {
    const { user } = setup();
    const check = () => {
      for (const element of [
        ...screen.getAllByRole("button"),
        ...screen.queryAllByRole("textbox"),
      ]) {
        expect(element.className).toContain("focus-visible:outline");
        expect(element.className).toContain("min-h-14");
      }
    };
    check();
    await signIn(user);
    check();
  });
});
