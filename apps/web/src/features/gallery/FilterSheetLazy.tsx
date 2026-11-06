"use client";

import dynamic from "next/dynamic";

/**
 * `FilterSheet` and the kit `Sheet` it pulls in, split out of the page's first-load chunks. Still
 * server-rendered (`ssr` stays on): the trigger link and the closed dialog are in the HTML, so the
 * no-JS `:target` path and the layout are unchanged and nothing flashes in. Only the code arrives
 * separately, after the chunks the page needs to become interactive.
 */
export const FilterSheet = dynamic(() => import("./FilterSheet").then((m) => m.FilterSheet));
