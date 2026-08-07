import {
  DEFAULT_GALLERY_SORT,
  FeedFilterDimensionSchema,
  FeedFiltersSchema,
  GallerySortSchema,
} from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { FeedCardViewSchema } from "../views/animal";
import { galleryPageSchema, galleryPageSizeSchema } from "./pagination";

const countSchema = z.int().nonnegative();

/**
 * A separate namespace from `feed`, not an extension of it.
 *
 * The two consumption patterns do not share a shape: the deck sends a cursor
 * and gets one back, never needs a total, and personalises by seen-set; the
 * gallery sends a page number, needs totals to draw page links at all, and is
 * identical for every visitor so it can be server-rendered and crawled. Forcing
 * them into one procedure with a discriminated `pagination` union would make
 * the deck carry the gallery's concerns on every request.
 */
export const GalleryListInputSchema = z.object({
  filters: FeedFiltersSchema,
  sort: GallerySortSchema.default(DEFAULT_GALLERY_SORT),
  page: galleryPageSchema,
  pageSize: galleryPageSizeSchema,
});

export const GalleryListOutputSchema = z.object({
  /**
   * The same view the deck's cards use. The gallery card needs no field the
   * deck card does not already project through `pick`, so a second view schema
   * would be a second thing to keep in step with `AnimalSchema`.
   */
  items: z.array(FeedCardViewSchema).readonly(),

  /**
   * Every animal matching the filters, not just this page, and truthful past
   * the navigable bound: the surface must never report finding fewer animals
   * than it found.
   */
  totalMatching: countSchema,

  /** Distinct shelters across the whole match set — the second half of the
   * result line, and a genuinely different aggregate from `totalMatching`. */
  totalShelters: countSchema,

  /** Pages that can actually be navigated to, which is `totalMatching` capped
   * at the navigable bound and divided by `pageSize`. Zero when nothing
   * matches. */
  totalPages: countSchema,

  /**
   * The page actually served, which is not always the page requested: a link
   * shared before some animals were adopted resolves to the last real page
   * rather than to an error or a silent bounce to the start, and a page past
   * the navigable bound resolves to the deepest page that bound permits.
   * Never greater than `totalPages` unless nothing matches at all.
   *
   * Sent rather than left for the caller to recompute from `page` and
   * `totalPages`. The caller has to *say* which page it is showing and which
   * one was asked for, and a clamp re-derived on the client is a second
   * implementation of a server rule that can disagree with it.
   */
  page: z.int().positive(),
});

export const galleryListContract = oc
  .input(GalleryListInputSchema)
  .output(GalleryListOutputSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });

/**
 * How many more animals dropping one filter would show.
 *
 * A list rather than one nullable field per dimension, because the answer only
 * exists for a dimension the caller actually constrained — there is no "remove
 * the size filter" suggestion to make when no size filter is applied, and a
 * null meaning "not applicable" is a shape that invites being rendered as
 * "+0". The dimension names are `FeedFilters`' own, so acting on a suggestion
 * is a typed edit to the filter set rather than a mapping table.
 */
export const GalleryRelaxationSchema = z.object({
  dimension: FeedFilterDimensionSchema,
  /** `withoutThisDimension - current`. Always the *gain*, never the total. */
  additional: countSchema,
});
export type GalleryRelaxation = z.infer<typeof GalleryRelaxationSchema>;

export const GalleryRelaxationCountsInputSchema = z.object({
  filters: FeedFiltersSchema,
});

export const GalleryRelaxationCountsOutputSchema = z.object({
  /** Matches under the filters exactly as given — the number the no-match
   * state is explaining, and the baseline every `additional` is measured
   * against. */
  current: countSchema,
  /** Ordered by `additional`, descending: the most useful suggestion first. */
  relaxations: z.array(GalleryRelaxationSchema).readonly(),
});

/**
 * Its own procedure rather than more fields on `gallery.list`, because it
 * answers the question that only arises when there is no page of results to
 * carry an answer on — and it is a different query, a single scan with one
 * `COUNT(*) FILTER (...)` per constrained dimension, not a reuse of the page
 * fetch.
 */
export const galleryRelaxationCountsContract = oc
  .input(GalleryRelaxationCountsInputSchema)
  .output(GalleryRelaxationCountsOutputSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
