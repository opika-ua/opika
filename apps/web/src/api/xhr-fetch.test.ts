import { describe, expect, it } from "vitest";
import { type UploadProgress, type XhrLike, xhrFetch } from "./xhr-fetch";

/**
 * `xhrFetch` carries one request over `XMLHttpRequest` so a photo upload can
 * report progress (K3 sheet answer 12). Driven through a fake XHR: what it
 * sends, what it reports, and how each ending reads to the oRPC link. The
 * real transport, through the kabinet route's Origin check, is the K3
 * harness spec's.
 */

type Sent = { method: string; url: string; headers: [string, string][]; body: Blob | null };

function fakeXhr(answer: (xhr: XhrLike & { sent: Sent }) => void) {
  const sent: Sent = { method: "", url: "", headers: [], body: null };
  let status = 0;
  let response: ArrayBuffer | null = null;
  let rawHeaders = "";
  const xhr = {
    sent,
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
    ontimeout: null,
    responseType: "" as XMLHttpRequestResponseType,
    get status() {
      return status;
    },
    get response() {
      return response;
    },
    open(method: string, url: string) {
      sent.method = method;
      sent.url = url;
    },
    setRequestHeader(name: string, value: string) {
      sent.headers.push([name, value]);
    },
    getAllResponseHeaders: () => rawHeaders,
    send(body: Blob | null) {
      sent.body = body;
      queueMicrotask(() => answer(xhr));
    },
    abort() {
      xhr.onabort?.();
    },
    respond(next: { status: number; body?: string; headers?: string }) {
      status = next.status;
      response = next.body === undefined ? null : new TextEncoder().encode(next.body).buffer;
      rawHeaders = next.headers ?? "";
      xhr.onload?.();
    },
  } as XhrLike & {
    sent: Sent;
    respond: (next: { status: number; body?: string; headers?: string }) => void;
  };
  return xhr;
}

const upload = () =>
  new Request("https://site.test/api/kabinet/shelter/photos/add", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.test", "x-extra": "1" },
    body: JSON.stringify({ json: { animalId: "a" } }),
  });

describe("xhrFetch", () => {
  it("sends the request as built, reports progress, and answers a Response", async () => {
    const progress: UploadProgress[] = [];
    const xhr = fakeXhr((x) => {
      x.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
      x.upload.onprogress?.({ lengthComputable: false, loaded: 7, total: 0 } as ProgressEvent);
      (x as unknown as { respond: (n: object) => void }).respond({
        status: 200,
        body: '{"json":{"ok":true}}',
        headers: "content-type: application/json\r\nx-request-id: 7\r\n",
      });
    });
    const response = await xhrFetch(
      upload(),
      (p) => progress.push(p),
      () => xhr,
    );
    expect(xhr.sent.method).toBe("POST");
    expect(xhr.sent.url).toBe("https://site.test/api/kabinet/shelter/photos/add");
    expect(await xhr.sent.body?.text()).toBe('{"json":{"animalId":"a"}}');
    // The browser sets Origin itself (and refuses a page that tries); the rest go as given.
    expect(Object.fromEntries(xhr.sent.headers)).toEqual({
      "content-type": "application/json",
      "x-extra": "1",
    });
    // Only a measurable step is reported.
    expect(progress).toEqual([{ sent: 5, total: 10 }]);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("7");
    expect(await response.json()).toEqual({ json: { ok: true } });
  });

  it("a status with no body (204) is a Response with none, not a thrown construction error", async () => {
    const xhr = fakeXhr((x) =>
      (x as unknown as { respond: (n: object) => void }).respond({ status: 204, body: "" }),
    );
    const response = await xhrFetch(
      upload(),
      () => {},
      () => xhr,
    );
    expect(response.status).toBe(204);
  });

  it("a network failure is a TypeError, as fetch's is, so the link reads it as no answer", async () => {
    const xhr = fakeXhr((x) => x.onerror?.());
    await expect(
      xhrFetch(
        upload(),
        () => {},
        () => xhr,
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("an aborted signal aborts the request: before it starts, and while it runs", async () => {
    const before = new AbortController();
    before.abort();
    const request = new Request(upload(), { signal: before.signal });
    await expect(
      xhrFetch(
        request,
        () => {},
        () => fakeXhr(() => {}),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    const during = new AbortController();
    const running = xhrFetch(
      new Request(upload(), { signal: during.signal }),
      () => {},
      () => fakeXhr(() => during.abort()),
    );
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
  });
});
