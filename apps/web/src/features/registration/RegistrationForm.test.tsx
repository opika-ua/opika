import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_VALUES,
  ENHANCED_NAME,
  HONEYPOT_NAME,
  type RegistrationAction,
  type RegistrationFormState,
} from "./form-state";
import { RegistrationForm } from "./RegistrationForm";
import { registrationCopy } from "./registration-copy";

const copy = registrationCopy();
const INITIAL: RegistrationFormState = { result: null, values: EMPTY_VALUES, formStamp: "s1" };

afterEach(() => vi.restoreAllMocks());

function renderForm(action: RegistrationAction, initial = INITIAL) {
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

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
  });
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RegistrationForm", () => {
  it("posts every field by name, the stamp and the hydrated marker, and nothing in a URL", async () => {
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
    expect(form.get(ENHANCED_NAME)).toBe("1");
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
    type(copy.labels.link, "@handle");
    type(copy.labels.password, "ялинка-під-вікном");
    await submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(copy.errors.link);
    expect(alert.textContent).toContain(copy.errors.password_mismatch);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((screen.getByLabelText(copy.labels.link) as HTMLInputElement).value).toBe("@handle");
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

  it("email_taken: says so, with the way to sign in by a full page load", async () => {
    renderForm(async (previous) => ({ ...previous, result: { kind: "email_taken" } }));
    await submit();
    expect(await screen.findByText(copy.emailTaken)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.signIn }).getAttribute("href")).toBe(
      "/kabinet/vkhid",
    );
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
    expect(screen.getByRole("link", { name: copy.consentRules }).getAttribute("href")).toBe(
      "/prytulkam#pravyla",
    );
    expect(screen.getByRole("link", { name: copy.consentPrivacy }).getAttribute("href")).toBe(
      "/pro#dani",
    );
  });
});
