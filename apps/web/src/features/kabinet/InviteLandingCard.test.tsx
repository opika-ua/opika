import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InviteLandingCard, SIGN_IN_PAGE } from "./InviteLandingCard";

/**
 * IN-T10's card, one rendered test per state the landing can be in
 * (`kabinet/invite-landing.ts`). Found by the catalogue keys, asserting what
 * is filled in and what is shown or withheld; the strings are Oleksii's final
 * Ukrainian (2026-10-14), and the sent body is also checked against his
 * wording, filled.
 */

const lead = (template: string, token: string) => template.split(token)[0] as string;
/** The paragraph whose whole text starts with `prefix` (it may hold a nested `<strong>`). */
const paragraphStarting = (prefix: string) => (_: string, element: Element | null) =>
  element?.tagName === "P" && (element.textContent ?? "").startsWith(prefix);
const t = uk.kabinet.inviteLanding;

describe("the invite landing card (IN-T10, KS-Q2 A)", () => {
  it("sent: names the shelter and the masked address, fills the minutes, and ends with a person to write to", () => {
    render(
      <InviteLandingCard
        landing={{ kind: "sent", shelterName: "Лапа допомоги", maskedEmail: "o•••@example.org" }}
        minutes={15}
        contact="help@example.net"
      />,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Лапа допомоги");
    expect(heading.textContent).not.toContain("{shelter}");
    expect(screen.getByText("o•••@example.org").tagName).toBe("STRONG");
    const body = screen.getByText(paragraphStarting(lead(t.sent, "{email}")));
    // Oleksii's final text (2026-10-14, row 27), transcribed, filled.
    expect(body.textContent).toBe(
      "Посилання для входу надіслано на o•••@example.org. Воно спрацює один раз і діє 15 хвилин. Вхід за ним приймає запрошення.",
    );
    const fallback = screen.getByText((text) =>
      text.startsWith(lead(uk.kabinet.signInCard.notArrived, "{contact}")),
    );
    expect(fallback.textContent).toContain("help@example.net");
    // Row 10 (Oleksii, 2026-10-14), transcribed: both Gmail folders.
    expect(
      screen.getByText(
        "Листа немає? Перевірте «Спам» і «Промоакції». Надіслати ще раз можна через 60 секунд.",
      ),
    ).toBeTruthy();
    // No field and no button: the answer card follows the one button's POST,
    // which already sent the link (EM-Q3); a second button would send again.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sent with no contact configured leaves the fallback line out", () => {
    render(
      <InviteLandingCard
        landing={{ kind: "sent", shelterName: "Лапа", maskedEmail: "o•••@example.org" }}
        minutes={15}
        contact={null}
      />,
    );
    expect(screen.queryByText(/\{contact\}/)).toBeNull();
    expect(
      screen.queryByText((text) =>
        text.startsWith(lead(uk.kabinet.signInCard.notArrived, "{contact}")),
      ),
    ).toBeNull();
  });

  it("send_failed: says the link could not be sent, as an alert, never «check your email»", () => {
    render(
      <InviteLandingCard
        landing={{ kind: "send_failed", shelterName: "Лапа" }}
        minutes={15}
        contact="help@example.net"
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(uk.kabinet.signIn.sendFailed);
    expect(screen.queryByText(paragraphStarting(lead(t.sent, "{email}")))).toBeNull();
  });

  it("unusable: one state for unknown, expired and withdrawn, naming no shelter and no address", () => {
    const { container } = render(
      <InviteLandingCard landing={{ kind: "unusable" }} minutes={15} contact="help@example.net" />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t.unusableTitle);
    expect(screen.getByText(t.expired)).toBeTruthy();
    expect(container.textContent).not.toContain("@");
  });

  it("already_accepted: says so and links to sign-in, with focus styling and a 56px target", () => {
    render(
      <InviteLandingCard landing={{ kind: "already_accepted" }} minutes={15} contact={null} />,
    );
    expect(screen.getByText(t.alreadyAccepted)).toBeTruthy();
    const link = screen.getByRole("link", { name: t.signIn });
    expect(link.getAttribute("href")).toBe(SIGN_IN_PAGE);
    expect(SIGN_IN_PAGE).toBe("/kabinet/vkhid");
    expect(link.className).toContain("focus-visible:outline");
    expect(link.className).toContain("min-h-14");
  });

  it("rate_limited: says too many links were asked for, and names no shelter", () => {
    const { container } = render(
      <InviteLandingCard landing={{ kind: "rate_limited" }} minutes={15} contact={null} />,
    );
    expect(screen.getByText(t.rateLimited)).toBeTruthy();
    expect(container.textContent).not.toContain("@");
  });
});
