// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FILTERED,
  MAX_STRING_LENGTH,
  scrubBreadcrumb,
  scrubEvent,
  scrubString,
  scrubUrl,
} from "./scrub";

describe("scrubString", () => {
  it.each(["olena@example.ua", "Олена.К+tag@пошта.укр", "first.last@sub.domain.example.com"])(
    "removes the email address %s",
    (email) => {
      const out = scrubString(`failed for ${email} while saving`);
      expect(out).not.toContain("@");
      expect(out).toContain(FILTERED);
    },
  );

  it.each([
    "+380501234567",
    "380501234567",
    "0501234567",
    "+380 50 123 45 67",
    "+38 (050) 123-45-67",
    "050-123-45-67",
    "(050) 123 45 67",
    "+38050 123 4567",
    "0 50 123 45 67",
  ])("removes the phone number %s", (phone) => {
    const out = scrubString(`call ${phone} now`);
    expect(out).toBe(`call ${FILTERED} now`);
  });

  it("leaves ordinary numbers alone", () => {
    expect(scrubString("line 1234, column 56; 3 of 10 cards; id 12345678")).toBe(
      "line 1234, column 56; 3 of 10 cards; id 12345678",
    );
  });

  it("removes cookie and authorization header lines and bearer tokens", () => {
    expect(scrubString("cookie: opika_session=abc; other=1")).toBe(FILTERED);
    expect(scrubString("Set-Cookie: a=b")).toBe(FILTERED);
    expect(scrubString("Authorization: Bearer abc.def")).toBe(FILTERED);
    expect(scrubString("sent Bearer abc.def-ghi to")).toBe(`sent ${FILTERED} to`);
  });

  it("removes the gate parameter and every query string inside text", () => {
    expect(scrubString("GET https://opika.example/tvaryny?gate=SECRET&x=1 failed")).toBe(
      "GET https://opika.example/tvaryny failed",
    );
    expect(scrubString("fetch /api/rpc/animals/list?page=2&email=a@b.ua failed")).toBe(
      "fetch /api/rpc/animals/list failed",
    );
    expect(scrubString("bare gate=SECRET here")).not.toContain("SECRET");
  });

  it("keeps a lone question mark in prose", () => {
    expect(scrubString("Unexpected token ? in expression")).toBe(
      "Unexpected token ? in expression",
    );
  });

  it("truncates long strings", () => {
    const out = scrubString("x".repeat(MAX_STRING_LENGTH * 3));
    expect(out.length).toBeLessThan(MAX_STRING_LENGTH + 40);
    expect(out.endsWith("[truncated]")).toBe(true);
  });
});

describe("scrubUrl", () => {
  it("drops query string and fragment, keeps the path", () => {
    expect(scrubUrl("https://opika.example/tvaryny/gortaty?gate=x&a=1#top")).toBe(
      "https://opika.example/tvaryny/gortaty",
    );
    expect(scrubUrl("/pro#data")).toBe("/pro");
    expect(scrubUrl("/pro")).toBe("/pro");
  });
});

const contactEvent = () => ({
  event_id: "abc",
  message: "reveal failed for olena@example.ua / 0501234567",
  user: { email: "olena@example.ua", ip_address: "203.0.113.7", id: "u1" },
  server_name: "host-1",
  breadcrumbs: [{ message: "x" }],
  request: {
    url: "https://opika.example/api/rpc/animals/reveal?gate=SECRET&email=olena@example.ua",
    method: "POST",
    cookies: { opika_session: "abc" },
    query_string: "gate=SECRET",
    data: '{"email":"olena@example.ua"}',
    headers: {
      Cookie: "opika_session=abc",
      Authorization: "Bearer tok",
      "X-Forwarded-For": "203.0.113.7",
      Referer: "https://opika.example/tvaryny?gate=SECRET",
      "User-Agent": "Mozilla/5.0 (Linux; Android 14)",
    },
  },
  exception: {
    values: [
      {
        type: "Error",
        value: "Cannot read olena@example.ua at 0501234567",
        stacktrace: {
          frames: [
            {
              filename: "https://opika.example/_next/static/chunks/a.js?v=SECRET",
              function: "reveal",
              lineno: 10,
              vars: { contact: "0501234567" },
              pre_context: ["const x = 'olena@example.ua';"],
              context_line: "throw new Error(x)",
              post_context: ["}"],
            },
          ],
        },
        mechanism: { type: "generic", handled: true, data: { email: "olena@example.ua" } },
      },
    ],
  },
  extra: {
    body: { email: "olena@example.ua" },
    note: "phone +380 50 123 45 67",
    contacts: ["0501234567"],
    shelterSnapshot: { phone: "0501234567" },
  },
  contexts: {
    nextjs: { request_path: "/api/x?gate=SECRET", router_path: "/api/x" },
    trace: { data: { "http.query": "?gate=SECRET" } },
  },
  tags: { email: "olena@example.ua", route: "/api/x", cookie: "opika_session=abc" },
  transaction: "GET /tvaryny?gate=SECRET",
  modules: { zod: "4" },
});

describe("scrubEvent", () => {
  const scrubbed = scrubEvent(contactEvent());
  const text = JSON.stringify(scrubbed);

  it("carries none of the contact, cookie, token, query or address values", () => {
    for (const secret of [
      "olena@example.ua",
      "0501234567",
      "+380 50 123 45 67",
      "SECRET",
      "opika_session",
      "Bearer",
      "203.0.113.7",
      "tok",
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("removes user, breadcrumbs, server name and module list", () => {
    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed).not.toHaveProperty("breadcrumbs");
    expect(scrubbed).not.toHaveProperty("server_name");
    expect(scrubbed).not.toHaveProperty("modules");
  });

  it("keeps only the page address and the method of the request: no header, not even the UA", () => {
    expect(scrubbed.request).toEqual({
      url: "https://opika.example/api/rpc/animals/reveal",
      method: "POST",
    });
  });

  it("drops top-level keys it does not know, and keeps only debug ids and files of debug_meta", () => {
    const out = scrubEvent({
      event_id: "e1",
      level: "error",
      fingerprint: ["olena@example.ua"],
      threads: { values: [{ name: "main" }] },
      culprit: "somewhere",
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "d1",
            code_file: "https://x.example/a.js?v=SECRET",
            extra: "e",
          },
        ],
        sdk_info: { sdk_name: "x" },
      },
    }) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["debug_meta", "event_id", "level"]);
    expect(out.debug_meta).toEqual({
      images: [{ type: "sourcemap", debug_id: "d1", code_file: "https://x.example/a.js" }],
    });
  });

  it("removes frame variables and source lines but keeps function, file and line", () => {
    const frame = scrubbed.exception.values[0]?.stacktrace.frames[0] as Record<string, unknown>;
    expect(frame).toMatchObject({ function: "reveal", lineno: 10 });
    expect(frame.filename).toBe("https://opika.example/_next/static/chunks/a.js");
    for (const key of ["vars", "pre_context", "context_line", "post_context"]) {
      expect(frame).not.toHaveProperty(key);
    }
  });

  it("keeps the error type and a scrubbed value", () => {
    expect(scrubbed.exception.values[0]?.type).toBe("Error");
    expect(scrubbed.exception.values[0]?.value).toBe(`Cannot read ${FILTERED} at ${FILTERED}`);
  });

  it("scrubs message, extra, contexts, tags and transaction", () => {
    expect(scrubbed.message).toBe(`reveal failed for ${FILTERED} / ${FILTERED}`);
    expect(scrubbed.extra.body).toBe(FILTERED);
    expect(scrubbed.extra.contacts).toBe(FILTERED);
    expect(scrubbed.extra.shelterSnapshot).toBe(FILTERED);
    expect(scrubbed.contexts.nextjs.request_path).toBe("/api/x");
    expect(scrubbed.tags).toEqual({ email: FILTERED, route: "/api/x", cookie: FILTERED });
    expect(scrubbed.transaction).toBe("GET /tvaryny");
  });

  it("runs over any event type, spans of a transaction included", () => {
    const out = scrubEvent({
      type: "transaction",
      transaction: "GET /x?gate=SECRET",
      spans: [{ description: "GET https://a.example/x?gate=SECRET", data: { email: "a@b.ua" } }],
    });
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(JSON.stringify(out)).not.toContain("a@b.ua");
  });

  it("does not modify the object it was given", () => {
    const original = contactEvent();
    scrubEvent(original);
    expect(original).toEqual(contactEvent());
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console and input breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "olena@example.ua" })).toBeNull();
  });

  it("reduces fetch and xhr to method, path and status", () => {
    const out = scrubBreadcrumb({
      category: "fetch",
      data: {
        method: "POST",
        url: "https://opika.example/api/kabinet/x?gate=SECRET",
        status_code: 200,
        request_body_size: 10,
        body: "olena@example.ua",
      },
    });
    expect(out).toEqual({
      category: "fetch",
      data: { method: "POST", url: "/api/kabinet/x", status_code: 200 },
    });
    const xhr = scrubBreadcrumb({
      category: "xhr",
      data: { method: "GET", url: "/api/rpc/a?email=a@b.ua", status_code: 500 },
    });
    expect(xhr).toEqual({
      category: "xhr",
      data: { method: "GET", url: "/api/rpc/a", status_code: 500 },
    });
  });

  it("drops query strings from navigation url, from and to", () => {
    const out = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/a?gate=SECRET", to: "/b?x=1#h", url: "https://x.example/c?y=2" },
    });
    expect(out).toEqual({
      category: "navigation",
      data: { from: "/a", to: "/b", url: "https://x.example/c" },
    });
  });

  it("scrubs breadcrumb messages", () => {
    const out = scrubBreadcrumb({ category: "custom", message: "sent to olena@example.ua" });
    expect(out?.message).toBe(`sent to ${FILTERED}`);
  });
});
