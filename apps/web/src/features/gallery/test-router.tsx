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

export function WithMockRouter({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={mockAppRouter()}>{children}</AppRouterContext.Provider>;
}
