"use server";

import { ShelterIdSchema } from "@opika/domain";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ANIMAL_LIST_PATH } from "../routes";
import { APPROVED_DISMISSED_COOKIE, approvedDismissedCookieOptions } from "./approved-dismissal";

/**
 * «Закрити» on «Притулок схвалено»: a plain form post, so it works without JavaScript. It records
 * the dismissal and re-renders the list in place; it never redirects (#509). The id only names
 * which banner this browser closed, so a forged one hides nothing but a banner.
 */
export async function dismissApprovedBanner(shelterId: string): Promise<void> {
  const parsed = ShelterIdSchema.safeParse(shelterId);
  if (!parsed.success) return;
  const jar = await cookies();
  jar.set(
    APPROVED_DISMISSED_COOKIE,
    parsed.data,
    approvedDismissedCookieOptions(process.env.NODE_ENV === "production"),
  );
  revalidatePath(ANIMAL_LIST_PATH);
}
