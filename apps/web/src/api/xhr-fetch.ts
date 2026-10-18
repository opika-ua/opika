/**
 * `fetch`, carried by `XMLHttpRequest`, for the one request the kabinet needs
 * upload progress on: a photo (Oleksii, K3 sheet answer 12, verbatim: "(a):
 * measure progress with XMLHttpRequest; `uploadingProgress` below,
 * `uploading` as the fallback."). `fetch` still can't report how much of a
 * request body has gone; XHR's `upload.onprogress` can, which is what a
 * budget phone on mobile data needs to see during a 1–2 MB upload.
 *
 * Takes the `Request` oRPC's link built, so the body (its multipart form,
 * file included), headers and URL are exactly what `fetch` would have sent:
 * nothing about the protocol is re-implemented here, only the transport.
 * The answer comes back as a `Response` for the link to read as usual.
 */

export type UploadProgress = { sent: number; total: number };

/** The slice of `XMLHttpRequest` this uses, so tests can drive it without a network. */
export type XhrLike = {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getAllResponseHeaders(): string;
  send(body: Blob | null): void;
  abort(): void;
  responseType: XMLHttpRequestResponseType;
  readonly response: ArrayBuffer | null;
  readonly status: number;
  upload: { onprogress: ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  ontimeout: (() => void) | null;
};

/**
 * Headers a page may not set on a request; the browser sets them itself and
 * refuses (with a console error) any attempt. `fetch` drops them silently.
 */
const BROWSER_OWNED = new Set(["content-length", "cookie", "host", "origin", "connection"]);

/** Statuses whose response must have no body (`new Response` throws otherwise). */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const headersOf = (raw: string): Headers => {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const at = line.indexOf(":");
    if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return headers;
};

export async function xhrFetch(
  request: Request,
  onProgress: (progress: UploadProgress) => void,
  createXhr: () => XhrLike = () => new XMLHttpRequest() as unknown as XhrLike,
): Promise<Response> {
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.blob();
  return new Promise<Response>((resolve, reject) => {
    const xhr = createXhr();
    const abort = () => xhr.abort();
    if (request.signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    request.signal.addEventListener("abort", abort, { once: true });
    xhr.open(request.method, request.url);
    request.headers.forEach((value, name) => {
      if (!BROWSER_OWNED.has(name.toLowerCase())) xhr.setRequestHeader(name, value);
    });
    xhr.responseType = "arraybuffer";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ sent: event.loaded, total: event.total });
    };
    const fail = (error: Error) => () => {
      request.signal.removeEventListener("abort", abort);
      reject(error);
    };
    // A network failure, like `fetch`'s, is a TypeError: the client reads it
    // as "no answer", never as a server refusal.
    xhr.onerror = fail(new TypeError("Network request failed"));
    xhr.ontimeout = fail(new TypeError("Network request timed out"));
    xhr.onabort = fail(new DOMException("Aborted", "AbortError"));
    xhr.onload = () => {
      request.signal.removeEventListener("abort", abort);
      // Settles either way: a Response the platform refuses to build must
      // reject, not leave the upload hanging on «Завантаження…» forever.
      try {
        resolve(
          new Response(NULL_BODY_STATUSES.has(xhr.status) ? null : xhr.response, {
            status: xhr.status,
            headers: headersOf(xhr.getAllResponseHeaders()),
          }),
        );
      } catch (error) {
        reject(error);
      }
    };
    xhr.send(body);
  });
}
