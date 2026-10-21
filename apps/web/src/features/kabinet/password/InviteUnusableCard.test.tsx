import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InviteUnusableCard } from "./InviteUnusableCard";

/**
 * The one page every invitation link that can't be used gets (PW-2), the way the link's GET
 * renders it. Its sentence is his, transcribed from his message, never read from the catalogue:
 * Oleksii, 2026-10-21, Q2 (b), verbatim: "The shared “link no longer works” page gets this text:
 * «Посилання вже не діє. Якщо пароль уже створено — увійдіть. Якщо ні — напишіть мені, і я
 * надішлю нове запрошення.» Keep the «Перейти до входу» button. It’s still one identical page for
 * every broken link. Update its test and the exact copy check." The page module renders the same
 * card for every broken link (`app/kabinet/vkhid/invite-landing-get.test.ts`); the POST's answer
 * turns the form into it (`SetPasswordCard.test.tsx`).
 */

describe("the invitation's one unusable page", () => {
  it("his text, the heading, and «Перейти до входу» to the sign-in page", () => {
    render(<InviteUnusableCard />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Цим запрошенням не можна скористатися" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Посилання вже не діє. Якщо пароль уже створено — увійдіть. Якщо ні — напишіть мені, і я надішлю нове запрошення.",
      ),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Перейти до входу" }).getAttribute("href")).toBe(
      "/kabinet/vkhid",
    );
  });

  /** Review finding 5, his PW-2 Q3: the token leaves the address bar on this page too. */
  it("takes the dead link's token out of the address bar and the history entry", () => {
    const token = "B".repeat(43);
    window.history.replaceState(null, "", `/kabinet/vkhid?zaproshennia=${token}`);
    const before = window.history.length;
    render(<InviteUnusableCard />);
    expect(window.location.pathname).toBe("/kabinet/vkhid");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain(token);
    // Replaced, not pushed: no entry is left behind carrying it.
    expect(window.history.length).toBe(before);
  });
});
