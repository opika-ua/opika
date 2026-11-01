"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";
import { OPERATOR_HOME } from "./routes";

/** `session.exitSupport`, the one write a support view may make (access matrix). */
export const EXIT_SUPPORT_PATH = "/api/kabinet/session/exitSupport";
/**
 * Where the operator goes after leaving: the list of shelters, S1 (RU-Q5,
 * answer 5, verbatim: "Yes: support mode in R-UI 3. Leaving it returns to the
 * list."). Named directly rather than through `/kabinet`'s redirect for a
 * super_admin, so the destination is the list whatever `/kabinet` does. This
 * supersedes KS-T11's front door, chosen while the registry had no screens.
 */
export const AFTER_SUPPORT_DESTINATION = OPERATOR_HOME;

async function defaultExit(): Promise<boolean> {
  const response = await fetch(EXIT_SUPPORT_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    // oRPC's RPC body for an empty input.
    body: JSON.stringify({ json: {} }),
  });
  return response.ok;
}

/**
 * S5 · support mode (KABINET N16; mock «S5 Режим підтримки»): a black 64px bar
 * over everything that doesn't scroll away, naming the shelter, with
 * «Вийти з режиму» as the system's one white-on-black button. The page around
 * it carries the 4px frame (`ShelterProfile`) and shows no writes: this page
 * has none, so the third signal (every action disabled) has nothing to apply
 * to here.
 */
export function SupportBanner({
  shelterName,
  exit = defaultExit,
  navigate = (to: string) => window.location.assign(to),
}: {
  shelterName: string;
  exit?: () => Promise<boolean>;
  navigate?: (to: string) => void;
}) {
  const [state, setState] = useState<"idle" | "leaving" | "failed">("idle");
  const t = uk.kabinet.support;
  // The title names the shelter too (EM-Q2): it speaks to the operator about
  // whose cabinet this is, with no operator name typed into the copy.
  const title = t.title.replaceAll("{shelter}", () => shelterName);
  return (
    <section
      aria-label={title}
      className="sticky top-0 z-(--z-header) flex min-h-16 flex-col items-start gap-3 bg-ink px-4 py-3 text-on-ink tablet:flex-row tablet:items-center tablet:px-8"
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-label">{title}</span>
        <span className="text-caption">{t.body}</span>
        {state === "failed" ? (
          <span role="alert" className="text-caption">
            {t.exitFailed}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        aria-busy={state === "leaving"}
        onClick={async () => {
          if (state === "leaving") return;
          setState("leaving");
          const left = await exit().catch(() => false);
          if (left) navigate(AFTER_SUPPORT_DESTINATION);
          else setState("failed");
        }}
        className="inline-flex min-h-target cursor-pointer items-center justify-center rounded-pill bg-on-ink px-6 text-label whitespace-nowrap text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-on-ink focus-visible:outline-solid"
      >
        {t.exit}
      </button>
    </section>
  );
}
