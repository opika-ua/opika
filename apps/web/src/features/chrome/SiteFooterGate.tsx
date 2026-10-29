"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides the footer inside the shelters' cabinet, which is a tool and not a public page. The footer
 * itself stays a server component passed in as `children`, so its strings never reach the bundle.
 */
export function SiteFooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/kabinet" || pathname.startsWith("/kabinet/")) return null;
  return children;
}
