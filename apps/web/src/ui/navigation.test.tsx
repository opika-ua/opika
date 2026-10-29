import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { CheckboxGroup, RadioGroup } from "./groups";
import { Pagination } from "./Pagination";
import { PrevNext } from "./PrevNext";
import { paginationWindow } from "./pagination-window";
import { Tabs } from "./Tabs";
import { Toast, ToastProvider, useToast } from "./Toast";
import { Toggle } from "./Toggle";

describe("paginationWindow", () => {
  it("shows every page up to 7, then first, last and the neighbours of the current one", () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
    expect(paginationWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paginationWindow(1, 83)).toEqual([1, 2, "ellipsis", 83]);
    expect(paginationWindow(5, 83)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 83]);
    expect(paginationWindow(83, 83)).toEqual([1, "ellipsis", 82, 83]);
    expect(paginationWindow(1, 0)).toEqual([]);
  });
});

const PAGER = {
  hrefFor: (n: number) => `/p/${n}`,
  navLabel: "Сторінки",
  prevLabel: "Попередня",
  nextLabel: "Наступна",
  pageLabel: "Сторінка {page}",
  currentLabel: "поточна",
};

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} totalPages={1} {...PAGER} />);
    expect(container.firstChild).toBeNull();
  });

  it("is a named nav of links; the current page is aria-current and not a link", () => {
    render(<Pagination page={2} totalPages={5} {...PAGER} />);
    const nav = screen.getByRole("navigation", { name: "Сторінки" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "Сторінка 3" }).getAttribute("href")).toBe("/p/3");
    expect(screen.getByRole("link", { name: "Попередня" }).getAttribute("href")).toBe("/p/1");
    expect(screen.getByRole("link", { name: "Наступна" }).getAttribute("href")).toBe("/p/3");
    expect(screen.queryByRole("link", { name: "Сторінка 2" })).toBeNull();
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("2");
  });

  it("has no prev link on the first page and no next link on the last", () => {
    const { rerender } = render(<Pagination page={1} totalPages={3} {...PAGER} />);
    expect(screen.queryByRole("link", { name: "Попередня" })).toBeNull();
    rerender(<Pagination page={3} totalPages={3} {...PAGER} />);
    expect(screen.queryByRole("link", { name: "Наступна" })).toBeNull();
  });
});

describe("PrevNext", () => {
  it("renders the links it is given, named, and nothing when both are null", () => {
    const { container, rerender } = render(
      <PrevNext prev={null} next={{ href: "/n", label: "Далі" }} />,
    );
    expect(screen.queryByRole("link", { name: "Назад" })).toBeNull();
    expect(screen.getByRole("link", { name: "Далі" }).getAttribute("href")).toBe("/n");
    rerender(<PrevNext prev={null} next={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("BottomNav", () => {
  it("marks only the current item and names the nav", () => {
    render(
      <BottomNav
        label="Кабінет"
        current="b"
        items={[
          { key: "a", href: "/a", label: "Головна" },
          { key: "b", href: "/b", label: "Тварини" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Кабінет" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Тварини" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Головна" }).hasAttribute("aria-current")).toBe(false);
  });
});

describe("Toggle", () => {
  it("is two named links; the current one is aria-current; the track is hidden", () => {
    const { container } = render(
      <Toggle
        label="Сортування"
        current={1}
        options={[
          { label: "Нові", href: "/n", ariaLabel: "Нові. Найсвіжіші" },
          { label: "Зачекались", href: "/w" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Нові. Найсвіжіші" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Зачекались" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(container.querySelectorAll('a[aria-hidden="true"]').length).toBe(1);
    expect(screen.getAllByRole("link").length).toBe(2);
  });
});

describe("Tabs", () => {
  function renderTabs() {
    render(
      <Tabs
        label="Розділи"
        tabs={[
          { id: "a", label: "Один", panel: <p>Перша</p> },
          { id: "b", label: "Два", panel: <p>Друга</p> },
          { id: "c", label: "Три", panel: <p>Третя</p> },
        ]}
      />,
    );
  }

  it("selects the first tab, shows only its panel, with one tab stop", () => {
    renderTabs();
    expect(screen.getByRole("tablist", { name: "Розділи" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Один" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Один" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Два" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Два" }).getAttribute("tabindex")).toBe("-1");
  });

  it("arrow keys, Home and End move the selection and the focus, wrapping around", () => {
    renderTabs();
    const first = screen.getByRole("tab", { name: "Один" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Два" }));
    expect(screen.getByRole("tabpanel", { name: "Два" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(screen.getByRole("tab", { name: "Три" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Один" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Три" }).getAttribute("aria-selected")).toBe("true");
  });

  it("a click selects a tab", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Три" }));
    expect(screen.getByRole("tabpanel", { name: "Три" })).toBeTruthy();
  });
});

describe("RadioGroup and CheckboxGroup", () => {
  it("RadioGroup: a named group of radios sharing a name, default chosen", () => {
    render(
      <RadioGroup
        name="size"
        legend="Розмір"
        defaultValue="m"
        error="Оберіть"
        options={[
          { value: "s", label: "Малий" },
          { value: "m", label: "Середній" },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Розмір" });
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("radio", { name: "Середній" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole("radio", { name: "Малий" }) as HTMLInputElement).name).toBe("size");
  });

  it("RadioGroup controlled: reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        name="r"
        legend="Q"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "А" },
          { value: "b", label: "Б" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Б" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("CheckboxGroup controlled: adds and removes values", () => {
    const onChange = vi.fn();
    render(
      <CheckboxGroup
        name="c"
        legend="Q"
        value={["a"]}
        onChange={onChange}
        options={[
          { value: "a", label: "А" },
          { value: "b", label: "Б" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Б" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "А" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("CheckboxGroup uncontrolled: defaults are checked and share a name for a GET form", () => {
    render(
      <CheckboxGroup
        name="age"
        legend="Вік"
        defaultValue={["a"]}
        options={[
          { value: "a", label: "А" },
          { value: "b", label: "Б" },
        ]}
      />,
    );
    expect((screen.getByRole("checkbox", { name: "А" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Б" }) as HTMLInputElement).name).toBe("age");
  });
});

describe("Toast", () => {
  it("an error toast is an alert; others are plain; dismiss is named", () => {
    render(
      <>
        <Toast tone="error" message="Помилка" dismissLabel="Закрити" onDismiss={() => {}} />
        <Toast tone="info" message="Збережено" dismissLabel="Закрити" />
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Помилка");
    expect(screen.getAllByRole("button", { name: "Закрити" }).length).toBe(1);
  });

  function Trigger() {
    const { show } = useToast();
    return (
      <button type="button" onClick={() => show("Збережено", "success")}>
        Показати
      </button>
    );
  }

  it("the provider's live region receives a toast, which leaves on dismiss and on its own", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <ToastProvider dismissLabel="Закрити" durationMs={1000}>
          <Trigger />
        </ToastProvider>,
      );
      const region = container.querySelector('[aria-live="polite"]') as HTMLElement;
      expect(region).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Показати" }));
      expect(region.textContent).toContain("Збережено");
      fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
      expect(region.textContent).toBe("");
      fireEvent.click(screen.getByRole("button", { name: "Показати" }));
      expect(region.textContent).toContain("Збережено");
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(region.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("useToast outside a provider fails loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
