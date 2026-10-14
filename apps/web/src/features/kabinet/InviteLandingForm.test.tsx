import { uk } from "@opika/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InviteLanding } from "../../kabinet/invite-landing";
import { InviteLandingForm } from "./InviteLandingForm";

/**
 * EM-Q3 (Oleksii, verbatim: "The invite landing shows one «Надіслати
 * посилання» button; only its POST sends."): the form before and after its
 * button, with the server action replaced by a counting stand-in. Strings are
 * `[COPY PENDING]`, so elements are found by catalogue key.
 */

const ID = "0ec0ec0e-0000-4000-8000-000000000003";
const t = uk.kabinet.inviteLanding;

function setup(answer: InviteLanding = { kind: "unusable" }) {
  const action = vi.fn(async (_previous: InviteLanding | null, _form: FormData) => answer);
  render(<InviteLandingForm invitationId={ID} action={action} minutes={15} contact={null} />);
  return action;
}

describe("the invite landing form (EM-Q3)", () => {
  it("renders one button and nothing else to press, and calls nothing until it is pressed", () => {
    const action = setup();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: t.send })).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t.pageTitle);
    expect(screen.getByText(t.ready)).toBeDefined();
    expect(action).not.toHaveBeenCalled();
  });

  it("posts the invitation id once per press, in the page's own parameter", async () => {
    const action = setup();
    await userEvent.click(screen.getByRole("button", { name: t.send }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const form = action.mock.calls[0]?.[1];
    expect(form?.getAll("zaproshennia")).toEqual([ID]);
  });

  it("replaces the button with the answer and moves focus to its heading", async () => {
    setup({ kind: "sent", shelterName: "Лапа допомоги", maskedEmail: "o•••@example.org" });
    await userEvent.click(screen.getByRole("button", { name: t.send }));
    const heading = await screen.findByRole("heading", { name: /Лапа допомоги/ });
    expect(screen.queryByRole("button")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("the button carries focus-visible styling and a 56px target", () => {
    setup();
    const button = screen.getByRole("button", { name: t.send });
    expect(button.className).toContain("focus-visible:outline");
    expect(button.className).toContain("min-h-14");
    expect(button.getAttribute("type")).toBe("submit");
  });
});
