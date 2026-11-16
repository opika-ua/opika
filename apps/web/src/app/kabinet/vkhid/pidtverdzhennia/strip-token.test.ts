import { afterEach, describe, expect, it } from "vitest";
import type { KabinetAuth } from "../../../../kabinet/auth";
import { handleKabinetConfirm } from "../../../../kabinet/confirm-route";
import { capturingInvitationSender } from "../../../../kabinet/email-senders";
import { capturingSender } from "../../../../kabinet/magic-link-sender";
import { capturingPasswordMail } from "../../../../kabinet/password-mail";

const TOKEN = "A".repeat(32);
const CONFIRM_PATH = "/kabinet/vkhid/pidtverdzhennia";

/** The page the emailed link opens; a GET never verifies, so auth and accept must not run. */
async function confirmPageHtml(): Promise<string> {
  const shown = await handleKabinetConfirm(
    new Request(`https://opika.example${CONFIRM_PATH}?token=${TOKEN}`),
    {
      availability: {
        kind: "available",
        passwordMail: capturingPasswordMail(),
        sender: capturingSender(),
        invites: capturingInvitationSender(),
        secret: "unused-here",
        baseURL: "https://opika.example",
      },
      auth: (): KabinetAuth => {
        throw new Error("a GET never reaches Better Auth");
      },
      acceptInvitation: async () => {
        throw new Error("a GET never accepts");
      },
    },
  );
  expect(shown.status).toBe(200);
  return shown.text();
}

afterEach(() => window.history.replaceState(null, "", "/"));

/**
 * Oleksii, 2026-10-20, verbatim: "Address bar: after the page reads the token, remove it with
 * history.replaceState. The form carries it in a hidden field." The page's own inline script, run
 * at the link's address the way the browser runs it; the harness does the same in Chromium.
 */
describe("the confirm page takes the token out of the address bar", () => {
  it("leaves the bare path in the bar and the history entry, and the form still posts the token", async () => {
    const page = new DOMParser().parseFromString(await confirmPageHtml(), "text/html");
    window.history.replaceState(null, "", `${CONFIRM_PATH}?token=${TOKEN}`);
    const entries = window.history.length;

    const scripts = [...page.querySelectorAll("script")].map((s) => s.textContent ?? "");
    expect(scripts).toHaveLength(1);
    for (const script of scripts) new Function(script)();

    expect(window.location.pathname).toBe(CONFIRM_PATH);
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    // Replaced, not pushed: no entry is left behind carrying it.
    expect(window.history.length).toBe(entries);

    const form = page.querySelector("form");
    if (form === null) throw new Error("the page has no form");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe(CONFIRM_PATH);
    expect(new FormData(form).get("token")).toBe(TOKEN);
  });
});
