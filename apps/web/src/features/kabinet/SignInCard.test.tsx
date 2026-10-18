import { uk } from "@opika/i18n";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESEND_LOCKOUT_SECONDS, SignInCard } from "./SignInCard";

/**
 * K1 (KABINET N1). Elements are found by the catalogue keys, and what's
 * asserted is what happens to them. The strings are Oleksii's final Ukrainian (2026-10-14); where
 * one carries a rule (the fallback line), its rendered text is also checked
 * against his wording, transcribed. The countdown format checked is the mock's
 * own, «· 0:42».
 */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const setup = (
  send: (email: string) => Promise<boolean> = async () => true,
  contact: string | null = "hello@example.org",
) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const spy = vi.fn(send);
  render(<SignInCard send={spy} contact={contact} />);
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

  it("the sent state names both Gmail folders a link can land in (row 10, Oleksii 2026-10-14)", async () => {
    const { user } = setup();
    await signIn(user);
    // Transcribed from his handoff: the sign-in email reached Promotions in delivery test 2.
    expect(
      screen.getByText(
        "Листа немає? Перевірте «Спам» і «Промоакції». Надіслати ще раз можна через 60 секунд.",
      ).tagName,
    ).toBe("P");
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

  it("says when a resend failed, on this state, and leaves resend unlocked to try again", async () => {
    let ok = true;
    const { user, send } = setup(async () => ok);
    await signIn(user);
    await act(async () => {
      vi.advanceTimersByTime(RESEND_LOCKOUT_SECONDS * 1000);
    });
    ok = false;
    await user.click(resendButton());
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(uk.kabinet.signIn.sentTitle);
    expect(screen.getByRole("alert").textContent).toBe(uk.kabinet.signIn.sendFailed);
    expect(resendButton().getAttribute("aria-disabled")).toBeNull();
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

  it("«a different address» tapped before «check your email»'s effects run still lands in the field", async () => {
    // «sent» arrives after the network, so React commits it in one task and
    // runs that commit's passive effects in a later one, after paint. On a
    // busy phone a tap queued behind a long task is handled in between.
    // Observer records are delivered as a microtask right after the commit's
    // task, so this taps exactly there, whatever the machine's load.
    const { user } = setup();
    let focusedAtFirstSight = "«check your email» was never observed";
    const observer = new MutationObserver(() => {
      const other = screen.queryByRole("button", { name: uk.kabinet.signIn.otherAddress });
      if (other === null) return;
      observer.disconnect();
      focusedAtFirstSight = document.activeElement?.tagName ?? "nothing";
      fireEvent.click(other);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    await signIn(user);
    observer.disconnect();
    await act(async () => {});
    expect(focusedAtFirstSight).toBe("H1");
    expect(document.activeElement).toBe(emailField());
  });
});

/**
 * IN-T9 (IN-E7's resolution): under «check your email», a person to write to,
 * the address from config. The same card for every address, so the line
 * shows whatever happened to the send.
 */
describe("K1 · «check your email» names a person to write to (IN-T9)", () => {
  /** The line's text before the address: the part of the placeholder the page doesn't fill. */
  const lead = uk.kabinet.signInCard.notArrived.split("{contact}")[0] as string;
  const notArrived = () => screen.queryByText((text) => text.startsWith(lead));

  it("shows the fallback line with the configured address filled in, never the placeholder", async () => {
    const { user } = setup(async () => true, "help@example.net");
    expect(notArrived()).toBeNull();
    await signIn(user);
    const line = notArrived();
    expect(line).not.toBeNull();
    expect(line?.textContent).toBe(
      "Якщо лист не прийшов за кілька хвилин, напишіть мені на help@example.net.",
    );
  });

  it("prints a contact carrying $& and $1 literally (review finding 2)", async () => {
    const { user } = setup(async () => true, "a$&$1@example.net");
    await signIn(user);
    expect(notArrived()?.textContent).toBe(
      "Якщо лист не прийшов за кілька хвилин, напишіть мені на a$&$1@example.net.",
    );
  });

  it("is on the «check your email» state only, not on the form", async () => {
    const { user } = setup();
    expect(screen.queryByText(/hello@example\.org/)).toBeNull();
    await signIn(user);
    expect(screen.getByText(/hello@example\.org/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: uk.kabinet.signIn.otherAddress }));
    expect(screen.queryByText(/hello@example\.org/)).toBeNull();
  });

  it("is left out, not shown with a hole, where no contact is configured", async () => {
    const { user } = setup(async () => true, null);
    await signIn(user);
    expect(notArrived()).toBeNull();
    expect(screen.queryByText(/\{contact\}/)).toBeNull();
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
