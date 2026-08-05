import { contract } from "@opika/contracts";
import { implement } from "@orpc/server";
import type { AppContext } from "./context.js";
import { animalsById } from "./handlers/animals.js";
import { citiesList } from "./handlers/cities.js";
import { feedList } from "./handlers/feed.js";
import { animalsReveal } from "./handlers/reveal.js";
import { revealsListMine } from "./handlers/reveals-list.js";
import { sessionBootstrap } from "./handlers/session.js";
import { sheltersById } from "./handlers/shelters.js";
import { swipesRecord } from "./handlers/swipes.js";

/**
 * The oRPC router, implementing the contract from @opika/contracts.
 *
 * Each handler receives the validated input and the AppContext. oRPC validates
 * outputs against the contract's output schema and strips extra fields — this
 * is the runtime guarantee that `pick`-based views actually hold over the wire.
 */
const impl = implement(contract).$context<AppContext>();

export const router = impl.router({
  session: {
    bootstrap: impl.session.bootstrap.handler(({ input, context }) =>
      sessionBootstrap(input, context),
    ),
  },
  cities: {
    list: impl.cities.list.handler(({ input, context }) => citiesList(input, context)),
  },
  feed: {
    list: impl.feed.list.handler(({ input, context }) => feedList(input, context)),
  },
  animals: {
    byId: impl.animals.byId.handler(({ input, context }) => animalsById(input, context)),
    reveal: impl.animals.reveal.handler(({ input, context }) => animalsReveal(input, context)),
  },
  reveals: {
    listMine: impl.reveals.listMine.handler(({ input, context }) =>
      revealsListMine(input, context),
    ),
  },
  shelters: {
    byId: impl.shelters.byId.handler(({ input, context }) => sheltersById(input, context)),
  },
  swipes: {
    record: impl.swipes.record.handler(({ input, context }) => swipesRecord(input, context)),
  },
});
