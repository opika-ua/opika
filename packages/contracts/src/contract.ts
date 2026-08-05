import { animalsByIdContract, animalsRevealContract } from "./procedures/animals.js";
import { citiesListContract } from "./procedures/cities.js";
import { feedListContract } from "./procedures/feed.js";
import { revealsListMineContract } from "./procedures/reveals.js";
import { sessionBootstrapContract } from "./procedures/session.js";
import { sheltersByIdContract } from "./procedures/shelters.js";
import { swipesRecordContract } from "./procedures/swipes.js";

/**
 * The API surface, as data.
 *
 * Every entry is a declarative object with no implementation attached —
 * handlers live in the app that serves them. Keeping the whole surface in one
 * package is what makes a future major-version migration of the contract
 * library a change to this package alone.
 */
export const contract = {
  session: {
    bootstrap: sessionBootstrapContract,
  },
  cities: {
    list: citiesListContract,
  },
  feed: {
    list: feedListContract,
  },
  animals: {
    byId: animalsByIdContract,
    reveal: animalsRevealContract,
  },
  reveals: {
    listMine: revealsListMineContract,
  },
  shelters: {
    byId: sheltersByIdContract,
  },
  swipes: {
    record: swipesRecordContract,
  },
} as const;

export type AppContract = typeof contract;
