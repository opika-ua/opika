import type { KabinetCursor } from "@opika/contracts";
import { useRef, useState } from "react";

/** One keyset page as both registry lists answer it. */
export type Page<T> = { items: readonly T[]; nextCursor: KabinetCursor | null };

/** «Показати ще»'s state: nothing in flight, a page loading, or the last request failed. */
export type MoreState = { kind: "idle" } | { kind: "loading" } | { kind: "failed" };

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

/**
 * A server-rendered first page, with «Показати ще» appending the next one
 * from the browser by its signed cursor (keyset, never OFFSET).
 *
 * A failure keeps what is shown and offers the same request again. A cursor
 * the server no longer accepts (INVALID_CURSOR: the signing secret rotated,
 * or the filters it was bound to changed) can't be retried into working, so
 * the page restarts at its first page instead (plan §1: "stale cursor
 * (restart at page 1)"). One request at a time: a second press while one is
 * in flight does nothing, so no page is appended twice.
 */
export function useMore<T>(
  first: Page<T>,
  fetchPage: (cursor: KabinetCursor) => Promise<Page<T>>,
  restart: () => void,
) {
  const [items, setItems] = useState<readonly T[]>(first.items);
  const [cursor, setCursor] = useState<KabinetCursor | null>(first.nextCursor);
  const [state, setState] = useState<MoreState>({ kind: "idle" });
  const inFlight = useRef(false);

  const more = async () => {
    if (cursor === null || inFlight.current) return;
    inFlight.current = true;
    setState({ kind: "loading" });
    try {
      const page = await fetchPage(cursor);
      setItems((shown) => [...shown, ...page.items]);
      setCursor(page.nextCursor);
      setState({ kind: "idle" });
    } catch (error) {
      if (codeOf(error) === "INVALID_CURSOR") {
        restart();
        return;
      }
      setState({ kind: "failed" });
    } finally {
      inFlight.current = false;
    }
  };

  return { items, hasMore: cursor !== null, state, more };
}

/** The default restart: the same URL again, whose server render is page 1 for the same filters. */
export const reloadPage = (): void => window.location.reload();
