import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { dismissApprovedBanner } = await import("./dismiss-approved");
const { APPROVED_DISMISSED_COOKIE, approvedDismissedFor } = await import("./approved-dismissal");

const SHELTER = "51000000-0000-4000-8000-000000000001";

beforeEach(() => {
  set.mockClear();
  revalidatePath.mockClear();
});

describe("«Закрити» on «Притулок схвалено» (owner, 2026-11-18)", () => {
  it("records this shelter's dismissal in a kabinet-only HttpOnly cookie and re-renders the list", async () => {
    await dismissApprovedBanner(SHELTER);
    expect(set).toHaveBeenCalledWith(APPROVED_DISMISSED_COOKIE, SHELTER, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/kabinet",
      maxAge: 365 * 24 * 60 * 60,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/kabinet/tvaryny");
  });

  it("writes nothing for a value that is not a shelter id", async () => {
    await dismissApprovedBanner("x; Path=/");
    expect(set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a dismissal counts only for the shelter it names", () => {
    expect(approvedDismissedFor(SHELTER, SHELTER)).toBe(true);
    expect(approvedDismissedFor(SHELTER, "51000000-0000-4000-8000-000000000002")).toBe(false);
    expect(approvedDismissedFor(SHELTER, undefined)).toBe(false);
  });
});
