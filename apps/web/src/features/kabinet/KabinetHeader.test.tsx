import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KabinetHeader } from "./KabinetHeader";
import { KabinetNav } from "./KabinetNav";

const admin = { kind: "shelter", shelterName: "Домівка", viewer: "admin" } as const;
const support = { kind: "shelter", shelterName: "Домівка", viewer: "support" } as const;

const stubSession = (user: { name?: string; email?: string } | null) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify(user === null ? null : { user }), { status: 200 }),
    ),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The menu panel (the Popover's group), not the phone sheet that carries the same content. */
const openMenu = async () => {
  const trigger = screen.getByRole("button", { name: "Домівка" });
  await userEvent.click(trigger);
  return { trigger, panel: screen.getByRole("group", { name: "Домівка" }) };
};

describe("KabinetHeader", () => {
  it("names the surface with a muted «Кабінет» beside the logo, not a chip", () => {
    render(<KabinetHeader account={admin} />);
    expect(screen.getByText("Opika")).toBeTruthy();
    const word = screen.getByText("Кабінет");
    expect(word.className).toContain("text-ink-2");
    expect(word.className).not.toContain("rounded-pill");
  });

  it("«На сайт» is one link that opens the public gallery in a new tab and says so", () => {
    render(<KabinetHeader account={admin} />);
    const link = screen.getByRole("link", { name: "На сайт (відкриється в новій вкладці)" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByText("Переглянути сайт")).toBeNull();
  });

  it("the button carries the shelter's name; the menu's first line is the person, the second the role, and the shelter's name is not repeated", async () => {
    stubSession({ name: "Олена Тестова", email: "olena@example.test" });
    render(<KabinetHeader account={admin} />);
    const { panel } = await openMenu();
    expect(await within(panel).findByText("Олена Тестова")).toBeTruthy();
    expect(within(panel).getByText("адміністратор притулку")).toBeTruthy();
    expect(panel.querySelector("p")?.textContent).not.toContain("Домівка");
    expect(within(panel).getByRole("link", { name: "Акаунт і пароль" }).getAttribute("href")).toBe(
      "/kabinet/akaunt",
    );
    expect(within(panel).getByRole("button", { name: "Вийти" })).toBeTruthy();
  });

  it("with no name on the account, the first line is the address", async () => {
    stubSession({ email: "olena@example.test" });
    render(<KabinetHeader account={admin} />);
    const { panel } = await openMenu();
    expect(await within(panel).findByText("olena@example.test")).toBeTruthy();
  });

  it("the phone sheet has no visible title and does not repeat the shelter's name", async () => {
    stubSession({ name: "Олена Тестова" });
    render(<KabinetHeader account={admin} />);
    const sheet = document.querySelector("dialog#kabinet-account") as HTMLElement;
    expect(await within(sheet).findByText("Олена Тестова")).toBeTruthy();
    expect(within(sheet).queryByText("Домівка")).toBeNull();
  });

  it("Escape closes the menu and puts focus back on the account button", async () => {
    render(<KabinetHeader account={admin} />);
    const { trigger } = await openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Домівка" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("opening the menu moves focus inside it", async () => {
    render(<KabinetHeader account={admin} />);
    const { panel } = await openMenu();
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("the phone sheet carries «На сайт» as well; the desktop menu leaves it to the header", async () => {
    render(<KabinetHeader account={admin} />);
    const { panel } = await openMenu();
    expect(within(panel).queryByRole("link", { name: /На сайт/ })).toBeNull();
    const sheet = document.querySelector("dialog#kabinet-account") as HTMLElement;
    expect(within(sheet).getByRole("link", { name: /На сайт/, hidden: true })).toBeTruthy();
  });

  it("the support view keeps its role line, no «Акаунт і пароль» and no working sign-out", async () => {
    render(<KabinetHeader account={support} />);
    const { panel } = await openMenu();
    expect(within(panel).getByText("Вихід вимкнено")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Вийти" })).toBeNull();
    expect(within(panel).queryByRole("link", { name: "Акаунт і пароль" })).toBeNull();
  });

  it("the operator's button reads «Оператор»; the menu has the person and the role word, no account link", async () => {
    stubSession({ name: "Олексій" });
    render(<KabinetHeader account={{ kind: "operator", role: "адміністратор сайту" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Оператор" }));
    const panel = screen.getByRole("group", { name: "Оператор" });
    expect(await within(panel).findByText("Олексій")).toBeTruthy();
    expect(within(panel).getByText("адміністратор сайту")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Вийти" })).toBeTruthy();
    expect(within(panel).queryByRole("link", { name: "Акаунт і пароль" })).toBeNull();
  });
});

describe("KabinetNav", () => {
  it("has two tabs, Тварини then Притулок, and no Головна", () => {
    render(<KabinetNav current="animals" animalList />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Тварини",
      "Притулок",
    ]);
    expect(screen.queryByRole("link", { name: "Головна" })).toBeNull();
    expect(screen.getByRole("link", { name: "Тварини" }).getAttribute("aria-current")).toBe("page");
  });

  it("a page under the account menu marks neither item", () => {
    render(<KabinetNav current={null} animalList />);
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });

  it("the phone bar is text only: every tab is 48px tall (min-h-target) and the bar clears the home indicator", () => {
    render(<KabinetNav current="animals" animalList />);
    for (const link of screen.getAllByRole("link"))
      expect(link.className).toContain("min-h-target");
    const bar = screen.getByRole("navigation");
    expect(bar.className).toContain("pb-inset");
  });
});
