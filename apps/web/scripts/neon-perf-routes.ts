import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Call,
  createRecordingDatabase,
  findRepeatedStatements,
  labelOf,
  type PerfPick,
  perfTarget,
  pickPerfData,
  REPEAT_THRESHOLD,
  scrubbed,
  timelineLines,
  wavesOf,
} from "@opika/db/perf";
import { NO_FILTERS } from "@opika/domain";
import { createRouterClient } from "@orpc/server";
import type { AppContext } from "../src/api/context";
import { router } from "../src/api/router";
import {
  type AnimalPageClient,
  loadAnimalPage,
} from "../src/features/animal-detail/animal-page-load";
import { kabinetAnimalListPageOf } from "../src/features/kabinet/animal-list/animal-list-page";
import {
  loadShelterPage,
  type ShelterPageClient,
} from "../src/features/shelters/shelter-page-load";
import { SHELTER_WRITE_POLICY } from "../src/kabinet/access";
import { capturingInvitationSender } from "../src/kabinet/email-senders";

/**
 * `pnpm --filter @opika/web neon-perf-routes --expect ep-…`: for each public page route, each public
 * API procedure the pages use, and the kabinet K2 list, runs the route's real data loader (or the
 * page's own call sequence where the page builds JSX around it) against the branch, with every DB
 * statement recorded by `createRecordingDatabase`. Per route it prints how many DB calls were made,
 * a timeline (start offset and duration per call), the number of sequential waves (the critical
 * path, in round trips), repeated statements (N+1 shapes) and a static note from reading the
 * source. Read-only: only read paths are called. Nothing in any route or repository is changed by
 * this; the suggestions are text.
 */

type Client = ReturnType<typeof routerClient>;
const routerClient = (context: () => AppContext) => createRouterClient(router, { context });

type Route = {
  label: string;
  /** The page's own call sequence, from the source. */
  reads: string;
  run: (
    client: Client,
    db: Parameters<typeof kabinetAnimalListPageOf>[1]["db"],
    pick: PerfPick,
  ) => Promise<unknown>;
  /** What depends on what, and what could run together: from reading the code, not measured. */
  notes: string[];
  needs: (pick: PerfPick) => boolean;
};

const GALLERY_LIST_NOTE =
  "gallery.list (handler + repo) is 4 sequential trips: (1) page SELECT; (2) countShelters, which needs only the same WHERE and not the page rows; (3) shelterRepo.findByIds(page's shelter ids); (4) cityRepo.findByIds(cards' cities). " +
  "(2) could start together with (1) in one Promise.all. (3) and (4) both need (1)'s rows; (4) also needs (3) only for the shelter's own city, so they can be one statement (shelters and cities by id) or a JOIN in (1): 4 trips -> 2 (page + count in parallel, then one lookup) or -> 1 with the JOINs.";

const DETAIL_NOTE =
  "loadAnimalPage: animals.byId = animal (1) then its shelter (2, needs animal.shelterId); then shelters.byId AGAIN (3, the same shelter row read a second time, only for fields the animal view lacks); then cities.byIds (4, needs the animal's or shelter's city). regions.list has no query. " +
  "Obvious merge: one statement animal JOIN shelter JOIN city (4 trips -> 1); at minimum, drop (3) by returning the extra shelter fields from (2).";

export const ROUTES: Route[] = [
  {
    label: "/tvaryny (gallery, unfiltered)",
    reads: "regions.list (no DB) | gallery.list || gallery.facetCounts",
    needs: () => true,
    run: async (client) => {
      await client.regions.list({});
      await Promise.all([
        client.gallery.list({ filters: NO_FILTERS, sort: "freshest", page: 1 } as never),
        client.gallery.facetCounts({ filters: NO_FILTERS } as never),
      ]);
    },
    notes: [
      "The page already runs gallery.list and gallery.facetCounts together (one Promise.all), so the page's wall time is the slower of the two.",
      GALLERY_LIST_NOTE,
    ],
  },
  {
    label: "/tvaryny?misto=<busiest city>",
    reads: "regions.list | cities.resolveTokens, then gallery.list || gallery.facetCounts",
    needs: (p) => p.citySlug !== null && p.cityId !== null,
    run: async (client, _db, pick) => {
      const [, resolutions] = await Promise.all([
        client.regions.list({}),
        client.cities.resolveTokens({ tokens: [pick.citySlug as string] }),
      ]);
      const city = resolutions[0]?.city;
      const filters = city
        ? { ...NO_FILTERS, cities: { kind: "oneOf", values: [city.id] } }
        : NO_FILTERS;
      await Promise.all([
        client.gallery.list({ filters, sort: "freshest", page: 1 } as never),
        client.gallery.facetCounts({ filters } as never),
      ]);
    },
    notes: [
      "cities.resolveTokens must finish first: the filter holds the resolved city id, so list and facetCounts depend on it. Not parallelisable as written (the slug could be turned into an id inside the list query, which is a larger change).",
      GALLERY_LIST_NOTE,
    ],
  },
  {
    label: "/tvaryny/[animalId] (animal page)",
    reads: "loadAnimalPage: animals.byId -> shelters.byId -> regions.list || cities.byIds",
    needs: (p) => p.animalId !== null,
    run: (client, _db, pick) =>
      loadAnimalPage(pick.animalId as string, client as unknown as AnimalPageClient),
    notes: [DETAIL_NOTE],
  },
  {
    label: "/tvaryny/@preview/[animalId] (gallery overlay)",
    reads: "loadAnimalPage, then animals.neighbours (2 parallel statements)",
    needs: (p) => p.animalId !== null,
    run: async (client, _db, pick) => {
      await loadAnimalPage(pick.animalId as string, client as unknown as AnimalPageClient);
      await client.animals.neighbours({
        animalId: pick.animalId,
        filters: NO_FILTERS,
        sort: "freshest",
      } as never);
    },
    notes: [
      DETAIL_NOTE,
      "animals.neighbours needs only the animal id (not the loaded animal), but the overlay awaits it after loadAnimalPage. Starting it with loadAnimalPage in one Promise.all removes one trip from the critical path.",
    ],
  },
  {
    label: "/prytulky/[shelterId] (busiest shelter)",
    reads:
      "loadShelterPage: shelters.byId -> gallery.list -> [facetCounts x1-2 -> relaxationCounts] -> cities.byIds? -> regions.list",
    needs: (p) => p.busyShelter !== null,
    run: (client, _db, pick) =>
      loadShelterPage(
        pick.busyShelter as string,
        { sort: "freshest", page: 1, filters: NO_FILTERS },
        client as unknown as ShelterPageClient,
      ),
    notes: [
      "shelters.byId is awaited first only so its NOT_FOUND decides the page (source comment); gallery.list for the shelter scope needs only the id, so it could start with it (a 404 would just discard the list).",
      "facetCounts (read only above 12 animals, or with a filter) needs gallery.list's total only to decide whether to run: it could be started speculatively in the same Promise.all, or always run (its statement is independent of the page rows). With a filter on, the second facetCounts (unfiltered, for the heading) is independent of the first and can run with it.",
      "cities.byIds for the shelter's city runs only if the list's cityLabels lack it; it needs only shelter.publicLocation.cityId, known after shelters.byId, so it could join the first Promise.all.",
      GALLERY_LIST_NOTE,
    ],
  },
  {
    label: "/prytulky/[shelterId] (shelter with no animals)",
    reads: "as above",
    needs: (p) => p.emptyShelter !== null,
    run: (client, _db, pick) =>
      loadShelterPage(
        pick.emptyShelter as string,
        { sort: "freshest", page: 1, filters: NO_FILTERS },
        client as unknown as ShelterPageClient,
      ),
    notes: [
      "An empty list adds the count statements (matching and shelters) to the list: see the call count.",
    ],
  },
  {
    label: "animals.cardsByIds (/zberezheni, 12 saved cards)",
    reads: "animalRepo.findByIds -> shelterRepo.findByIds -> cityRepo.findByIds",
    needs: (p) => p.animalIds.length > 0,
    run: (client, _db, pick) => client.animals.cardsByIds({ animalIds: pick.animalIds } as never),
    notes: [
      "Three dependent trips: animals, then their shelters (needs animal.shelterId), then cities (needs animal and shelter cities). One statement with JOINs on shelters and cities returns the same data in 1 trip.",
    ],
  },
  {
    label: "/kabinet/tvaryny (K2 list, shelter admin)",
    reads: "shelter.profile.get || shelter.animals.list (one Promise.all)",
    needs: (p) => p.busyShelter !== null,
    run: (_client, db, pick) =>
      kabinetAnimalListPageOf(
        {
          kind: "shelter_admin",
          shelterAdminId: "33333333-3333-4333-8333-333333333333" as never,
          shelterId: pick.busyShelter as never,
        },
        {
          db,
          now: new Date(),
          newId: () => crypto.randomUUID(),
          invites: capturingInvitationSender(),
          linkBaseURL: "http://localhost",
          shelterWrites: SHELTER_WRITE_POLICY,
          cursorSecret: "perf-check-cursor-secret",
          operatorDisplayName: "perf",
        },
      ),
    notes: [
      "The page already reads the profile and the first page of animals together. Inside shelter.animals.list the page rows, the kind counts and the stale count are separate statements: see whether they run in one wave in the timeline.",
    ],
  },
];

const ms = (n: number) => (Math.round(n * 10) / 10).toString();

export function routeBlock(route: Route, calls: readonly Call[], wallMs: number): string[] {
  const waves = wavesOf(calls);
  const repeats = findRepeatedStatements(calls);
  const lines = [
    "",
    `== ${route.label}`,
    `   reads: ${route.reads}`,
    `   DB calls: ${calls.length} | sequential waves (critical path, in round trips): ${waves.length} | wall ${ms(wallMs)} ms`,
    ...timelineLines([...calls]),
  ];
  if (repeats.length === 0)
    lines.push(`   repeated statements (N+1, >= ${REPEAT_THRESHOLD}): none`);
  for (const r of repeats) {
    lines.push(
      `   N+1 SUSPECT: ${labelOf(r.sql)} issued ${r.count} times (${r.distinctParams} distinct parameter sets)`,
    );
  }
  // The same statement text twice with the same parameters: a duplicate read.
  const seen = new Map<string, number>();
  for (const c of calls) {
    const key = JSON.stringify([c.sql, c.params]);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seen) {
    if (n > 1)
      lines.push(
        `   DUPLICATE READ: ${labelOf((JSON.parse(key) as [string])[0])} x${n} with identical parameters`,
      );
  }
  for (const note of route.notes) lines.push(`   note: ${note}`);
  return lines;
}

export async function runRoutes(url: string, log: (line: string) => void): Promise<void> {
  const recorder = createRecordingDatabase(url);
  try {
    const pick = await pickPerfData(recorder.db);
    log(
      `Picked: busiest shelter ${pick.busyShelter ? "found" : "none"}, animal ${pick.animalId ? "found" : "none"}, city ${pick.citySlug ?? "none"}`,
    );
    const client = routerClient(
      (): AppContext => ({
        db: recorder.db,
        adopterId: null,
        tokenHash: null,
        now: new Date(),
        caller: { kind: "in_process" },
        setCookies: [],
      }),
    );
    for (const route of ROUTES) {
      if (!route.needs(pick)) {
        log("");
        log(`== ${route.label}`);
        log("   skipped: the branch has no data for it");
        continue;
      }
      // One untimed pass first, so the second is the warm one.
      await route.run(client, recorder.db, pick);
      recorder.reset();
      const started = performance.now();
      await route.run(client, recorder.db, pick);
      const wall = performance.now() - started;
      for (const line of routeBlock(route, recorder.calls, wall)) log(line);
    }
  } finally {
    await recorder.close();
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const target = perfTarget(url, process.argv.slice(2));
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log("Routes: warm pass (a cold pass runs first and is discarded). Reads only.");
  try {
    await runRoutes(url, (line) => console.log(scrubbed(line)));
  } catch (error) {
    console.error(
      scrubbed(`Routes failed: ${error instanceof Error ? error.message.split("\n")[0] : "error"}`),
    );
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
