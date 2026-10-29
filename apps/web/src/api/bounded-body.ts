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
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) return "too_large";
  if (request.body === null) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const headers = new Headers(request.headers);
  // The buffered body sets its own length; a chunked framing header no longer applies.
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: Buffer.concat(chunks),
  });
}
