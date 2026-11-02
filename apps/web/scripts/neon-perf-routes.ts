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
import { galleryRepo } from "@opika/db/repos";
import { type AnimalId, NO_FILTERS } from "@opika/domain";
import { createRouterClient } from "@orpc/server";
import type { AppContext } from "../src/api/context";
import { router } from "../src/api/router";
import {
  type AnimalPageClient,
  loadAnimalPage,
} from "../src/features/animal-detail/animal-page-load";
import { loadOverlayData } from "../src/features/animal-overlay/overlay-load";
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
 * source. Only read paths are called (the connection is also READ ONLY when local; Neon HTTP has no session). Nothing in any route or repository is changed by
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
  "gallery.list (handler + repo) is one wave: the page SELECT joins each card's shelter and city (narrow public columns), and countShelters runs beside it. Only a page past the end or with no match adds a count wave.";

const DETAIL_NOTE =
  "loadAnimalPage: animals.byId is one statement (animal JOIN shelter); then shelters.byId (the page-only shelter fields) and cities.byIds run together (the card's city is known from the animal view). regions.list has no query. The shelter row is still read a second time for fields the animal view lacks; dropping that needs a contract change.";

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
    reads:
      "loadAnimalPage: animals.byId (animal JOIN shelter) -> shelters.byId || regions.list || cities.byIds",
    needs: (p) => p.animalId !== null,
    run: (client, _db, pick) =>
      loadAnimalPage(pick.animalId as string, client as unknown as AnimalPageClient),
    notes: [DETAIL_NOTE],
  },
  {
    label: "/tvaryny/@preview/[animalId] (gallery overlay)",
    reads: "loadOverlayData: loadAnimalPage || animals.neighbours (2 parallel statements)",
    needs: (p) => p.animalId !== null,
    run: async (client, _db, pick) => {
      await loadOverlayData(pick.animalId as AnimalId, {}, client as unknown as AnimalPageClient);
    },
    notes: [
      DETAIL_NOTE,
      "animals.neighbours (2 parallel statements) starts with loadAnimalPage in one Promise.all: it needs only the animal id.",
    ],
  },
  {
    label: "/prytulky/[shelterId] (busiest shelter)",
    reads:
      "loadShelterPage: shelters.byId || gallery.list || [facetCounts x2 when filtered] -> facetCounts / relaxationCounts / cities.byIds together",
    needs: (p) => p.busyShelter !== null,
    run: (client, _db, pick) =>
      loadShelterPage(
        pick.busyShelter as string,
        { sort: "freshest", page: 1, filters: NO_FILTERS },
        client as unknown as ShelterPageClient,
      ),
    notes: [
      "shelters.byId and gallery.list start together (a 404 just discards the list); the facet counts the list's total calls for, the zero-match suggestions and the shelter's own city (when no card carried it) run together in a second wave.",
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
      "An empty list adds one count statement (matching) after the page: see the call count.",
    ],
  },
  {
    label: "animals.cardsByIds (/zberezheni, 12 saved cards)",
    reads: "animalRepo.findCardsByIds (animals JOIN shelters JOIN cities)",
    needs: (p) => p.animalIds.length > 0,
    run: (client, _db, pick) => client.animals.cardsByIds({ animalIds: pick.animalIds } as never),
    notes: ["One statement: the animals with their shelters and card cities (LEFT JOINs)."],
  },
  {
    label: "/sitemap.xml (every public animal)",
    reads: "galleryRepo.sitemapRows (ids and shelter ids, one statement up to the navigable bound)",
    needs: () => true,
    run: (_client, db) => galleryRepo(db).sitemapRows({ now: new Date() }),
    notes: [
      "One statement. It was a loop of 50-animal gallery pages, each four statements in a row (page, shelter count, shelters, cities): about 4 x ceil(n/50) round trips in sequence.",
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

/** What a route cost: statements issued and sequential waves (round trips on the critical path). */
export type RouteCost = { label: string; calls: number; waves: number; wallMs: number } | null;

export async function runRoutes(
  url: string,
  log: (line: string) => void,
  options: { latencyMs?: number } = {},
): Promise<ReadonlyMap<string, RouteCost>> {
  const costs = new Map<string, RouteCost>();
  const recorder = createRecordingDatabase(url, { readOnly: true, ...options });
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
        costs.set(route.label, null);
        continue;
      }
      // One untimed pass first, so the second is the warm one.
      await route.run(client, recorder.db, pick);
      recorder.reset();
      const started = performance.now();
      await route.run(client, recorder.db, pick);
      const wall = performance.now() - started;
      for (const line of routeBlock(route, recorder.calls, wall)) log(line);
      costs.set(route.label, {
        label: route.label,
        calls: recorder.calls.length,
        waves: wavesOf(recorder.calls).length,
        wallMs: wall,
      });
    }
  } finally {
    await recorder.close();
  }
  return costs;
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
  console.log(
    "Routes: warm pass (a cold pass runs first and is discarded). Read paths only; local connection READ ONLY, Neon HTTP has no session.",
  );
  try {
    // PERF_LATENCY_MS=26 holds each statement back that long (local only): the wall time then
    // reads as waves x round trip, as it would over Neon.
    const latencyMs = Number(process.env["PERF_LATENCY_MS"] ?? 0) || 0;
    await runRoutes(url, (line) => console.log(scrubbed(line)), { latencyMs });
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
