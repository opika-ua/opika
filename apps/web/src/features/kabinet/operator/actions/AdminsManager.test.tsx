import type { RegistryShelterView, ShelterAdminView } from "@opika/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminsManager } from "./AdminsManager";
import { apiError, lostAnswer, registryView, renderWithActions, SHELTER_ID } from "./test-fixtures";

/**
 * S4's admins: remove (asked first), resend, invite another, each showing
 * what became of the email. Strings transcribed from `rui-copy-uk.md` §1.3,
 * §2.3, §2.4 and §3.3 (and K1's «Електронна пошта», K4's «Скасувати»,
 * «Закрити», «Схоже, це не адреса пошти.»).
 */

const NOW = new Date("2026-10-17T12:00:00Z");
const OLENA: ShelterAdminView = {
  id: "a1000000-0000-4000-8000-000000000001" as ShelterAdminView["id"],
  name: "Олена",
  email: "olena@example.org",
  invite: { status: "accepted" },
};
const ANDRII: ShelterAdminView = {
  id: "a1000000-0000-4000-8000-000000000002" as ShelterAdminView["id"],
  name: "Андрій",
  email: "andrii@example.org",
  invite: { status: "pending", expiresAt: new Date("2026-10-20T09:00:00Z") },
};
const IRYNA: ShelterAdminView = {
  id: "a1000000-0000-4000-8000-000000000003" as ShelterAdminView["id"],
  name: "Ірина",
  email: "iryna@example.org",
  invite: { status: "pending", expiresAt: new Date("2026-10-10T09:00:00Z") },
};

const withAdmins = (admins: ShelterAdminView[]): RegistryShelterView => registryView({ admins });
const row = (name: string) => {
  const item = screen.getByText(name, { selector: "span" }).closest("li");
  if (item === null) throw new Error(`no row for ${name}`);
  return within(item);
};
const REMINDER = "Повідомте притулок особисто: запрошення надіслано з hello@example.org.";

describe("the list", () => {
  it("shows each admin with what is true of their access; resend only for an invitation", () => {
    renderWithActions(<AdminsManager now={NOW} />, { view: withAdmins([OLENA, ANDRII, IRYNA]) });
    expect(row("Олена").getByText("olena@example.org · Має доступ")).toBeTruthy();
    expect(
      row("Андрій").getByText(
        /^andrii@example\.org · Запрошено · посилання діє до 20 жовтня 2026 р\.?$/,
      ),
    ).toBeTruthy();
    expect(
      row("Ірина").getByText("iryna@example.org · Запрошено · посилання вже не діє"),
    ).toBeTruthy();
    expect(row("Олена").queryByRole("button", { name: "Надіслати ще раз" })).toBeNull();
    expect(row("Андрій").getByRole("button", { name: "Надіслати ще раз" })).toBeTruthy();
    expect(row("Ірина").getByRole("button", { name: "Надіслати ще раз" })).toBeTruthy();
  });

  /**
   * A shelter can have no admin (create's race, or the last one removed), and
   * R-UI 2's S2 sends the operator here for exactly that: «Інших
   * адміністраторів можна запросити зі сторінки притулку.» and «Притулок
   * створено, але без адміністратора. Запросіть його зі сторінки притулку.»
   */
  it("no admin and no invitation: says so, and offers «Запросити адміністратора» (N7)", async () => {
    const invite = vi.fn(async () => ({
      id: "a1000000-0000-4000-8000-000000000009",
      name: "Марія",
      email: "maria@example.org",
      invite: { status: "pending", expiresAt: new Date("2026-10-20T12:00:00Z") },
      invitationEmail: { kind: "sent", blockCheck: "clear" },
      invitationReminder: null,
    }));
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([]),
      client: { admins: { invite } },
    });
    expect(screen.getByText("Адміністраторів немає")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Імʼя"), "Марія");
    await userEvent.type(screen.getByLabelText("Електронна пошта"), "maria@example.org");
    expect(screen.queryByRole("button", { name: "Запросити ще одного" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Запросити адміністратора" }));
    expect(invite).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      name: "Марія",
      email: "maria@example.org",
    });
  });

  it("each row's buttons are described by that admin's name", () => {
    renderWithActions(<AdminsManager now={NOW} />, { view: withAdmins([OLENA, ANDRII]) });
    const remove = row("Андрій").getByRole("button", { name: "Прибрати" });
    expect(
      document.getElementById(remove.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Андрій");
  });
});

describe("remove asks first", () => {
  it("«Скасувати» sends nothing; confirming removes, and the row is gone after the re-read", async () => {
    const remove = vi.fn(async () => ({}));
    const { reread } = renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([OLENA, ANDRII]),
      client: { admins: { remove } },
      reread: async () => withAdmins([ANDRII]),
    });
    await userEvent.click(row("Олена").getByRole("button", { name: "Прибрати" }));
    const dialog = within(
      screen.getByRole("dialog", {
        name: "Закрити доступ? Олена більше не зможе входити в кабінет.",
      }),
    );
    expect(
      dialog.getByText("Доступ до кабінету закриється одразу, усі сеанси завершаться."),
    ).toBeTruthy();
    await userEvent.click(dialog.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(row("Олена").getByRole("button", { name: "Прибрати" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Прибрати" }),
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID, adminId: OLENA.id });
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Олена", { selector: "span" })).toBeNull();
    await waitFor(() => expect(document.activeElement?.tagName).toBe("UL"));
  });

  it("removing the last admin: the list says none, and focus goes to the invite's first field", async () => {
    const remove = vi.fn(async () => ({}));
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([OLENA]),
      client: { admins: { remove } },
      reread: async () => withAdmins([]),
    });
    await userEvent.click(row("Олена").getByRole("button", { name: "Прибрати" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Прибрати" }),
    );
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.getByText("Адміністраторів немає")).toBeTruthy();
    // The last admin removed: nobody is left to be "another" to (N7).
    expect(screen.getByRole("button", { name: "Запросити адміністратора" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Імʼя")));
  });

  it("Escape and ✕ close the question too", async () => {
    const remove = vi.fn();
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([OLENA]),
      client: { admins: { remove } },
    });
    await userEvent.click(row("Олена").getByRole("button", { name: "Прибрати" }));
    // Esc on a native modal <dialog> is the browser's close; happy-dom doesn't send it.
    act(() => (screen.getByRole("dialog") as HTMLDialogElement).close());
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(row("Олена").getByRole("button", { name: "Прибрати" }));
    await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("already gone (NOT_FOUND): re-reads and says the access is already closed", async () => {
    const { reread } = renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([OLENA]),
      client: {
        admins: {
          remove: vi.fn(async () => {
            throw apiError("NOT_FOUND");
          }),
        },
      },
      reread: async () => withAdmins([]),
    });
    await userEvent.click(row("Олена").getByRole("button", { name: "Прибрати" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Прибрати" }),
    );
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("Цей доступ уже закрито.");
    expect(screen.getByText("Адміністраторів немає")).toBeTruthy();
  });
});

describe("resend shows what became of the email", () => {
  it.each([
    [
      { kind: "sent", blockCheck: "clear" },
      { kind: "tell_personally", text: REMINDER },
      "Запрошення надіслано на andrii@example.org.",
      REMINDER,
    ],
    [
      { kind: "sent", blockCheck: "unknown" },
      { kind: "tell_personally", text: REMINDER },
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
      REMINDER,
    ],
    [
      { kind: "blocked", reason: "hard_bounce" },
      null,
      "Запрошення не надіслано: адреса не існує або не приймає пошту.",
      null,
    ],
    [
      { kind: "failed", reason: "provider_error" },
      null,
      "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
      null,
    ],
  ] as const)("%j", async (invitationEmail, invitationReminder, said, reminder) => {
    const resendInvite = vi.fn(async () => ({ invitationEmail, invitationReminder }));
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([ANDRII]),
      client: { admins: { resendInvite } },
    });
    await userEvent.click(row("Андрій").getByRole("button", { name: "Надіслати ще раз" }));
    expect(resendInvite).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      adminId: ANDRII.id,
    });
    expect(screen.getByRole("status").textContent).toBe(said);
    // The reminder follows a send only (IN-E13).
    expect(screen.queryByText(REMINDER)?.textContent ?? null).toBe(reminder);
  });

  it("an address that meanwhile has a role elsewhere: says which", async () => {
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([ANDRII]),
      client: {
        admins: {
          resendInvite: vi.fn(async () => {
            throw apiError("ADDRESS_HAS_A_ROLE", { reason: "invited_elsewhere" });
          }),
        },
      },
    });
    await userEvent.click(row("Андрій").getByRole("button", { name: "Надіслати ще раз" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "На цю адресу вже надіслано чинне запрошення до іншого притулку.",
    );
  });

  it("a lost resend: done if the re-read shows a later expiry, and nothing said about the email", async () => {
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([ANDRII]),
      client: {
        admins: {
          resendInvite: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () =>
        withAdmins([
          { ...ANDRII, invite: { status: "pending", expiresAt: new Date("2026-10-20T12:00:00Z") } },
        ]),
    });
    await userEvent.click(row("Андрій").getByRole("button", { name: "Надіслати ще раз" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("invite (a shelter with no admin yet, so the button reads «Запросити адміністратора»)", () => {
  const nameField = () => screen.getByLabelText("Імʼя");
  const emailField = () => screen.getByLabelText("Електронна пошта");
  const submit = () => screen.getByRole("button", { name: "Запросити адміністратора" });

  it("both fields are required, and the address must look like one; nothing is sent until they are", async () => {
    const invite = vi.fn();
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([]),
      client: { admins: { invite } },
    });
    await userEvent.click(submit());
    expect(screen.getAllByText("Це поле потрібне.")).toHaveLength(2);
    expect(document.activeElement).toBe(nameField());
    await userEvent.type(nameField(), "Марія");
    await userEvent.type(emailField(), "maria-at-example");
    await userEvent.click(submit());
    expect(screen.getByText("Схоже, це не адреса пошти.")).toBeTruthy();
    expect(emailField().getAttribute("aria-invalid")).toBe("true");
    expect(invite).not.toHaveBeenCalled();
  });

  it("sends the trimmed name and address, clears the form, and shows the email outcome and the reminder", async () => {
    const invite = vi.fn(async () => ({
      id: "a1000000-0000-4000-8000-000000000009",
      name: "Марія",
      email: "maria@example.org",
      invite: { status: "pending", expiresAt: new Date("2026-10-20T12:00:00Z") },
      invitationEmail: { kind: "sent", blockCheck: "clear" },
      invitationReminder: { kind: "tell_personally", text: REMINDER },
    }));
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([]),
      client: { admins: { invite } },
    });
    await userEvent.type(nameField(), "  Марія ");
    await userEvent.type(emailField(), " maria@example.org  ");
    await userEvent.click(submit());
    expect(invite).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      name: "Марія",
      email: "maria@example.org",
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Запрошення надіслано на maria@example.org.",
    );
    expect(screen.getByText(REMINDER)).toBeTruthy();
    expect((nameField() as HTMLInputElement).value).toBe("");
    expect((emailField() as HTMLInputElement).value).toBe("");
  });

  it("an address with a role elsewhere: the reason, at the address field", async () => {
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([]),
      client: {
        admins: {
          invite: vi.fn(async () => {
            throw apiError("ADDRESS_HAS_A_ROLE", { reason: "operator" });
          }),
        },
      },
    });
    await userEvent.type(nameField(), "Марія");
    await userEvent.type(emailField(), "maria@example.org");
    await userEvent.click(submit());
    expect(
      screen.getByText("Це адреса адміністратора сайту. Для притулку потрібна інша."),
    ).toBeTruthy();
    expect(emailField().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(emailField());
  });

  it("a lost invite the re-read shows done: the form clears, and no email outcome is claimed", async () => {
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([]),
      client: {
        admins: {
          invite: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () =>
        withAdmins([
          {
            id: "a1000000-0000-4000-8000-000000000009" as ShelterAdminView["id"],
            name: "Марія",
            email: "maria@example.org",
            invite: { status: "pending", expiresAt: new Date("2026-10-20T12:00:00Z") },
          },
        ]),
    });
    await userEvent.type(nameField(), "Марія");
    await userEvent.type(emailField(), "Maria@Example.org");
    await userEvent.click(submit());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    expect((emailField() as HTMLInputElement).value).toBe("");
    expect(row("Марія")).toBeTruthy();
  });

  it("a lost invite the re-read shows not done: his failure text, and the form keeps what was typed", async () => {
    renderWithActions(<AdminsManager now={NOW} />, {
      view: withAdmins([]),
      client: {
        admins: {
          invite: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
    });
    await userEvent.type(nameField(), "Марія");
    await userEvent.type(emailField(), "maria@example.org");
    await userEvent.click(submit());
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect((emailField() as HTMLInputElement).value).toBe("maria@example.org");
  });
});
