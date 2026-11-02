/** Test double for the SDK's transport: keeps every envelope the SDK would have sent, sends none. */
export type SentEnvelope = [
  header: Record<string, unknown>,
  items: [Record<string, unknown>, unknown][],
];

export function recordingTransport() {
  const envelopes: SentEnvelope[] = [];
  const transport = () => ({
    send: async (envelope: unknown) => {
      envelopes.push(envelope as SentEnvelope);
      return {};
    },
    flush: async () => true,
  });
  return {
    envelopes,
    transport,
    /** Every envelope item's type, e.g. "event"; any "transaction" or "span" here is a failure. */
    itemTypes: () => envelopes.flatMap(([, items]) => items.map(([header]) => String(header.type))),
    json: () => JSON.stringify(envelopes),
  };
}
