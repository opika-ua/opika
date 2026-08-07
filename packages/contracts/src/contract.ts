import { animalsByIdContract, animalsRevealContract } from "./procedures/animals";
import { citiesListContract } from "./procedures/cities";
import { feedListContract } from "./procedures/feed";
import { galleryListContract, galleryRelaxationCountsContract } from "./procedures/gallery";
import { revealsListMineContract } from "./procedures/reveals";
import { sessionBootstrapContract } from "./procedures/session";
import { sheltersByIdContract } from "./procedures/shelters";
import { swipesRecordContract } from "./procedures/swipes";

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
  gallery: {
    list: galleryListContract,
    relaxationCounts: galleryRelaxationCountsContract,
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
