import { describe, expect, it } from "vitest";
import {
  REGISTRATION_EMAIL_TEMPLATES,
  type RegistrationEmail,
  registrationEmailFor,
  safeSubject,
} from "./registration-email";

const TO = "lapa@example.org";
const HOSTILE_NAME = 'Лапа\r\nBcc: victim@example.org <script>alert("x")</script>';

const samples: Record<RegistrationEmail["template"], RegistrationEmail> = {
  application_confirm: {
    template: "application_confirm",
    name: HOSTILE_NAME,
    confirmUrl: "https://opika.org.ua/kabinet/email/pidtverdyty?t=abc",
    notMeUrl: "https://opika.org.ua/kabinet/email/tse-ne-ya?t=def",
    operatorName: "Олексій Колотенко",
  },
  application_approved: {
    template: "application_approved",
    name: HOSTILE_NAME,
    kabinetUrl: "https://opika.org.ua/kabinet",
  },
  application_rejected: {
    template: "application_rejected",
    name: HOSTILE_NAME,
    reason: { code: "other", note: "Це магазин" },
    contactEmail: "hello@example.org",
    telegram: "@operator",
  },
  operator_new_application: {
    template: "operator_new_application",
    name: HOSTILE_NAME,
    cityName: "Бровари",
    link: "https://www.instagram.com/lapa_help/",
    contact: "+380671234567",
    email: TO,
    queueUrl: "https://opika.org.ua/kabinet/prytulky",
  },
  registration_cap_hit: {
    template: "registration_cap_hit",
    count: 300,
    queueUrl: "https://opika.org.ua/kabinet/prytulky",
  },
  notification_cap_warning: { template: "notification_cap_warning", count: 240, cap: 300 },
  login_email_changed: {
    template: "login_email_changed",
    shelterName: HOSTILE_NAME,
    maskedEmail: "u•••9@example.org",
    contact: "hello@example.org",
    operatorName: "Олексій Колотенко",
  },
};

describe("safeSubject (header injection, §11.3)", () => {
  it("turns CR, LF, other controls and Unicode separators into single spaces", async () => {
    expect(safeSubject("a\r\nBcc: x\u0000y z\u0085w")).toBe("a Bcc: x y z w");
  });

  it("caps the subject at 200 characters, counted as a reader would", async () => {
    expect([...safeSubject("я".repeat(500))]).toHaveLength(200);
  });
});

describe("registrationEmailFor", () => {
  it("has a sample for every template", async () => {
    expect(Object.keys(samples).sort()).toEqual([...REGISTRATION_EMAIL_TEMPLATES].sort());
  });

  for (const template of REGISTRATION_EMAIL_TEMPLATES) {
    it(`${template}: no line break in the subject, applicant text escaped in the HTML`, async () => {
      const email = await registrationEmailFor(samples[template], TO);
      expect(email.to).toBe(TO);
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.html).not.toContain("<script>");
    });
  }

  it.each(["application_confirm", "operator_new_application", "login_email_changed"] as const)(
    "%s: the name in the body is escaped, not dropped",
    async (template) => {
      expect((await registrationEmailFor(samples[template], TO)).html).toContain("&lt;script&gt;");
    },
  );

  it("the confirmation carries both links, «Це не я» after the explanation", async () => {
    const email = await registrationEmailFor(samples.application_confirm, TO);
    const confirm = email.html.indexOf("pidtverdyty");
    const notMe = email.html.indexOf("tse-ne-ya");
    expect(confirm).toBeGreaterThan(-1);
    expect(notMe).toBeGreaterThan(confirm);
    expect(email.html).toContain(">Це не я</a>");
    expect(email.text).toContain("Це не я: https://opika.org.ua/kabinet/email/tse-ne-ya?t=def");
  });

  it("the approval ends on his R5 open-sources line", async () => {
    expect((await registrationEmailFor(samples.application_approved, TO)).text).toContain(
      "Якщо для повної перевірки мені забракне інформації з відкритих джерел, я напишу вам.",
    );
  });

  it("the rejection states the preset reason, with «Інше» carrying its text", async () => {
    const text = (await registrationEmailFor(samples.application_rejected, TO)).text;
    expect(text).toContain("Причина: Інше: Це магазин.");
    expect(text).toContain("Дані заявки я видалю через 30 днів.");
    const duplicate = (
      await registrationEmailFor(
        {
          template: "application_rejected",
          name: "Лапа",
          reason: { code: "duplicate_submission", note: null },
          contactEmail: "hello@example.org",
          telegram: "@operator",
        },
        TO,
      )
    ).text;
    expect(duplicate).toContain("Причина: Такий притулок уже є на Opika.");
  });
});
