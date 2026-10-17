import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SupportEntry } from "./SupportEntry";
import { apiError, lostAnswer, renderWithActions, SHELTER_ID } from "./test-fixtures";

/**
 * Support mode from S4 (RU-Q5, answer 5): «Переглянути як притулок · лише
 * читання» (transcribed from `rui-copy-uk.md` §3.3) opens a support session
 * and goes to `/kabinet`, where the shelter's cabinet renders read-only.
 */

const button = () => screen.getByRole("button", { name: "Переглянути як притулок · лише читання" });

describe("support entry", () => {
  it("enters support for this shelter, then goes to /kabinet, without reading S4 again", async () => {
    const enter = vi.fn(async () => ({}));
    const { navigate, reread } = renderWithActions(<SupportEntry />, {
      client: { support: { enter } },
    });
    await userEvent.click(button());
    expect(enter).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    // The path, transcribed: the support view is the shelter's own cabinet page.
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/kabinet");
    // With the cookie set, S4 itself would answer 404 to this browser.
    expect(reread).not.toHaveBeenCalled();
  });

  it("a refusal stays on S4 and says so", async () => {
    const { navigate } = renderWithActions(<SupportEntry />, {
      client: {
        support: {
          enter: vi.fn(async () => {
            throw apiError("INTERNAL_SERVER_ERROR");
          }),
        },
      },
    });
    await userEvent.click(button());
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("a lost answer goes to /kabinet too, which alone can tell whether a session opened", async () => {
    const { navigate, reread } = renderWithActions(<SupportEntry />, {
      client: {
        support: {
          enter: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
    });
    await userEvent.click(button());
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/kabinet");
    expect(reread).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
