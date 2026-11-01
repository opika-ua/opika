// Not a client module, so the server page can read `?tab=` with it.
/** The sub-tabs and their `?tab=` values (Latin slugs, like the routes). The first is the default. */
export const PROFILE_TABS = ["profil", "kontakty", "zbir", "perevirka", "akaunt"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];
export const profileTabOf = (raw: string | undefined): ProfileTab =>
  PROFILE_TABS.find((tab) => tab === raw) ?? "profil";
