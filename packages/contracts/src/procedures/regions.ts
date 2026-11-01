import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { RegionViewSchema } from "../views/shelter";

/** The 27 first-level units, from a constant: no query behind it. */
export const regionsListContract = oc
  .input(z.object({}))
  .output(z.array(RegionViewSchema).readonly())
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
