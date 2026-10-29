import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Combobox,
  type ComboboxMessages,
  type ComboboxOption,
  type ComboboxResult,
} from "./Combobox";

const MESSAGES: ComboboxMessages = {
  placeholder: "Type a place",
  tooShort: "Type at least 2 letters",
  loading: "Searching",
  empty: "Nothing found",
  error: "Search failed",
  retry: "Try again",
  found: (count) => `Found: ${count}`,
  clear: "Clear",
  close: "Close",
};

const OPTIONS: readonly ComboboxOption[] = [
  { value: "a", label: "Alpha", detail: "North district" },
  { value: "b", label: "Alpine", detail: "South district" },
  { value: "c", label: "Beta" },
];

type Search = (query: string, signal: AbortSignal) => Promise<ComboboxResult>;

function setPhone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function Harness({
  search,
  initial = null,
  onChange,
  error,
}: {
  search: Search;
  initial?: ComboboxOption | null;
  onChange?: (next: ComboboxOption | null) => void;
  error?: string;
}) {
  const [value, setValue] = useState<ComboboxOption | null>(initial);
  return (
    <form>
      <Combobox
        id="place"
        name="place"
        label="Place"
        hint="Pick from the list"
        error={error}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        search={search}
        messages={MESSAGES}
        suggestions={[{ value: "z", label: "Zeta" }]}
      />
    </form>
  );
}

const ok = (options: readonly ComboboxOption[]): Promise<ComboboxResult> =>
  Promise.resolve({ kind: "options", options });

async function type(text: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setPhone(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Combobox (inline)", () => {
  it("is a labelled combobox described by its hint, closed at first", () => {
    render(<Harness search={() => ok(OPTIONS)} />);
    const input = screen.getByRole("combobox", { name: "Place" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("place-hint");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
  });

  it("links the error and marks the field invalid", () => {
    render(<Harness search={() => ok(OPTIONS)} error="Pick a place" />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("place-hint place-error");
  });

  it("opens on focus with the suggestions and does not search", () => {
    const search = vi.fn<Search>(() => ok(OPTIONS));
    render(<Harness search={search} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox", { name: "Type a place" })).toBeTruthy();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Zeta"]);
    expect(search).not.toHaveBeenCalled();
  });

  it("an empty field offers the current value first", () => {
    render(<Harness search={() => ok(OPTIONS)} initial={OPTIONS[2] ?? null} />);
    fireEvent.focus(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Beta", "Zeta"]);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("searches after the debounce, shows the second line and announces the count", async () => {
    const search = vi.fn<Search>(() => ok(OPTIONS.slice(0, 2)));
    render(<Harness search={search} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Al" } });
    expect(search).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toBe("Al");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]?.textContent).toContain("North district");
    expect(screen.getByText("Found: 2")).toBeTruthy();
  });

  it("does not search under the minimum length", async () => {
    const search = vi.fn<Search>(() => ok(OPTIONS));
    render(<Harness search={search} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await type("A");
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText("Type at least 2 letters")).toBeTruthy();
  });

  it("aborts a stale request and ignores its late answer", async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Array<(r: ComboboxResult) => void> = [];
    const search: Search = (_q, signal) => {
      signals.push(signal);
      return new Promise((resolve) => resolvers.push(resolve));
    };
    render(<Harness search={search} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await type("Al");
    await type("Alp");
    expect(signals).toHaveLength(2);
    // The first request is aborted only if it was still pending when the next fired.
    expect(signals[0]?.aborted).toBe(true);
    await act(async () => {
      resolvers[1]?.({ kind: "options", options: [OPTIONS[1] as ComboboxOption] });
      resolvers[0]?.({ kind: "options", options: [OPTIONS[0] as ComboboxOption] });
    });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "AlpineSouth district",
    ]);
  });

  it("shows loading, then empty", async () => {
    let finish: (r: ComboboxResult) => void = () => undefined;
    const search: Search = () => new Promise((resolve) => (finish = resolve));
    render(<Harness search={search} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await type("Qq");
    expect(screen.getByText("Searching")).toBeTruthy();
    expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");
    await act(async () => finish({ kind: "options", options: [] }));
    expect(screen.getAllByText("Nothing found").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows an error and retries", async () => {
    const search = vi
      .fn<Search>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ kind: "options", options: [OPTIONS[0] as ComboboxOption] });
    render(<Harness search={search} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await type("Al");
    expect(screen.getAllByText("Search failed").length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("moves with the arrows (wrapping), tracks aria-activedescendant, and Enter commits", async () => {
    const onChange = vi.fn();
    render(<Harness search={() => ok(OPTIONS)} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await type("Al");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[2]?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(OPTIONS[1]);
    expect((input as HTMLInputElement).value).toBe("Alpine");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("Enter with no active option commits nothing (free text never commits)", async () => {
    const onChange = vi.fn();
    render(<Harness search={() => ok(OPTIONS)} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await type("Alpha");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaving the field restores the committed label and submits the option's value", async () => {
    const { container } = render(
      <Harness search={() => ok(OPTIONS)} initial={OPTIONS[0] ?? null} />,
    );
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    await type("Garbage");
    fireEvent.blur(input);
    expect(input.value).toBe("Alpha");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="place"]');
    expect(hidden?.value).toBe("a");
  });

  it("Esc closes the list first, then restores the committed label", async () => {
    render(<Harness search={() => ok(OPTIONS)} initial={OPTIONS[0] ?? null} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    await type("Alp");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value).toBe("Alp");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("Alpha");
  });

  it("clear empties the field and the value", () => {
    const onChange = vi.fn();
    render(<Harness search={() => ok(OPTIONS)} initial={OPTIONS[0] ?? null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });

  it("a disabled field does not open", () => {
    render(
      <Combobox
        id="d"
        label="Place"
        value={null}
        onChange={() => undefined}
        search={() => ok(OPTIONS)}
        messages={MESSAGES}
        disabled
      />,
    );
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("Combobox (phone)", () => {
  it("opens a modal dialog with the search pinned in it, and a pick closes it", async () => {
    setPhone(true);
    const onChange = vi.fn();
    render(<Harness search={() => ok(OPTIONS)} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Place/ }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    const input = screen.getByRole("combobox", { name: "Place" });
    expect(dialog.contains(input)).toBe(true);
    await type("Al");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(OPTIONS[0]);
    expect(dialog.open).toBe(false);
  });
});
