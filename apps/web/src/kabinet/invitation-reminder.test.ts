import { describe, expect, it } from "vitest";
import { invitationReminderOf } from "./invitation-reminder";

describe("invitationReminderOf", () => {
  it("prints a From address carrying $& and $1 literally (review finding 2)", () => {
    expect(
      invitationReminderOf({ kind: "sent", blockCheck: "unknown" }, "a$&$1@example.org"),
    ).toEqual({
      kind: "tell_personally",
      text: "Повідомте притулок особисто: запрошення надіслано з a$&$1@example.org. Якщо листа не видно - хай перевірить вкладку «Промоакції».",
    });
  });
});
