import type { RegistryShelterView } from "@opika/contracts";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Reread } from "./operator-actions";
import { registryView } from "./test-fixtures";
import { useRouterReread } from "./use-router-reread";

/**
 * S4's re-read in production: `router.refresh()` re-renders the page on the
 * server, and the promise answers with the record the page then passes down.
 * Next.js's router is replaced by one whose refresh hands the page a new
 * record, as a server re-render would; the hook itself runs unchanged.
 */

const page = vi.hoisted(() => ({
  next: null as RegistryShelterView | null,
  setView: (_view: RegistryShelterView) => {},
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      page.refresh();
      if (page.next !== null) page.setView(page.next);
    },
  }),
}));

let reread: Reread = async () => null;

function Probe({ view }: { view: RegistryShelterView }) {
  reread = useRouterReread(view);
  return <p>{view.displayName}</p>;
}

function Page({ initial }: { initial: RegistryShelterView }) {
  const [view, setView] = useState(initial);
  page.setView = setView;
  return <Probe view={view} />;
}

describe("useRouterReread", () => {
  it("refreshes the page once and answers with the record it then holds", async () => {
    const before = registryView({ displayName: "Домівка", version: 3 });
    const after = registryView({ displayName: "Домівка", version: 4 });
    page.next = after;
    render(<Page initial={before} />);
    // Started inside act and awaited outside it: act flushes the refresh's
    // renders and effects as it returns, which is what settles the promise.
    let answer: Promise<RegistryShelterView | null> = Promise.resolve(null);
    await act(async () => {
      answer = reread();
    });
    const answered = await answer;
    expect(page.refresh).toHaveBeenCalledOnce();
    expect(answered).toBe(after);
  });

  it("a refresh that brings nothing new answers with the same record (so a lost answer reads as not done)", async () => {
    page.refresh.mockClear();
    const before = registryView({ displayName: "Лапа", version: 3 });
    page.next = null;
    render(<Page initial={before} />);
    // Started inside act and awaited outside it: act flushes the refresh's
    // renders and effects as it returns, which is what settles the promise.
    let answer: Promise<RegistryShelterView | null> = Promise.resolve(null);
    await act(async () => {
      answer = reread();
    });
    const answered = await answer;
    expect(page.refresh).toHaveBeenCalledOnce();
    expect(answered).toBe(before);
    expect(screen.getByText("Лапа")).toBeTruthy();
  });
});
