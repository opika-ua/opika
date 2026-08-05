import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";
import { SessionBootstrapViewSchema } from "../views/session.js";

export const SessionBootstrapInputSchema = z.object({
  /** Null on a first visit; the server issues one in that case. */
  deviceSessionId: z.string().min(1).nullable(),
});

export const sessionBootstrapContract = oc
  .input(SessionBootstrapInputSchema)
  .output(SessionBootstrapViewSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
