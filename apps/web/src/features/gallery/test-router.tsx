import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactNode } from "react";
import { vi } from "vitest";

/**
 * `FilterSheet`/`ReplaceNav` call `useRouter()` (`next/navigation`), which
 * throws "invariant expected app router to be mounted" outside a real
 * Next.js render tree — RTL's plain `render()` has no App Router context to
 * provide. This is the minimal stand-in: enough of `AppRouterInstance` for
 * `router.replace` to be callable and assertable, not a full router.
 */
export function mockAppRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    bfcacheId: "test",
  };
}

/**
 * Accepts an external router (from `mockAppRouter()`) so a caller can keep
 * a reference and assert on it — `page.test.tsx` doesn't need that and
 * creates its own internally by omitting `router`; `FilterSheet.test.tsx`
 * does need it, to assert what `router.replace` was actually called with.
 */
export function WithMockRouter({
  children,
  router = mockAppRouter(),
}: {
  children: ReactNode;
  router?: ReturnType<typeof mockAppRouter>;
}) {
  return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
}
