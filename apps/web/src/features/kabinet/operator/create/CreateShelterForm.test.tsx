import {
  type CreatedShelterView,
  type EmailSendOutcome,
  type InvitationReminder,
  registrySheltersContract,
} from "@opika/contracts";
import { ORPCError } from "@orpc/client";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { CreatedShelter } from "./CreatedShelter";
import { CreateShelterForm } from "./CreateShelterForm";
import type { RegistryCreateClient } from "./registry-create-client";

/**
 * S2, behaviour only (Oleksii, 2026-10-17: "Test logic, not looks"). Every
 * string asserted or looked up is his Ukrainian transcribed from
 * `rui-copy-uk.md` (§2) or an older final key, never read from `uk.ts`. The
 * API is a fake client with the picked browser client's shape; the server's
 * side of each answer is `src/kabinet/registry-create-screen.test.ts`.
 */

const SHELTER_ID = "51000000-0000-4000-8000-0000000000aa";
const ADMIN_ID = "33000000-0000-4000-8000-0000000000bb";
const CITY = { id: "c1000000-0000-4000-8000-000000000001", name: "Вишгород" };
/** 10:00 in Kyiv. */
const NOW = new Date("2026-10-13T07:00:00.000Z");
const createInputSchema = registrySheltersContract.create["~orpc"].inputSchema as z.ZodType;

const createdView = (
  email: EmailSendOutcome | null,
  reminder: InvitationReminder = null,
): CreatedShelterView =>
  ({
    id: SHELTER_ID,
    displayName: "Лапа Вишгорода",
    verification: {
      status: "pending",
      submittedAt: NOW,
      evidence: { items: [], submittedAt: NOW },
    },
    admins:
      email === null
        ? []
        : [
            {
              id: ADMIN_ID,
              name: "Ірина",
              email: "iryna@example.org",
              invite: { status: "pending", expiresAt: new Date("2026-10-16T08:04:00.000Z") },
            },
          ],
    firstAdminInvitationEmail: email,
    firstAdminInvitationReminder: reminder,
  }) as unknown as CreatedShelterView;

const TELL =
  "Повідомте притулок особисто: запрошення надіслано з noreply@mail.example.org. Якщо листа не видно — хай перевірить вкладку «Промоакції».";

function fakeClient(create: (input: unknown) => Promise<CreatedShelterView>) {
  const fns = {
    create: vi.fn(create),
    resendInvite: vi.fn(async () => ({
      invitationEmail: { kind: "sent", blockCheck: "clear" } as EmailSendOutcome,
      invitationReminder: { kind: "tell_personally", text: TELL } as InvitationReminder,
    })),
  };
  const client = {
    registry: { shelters: { create: fns.create }, admins: { resendInvite: fns.resendInvite } },
  } as unknown as RegistryCreateClient;
  return { fns, client };
}

function renderForm(create: (input: unknown) => Promise<CreatedShelterView>, now: Date = NOW) {
  const { fns, client } = fakeClient(create);
  render(<CreateShelterForm cities={[CITY]} client={client} now={() => now} />);
  return fns;
}

/** No pause between keystrokes: the fill is long, and nothing here depends on typing speed. */
const user = () => userEvent.setup({ delay: null });

/** The rehearsal shelter (RU-B5): an unregistered initiative, a site visit and two references. */
async function fillInitiative(visitedOn = "2026-10-12") {
  const u = user();
  await u.type(screen.getByLabelText("Назва притулку"), "Лапа Вишгорода");
  await u.type(screen.getByLabelText("Опис притулку"), "Волонтери з Вишгорода.");
  await u.selectOptions(screen.getByLabelText("Місто"), "Вишгород");
  await u.type(screen.getByLabelText("Вулиця, будинок"), "вул. Мечникова, 4");
  await u.type(screen.getByLabelText("Координати"), "50.5843, 30.4890");
  await u.click(screen.getByRole("radio", { name: "Ініціатива без реєстрації" }));
  await u.type(screen.getByLabelText("Контактна особа"), "Ірина Коваль");
  const contacts = within(screen.getByRole("region", { name: "Контакти" }));
  await u.type(contacts.getByLabelText(/^Телефон/), "+380 50 111-22-33");

  await u.selectOptions(screen.getByLabelText("Тип доказу"), "Візит на місце");
  await u.click(screen.getByRole("button", { name: "+ Додати доказ" }));
  const visit = within(screen.getByRole("group", { name: "Візит на місце" }));
  fireEvent.change(visit.getByLabelText("Дата візиту"), { target: { value: visitedOn } });
  await u.type(visit.getByLabelText("Нотатка"), "Оглянув вольєри.");

  for (const [n, phone] of [
    [0, "+380 50 555 21 08"],
    [1, "+380 67 000 11 22"],
  ] as const) {
    await u.selectOptions(screen.getByLabelText("Тип доказу"), "Рекомендація");
    await u.click(screen.getByRole("button", { name: "+ Додати доказ" }));
    const ref = within(screen.getAllByRole("group", { name: "Рекомендація" })[n] as HTMLElement);
    await u.type(ref.getByLabelText("Хто"), `Рекомендація ${n + 1}`);
    await u.type(ref.getByLabelText("Телефон"), phone);
    await u.selectOptions(ref.getByLabelText("Ким доводиться притулку"), "Ветклініка");
  }

  await u.type(screen.getByLabelText("Імʼя"), "Ірина");
  await u.type(screen.getByLabelText("Електронна пошта"), "iryna@example.org");
  return u;
}

const submit = () => screen.getByRole("button", { name: "Створити й надіслати запрошення" });

describe("creating a shelter", () => {
  it("sends one request whose input the contract accepts, a site visit with no visitor and no document", async () => {
    const fns = renderForm(async () => createdView({ kind: "sent", blockCheck: "clear" }, null));
    const u = await fillInitiative();
    await u.click(submit());
    expect(fns.create).toHaveBeenCalledTimes(1);
    const input = fns.create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(createInputSchema.safeParse(input).success).toBe(true);
    expect(input.legalEntity).toEqual({
      kind: "unregistered_initiative",
      contactPersonName: "Ірина Коваль",
    });
    expect(input.evidence).toEqual([
      { kind: "site_visit", visitedOn: "2026-10-12", notes: "Оглянув вольєри." },
      {
        kind: "reference_contact",
        name: "Рекомендація 1",
        channel: { kind: "phone", e164: "+380505552108" },
        relationship: "veterinary_clinic",
      },
      {
        kind: "reference_contact",
        name: "Рекомендація 2",
        channel: { kind: "phone", e164: "+380670001122" },
        relationship: "veterinary_clinic",
      },
    ]);
    expect(JSON.stringify(input)).not.toMatch(/documentKey|visitedBy/);
  });

  it("shows «Очікує», the fact, the outcome, the expiry and the reminder, with resend and open", async () => {
    renderForm(async () =>
      createdView({ kind: "sent", blockCheck: "clear" }, { kind: "tell_personally", text: TELL }),
    );
    const u = await fillInitiative();
    await u.click(submit());
    const fact = await screen.findByRole("heading", { name: "Притулок створено." });
    expect(document.activeElement).toBe(fact);
    expect(screen.getByText("Очікує")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe(
      "Запрошення надіслано на iryna@example.org.",
    );
    // 08:04 UTC on the 16th is 11:04 in Kyiv.
    expect(screen.getByText("Посилання діє до 16 жовтня, 11:04.")).toBeDefined();
    expect(screen.getByText(TELL)).toBeDefined();
    expect(screen.getByRole("button", { name: "Надіслати ще раз" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Відкрити притулок" }).getAttribute("href")).toBe(
      `/kabinet/prytulky/${SHELTER_ID}`,
    );
  });

  it.each<[string, EmailSendOutcome, string, boolean]>([
    [
      "sent, unchecked",
      { kind: "sent", blockCheck: "unknown" },
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
      true,
    ],
    [
      "blocked: unsubscribed",
      { kind: "blocked", reason: "unsubscribed" },
      "Запрошення не надіслано: людина з цієї адреси відписалася від листів.",
      false,
    ],
    [
      "blocked: hard bounce",
      { kind: "blocked", reason: "hard_bounce" },
      "Запрошення не надіслано: адреса не існує або не приймає пошту.",
      false,
    ],
    [
      "blocked: spam complaint",
      { kind: "blocked", reason: "spam_complaint" },
      "Запрошення не надіслано: на попередній лист з цієї адреси поскаржилися як на спам.",
      false,
    ],
    [
      "blocked: by hand",
      { kind: "blocked", reason: "admin_blocked" },
      "Запрошення не надіслано: адресу заблоковано вручну в поштовому сервісі.",
      false,
    ],
    [
      "failed: provider error",
      { kind: "failed", reason: "provider_error" },
      "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
      false,
    ],
    [
      "failed: copy pending",
      { kind: "failed", reason: "copy_pending" },
      "Запрошення не надіслано: текст листа ще не готовий.",
      false,
    ],
  ])(
    "outcome %s: its sentence, resend still offered, the expiry only after a send",
    async (_c, outcome, sentence, sent) => {
      renderForm(async () => createdView(outcome));
      const u = await fillInitiative();
      await u.click(submit());
      await screen.findByRole("heading", { name: "Притулок створено." });
      expect(screen.getByRole("status").textContent).toBe(sentence);
      expect(screen.getByRole("button", { name: "Надіслати ще раз" })).toBeDefined();
      expect(screen.queryByText(/^Посилання діє до /) !== null).toBe(sent);
    },
  );

  it("no admin (a race took the address): created without one, no resend, the shelter page offered", async () => {
    renderForm(async () => createdView(null));
    const u = await fillInitiative();
    await u.click(submit());
    expect(
      await screen.findByRole("heading", {
        name: "Притулок створено, але без адміністратора. Запросіть його зі сторінки притулку.",
      }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Надіслати ще раз" })).toBeNull();
    expect(screen.getByRole("link", { name: "Відкрити притулок" })).toBeDefined();
  });

  it("resends to the first admin and shows the new outcome", async () => {
    const fns = renderForm(async () => createdView({ kind: "failed", reason: "provider_error" }));
    const u = await fillInitiative();
    await u.click(submit());
    await u.click(await screen.findByRole("button", { name: "Надіслати ще раз" }));
    expect(fns.resendInvite).toHaveBeenCalledTimes(1);
    expect(fns.resendInvite).toHaveBeenCalledWith({ shelterId: SHELTER_ID, adminId: ADMIN_ID });
    expect(screen.getByRole("status").textContent).toBe(
      "Запрошення надіслано на iryna@example.org.",
    );
    expect(screen.getByText(TELL)).toBeDefined();
  });

  it("after a resend the expiry line goes: the resend's answer carries no new expiry, so none is guessed (RU2-T7)", async () => {
    const { fns, client } = fakeClient(async () => createdView(null));
    fns.resendInvite.mockResolvedValueOnce({
      invitationEmail: { kind: "sent", blockCheck: "unknown" },
      invitationReminder: { kind: "tell_personally", text: TELL },
    });
    render(
      <CreatedShelter view={createdView({ kind: "sent", blockCheck: "clear" })} client={client} />,
    );
    expect(screen.getByText("Посилання діє до 16 жовтня, 11:04.")).toBeDefined();
    await user().click(screen.getByRole("button", { name: "Надіслати ще раз" }));
    // Still a send, so only the missing expiry can keep the line away.
    expect(
      await screen.findByText(
        "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
      ),
    ).toBeDefined();
    expect(screen.queryByText(/^Посилання діє до /)).toBeNull();
  });

  it("a resend refused because the address meanwhile has a role elsewhere says so", async () => {
    const fns = renderForm(async () => createdView({ kind: "sent", blockCheck: "clear" }));
    fns.resendInvite.mockRejectedValueOnce(
      new ORPCError("ADDRESS_HAS_A_ROLE", {
        status: 409,
        data: { reason: "invited_elsewhere" },
        defined: true,
      }),
    );
    const u = await fillInitiative();
    await u.click(submit());
    await u.click(await screen.findByRole("button", { name: "Надіслати ще раз" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "На цю адресу вже надіслано чинне запрошення до іншого притулку.",
    );
  });
});

describe("one request only", () => {
  it("a second press while the first is in flight sends nothing, and the button says «Збереження…»", async () => {
    let finish: (view: CreatedShelterView) => void = () => {};
    const fns = renderForm(
      () =>
        new Promise<CreatedShelterView>((resolve) => {
          finish = resolve;
        }),
    );
    const u = await fillInitiative();
    await u.click(submit());
    // K4's word for a write in flight (`kabinet.profileEdit.state.saving`, K4 copy sheet).
    const busy = screen.getByRole("button", { name: "Збереження…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("button", { name: "Створити й надіслати запрошення" })).toBeNull();
    await u.click(busy);
    fireEvent.submit(busy.closest("form") as HTMLFormElement);
    expect(fns.create).toHaveBeenCalledTimes(1);
    await act(async () => finish(createdView({ kind: "sent", blockCheck: "clear" })));
    expect(await screen.findByRole("heading", { name: "Притулок створено." })).toBeDefined();
    expect(fns.create).toHaveBeenCalledTimes(1);
  });

  it("a second press of «Надіслати ще раз» while the first resend is in flight sends nothing", async () => {
    const { fns, client } = fakeClient(async () => createdView(null));
    let finish: (value: Awaited<ReturnType<typeof fns.resendInvite>>) => void = () => {};
    fns.resendInvite.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <CreatedShelter
        view={createdView({ kind: "failed", reason: "provider_error" })}
        client={client}
      />,
    );
    const resend = screen.getByRole("button", { name: "Надіслати ще раз" });
    // Two presses before React re-renders, then a third after: only the ref can stop the second.
    fireEvent.click(resend);
    fireEvent.click(resend);
    await user().click(resend);
    expect(fns.resendInvite).toHaveBeenCalledTimes(1);
    expect(resend.getAttribute("aria-busy")).toBe("true");
    await act(async () =>
      finish({
        invitationEmail: { kind: "sent", blockCheck: "clear" },
        invitationReminder: { kind: "tell_personally", text: TELL },
      }),
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Запрошення надіслано на iryna@example.org.",
    );
    expect(resend.getAttribute("aria-busy")).toBeNull();
    expect(fns.resendInvite).toHaveBeenCalledTimes(1);
  });

  it("a lost answer is never retried: one request, and the list first", async () => {
    const fns = renderForm(async () => {
      throw new TypeError("Failed to fetch");
    });
    await fillInitiative();
    // Fake timers from the press on: a retry scheduled by any delay, however
    // long, would run inside the minute advanced below.
    vi.useFakeTimers();
    try {
      fireEvent.click(submit());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByRole("alert").textContent).toBe(
        "Відповідь не надійшла. Притулок міг створитися — перевірте список, перш ніж пробувати знову.",
      );
      expect(fns.create).toHaveBeenCalledTimes(1);
      // The form stays, so the operator can try again once the list is checked.
      expect(submit().getAttribute("aria-busy")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refusals", () => {
  it.each<[string, unknown, string]>([
    [
      "the address belongs to a shelter",
      new ORPCError("ADDRESS_HAS_A_ROLE", {
        status: 409,
        data: { reason: "shelter_admin" },
        defined: true,
      }),
      "Ця адреса вже має доступ до іншого притулку.",
    ],
    [
      "the address is an operator's",
      new ORPCError("ADDRESS_HAS_A_ROLE", {
        status: 409,
        data: { reason: "operator" },
        defined: true,
      }),
      "Це адреса адміністратора сайту. Для притулку потрібна інша.",
    ],
    [
      "the address has a live invitation elsewhere",
      new ORPCError("ADDRESS_HAS_A_ROLE", {
        status: 409,
        data: { reason: "invited_elsewhere" },
        defined: true,
      }),
      "На цю адресу вже надіслано чинне запрошення до іншого притулку.",
    ],
    [
      "the site visit is in the future (by the server's clock)",
      new ORPCError("INVALID_EVIDENCE", {
        status: 422,
        data: { reason: "site_visit_in_future" },
        defined: true,
      }),
      "Дата візиту не може бути в майбутньому.",
    ],
    [
      "the city is unknown",
      new ORPCError("BAD_REQUEST", { status: 400, message: "Unknown city" }),
      "Такого міста немає у списку.",
    ],
    [
      "the input refused for anything but the name's length",
      new ORPCError("BAD_REQUEST", {
        status: 400,
        message: "Input validation failed",
        data: { issues: [{ path: ["contact"], message: "Invalid input" }] },
      }),
      "Не вдалося створити притулок. Спробуйте ще раз.",
    ],
    [
      "anything else",
      new ORPCError("FORBIDDEN", { status: 403 }),
      "Не вдалося створити притулок. Спробуйте ще раз.",
    ],
  ])("%s", async (_case, error, sentence) => {
    const fns = renderForm(async () => {
      throw error;
    });
    const u = await fillInitiative();
    await u.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe(sentence);
    expect(fns.create).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Назва притулку")).toHaveProperty("value", "Лапа Вишгорода");
  });

  // RUI4-F2: his sentence, transcribed from his answer and filled for 100; the issue message is the server's.
  it("the server refusing the name for its length: his sentence on the name field, not the plain failure", async () => {
    const fns = renderForm(async () => {
      throw new ORPCError("BAD_REQUEST", {
        status: 400,
        message: "Input validation failed",
        data: {
          issues: [
            {
              path: ["displayName"],
              message: "Shelter display name is longer than 100 characters",
            },
          ],
        },
      });
    });
    const u = await fillInitiative();
    await u.click(submit());
    expect(await screen.findByText("Назва довша за 100 символів.")).toBeDefined();
    const name = screen.getByLabelText("Назва притулку");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(screen.queryByText("Не вдалося створити притулок. Спробуйте ще раз.")).toBeNull();
    expect(fns.create).toHaveBeenCalledTimes(1);
  });
});

describe("checked before anything is sent", () => {
  it("an empty form sends nothing, marks the required fields and moves focus to the first", async () => {
    const fns = renderForm(async () => createdView(null));
    await user().click(submit());
    expect(fns.create).not.toHaveBeenCalled();
    const name = screen.getByLabelText("Назва притулку");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(screen.getAllByText("Це поле потрібне.").length).toBeGreaterThan(5);
    expect(screen.getByText("Залиште хоча б один спосіб звʼязку.")).toBeDefined();
  });

  it("a site visit dated tomorrow in Kyiv is refused on the field; today just after Kyiv's midnight goes", async () => {
    const justAfterKyivMidnight = new Date("2026-10-07T22:30:00.000Z");
    const fns = renderForm(async () => createdView(null), justAfterKyivMidnight);
    const u = await fillInitiative("2026-10-09");
    await u.click(submit());
    expect(fns.create).not.toHaveBeenCalled();
    const visit = within(screen.getByRole("group", { name: "Візит на місце" }));
    expect(visit.getByText("Дата візиту не може бути в майбутньому.")).toBeDefined();
    expect(document.activeElement).toBe(visit.getByLabelText("Дата візиту"));

    fireEvent.change(visit.getByLabelText("Дата візиту"), { target: { value: "2026-10-08" } });
    await u.click(submit());
    expect(fns.create).toHaveBeenCalledTimes(1);
  });

  // RUI4-F2: his sentence, transcribed from his answer ("«Назва довша за {max} символів.»"), for 100.
  it("a name over 100 characters is refused on the field and kept whole; 100, spaces aside, goes", async () => {
    const fns = renderForm(async () => createdView(null));
    const u = await fillInitiative();
    const name = screen.getByLabelText("Назва притулку") as HTMLInputElement;
    await u.clear(name);
    await u.click(name);
    await u.paste("а".repeat(101));
    // Nothing cut the pasted name short.
    expect(name.value).toBe("а".repeat(101));
    await u.click(submit());
    expect(fns.create).not.toHaveBeenCalled();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(screen.getByText("Назва довша за 100 символів.")).toBeDefined();

    await u.clear(name);
    await u.click(name);
    await u.paste(`  ${"а".repeat(100)} `);
    await u.click(submit());
    expect(fns.create).toHaveBeenCalledTimes(1);
    expect(fns.create.mock.calls[0]?.[0]).toMatchObject({ displayName: "а".repeat(100) });
    expect(createInputSchema.safeParse(fns.create.mock.calls[0]?.[0]).success).toBe(true);
  });

  it("the coordinates in a shape it can't read get their own message", async () => {
    const fns = renderForm(async () => createdView(null));
    const u = await fillInitiative();
    await u.clear(screen.getByLabelText("Координати"));
    await u.type(screen.getByLabelText("Координати"), "50,4501 30,5234");
    await u.click(submit());
    expect(fns.create).not.toHaveBeenCalled();
    expect(
      screen.getByText("Вкажіть координати як «широта, довгота», наприклад «50.4501, 30.5234»."),
    ).toBeDefined();
  });
});

describe("what happens next", () => {
  const steps = () =>
    within(screen.getByRole("complementary", { name: "Що буде далі" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);

  it("names the first admin in step 2, and leaves the step out until a name is typed", async () => {
    renderForm(async () => createdView(null));
    expect(steps()).toEqual([
      "Притулок зʼявиться у списку зі статусом «Очікує».",
      "Тварин притулку не буде в галереї, доки ви не схвалите перевірку.",
    ]);
    await user().type(screen.getByLabelText("Імʼя"), "Ірина");
    expect(steps()).toEqual([
      "Притулок зʼявиться у списку зі статусом «Очікує».",
      "Ірина отримає лист для входу. Посилання діє 72 години, його можна надіслати ще раз.",
      "Тварин притулку не буде в галереї, доки ви не схвалите перевірку.",
    ]);
  });
});

describe("the evidence editor", () => {
  it("offers the four document-free kinds only, adds a card of the picked kind, and removes it", async () => {
    renderForm(async () => createdView(null));
    const u = user();
    const picker = screen.getByLabelText("Тип доказу");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Реєстрація · ЄДРПОУ",
      "Власник банківського рахунку",
      "Рекомендація",
      "Візит на місце",
    ]);
    await u.selectOptions(picker, "Власник банківського рахунку");
    await u.click(screen.getByRole("button", { name: "+ Додати доказ" }));
    const card = screen.getByRole("group", { name: "Власник банківського рахунку" });
    expect(document.activeElement).toBe(within(card).getByLabelText("Власник рахунку"));
    expect(
      within(card).getByText("Документ не додано — для цього типу доказу це дозволено."),
    ).toBeDefined();
    await u.click(within(card).getByRole("button", { name: "Прибрати" }));
    expect(screen.queryByRole("group", { name: "Власник банківського рахунку" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Тип доказу"));
  });

  it("has no visitor field on a site visit: whoever records it is the visitor", async () => {
    renderForm(async () => createdView(null));
    const u = user();
    await u.selectOptions(screen.getByLabelText("Тип доказу"), "Візит на місце");
    await u.click(screen.getByRole("button", { name: "+ Додати доказ" }));
    const card = screen.getByRole("group", { name: "Візит на місце" });
    const labels = [...card.querySelectorAll("input, textarea, select")].map(
      (control) => (control as HTMLInputElement).labels?.[0]?.textContent,
    );
    expect(labels).toEqual(["Дата візиту", "Нотатка"]);
  });
});
