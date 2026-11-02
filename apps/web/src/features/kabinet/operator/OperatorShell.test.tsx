import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/** Every fetch answers with `other`; the person comes as a prop, never from a fetch. */
const stubFetch = (other: () => Response = () => new Response(null, { status: 200 })) => {
  const mock = vi.fn(async () => other());
  vi.stubGlobal("fetch", mock);
  return mock;
};

const renderShell = (
  current: "shelters" | "new_shelter" | null = "shelters",
): ReturnType<typeof render> =>
  render(
    <OperatorShell current={current} person={{ name: "Олексій Колотенко", email: null }}>
      <p>Вміст сторінки</p>
    </OperatorShell>,
  );

const header = () => screen.getByRole("banner");
/** Opens the account menu (the operator's button reads «Оператор») and returns its panel. */
const openMenu = async () => {
  await userEvent.click(within(header()).getByRole("button", { name: "Оператор" }));
  return screen.getByRole("group", { name: "Оператор" });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OperatorShell: who is signed in", () => {
  it("the account button reads «Оператор»; the menu has the person, then the role word, once", async () => {
    stubFetch();
    renderShell();
    const panel = await openMenu();
    expect(within(panel).getByText("Олексій Колотенко")).toBeTruthy();
    expect(within(panel).getAllByText("адміністратор сайту")).toHaveLength(1);
  });
});

describe("OperatorShell: «Вийти»", () => {
  it("is the kabinet's sign-out: it posts to the sign-out path, and a refusal stays and says so", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 503 }));
    renderShell();
    const panel = await openMenu();
    await userEvent.click(within(panel).getByRole("button", { name: "Вийти" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Вийти не вдалося – ви досі в кабінеті. Перевірте зʼєднання і спробуйте ще раз.",
    );
  });
});

describe("OperatorShell: the nav and the page", () => {
  const navLinks = () => within(screen.getByRole("navigation")).getAllByRole("link");

  it("leads to the list and to the create page", () => {
    renderShell(null);
    expect(navLinks().map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Притулки", "/kabinet/prytulky"],
      ["Новий притулок", "/kabinet/prytulky/novyi"],
    ]);
  });

  it.each([
    ["shelters", "Притулки"],
    ["new_shelter", "Новий притулок"],
  ] as const)("marks %s as the current page, and only it", (current, label) => {
    renderShell(current);
    expect(
      navLinks()
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual([label]);
  });

  it("marks nothing on a page outside the nav (a shelter's page)", () => {
    renderShell(null);
    expect(navLinks().filter((link) => link.hasAttribute("aria-current"))).toEqual([]);
  });

  it("puts the page's content in the main landmark", () => {
    renderShell();
    expect(within(screen.getByRole("main")).getByText("Вміст сторінки")).toBeTruthy();
  });
});
