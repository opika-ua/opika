import type { KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { BODY, CAPTION, CARD, CARD_TITLE, INNER, STRONG } from "./profile-edit/styles";

/**
 * K5 at its minimum (RU-Q7, answer 7, verbatim: "Yes: a minimal shelter-side
 * view in R-UI 3 showing the code and my note verbatim (keys in
 * rui-copy-uk.md §3.4)."): on `/kabinet`, a rejected or suspended shelter
 * sees why, as the operator wrote it: the title and what it means for its
 * animals, the reason's code, then «Пояснення:», the operator's note quoted
 * exactly as stored (the contract trims it once on the way in; nothing
 * rewrites or translates it) and the operator's signature under it (round-2
 * answer 2, verbatim: "«Пояснення:», then my note verbatim, then a signature
 * line «— {operator}» (nominative, as in the emails). No new env var."), and
 * the line inviting a question. This is what makes S4's «Притулок побачить
 * рішення і пояснення дослівно у своєму кабінеті» and the reason dialog's
 * body sentences true.
 *
 * Read from the shelter-facing verification only (`ShelterFacingVerification`:
 * status, date, reason), which carries no moderator id and no evidence, and
 * nothing about adopters, ever (commitment #2). The code labels are the
 * operator's own list (`operator.codes`), one set for both sides, so the
 * shelter reads the same words the operator picked.
 *
 * A reason stored before notes were required has no note: then there is no
 * «Пояснення:», no quotation and no signature, since the signature signs the
 * note. Every other status renders nothing: pending and under review are the
 * chip's to say, verified needs no notice, and a pause is the shelter's own
 * (`PausedStatus`).
 */
export function VerificationDecision({
  verification,
  operatorName,
}: {
  verification: KabinetShelterView["verification"];
  /**
   * Who signs the note: the name standing alone, as both emails sign
   * (`standaloneOperatorName`: the configured name, else «Адміністратор
   * сайту»). The same environment value the emails read; nothing new.
   */
  operatorName: string;
}) {
  const t = uk.kabinet.verificationDecision;
  if (verification.status !== "rejected" && verification.status !== "suspended") return null;
  const rejected = verification.status === "rejected";
  const code = rejected
    ? uk.kabinet.operator.codes.rejection[verification.reason.code]
    : uk.kabinet.operator.codes.suspension[verification.reason.code];
  const title = rejected ? t.rejectedTitle : t.suspendedTitle;
  const note = verification.reason.note;
  return (
    <section aria-label={title} className={CARD}>
      <h2 className={CARD_TITLE}>{title}</h2>
      <p className={BODY}>{rejected ? t.rejectedEffect : t.suspendedEffect}</p>
      <p className={STRONG}>{fillTemplate(t.reason, { code })}</p>
      {note !== null ? (
        <figure className="flex flex-col gap-2">
          <figcaption className={CAPTION}>{t.noteLabel}</figcaption>
          <blockquote className={`${INNER} ${BODY} whitespace-pre-wrap`}>{note}</blockquote>
          <p className={BODY}>{fillTemplate(t.signature, { operator: operatorName })}</p>
        </figure>
      ) : null}
      <p className={CAPTION}>{t.contact}</p>
    </section>
  );
}
