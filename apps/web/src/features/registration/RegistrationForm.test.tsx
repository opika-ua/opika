import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_VALUES,
  HONEYPOT_NAME,
  type RegistrationAction,
  type RegistrationFormState,
} from "./form-state";
import { RegistrationForm } from "./RegistrationForm";
import { registrationCopy } from "./registration-copy";

const copy = registrationCopy();
const INITIAL: RegistrationFormState = { result: null, values: EMPTY_VALUES, formStamp: "s1" };
/** A refused answer can echo a picked city; the tests start from one so «Далі» can pass. */
const CITY = { id: "c-1", label: "Тестове" };
const READY: RegistrationFormState = {
  ...INITIAL,
  values: {
    ...EMPTY_VALUES,
    name: "Тестовий хвіст",
    city: CITY,
    link: "x.ua",
    contact: "@prytulok_test",
  },
};

afterEach(() => vi.restoreAllMocks());

function renderForm(action: RegistrationAction, initial = READY) {
  return render(
    <RegistrationForm
      action={action}
      searchCities={async () => ({ kind: "too_short" })}
      initial={initial}
      copy={copy}
      headingId="reyestratsiia-title"
    />,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: copy.next }));

/** From whichever step is showing: «Далі» first when step 1 is, then the submit. */
const submit = async () => {
  const onStepOne = screen.queryByRole("button", { name: copy.next });
  if (onStepOne !== null) fireEvent.click(onStepOne);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
  });
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RegistrationForm", () => {
  it("posts every field by name and the stamp", async () => {
    let posted: FormData | null = null;
    renderForm(async (previous, form) => {
      posted = form;
      return previous;
    });
    type(copy.labels.name, "Тестовий хвіст");
    type(copy.labels.link, "instagram.com/prytulok_test");
    type(copy.labels.contact, "@prytulok_test");
    type(copy.labels.email, "olena@example.org");
    await submit();
    await waitFor(() => expect(posted).not.toBeNull());
    const form = posted as unknown as FormData;
    expect(form.get("name")).toBe("Тестовий хвіст");
    expect(form.get("link")).toBe("instagram.com/prytulok_test");
    expect(form.get("email")).toBe("olena@example.org");
    expect(form.get("formStamp")).toBe("s1");
    // Nothing in the form says how it was sent: the server reads the Next-Action header.
    expect(form.has("enhanced")).toBe(false);
    expect(form.get(HONEYPOT_NAME)).toBe("");
  });

  it("every field has its autocomplete, and the address, link and phone their keyboards", () => {
    renderForm(async (previous) => previous);
    const attr = (label: string, name: string) => screen.getByLabelText(label).getAttribute(name);
    expect(attr(copy.labels.name, "autocomplete")).toBe("organization");
    expect(attr(copy.labels.link, "autocomplete")).toBe("url");
    expect(attr(copy.labels.link, "inputmode")).toBe("url");
    expect(attr(copy.labels.contact, "autocomplete")).toBe("tel");
    expect(attr(copy.labels.contact, "inputmode")).toBe("tel");
    expect(attr(copy.labels.email, "autocomplete")).toBe("email");
    expect(attr(copy.labels.email, "inputmode")).toBe("email");
    expect(attr(copy.labels.password, "autocomplete")).toBe("new-password");
    expect(attr(copy.labels.passwordRepeat, "autocomplete")).toBe("new-password");
  });

  it("the adopter contact is the one optional text field, and its label says so", () => {
    renderForm(async (previous) => previous);
    const contact = screen.getByLabelText(copy.labels.contact);
    expect(contact.hasAttribute("required")).toBe(false);
    expect(copy.labels.contact).toContain("необовʼязково");
    for (const label of [copy.labels.name, copy.labels.link, copy.labels.email]) {
      expect(screen.getByLabelText(label).hasAttribute("required")).toBe(true);
    }
  });

  it("the honeypot is out of reach: hidden from assistive tech and the tab order", () => {
    const { container } = renderForm(async (previous) => previous);
    const honeypot = container.querySelector(`input[name="${HONEYPOT_NAME}"]`);
    expect(honeypot?.getAttribute("tabindex")).toBe("-1");
    expect(honeypot?.getAttribute("autocomplete")).toBe("off");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("a refused submit: the summary lists the fields, takes focus, and the typed values stay", async () => {
    renderForm(async (_previous, form) => ({
      result: { kind: "invalid", fields: { link: "link", passwordRepeat: "password_mismatch" } },
      values: { ...EMPTY_VALUES, link: String(form.get("link")) },
      formStamp: "s2",
    }));
    type(copy.labels.link, "x.ua/prytulok");
    type(copy.labels.password, "ялинка-під-вікном");
    await submit();
    const alert = await screen.findByRole("alert");
    // The summary names the fields; each field says its own problem.
    expect(alert.textContent).toContain(copy.labels.link);
    expect(alert.textContent).toContain(copy.labels.passwordRepeat);
    expect(screen.getByText(copy.errors.link)).toBeTruthy();
    expect(screen.getByText(copy.errors.password_mismatch)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((screen.getByLabelText(copy.labels.link) as HTMLInputElement).value).toBe(
      "x.ua/prytulok",
    );
    expect((screen.getByLabelText(copy.labels.password) as HTMLInputElement).value).toBe(
      "ялинка-під-вікном",
    );
    expect(screen.getByLabelText(copy.labels.link).getAttribute("aria-invalid")).toBe("true");
  });

  it("checks the repeated password on blur", () => {
    renderForm(async (previous) => previous);
    type(copy.labels.password, "ялинка-під-вікном");
    type(copy.labels.passwordRepeat, "ялинка-під-вікно");
    fireEvent.blur(screen.getByLabelText(copy.labels.passwordRepeat));
    expect(screen.getByText(copy.errors.password_mismatch)).toBeTruthy();
    expect(screen.getByLabelText(copy.labels.passwordRepeat).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("registered: leaves with a full page load to where the action said", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      hash: "",
      assign,
    } as Location);
    renderForm(async () => ({
      result: { kind: "registered", next: "/kabinet" },
      values: EMPTY_VALUES,
      formStamp: "s2",
    }));
    await submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/kabinet"));
  });

  it("email_taken: says so, with «Увійти» and «Відновити пароль» as plain links", async () => {
    renderForm(async (previous) => ({ ...previous, result: { kind: "email_taken" } }));
    await submit();
    expect(await screen.findByText(copy.emailTaken)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.signIn }).getAttribute("href")).toBe(
      "/kabinet/vkhid",
    );
    expect(screen.getByRole("link", { name: copy.resetPassword }).getAttribute("href")).toBe(
      "/kabinet/vkhid/zabuly",
    );
    expect(copy.signIn).toBe("Увійти");
    expect(copy.resetPassword).toBe("Відновити пароль");
  });

  it("daily_cap: the owner's refusal, with the operator's address", async () => {
    renderForm(async (previous) => ({ ...previous, result: { kind: "daily_cap" } }));
    await submit();
    expect(
      await screen.findByText(
        "Зараз забагато заявок. Спробуйте, будь ласка, завтра або напишіть мені на hello@opika.org.ua.",
      ),
    ).toBeTruthy();
  });

  it("rate_limited and failed each say their sentence", async () => {
    let answer: RegistrationFormState["result"] = { kind: "rate_limited", retryAfterSeconds: 60 };
    renderForm(async (previous) => ({ ...previous, result: answer }));
    await submit();
    expect(await screen.findByText(copy.rateLimited)).toBeTruthy();
    answer = { kind: "failed" };
    await submit();
    expect(await screen.findByText(copy.generic)).toBeTruthy();
  });

  it("the consent links to the rules and to the privacy section", () => {
    renderForm(async (previous) => previous);
    next();
    expect(screen.getByRole("link", { name: copy.consentRules }).getAttribute("href")).toBe(
      "/prytulkam#pravyla",
    );
    expect(screen.getByRole("link", { name: copy.consentPrivacy }).getAttribute("href")).toBe(
      "/pro#dani",
    );
  });
});

describe("RegistrationForm's two steps", () => {
  const action: RegistrationAction = async (previous) => previous;
  const visible = (name: string) => screen.queryByRole("button", { name }) !== null;

  it("starts on step 1: its label, «Далі», and no submit in sight", () => {
    renderForm(action, INITIAL);
    expect(screen.getByRole("heading", { name: copy.steps.one })).toBeTruthy();
    expect(visible(copy.next)).toBe(true);
    expect(visible(copy.submit)).toBe(false);
  });

  it("«Далі» checks step 1 first: 2+ problems list the fields and take focus, no step 2", () => {
    renderForm(action, INITIAL);
    next();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(copy.labels.name);
    expect(alert.textContent).toContain(copy.labels.cityId);
    expect(document.activeElement).toBe(alert);
    expect(visible(copy.submit)).toBe(false);
  });

  it("an empty step-1 field says what goes in it, never the generic line (owner, 2026-11-19)", () => {
    renderForm(action, INITIAL);
    next();
    expect(screen.getByText("Вкажіть назву притулку чи ініціативи.")).toBeTruthy();
    expect(screen.getByText("Оберіть місто зі списку.")).toBeTruthy();
    expect(screen.getByText("Додайте посилання на сайт або сторінку в соцмережі.")).toBeTruthy();
    expect(screen.queryByText(copy.errors.required)).toBeNull();
    expect(screen.getByLabelText(copy.labels.name).getAttribute("aria-invalid")).toBe("true");
  });

  it("one problem: no summary, focus on that field", () => {
    renderForm(action, { ...READY, values: { ...READY.values, link: "" } });
    next();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(copy.requiredBy.link as string)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(copy.labels.link));
  });

  it("an empty contact passes step 1: it is optional (owner, 2026-11-19)", () => {
    renderForm(action, { ...READY, values: { ...READY.values, contact: "" } });
    expect(copy.labels.contact).toBe("Телефон або Telegram для людей · необовʼязково");
    next();
    expect(screen.queryByText(copy.errors.contact)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: copy.steps.two }));
    expect(visible(copy.submit)).toBe(true);
  });

  it("a contact that is neither a phone nor a Telegram name stops at step 1", () => {
    renderForm(action);
    type(copy.labels.contact, "0671234");
    next();
    expect(screen.getByText("Вкажіть телефон у форматі +380… або Telegram через @.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(copy.labels.contact));
    expect(visible(copy.submit)).toBe(false);
  });

  it("a link that isn't one stops at step 1 with the link's own line", () => {
    renderForm(action);
    type(copy.labels.link, "@handle");
    next();
    expect(screen.getByText(copy.errors.link)).toBeTruthy();
    expect(visible(copy.submit)).toBe(false);
  });

  it("the server's «required» on a step-1 field reads the field's own line too", async () => {
    renderForm(async (previous) => ({
      ...previous,
      result: { kind: "invalid", fields: { name: "required", link: "required" } },
    }));
    await submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(copy.labels.name);
    expect(alert.textContent).toContain(copy.labels.link);
    expect(screen.getByText(copy.requiredBy.name as string)).toBeTruthy();
    expect(screen.getByText(copy.requiredBy.link as string)).toBeTruthy();
  });

  it("a passed step 1 shows step 2 with the recap, focus on its label", () => {
    renderForm(action);
    next();
    const label = screen.getByRole("heading", { name: copy.steps.two });
    expect(document.activeElement).toBe(label);
    const recap = screen.getByText(
      (_text, element) =>
        element?.tagName === "P" &&
        (element.textContent ?? "").startsWith("Тестовий хвіст, Тестове."),
    );
    expect(recap).toBeTruthy();
    expect(visible(copy.submit)).toBe(true);
  });

  it("«Назад» and «Змінити» go back to step 1 with every value kept", () => {
    renderForm(action);
    type(copy.labels.name, "Хвіст і лапи");
    next();
    type(copy.labels.email, "olena@example.org");
    fireEvent.click(screen.getByRole("button", { name: copy.back }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: copy.steps.one }));
    expect((screen.getByLabelText(copy.labels.name) as HTMLInputElement).value).toBe(
      "Хвіст і лапи",
    );
    next();
    expect((screen.getByLabelText(copy.labels.email) as HTMLInputElement).value).toBe(
      "olena@example.org",
    );
    fireEvent.click(screen.getByRole("button", { name: copy.change }));
    expect(visible(copy.next)).toBe(true);
    expect((screen.getByLabelText(copy.labels.email) as HTMLInputElement).value).toBe(
      "olena@example.org",
    );
  });

  it("a server refusal on a step-1 field brings step 1 back", async () => {
    renderForm(async (previous) => ({
      ...previous,
      result: { kind: "invalid", fields: { link: "link" } },
    }));
    await submit();
    await waitFor(() => expect(visible(copy.next)).toBe(true));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(copy.labels.link)),
    );
  });

  it("without JS both steps are one form: all seven fields, no «Далі», no recap, nothing hidden", () => {
    const html = renderToStaticMarkup(
      <RegistrationForm
        action={action}
        searchCities={async () => ({ kind: "too_short" })}
        initial={READY}
        copy={copy}
        headingId="reyestratsiia-title"
      />,
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelectorAll("[hidden]")).toHaveLength(0);
    expect(host.textContent).not.toContain(copy.next);
    expect(host.textContent).not.toContain(copy.change);
    expect(host.querySelectorAll("form input:not([type=hidden])").length).toBeGreaterThanOrEqual(7);
    expect(host.querySelector('button[type="submit"]')?.textContent).toBe(copy.submit);
  });
});
