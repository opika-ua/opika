import { useEffect, useState } from "react";

/**
 * Copies text and remembers which button did it for two seconds, so that button can say
 * «Скопійовано.». A missing clipboard or a refused permission stays silent: the text is on screen.
 */
export function useCopiedKey() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // The confirmation clears itself; it is never kept for the next open.
  useEffect(() => {
    if (copiedKey === null) return;
    const timer = setTimeout(() => setCopiedKey(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const copy = async (key: string, value: string) => {
    if (typeof navigator.clipboard?.writeText !== "function") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      // No clipboard permission or an insecure context: nothing was copied, so nothing is said.
    }
  };

  return { copiedKey, copy };
}
