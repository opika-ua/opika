import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Testing Library only auto-cleans when Vitest's globals are injected, and this
 * repo runs without `globals: true`. Unmounting explicitly keeps each test's
 * queries scoped to its own render instead of matching a leftover tree from
 * the previous one — which shows up as a passing test that asserts nothing
 * about the component it names.
 */
afterEach(cleanup);
