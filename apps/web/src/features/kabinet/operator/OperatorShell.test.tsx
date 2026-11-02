import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorName } from "../../../kabinet/operator";
import { OperatorShell } from "./OperatorShell";

/**
 * The operator's frame as behaviour (review note 5): who is signed in, said
 * once; «Вийти» is the kabinet's own sign-out; the nav leads to the list and
 * to the create page («Новий притулок» joins it with S2, R-UI 2) and marks the
 * page it is on; the page's content sits in the main landmark. Expected text is typed
 * from his Ukrainian (answer 9: the role «адміністратор сайту»; round 2,
 * answer 6: standing alone, «Адміністратор сайту»), never read from the
 * catalogue.
 */

const OLEKSII: OperatorName = { kind: "configured", name: "Олексій Колотенко" };
const UNSET: OperatorName = { kind: "fallback" };

const renderShell = (
  operator: OperatorName,
  current: "shelters" | "new_shelter" | null = "shelters",
): ReturnType<typeof render> =>
  render(
    <OperatorShell operator={operator} current={current}>
      <p>Вміст сторінки</p>
    </OperatorShell>,
  );

const header = () => screen.getByRole("banner");
/** Opens the account menu (the operator's button reads «Оператор») and returns its panel. */
const openMenu = async (name: string) => {
  await userEvent.click(within(header()).getByRole("button", { name: "Оператор" }));
  return screen.getByRole("group", { name });
};
/** Every «адміністратор сайту» in the menu, either case. */
const roleMentions = (panel: HTMLElement) =>
  panel.querySelector("p")?.textContent?.match(/адміністратор сайту/giu) ?? [];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OperatorShell: who is signed in", () => {
  it("the account button reads «Оператор»; the menu names who is signed in, with the role under it", async () => {
    renderShell(OLEKSII);
    const panel = await openMenu("Олексій Колотенко");
    expect(within(panel).getByText("адміністратор сайту")).toBeTruthy();
    expect(roleMentions(panel)).toHaveLength(1);
  });

  it("no name configured: the role once, capitalised as it stands alone, never twice", async () => {
    renderShell(UNSET);
    const panel = await openMenu("Адміністратор сайту");
    expect(within(panel).queryByText("адміністратор сайту")).toBeNull();
    expect(roleMentions(panel)).toEqual(["Адміністратор сайту"]);
  });
});

describe("OperatorShell: «Вийти»", () => {
  it("is the kabinet's sign-out: it posts to the sign-out path, and a refusal stays and says so", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    renderShell(OLEKSII);
    const panel = await openMenu("Олексій Колотенко");
    await userEvent.click(within(panel).getByRole("button", { name: "Вийти" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Вийти не вдалося – ви досі в кабінеті. Перевірте зʼєднання і спробуйте ще раз.",
    );
  });

  it("is there with no name configured too, and there is no account link for the operator", async () => {
    renderShell(UNSET);
    const panel = await openMenu("Адміністратор сайту");
    expect(within(panel).getByRole("button", { name: "Вийти" })).toBeTruthy();
    expect(within(panel).queryByRole("link", { name: "Акаунт і пароль" })).toBeNull();
  });
});

describe("OperatorShell: the nav and the page", () => {
  const navLinks = () => within(screen.getByRole("navigation")).getAllByRole("link");

  it("leads to the list and to the create page", () => {
    renderShell(OLEKSII, null);
    expect(navLinks().map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Притулки", "/kabinet/prytulky"],
      ["Новий притулок", "/kabinet/prytulky/novyi"],
    ]);
  });

  it.each([
    ["shelters", "Притулки"],
    ["new_shelter", "Новий притулок"],
  ] as const)("marks %s as the current page, and only it", (current, label) => {
    renderShell(OLEKSII, current);
    expect(
      navLinks()
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual([label]);
  });

  it("marks nothing on a page outside the nav (a shelter's page)", () => {
    renderShell(OLEKSII, null);
    expect(navLinks().filter((link) => link.hasAttribute("aria-current"))).toEqual([]);
  });

  it("puts the page's content in the main landmark", () => {
    renderShell(OLEKSII);
    expect(within(screen.getByRole("main")).getByText("Вміст сторінки")).toBeTruthy();
  });
});
