import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KabinetLayout, { metadata } from "./layout";

/**
 * The cabinet's pages sit behind the same condition as its API (Oleksii,
 * Q0): no sign-in available → 404, never a page. And never indexed.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const isNotFound = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  String((error as { digest?: unknown }).digest).includes("404");

describe("/kabinet layout", () => {
  it("answers 404 while sign-in is unavailable (no BETTER_AUTH_* configured)", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    let thrown: unknown;
    try {
      KabinetLayout({ children: <p>inside</p> });
    } catch (error) {
      thrown = error;
    }
    expect(isNotFound(thrown)).toBe(true);
  });

  it("answers 404 in production, which has no email sender yet, even when configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "https://example.org");
    let thrown: unknown;
    try {
      KabinetLayout({ children: <p>inside</p> });
    } catch (error) {
      thrown = error;
    }
    expect(isNotFound(thrown)).toBe(true);
  });

  it("renders its pages once sign-in is available", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    render(KabinetLayout({ children: <p>inside</p> }));
    expect(screen.getByText("inside")).toBeTruthy();
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
