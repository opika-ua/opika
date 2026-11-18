import type { ApplicationsQueueView } from "@opika/contracts";
import { cityRepo } from "@opika/db/repos";
import { createRouterClient } from "@orpc/server";
import type { KabinetPrincipal } from "../../../../kabinet/actor";
import type { KabinetContext } from "../../../../kabinet/context";
import { INVITE_PASSWORDS_OFF } from "../../../../kabinet/invite-password";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../../../kabinet/photo-uploads";
import { registryRouter } from "../../../../kabinet/registry-router";
import { type OperatorPageDeps, type OperatorRefusal, refusalOf } from "../pages";

/** The queue's one read, picked: a page render can reach no write (as `pages.ts` picks). */
const queueReadRouter = {
  registry: { applications: { list: registryRouter.registry.applications.list } },
};

export type OperatorQueue =
  | OperatorRefusal
  | { kind: "load_failed" }
  | { kind: "queue"; view: ApplicationsQueueView; cityNames: Record<string, string> };

/** «Заявки» on S1, read in-process through the registry's own access check and output schema. */
export async function operatorQueueOf(
  principal: KabinetPrincipal,
  deps: OperatorPageDeps,
  log: (error: unknown) => void = (error) =>
    // biome-ignore lint/suspicious/noConsole: the cleaned query error is the only trace of a failed read
    console.error("[kabinet] operator queue", error),
): Promise<OperatorQueue> {
  const client = createRouterClient(queueReadRouter, {
    context: (): KabinetContext => ({
      ...deps,
      principal,
      locationPolicy: null,
      setCookies: [],
      cookieHeader: null,
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
      invitePasswords: INVITE_PASSWORDS_OFF,
      transactionalMail: null,
    }),
  });
  let view: ApplicationsQueueView;
  try {
    view = await client.registry.applications.list({});
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal !== null) return refusal;
    log(error);
    return { kind: "load_failed" };
  }
  const ids = [...view.applications, ...view.listedUnverified].map((row) => row.cityId);
  const cities = ids.length === 0 ? [] : await cityRepo(deps.db).findByIds(ids);
  return {
    kind: "queue",
    view,
    cityNames: Object.fromEntries(cities.map((city) => [city.id, city.name.uk])),
  };
}
