import { z } from "zod";
import { DEFAULT_GALLERY_SORT, GALLERY_SORTS, type GallerySort } from "../core";

/**
 * Lives here rather than in the contract package because both the API contract and the query
 * layer need it, and the query layer cannot depend on the contract package. The values and the
 * reasoning for them are in `../core`; the schema derives from that tuple.
 */
export { DEFAULT_GALLERY_SORT, GALLERY_SORTS, type GallerySort };

export const GallerySortSchema = z.enum(GALLERY_SORTS);
