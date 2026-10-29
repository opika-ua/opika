/**
 * The request with its body read into memory, or `too_large` as soon as it is
 * known to exceed `maxBytes`: by a declared `Content-Length` without reading a
 * byte, or, for a body without one (chunked), by counting while reading and
 * stopping at the first byte over. Nothing is parsed either way.
 *
 * A declared length is not trusted to be honest: the count runs on every
 * body, so one that claims less than it sends is refused all the same.
 * Shared by `/api/kabinet` (P-Q7) and `/api/rpc` (audit F3).
 */
export async function boundedBody(
  request: Request,
  maxBytes: number,
): Promise<Request | "too_large"> {
  const head = await readBodyHead(request, maxBytes);
  if (head.kind === "whole") return head.request;
  await head.discard();
  return "too_large";
}

/**
 * A body read as far as `headBytes`: `whole` if it ended within them, else `longer`, with
 * nothing read past the chunk that crossed the line (and nothing at all when a declared
 * `Content-Length` already says so). `readRest` then reads on, by the same count, up to a
 * higher limit; `discard` stops reading. So a caller can decide between the two limits
 * before most of a large body is read (audit F9).
 */
export type BodyHead =
  | { kind: "whole"; request: Request }
  | {
      kind: "longer";
      readRest: (maxBytes: number) => Promise<Request | "too_large">;
      discard: () => Promise<void>;
    };

export async function readBodyHead(request: Request, headBytes: number): Promise<BodyHead> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  const reader = request.body?.getReader() ?? null;
  const chunks: Uint8Array[] = [];
  let total = 0;

  /** Reads until the body ends (`true`) or the count passes `maxBytes` (`false`). */
  const readWithin = async (maxBytes: number): Promise<boolean> => {
    if (reader === null) return true;
    while (total <= maxBytes) {
      const { done, value } = await reader.read();
      if (done) return true;
      total += value.byteLength;
      chunks.push(value);
    }
    return false;
  };
  const discard = async () => {
    await reader?.cancel();
  };
  const buffered = (): Request => {
    if (reader === null) return request;
    const headers = new Headers(request.headers);
    // The buffered body sets its own length; a chunked framing header no longer applies.
    headers.delete("content-length");
    headers.delete("transfer-encoding");
    return new Request(request.url, {
      method: request.method,
      headers,
      body: Buffer.concat(chunks),
    });
  };
  const longer: BodyHead = {
    kind: "longer",
    discard,
    readRest: async (maxBytes) => {
      if (declared > maxBytes || !(await readWithin(maxBytes))) {
        await discard();
        return "too_large";
      }
      return buffered();
    },
  };

  if (declared > headBytes) return longer;
  return (await readWithin(headBytes)) ? { kind: "whole", request: buffered() } : longer;
}
