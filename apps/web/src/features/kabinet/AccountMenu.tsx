"use client";

import { uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { buttonClass } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/Icon";
import { Popover } from "../../ui/Popover";
import { Sheet } from "../../ui/Sheet";
import { PUBLIC_GALLERY_PATH, SHELTER_ACCOUNT_PATH } from "./routes";
import { SignOutButton } from "./SignOutButton";

export type AccountMenuProps = {
  /** The button's label: the shelter's name, or «Оператор». */
  buttonLabel: string;
  /** First line of the menu: who is signed in. */
  name: string;
  /** Second line: the role, when there is one to say. */
  role: string | null;
  /** «Акаунт і пароль» is offered to a shelter's own admin only (the operator has no password). */
  account: boolean;
  /** The support view cannot sign out. */
  signOut: "enabled" | "disabled";
};

const ROW = cx(buttonClass("ghost"), "w-full justify-start rounded-field px-3 no-underline");

function SiteLink() {
  return (
    <a href={PUBLIC_GALLERY_PATH} target="_blank" rel="noopener" className={ROW}>
      {uk.kabinet.shell.toSite}
      <Icon name="arrow-up-right" size="md" />
      <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
    </a>
  );
}

function Body({ props, withSite }: { props: AccountMenuProps; withSite: boolean }): ReactNode {
  return (
    <div className="flex w-full min-w-56 flex-col gap-1">
      <p className="flex flex-col px-3 py-2">
        <span className="break-words text-label text-ink">{props.name}</span>
        {props.role === null ? null : <span className="text-caption text-ink-2">{props.role}</span>}
      </p>
      {withSite ? <SiteLink /> : null}
      {props.account ? (
        <a href={SHELTER_ACCOUNT_PATH} className={ROW}>
          {uk.kabinet.shell.accountAndPassword}
        </a>
      ) : null}
      {props.signOut === "enabled" ? (
        <SignOutButton variant="menu" />
      ) : (
        <p className="px-3 py-2 text-body text-ink-2">{uk.kabinet.support.signOutDisabled}</p>
      )}
    </div>
  );
}

/**
 * The header's account button and its menu. From `tablet` a Popover in the top layer under a button
 * labelled with the shelter's name; on a phone an icon button opening a bottom sheet that also
 * carries «На сайт» (the header has no room for that link there).
 */
export function AccountMenu(props: AccountMenuProps) {
  return (
    <>
      <Popover
        label={props.buttonLabel}
        trigger={props.buttonLabel}
        panelLabel={props.name}
        align="end"
        className="hidden max-w-64 tablet:block"
      >
        <Body props={props} withSite={false} />
      </Popover>
      <Sheet
        id="kabinet-account"
        label={props.buttonLabel}
        closeLabel={uk.kabinet.profileEdit.pause.close}
        trigger={<Icon name="user" />}
        triggerClassName="rounded-pill border-2 border-line tablet:hidden"
        hideFrom="tablet"
      >
        <Body props={props} withSite />
      </Sheet>
    </>
  );
}
