import type { RegistryShelterView } from "@opika/contracts";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { OperatorActionsProvider, type Reread } from "./operator-actions";
import type { RegistryActionsClient } from "./registry-actions-client";

/**
 * Test-only: the record S4 reads, a fake of the picked browser client with
 * its shape, and the provider around a control. Imported by the actions'
 * tests only, so it never reaches a bundle. The server side of each call is
 * `kabinet/registry.test.ts`'s.
 */

export const SHELTER_ID = "51000000-0000-4000-8000-000000000001" as RegistryShelterView["id"];
export const MODERATOR = "11111111-1111-4111-8111-111111111111" as never;
export const ADMIN_ID = "33333333-3333-4333-8333-333333333333" as never;

export function registryView(overrides: Partial<RegistryShelterView> = {}): RegistryShelterView {
  return {
    id: SHELTER_ID,
    displayName: "Домівка",
    description: { uk: "Опис", en: null },
    legalEntity: {
      kind: "registered_ngo",
      legalName: "ГО «Домівка для хвостатих»",
      edrpou: "43218765" as never,
      registeredAt: new Date("2020-01-01T00:00:00Z"),
    },
    publicLocation: {
      precision: "fuzzed_address",
      cityId: "c1000000-0000-4000-8000-000000000001" as never,
      district: null,
      approximate: { lat: 50.5, lng: 30.8 } as never,
    },
    exactAddress: {
      line1: "вул. Київська, 300",
      line2: null,
      postalCode: "07400",
      cityId: "c1000000-0000-4000-8000-000000000001" as never,
      district: null,
      coordinates: { lat: 50.5, lng: 30.8 },
    },
    contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
    donation: null,
    pendingDonation: null,
    freshnessSentence: null,
    verification: {
      status: "pending",
      submittedAt: new Date("2026-10-01T09:00:00Z"),
      evidence: { items: [], submittedAt: new Date("2026-10-01T09:00:00Z") },
    },
    createdAt: new Date("2026-10-01T09:00:00Z"),
    lastUpdatedAt: new Date("2026-10-01T09:00:00Z"),
    version: 3,
    admins: [],
    ...overrides,
  };
}

/** The same record with another verification state, everything else kept. */
export const withVerification = (
  view: RegistryShelterView,
  verification: RegistryShelterView["verification"],
): RegistryShelterView => ({ ...view, verification, version: view.version + 1 });

export const apiError = (code: string, data?: unknown) =>
  Object.assign(new Error(code), { code, ...(data === undefined ? {} : { data }) });

/** What a dropped connection looks like to the browser client: fetch throws, no code. */
export const lostAnswer = () => new TypeError("Failed to fetch");

type Fns = {
  shelters: Record<keyof RegistryActionsClient["registry"]["shelters"], ReturnType<typeof vi.fn>>;
  verification: Record<
    keyof RegistryActionsClient["registry"]["verification"],
    ReturnType<typeof vi.fn>
  >;
  donation: Record<keyof RegistryActionsClient["registry"]["donation"], ReturnType<typeof vi.fn>>;
  admins: Record<keyof RegistryActionsClient["registry"]["admins"], ReturnType<typeof vi.fn>>;
  support: Record<keyof RegistryActionsClient["registry"]["support"], ReturnType<typeof vi.fn>>;
};

export type FakeOverrides = {
  [K in keyof Fns]?: Partial<Fns[K]>;
};

const unexpected = (path: string) =>
  vi.fn(async () => {
    throw new Error(`unexpected call: ${path}`);
  });

export function fakeClient(overrides: FakeOverrides = {}) {
  const fns: Fns = {
    shelters: {
      updateProfile: unexpected("shelters.updateProfile"),
      ...overrides.shelters,
    },
    verification: {
      startReview: unexpected("startReview"),
      approve: unexpected("approve"),
      reject: unexpected("reject"),
      suspend: unexpected("suspend"),
      reinstate: unexpected("reinstate"),
      resubmit: unexpected("resubmit"),
      ...overrides.verification,
    },
    donation: {
      approve: unexpected("donation.approve"),
      reject: unexpected("donation.reject"),
      ...overrides.donation,
    },
    admins: {
      invite: unexpected("admins.invite"),
      resendInvite: unexpected("admins.resendInvite"),
      remove: unexpected("admins.remove"),
      ...overrides.admins,
    },
    support: { enter: unexpected("support.enter"), ...overrides.support },
  };
  return { fns, client: { registry: fns } as unknown as RegistryActionsClient };
}

export function renderWithActions(
  ui: ReactNode,
  options: {
    view?: RegistryShelterView;
    client?: FakeOverrides;
    /** The record the page holds after a re-read; defaults to the one it started with. */
    reread?: Reread;
    navigate?: (to: string) => void;
  } = {},
) {
  const view = options.view ?? registryView();
  const { fns, client } = fakeClient(options.client);
  const reread = vi.fn(options.reread ?? (async () => view));
  const navigate = vi.fn(options.navigate ?? (() => {}));
  const result = render(
    <OperatorActionsProvider view={view} reread={reread} client={client} navigate={navigate}>
      {ui}
    </OperatorActionsProvider>,
  );
  return { ...result, fns, reread, navigate };
}

/** A promise the test settles by hand, to look at the screen while a call is in flight. */
export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
