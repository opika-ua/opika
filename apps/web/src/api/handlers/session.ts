import type { SessionBootstrapView } from "@opika/contracts";
import { adopterRepo, sessionRepo } from "@opika/db/repos";
import {
  type AdopterId,
  AdopterIdSchema,
  type CountryCode,
  CountryCodeSchema,
  NO_FILTERS,
} from "@opika/domain";
import type { AppContext } from "../context";
import {
  DEFAULT_SESSION_POLICY,
  hashToken,
  mintSessionToken,
  setSessionCookie,
} from "../session/index";

export async function sessionBootstrap(
  _input: Record<string, never>,
  context: AppContext,
): Promise<SessionBootstrapView> {
  // If the caller already has a valid session, return it
  if (context.adopterId) {
    const adopters = adopterRepo(context.db);
    const adopter = await adopters.findById(context.adopterId);
    if (adopter) {
      return {
        adopter: {
          id: adopter.id,
          country: adopter.country,
          preferredLocale: adopter.preferredLocale,
          isAnonymous: adopter.identity.kind === "anonymous",
        },
        filters: adopter.savedFilters ?? NO_FILTERS,
        serverTime: context.now,
      };
    }
  }

  // Mint a new anonymous session
  const token = mintSessionToken();
  const hash = hashToken(token);
  const adopterId = AdopterIdSchema.parse(crypto.randomUUID()) as AdopterId;
  const country = CountryCodeSchema.parse("UA") as CountryCode;

  const adopters = adopterRepo(context.db);
  await adopters.insert({
    id: adopterId,
    identity: { kind: "anonymous", deviceSessionId: hash },
    country,
    preferredLocale: "uk",
    savedFilters: null,
    createdAt: context.now,
  });

  const sessions = sessionRepo(context.db);
  await sessions.insert({
    tokenHash: hash,
    adopterId,
    createdAt: context.now,
    lastSeenAt: context.now,
  });

  // Queue Set-Cookie for the response
  context.setCookies.push(setSessionCookie(token, DEFAULT_SESSION_POLICY.absoluteExpirySeconds));

  return {
    adopter: {
      id: adopterId,
      country,
      preferredLocale: "uk",
      isAnonymous: true,
    },
    filters: NO_FILTERS,
    serverTime: context.now,
  };
}
