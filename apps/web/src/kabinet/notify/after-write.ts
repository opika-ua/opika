import { notificationRecipientsRepo } from "@opika/db/repos";
import type { Shelter } from "@opika/domain";
import { errorClassNameOf } from "../error-class-name";
import { createPacer, deliver, type NotifyDeps } from "./deliver";
import { type HistoryLine, planEventIntents } from "./intents";

/**
 * The event mails for a write that has committed (O1, O2, S1-S4). Never throws: it runs in
 * `after()`, past the response, and a failed mail must not turn a saved change into an error.
 * One masked line per failure, no address and no id.
 */
export async function notifyAfterWrite(
  deps: NotifyDeps,
  shelter: Shelter,
  lines: readonly HistoryLine[],
): Promise<void> {
  try {
    const intents = planEventIntents(shelter, lines);
    if (intents.length === 0) return;
    const recipients = notificationRecipientsRepo(deps.db);
    const pacer = createPacer(deps);
    for (const intent of intents) {
      const to =
        intent.audience === "operators"
          ? await recipients.operators()
          : await recipients.shelterAdmins(intent.shelterId);
      for (const recipient of to) {
        try {
          await deliver(deps, pacer, intent, recipient);
        } catch (error) {
          deps.log(
            `[kabinet] notification ${intent.kind} not delivered (${errorClassNameOf(error)})`,
          );
        }
      }
    }
  } catch (error) {
    deps.log(`[kabinet] notification after a write failed (${errorClassNameOf(error)})`);
  }
}
