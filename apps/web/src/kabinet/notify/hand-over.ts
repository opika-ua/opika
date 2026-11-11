import type { Shelter } from "@opika/domain";
import type { HistoryLine, ShelterNotifier } from "./intents";

/**
 * Where the two write choke points give a committed write to the notifier. A notifier that
 * throws (a scheduler outside a request, say) is swallowed: the change is saved, and a mail is
 * never a reason to answer an error for it.
 */
export function handOver(
  notify: ShelterNotifier | undefined,
  shelter: Shelter,
  lines: readonly HistoryLine[],
): void {
  try {
    notify?.(shelter, lines);
  } catch {
    // Deliberately silent: there is nothing to log without an address or an id, and the
    // notifier's own failures are logged where they happen.
  }
}
