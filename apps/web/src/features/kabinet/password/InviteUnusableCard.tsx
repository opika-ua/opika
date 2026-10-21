"use client";

import { uk } from "@opika/i18n";
import Link from "next/link";
import type { Ref } from "react";
import { linkClass } from "../../controls/controls";
import { SIGN_IN_PAGE_PATH } from "../routes";
import { CARD_BODY, CARD_TITLE, CardFrame } from "./CardFrame";
import { useTokenOutOfAddressBar } from "./use-token-out-of-address-bar";

/**
 * The one page every invitation link that can't be used gets (PW-2; Oleksii, Q1, verbatim: "An
 * unknown, expired, used or revoked link renders one identical "link no longer works" page."),
 * whether the link's GET found it so or the form's POST did: his `inviteLanding` strings, and the
 * way to sign-in for someone who already set a password with it. His 2026-10-21 text (Q2 (b))
 * covers both readers: «Якщо пароль уже створено — увійдіть. Якщо ні — напишіть мені…».
 *
 * The token leaves the address bar here too (review finding 5, his Q3): a dead link's token is
 * still the link's, and no history entry keeps it.
 */
export function InviteUnusableCard({ titleRef }: { titleRef?: Ref<HTMLHeadingElement> }) {
  useTokenOutOfAddressBar();
  const copy = uk.kabinet.inviteLanding;
  return (
    <CardFrame titleId="invite-unusable-title">
      <h1 id="invite-unusable-title" ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
        {copy.unusableTitle}
      </h1>
      <p className={CARD_BODY}>{copy.expired}</p>
      <Link href={SIGN_IN_PAGE_PATH} className={linkClass("text")}>
        {copy.signIn}
      </Link>
    </CardFrame>
  );
}
