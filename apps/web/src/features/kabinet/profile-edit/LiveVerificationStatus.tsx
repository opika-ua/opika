"use client";

import type { ShelterVerification } from "@opika/domain";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { VerificationStatusChip } from "../StatusChips";

type Status = ShelterVerification["status"];

const Context = createContext<{ status: Status; set: (status: Status) => void } | null>(null);

/**
 * The page header's chip is rendered by the server, but a pause or resume in the editor changes
 * the status without a reload; the editor reports it here so the chip never says «Перевірено» over a paused shelter.
 */
export function LiveVerificationStatus({
  initial,
  children,
}: {
  initial: Status;
  children: ReactNode;
}) {
  const [status, set] = useState(initial);
  return <Context.Provider value={{ status, set }}>{children}</Context.Provider>;
}

export function LiveVerificationChip({ fallback }: { fallback: Status }) {
  const live = useContext(Context);
  return <VerificationStatusChip status={live?.status ?? fallback} />;
}

/** Called by the editor with the status of the view it holds. */
export function useReportVerification(status: Status) {
  const live = useContext(Context);
  const set = live?.set;
  useEffect(() => set?.(status), [set, status]);
}
