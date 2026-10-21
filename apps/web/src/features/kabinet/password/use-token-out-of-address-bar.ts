"use client";

import { useEffect } from "react";

/**
 * His PW1-V1 rule, extended to the invitation by his PW-2 Q3 (verbatim excerpt: "extend PW-1's
 * beforeSend query-stripping and the history.replaceState token removal to ?zaproshennia="):
 * once a token page has rendered, the address bar, the history entry and anything reading
 * `location` see the bare path. The form keeps what it needs in its own state, never in the URL.
 */
export function useTokenOutOfAddressBar(): void {
  useEffect(() => {
    if (window.location.search !== "") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
}
