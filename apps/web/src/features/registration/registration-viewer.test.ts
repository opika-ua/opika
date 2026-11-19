import type { Database } from "@opika/db";
import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import { describe, expect, it, vi } from "vitest";
import type { KabinetAuth } from "../../kabinet/auth";
import { type RegistrationViewerDeps, registrationViewerOf } from "./registration-viewer";

const { supportRepo, supportMode } = vi.hoisted(() => ({
  supportRepo: vi.fn(),
  supportMode: vi.fn(),
}));
vi.mock("@opika/db/repos", async (original) => ({
  ...(await original<typeof import("@opika/db/repos")>()),
  kabinetSupportRepo: supportRepo,
}));
vi.mock("../../kabinet/support", async (original) => ({
  ...(await original<typeof import("../../kabinet/support")>()),
  withSupportMode: supportMode,
}));

const NOW = new Date("2026-11-19T10:00:00Z");

/** Any use of the database outside the injected `roleOf` throws: the read must not write. */
const untouchableDb = new Proxy({} as Database, {
  get: (_target, key) => {
    // What Vitest's printer reads when a failed call shows its arguments; anything else is a read.
    if (key === "$$typeof" || key === "then" || key === "asymmetricMatch") return undefined;
    throw new Error(`database touched: ${String(key)}`);
  },
});

function depsWith(overrides: Partial<RegistrationViewerDeps> = {}) {
  const getSession = vi.fn(async (_args: unknown) => ({
    session: { createdAt: NOW, updatedAt: NOW },
    user: { id: "u-1", name: null, email: "olena@example.org" },
  }));
  const auth = vi.fn(() => ({ api: { getSession } }) as unknown as KabinetAuth);
  const roleOf = vi.fn(async () => ({
    kind: "shelter_admin" as const,
    shelterAdminId: "a-1" as ShelterAdminId,
    shelterId: "s-1" as ShelterId,
  }));
  const logError = vi.fn();
  const deps: RegistrationViewerDeps = {
    available: () => true,
    auth,
    db: () => untouchableDb,
    headers: async () => new Headers({ cookie: "x=1" }),
    now: () => NOW,
    roleOf,
    logError,
    ...overrides,
  };
  return { deps, auth, getSession, roleOf, logError };
}

describe("registrationViewerOf: who /prytulkam's card is for", () => {
  it("no session cookie: no auth read at all", async () => {
    const { deps, auth, getSession, roleOf } = depsWith();
    expect(await registrationViewerOf(false, deps)).toEqual({ kind: "anonymous" });
    expect(auth).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(roleOf).not.toHaveBeenCalled();
  });

  it("with the cookie: one session read without refresh, the role, and no support-view touch", async () => {
    const { deps, getSession } = depsWith();
    expect(await registrationViewerOf(true, deps)).toEqual({
      kind: "shelter",
      maskedEmail: "o•••@example.org",
    });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession.mock.calls[0]?.[0]).toMatchObject({ query: { disableRefresh: true } });
    expect(supportMode).not.toHaveBeenCalled();
    expect(supportRepo).not.toHaveBeenCalled();
  });

  it("a super_admin, support view open or not, is the operator", async () => {
    const { deps } = depsWith({
      roleOf: async () => ({ kind: "super_admin", moderatorId: "m-1" as ModeratorId }),
    });
    expect(await registrationViewerOf(true, deps)).toEqual({ kind: "operator" });
    expect(supportMode).not.toHaveBeenCalled();
  });

  it("a failed read shows the form and logs the error class only", async () => {
    const { deps, logError } = depsWith({
      roleOf: async () => {
        throw new TypeError("select … token=secret");
      },
    });
    expect(await registrationViewerOf(true, deps)).toEqual({ kind: "anonymous" });
    expect(logError).toHaveBeenCalledWith("TypeError");
  });
});
