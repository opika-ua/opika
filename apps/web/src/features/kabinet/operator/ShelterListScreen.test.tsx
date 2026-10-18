import type { KabinetCursor, RegistryShelterRowView } from "@opika/contracts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RegistryReadClient } from "./registry-browser-client";
import { ShelterListScreen } from "./ShelterListScreen";
import { ShelterRows } from "./ShelterRows";

/**
 * S1 · Притулки as behaviour: the rows and what each says, the filters and
 * the URLs they lead to, every empty and failed state, and «Показати ще».
 * Expected text is typed from his Ukrainian (`rui-copy-uk.md` §1.2), never
 * read from the catalogue.
 */

const CITY = "c1000000-0000-4000-8000-000000000001";
const row = (overrides: Partial<RegistryShelterRowView> = {}): RegistryShelterRowView => ({
  id: "51000000-0000-4000-8000-000000000001" as RegistryShelterRowView["id"],
  displayName: "Притулок «Домівка»",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  status: "pending",
  cityId: CITY as RegistryShelterRowView["cityId"],
  animalCount: 3,
  admins: { joined: 0, invited: 0 },
  donationPending: false,
  ...overrides,
});
const COUNTS = {
  pending: 2,
  under_review: 1,
  verified: 4,
  rejected: 0,
  paused: 0,
  suspended: 1,
};
const cursor = "next-page-cursor" as KabinetCursor;
/** The rows' own list (the status filter is a list too). */
const rows = () => screen.getByRole("list", { name: "Притулки" });

const renderList = (
  items: RegistryShelterRowView[],
  filters: { search: string | null; status: RegistryShelterRowView["status"] | null } = {
    search: null,
    status: null,
  },
) =>
  render(
    <ShelterListScreen
      filters={filters}
      content={{
        kind: "list",
        page: { items, nextCursor: null, counts: COUNTS },
        cityNames: { [CITY]: "Бровари" },
      }}
    />,
  );

describe("S1 rows", () => {
  it("names each shelter with its status, city and admins, and links to its page", () => {
    renderList([row({ admins: { joined: 1, invited: 2 } })]);
    const item = within(rows()).getByRole("listitem");
    expect(within(item).getByRole("heading", { name: "Притулок «Домівка»" })).toBeTruthy();
    expect(within(item).getByText("Очікує · Бровари")).toBeTruthy();
    expect(within(item).getByText("Адміністраторів: 1 · Запрошено: 2")).toBeTruthy();
    const open = within(item).getByRole("link", { name: "Відкрити Притулок «Домівка»" });
    expect(open.getAttribute("href")).toBe(
      "/kabinet/prytulky/51000000-0000-4000-8000-000000000001",
    );
  });

  it("says so when a shelter has no admin and no invitation", () => {
    renderList([row()]);
    expect(screen.getByText("Немає ні адміністраторів, ні запрошень")).toBeTruthy();
  });

  it("leaves out the invited count when nobody is invited", () => {
    renderList([row({ admins: { joined: 2, invited: 0 } })]);
    expect(screen.getByText("Адміністраторів: 2")).toBeTruthy();
    expect(screen.queryByText(/Запрошено/)).toBeNull();
  });

  it("says why a verified shelter sorts first: a donation link waits for a decision", () => {
    renderList([row({ status: "verified", donationPending: true }), row({ id: "x" as never })]);
    expect(screen.getAllByText("Посилання на збір чекає на рішення")).toHaveLength(1);
  });

  it("reads «Не записано» for a city the list doesn't know", () => {
    renderList([row({ cityId: "c9" as never })]);
    expect(screen.getByText("Очікує · Не записано")).toBeTruthy();
  });
});

describe("S1 heading, search and status filter", () => {
  it("shows the total and the order note", () => {
    renderList([row()]);
    expect(screen.getByRole("heading", { level: 1, name: "Притулки" })).toBeTruthy();
    expect(screen.getByText("Усього: 8")).toBeTruthy();
    expect(screen.getByText("Спочатку ті, що чекають на ваше рішення.")).toBeTruthy();
  });

  it("searches by name with a GET form to the list's own URL, keeping the status", () => {
    renderList([row()], { search: "Дом", status: "pending" });
    const search = screen.getByRole("searchbox", { name: "Пошук за назвою" }) as HTMLInputElement;
    expect(search.value).toBe("Дом");
    expect(search.name).toBe("poshuk");
    const form = search.closest("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/kabinet/prytulky");
    const hidden = form?.querySelector('input[type="hidden"]') as HTMLInputElement | null;
    expect([hidden?.name, hidden?.value]).toEqual(["status", "pending"]);
  });

  it("offers every status with its count, keeping the search, the current one marked", () => {
    renderList([row()], { search: "Дом", status: "suspended" });
    const all = screen.getByRole("link", { name: "Усі · 8" });
    expect(all.getAttribute("href")).toBe("/kabinet/prytulky?poshuk=%D0%94%D0%BE%D0%BC");
    expect(all.getAttribute("aria-current")).toBeNull();
    const suspended = screen.getByRole("link", { name: "Призупинено · 1" });
    expect(suspended.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "На розгляді · 1" }).getAttribute("href")).toBe(
      "/kabinet/prytulky?poshuk=%D0%94%D0%BE%D0%BC&status=under_review",
    );
    for (const name of ["Очікує · 2", "Перевірено · 4", "Відхилено · 0", "На паузі · 0"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
  });
});

describe("S1 states", () => {
  it("no match: a search or filter that finds nothing says so", () => {
    renderList([], { search: "Нема", status: null });
    expect(screen.getByText("Нічого не знайдено. Змініть пошук або фільтр.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Притулки" })).toBeNull();
    // A search that finds nothing is not an empty registry.
    expect(screen.queryByText(/^Притулків ще немає/)).toBeNull();
  });

  it("empty: no shelters at all shows the zero total, no rows, and the empty state's link to S2", () => {
    render(
      <ShelterListScreen
        filters={{ search: null, status: null }}
        content={{
          kind: "list",
          page: {
            items: [],
            nextCursor: null,
            counts: { ...COUNTS, pending: 0, under_review: 0, verified: 0, suspended: 0 },
          },
          cityNames: {},
        }}
      />,
    );
    expect(screen.getByText("Усього: 0")).toBeTruthy();
    expect(screen.queryByText(/Нічого не знайдено/)).toBeNull();
    expect(screen.queryByRole("list", { name: "Притулки" })).toBeNull();
    const empty = screen.getByText(
      "Притулків ще немає. Перший можна додати через «Новий притулок».",
    ).parentElement as HTMLElement;
    expect(within(empty).getByRole("link", { name: "Новий притулок" }).getAttribute("href")).toBe(
      "/kabinet/prytulky/novyi",
    );
  });

  it("offers «Новий притулок», to S2, above the rows, with no empty state over them", () => {
    renderList([row()]);
    expect(
      screen.getAllByRole("link", { name: "Новий притулок" }).map((l) => l.getAttribute("href")),
    ).toEqual(["/kabinet/prytulky/novyi"]);
    expect(screen.queryByText(/^Притулків ще немає/)).toBeNull();
  });

  it("load failed: says so and retries the same URL", () => {
    render(
      <ShelterListScreen
        filters={{ search: "Дом", status: null }}
        content={{ kind: "load_failed" }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Список не завантажився.")).toBeTruthy();
    expect(
      within(alert).getByRole("link", { name: "Спробувати ще раз" }).getAttribute("href"),
    ).toBe("/kabinet/prytulky?poshuk=%D0%94%D0%BE%D0%BC");
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});

describe("S1 «Показати ще»", () => {
  const fakeClient = (list: ReturnType<typeof vi.fn>) =>
    ({
      registry: { shelters: { list }, history: { list: vi.fn() } },
    }) as unknown as RegistryReadClient;

  const renderRows = (list: ReturnType<typeof vi.fn>, restart = vi.fn()) => {
    render(
      <ShelterRows
        first={{ items: [row()], nextCursor: cursor }}
        filters={{ search: "Дом", status: "pending" }}
        cityNames={{ [CITY]: "Бровари" }}
        client={fakeClient(list)}
        restart={restart}
      />,
    );
    return restart;
  };

  it("sends the page's cursor with the same filters, and appends the next page", async () => {
    const list = vi.fn(async () => ({
      items: [row({ id: "52000000-0000-4000-8000-000000000002" as never, displayName: "Лапа" })],
      nextCursor: null,
      counts: COUNTS,
    }));
    renderRows(list);
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(list).toHaveBeenCalledWith({
      search: "Дом",
      status: "pending",
      cursor: "next-page-cursor",
      limit: 50,
    });
    expect(
      within(rows())
        .getAllByRole("listitem")
        .map((item) => within(item).getByRole("heading").textContent),
    ).toEqual(["Притулок «Домівка»", "Лапа"]);
    // The last page: nothing more to show.
    expect(screen.queryByRole("button", { name: "Показати ще" })).toBeNull();
  });

  it("a failed page keeps what's shown and offers the same request again", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [], nextCursor: null, counts: COUNTS });
    renderRows(list);
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Список не завантажився.")).toBeTruthy();
    expect(within(rows()).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(within(alert).getByRole("button", { name: "Спробувати ще раз" }));
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1]?.[0]).toMatchObject({ cursor: "next-page-cursor" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a second press while a page is loading sends nothing more, so no page is appended twice", async () => {
    let answer: (page: unknown) => void = () => {};
    const list = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    renderRows(list);
    const more = screen.getByRole("button", { name: "Показати ще" });
    await userEvent.click(more);
    await userEvent.click(more);
    expect(list).toHaveBeenCalledOnce();
    await act(async () => {
      answer({
        items: [row({ id: "52000000-0000-4000-8000-000000000002" as never, displayName: "Лапа" })],
        nextCursor: null,
        counts: COUNTS,
      });
    });
    expect(within(rows()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("a stale cursor restarts the list at its first page instead of failing", async () => {
    const list = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("stale"), { code: "INVALID_CURSOR" }));
    const restart = renderRows(list);
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(restart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
