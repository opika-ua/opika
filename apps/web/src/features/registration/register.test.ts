import type { SelfRegistrationOutcome, SelfRegistrationWrite } from "@opika/db/repos";
import type { PasswordVerdict } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { issueFormStamp, MIN_FILL_MS } from "./form-stamp";
import { EMPTY_VALUES, HONEYPOT_NAME } from "./form-state";
import {
  nativePostRedirectOf,
  type RegisterDeps,
  type RegisteredApplication,
  type RegistrationLogReason,
  registerWith,
} from "./register";

const KEY = "stamp-key";
const RENDERED = new Date("2026-11-18T10:00:00.000Z");
const NOW = new Date(RENDERED.getTime() + 60_000);
const CITY = { id: "0b5f8c5e-7d6a-4f3e-9c2b-1a2b3c4d5e6f", label: "м. Бровари" };
const PASSWORD = "ялинка-під-вікном-у-грудні";

const FILLED = {
  name: "Притулок «Тестовий хвіст»",
  cityId: CITY.id,
  link: "instagram.com/prytulok_test",
  contact: "067 123 45 67",
  email: " Olena@Example.org ",
  password: PASSWORD,
  passwordRepeat: PASSWORD,
};

function formOf(fields: Record<string, string> = {}, stampAt = RENDERED): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    ...FILLED,
    [HONEYPOT_NAME]: "",
    formStamp: issueFormStamp(stampAt, KEY),
    ...fields,
  })) {
    form.set(name, value);
  }
  return form;
}

type Harness = {
  deps: RegisterDeps;
  writes: SelfRegistrationWrite[];
  registered: RegisteredApplication[];
  cookies: string[][];
  logged: RegistrationLogReason[];
  mailsTaken: number;
  charged: { ip: number; address: string[] };
};

function harness(
  overrides: Partial<RegisterDeps> & { outcome?: SelfRegistrationOutcome } = {},
): Harness {
  const h: Harness = {
    writes: [],
    registered: [],
    cookies: [],
    logged: [],
    mailsTaken: 0,
    charged: { ip: 0, address: [] },
    deps: undefined as never,
  };
  let ids = 0;
  let tokens = 0;
  h.deps = {
    now: NOW,
    stampKey: KEY,
    issueStamp: (issuedAt) => issueFormStamp(issuedAt, KEY),
    allowIp: async () => {
      h.charged.ip += 1;
      return { kind: "ok" };
    },
    allowAddress: async (email) => {
      h.charged.address.push(email);
      return { kind: "ok" };
    },
    hasAccount: async () => false,
    takeDailyMail: async () => {
      h.mailsTaken += 1;
      return true;
    },
    resolveCity: async (by) =>
      (by.kind === "id" && by.id === CITY.id) || (by.kind === "name" && by.name === "Бровари")
        ? CITY
        : null,
    passwordVerdict: (): PasswordVerdict => ({ kind: "ok" }),
    hashPassword: async (password) => `hash(${password.length})`,
    write: async (input) => {
      h.writes.push(input);
      return overrides.outcome ?? { kind: "registered" };
    },
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    newToken: () => `token-${++tokens}`,
    hashToken: (token) => `sha(${token})`,
    afterRegistration: async (application) => {
      h.registered.push(application);
    },
    signIn: async () => ({
      kind: "signed_in",
      userId: h.writes[0]?.userId ?? "",
      setCookies: ["kabinet.session_token=s; Path=/"],
    }),
    setCookies: async (setCookies) => {
      h.cookies.push([...setCookies]);
    },
    log: (reason) => h.logged.push(reason),
    ...overrides,
  };
  return h;
}

describe("registerWith: abuse controls", () => {
  it("a filled honeypot answers registered, charges nothing and writes nothing", async () => {
    const h = harness();
    const state = await registerWith(formOf({ [HONEYPOT_NAME]: "http://spam.example" }), h.deps);
    expect(state.result).toEqual({ kind: "registered", next: "/kabinet" });
    expect(state.values).toEqual(EMPTY_VALUES);
    expect(h.writes).toEqual([]);
    expect(h.registered).toEqual([]);
    expect(h.cookies).toEqual([]);
    expect(h.charged.ip).toBe(0);
    expect(h.logged).toEqual(["honeypot"]);
  });

  it("a submit faster than the minimum fill time fails, keeping the render time for a retry", async () => {
    const h = harness();
    const state = await registerWith(formOf({}, new Date(NOW.getTime() - MIN_FILL_MS + 1)), h.deps);
    expect(state.result).toEqual({ kind: "failed" });
    expect(h.writes).toEqual([]);
    expect(h.logged).toEqual(["too_fast"]);
    expect(state.formStamp).toBe(issueFormStamp(new Date(NOW.getTime() - MIN_FILL_MS + 1), KEY));
  });

  it("a forged or missing stamp fails and writes nothing", async () => {
    const h = harness();
    expect((await registerWith(formOf({ formStamp: "1.x" }), h.deps)).result).toEqual({
      kind: "failed",
    });
    expect((await registerWith(formOf({ formStamp: "" }), h.deps)).result).toEqual({
      kind: "failed",
    });
    expect(h.writes).toEqual([]);
    expect(h.logged).toEqual(["stamp_invalid", "stamp_invalid"]);
  });

  it("over the per-IP budget: rate_limited before anything is read or written", async () => {
    let cityLookups = 0;
    const h = harness({
      allowIp: async () => ({ kind: "limited", retryAfterSeconds: 120 }),
      resolveCity: async () => {
        cityLookups += 1;
        return CITY;
      },
    });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
    expect(cityLookups).toBe(0);
    expect(h.writes).toEqual([]);
  });

  it("over the per-address budget: rate_limited, keyed on the normalised address, nothing written", async () => {
    const h = harness({
      allowAddress: async (email) => {
        h.charged.address.push(email);
        return { kind: "limited", retryAfterSeconds: 60 };
      },
    });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
    expect(h.charged.address).toEqual(["olena@example.org"]);
    expect(h.writes).toEqual([]);
  });

  it("an invalid submit never charges the per-address budget", async () => {
    const h = harness();
    await registerWith(formOf({ link: "" }), h.deps);
    expect(h.charged.address).toEqual([]);
  });
});

describe("registerWith: the fields", () => {
  it("names every empty field as required and keeps what was typed (never the passwords)", async () => {
    const h = harness();
    const state = await registerWith(
      formOf({ name: "", cityId: "", link: "", contact: "", password: "", passwordRepeat: "" }),
      h.deps,
    );
    expect(state.result).toEqual({
      kind: "invalid",
      fields: {
        name: "required",
        cityId: "required",
        link: "required",
        contact: "required",
        password: "required",
        passwordRepeat: "required",
      },
    });
    expect(state.values).toEqual({ ...EMPTY_VALUES, email: FILLED.email });
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
    expect(h.writes).toEqual([]);
  });

  it("checks the repeated password on the server too", async () => {
    const h = harness();
    const state = await registerWith(formOf({ passwordRepeat: `${PASSWORD}!` }), h.deps);
    expect(state.result).toEqual({
      kind: "invalid",
      fields: { passwordRepeat: "password_mismatch" },
    });
    expect(h.writes).toEqual([]);
  });

  it("reports the mismatch beside other field errors", async () => {
    const h = harness();
    const state = await registerWith(
      formOf({ link: "@handle", passwordRepeat: "something-else-long" }),
      h.deps,
    );
    expect(state.result).toEqual({
      kind: "invalid",
      fields: { link: "link", passwordRepeat: "password_mismatch" },
    });
  });

  it("an unknown city id is a city error, and the typed values come back", async () => {
    const h = harness();
    const state = await registerWith(formOf({ cityId: crypto.randomUUID() }), h.deps);
    expect(state.result).toEqual({ kind: "invalid", fields: { cityId: "city" } });
    expect(state.values.link).toBe(FILLED.link);
  });

  it("without JS the city's typed name is matched on the server", async () => {
    const h = harness();
    const state = await registerWith(formOf({ cityId: "", cityName: "Бровари" }), h.deps);
    expect(state.result?.kind).toBe("registered");
    expect(h.writes[0]?.shelter.publicLocation.cityId).toBe(CITY.id);
  });

  it("the password policy's refusal lands on the password field", async () => {
    const h = harness({ passwordVerdict: () => ({ kind: "contains_personal" }) });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "invalid", fields: { password: "password_personal" } });
    expect(h.writes).toEqual([]);
  });
});

describe("registerWith: the write and the way in", () => {
  it("writes one application with the normalised link, contact and address, then signs in", async () => {
    const h = harness();
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "registered", next: "/kabinet" });
    expect(state.values).toEqual(EMPTY_VALUES);

    const [write] = h.writes;
    expect(write?.email).toBe("olena@example.org");
    expect(write?.passwordHash).toBe(`hash(${PASSWORD.length})`);
    expect(write?.shelter).toMatchObject({
      displayName: FILLED.name,
      contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      verification: {
        status: "application",
        appliedAt: NOW,
        evidence: {
          items: [{ kind: "public_link", url: "https://www.instagram.com/prytulok_test/" }],
        },
      },
    });
    expect(write?.history.entry).toEqual({
      kind: "shelter_registered",
      at: NOW,
      shelterAdminId: write?.userId,
    });
    // Only the hashes are written; the tokens themselves go to the email.
    expect(write?.tokens.map((token) => [token.purpose, token.tokenHash])).toEqual([
      ["confirm_email", "sha(token-1)"],
      ["not_me", "sha(token-2)"],
    ]);
    expect(h.registered).toEqual([
      {
        userId: write?.userId,
        shelterId: write?.shelter.id,
        name: FILLED.name,
        email: "olena@example.org",
        confirmToken: "token-1",
        notMeToken: "token-2",
      },
    ]);
    expect(h.cookies).toEqual([["kabinet.session_token=s; Path=/"]]);
  });

  it("an address with an account answers email_taken: no email, no sign-in", async () => {
    const h = harness({ outcome: { kind: "email_taken" } });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "email_taken" });
    expect(h.registered).toEqual([]);
    expect(h.cookies).toEqual([]);
    expect(state.values.email).toBe(FILLED.email);
  });

  it("a failed write is failed, with nothing sent", async () => {
    const h = harness({
      write: async () => {
        throw new Error("statement failed");
      },
    });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "failed" });
    expect(h.registered).toEqual([]);
    expect(h.logged).toEqual(["write_failed"]);
  });

  it("a refused sign-in still registered: off to the sign-in page, no cookie", async () => {
    const h = harness({ signIn: async () => ({ kind: "refused" }) });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "registered", next: "/kabinet/vkhid" });
    expect(h.cookies).toEqual([]);
    expect(h.logged).toEqual(["sign_in_failed"]);
  });

  it("a session for anyone but the new account is never handed over", async () => {
    const h = harness({
      signIn: async () => ({ kind: "signed_in", userId: "someone-else", setCookies: ["x=y"] }),
    });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "registered", next: "/kabinet/vkhid" });
    expect(h.cookies).toEqual([]);
  });

  it("a failing email or funnel never fails the registration", async () => {
    const h = harness({
      afterRegistration: async () => {
        throw new Error("mail down");
      },
    });
    expect((await registerWith(formOf(), h.deps)).result).toEqual({
      kind: "registered",
      next: "/kabinet",
    });
  });

  it("logs reason codes only, never a value someone typed", async () => {
    const h = harness();
    await registerWith(formOf({ link: "" }), h.deps);
    await registerWith(formOf({ [HONEYPOT_NAME]: "x" }), h.deps);
    for (const line of h.logged) {
      expect(["invalid", "honeypot"]).toContain(line);
    }
  });
});

describe("nativePostRedirectOf: the no-JS exit", () => {
  const registered = {
    result: { kind: "registered", next: "/kabinet" } as const,
    values: EMPTY_VALUES,
    formStamp: "",
  };

  it("a native post (no Next-Action header) that registered is a 303 to where it goes", () => {
    expect(nativePostRedirectOf(registered, new Headers())).toBe("/kabinet");
  });

  it("the client's own call (Next-Action header) leaves by itself, so no redirect", () => {
    expect(nativePostRedirectOf(registered, new Headers({ "Next-Action": "7f3a" }))).toBeNull();
  });

  it("anything but registered stays on the page", () => {
    expect(
      nativePostRedirectOf({ ...registered, result: { kind: "failed" } }, new Headers()),
    ).toBeNull();
  });
});

describe("registerWith: the day's confirmation emails", () => {
  it("at the cap: refused before anything is written, the typed values kept", async () => {
    const h = harness({ takeDailyMail: async () => false });
    const state = await registerWith(formOf(), h.deps);
    expect(state.result).toEqual({ kind: "daily_cap" });
    expect(h.writes).toEqual([]);
    expect(h.registered).toEqual([]);
    expect(h.cookies).toEqual([]);
    expect(state.values.link).toBe("instagram.com/prytulok_test");
    expect(h.logged).toEqual(["daily_cap"]);
  });

  it("a taken address spends none of the day's emails", async () => {
    const h = harness({ hasAccount: async () => true });
    expect((await registerWith(formOf(), h.deps)).result).toEqual({ kind: "email_taken" });
    expect(h.mailsTaken).toBe(0);
    expect(h.writes).toEqual([]);
  });

  it("an invalid submit spends none either; a registration spends one", async () => {
    const h = harness();
    await registerWith(formOf({ link: "" }), h.deps);
    expect(h.mailsTaken).toBe(0);
    await registerWith(formOf(), h.deps);
    expect(h.mailsTaken).toBe(1);
  });
});
