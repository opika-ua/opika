import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorName } from "../../../kabinet/operator";
import { OperatorShell } from "./OperatorShell";

/**
 * The operator's frame as behaviour (review note 5): who is signed in, said
 * once; «Вийти» is the kabinet's own sign-out; the nav marks the page it is
 * on; the page's content sits in the main landmark. Expected text is typed
 * from his Ukrainian (answer 9: the role «адміністратор сайту»; round 2,
 * answer 6: standing alone, «Адміністратор сайту»), never read from the
 * catalogue.
 */

const OLEKSII: OperatorName = { kind: "configured", name: "Олексій Колотенко" };
const UNSET: OperatorName = { kind: "fallback" };

const renderShell = (
  operator: OperatorName,
  current: "shelters" | null = "shelters",
): ReturnType<typeof render> =>
  render(
    <OperatorShell operator={operator} current={current}>
      <p>Вміст сторінки</p>
    </OperatorShell>,
  );

const header = () => screen.getByRole("banner");
/** Every «адміністратор сайту» in the header, either case. */
const roleMentions = () => header().textContent?.match(/адміністратор сайту/giu) ?? [];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OperatorShell: who is signed in", () => {
  it("a configured name, with the role beside it", () => {
    renderShell(OLEKSII);
    expect(within(header()).getByText("Олексій Колотенко")).toBeTruthy();
    expect(within(header()).getByText("адміністратор сайту")).toBeTruthy();
    expect(roleMentions()).toHaveLength(1);
  });

  it("no name configured: the role once, capitalised as it stands alone, never twice", () => {
    renderShell(UNSET);
    expect(within(header()).getByText("Адміністратор сайту")).toBeTruthy();
    expect(within(header()).queryByText("адміністратор сайту")).toBeNull();
    expect(roleMentions()).toEqual(["Адміністратор сайту"]);
  });
});

describe("OperatorShell: «Вийти»", () => {
  it("is the kabinet's sign-out: it posts to the sign-out path, and a refusal stays and says so", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    renderShell(OLEKSII);
    await userEvent.click(within(header()).getByRole("button", { name: "Вийти" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Вийти не вдалося — ви досі в кабінеті. Перевірте з'єднання і спробуйте ще раз.",
    );
  });

  it("is there with no name configured too", () => {
    renderShell(UNSET);
    expect(within(header()).getByRole("button", { name: "Вийти" })).toBeTruthy();
  });
});

describe("OperatorShell: the nav and the page", () => {
  const sheltersLink = () =>
    within(screen.getByRole("navigation")).getByRole("link", { name: "Притулки" });

  it("«Притулки» leads to the list, marked as the current page on it", () => {
    renderShell(OLEKSII, "shelters");
    expect(sheltersLink().getAttribute("href")).toBe("/kabinet/prytulky");
    expect(sheltersLink().getAttribute("aria-current")).toBe("page");
  });

  it("is not marked current on a page outside the nav (a shelter's page)", () => {
    renderShell(OLEKSII, null);
    expect(sheltersLink().getAttribute("aria-current")).toBeNull();
  });

  it("puts the page's content in the main landmark", () => {
    renderShell(OLEKSII);
    expect(within(screen.getByRole("main")).getByText("Вміст сторінки")).toBeTruthy();
  });
});
