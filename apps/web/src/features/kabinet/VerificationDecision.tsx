import type { KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { BODY, CAPTION, CARD, CARD_TITLE, INNER, STRONG } from "./profile-edit/styles";

/**
 * K5 at its minimum (RU-Q7, answer 7, verbatim: "Yes: a minimal shelter-side
 * view in R-UI 3 showing the code and my note verbatim (keys in
 * rui-copy-uk.md §3.4)."): on `/kabinet`, a rejected or suspended shelter
 * sees why, as the operator wrote it: the title and what it means for its
 * animals, the reason's code, the operator's note quoted exactly as stored
 * (the contract trims it once on the way in; nothing rewrites or translates
 * it), and the line inviting a question. This is what
 * makes S4's «Притулок побачить рішення і пояснення дослівно у своєму
 * кабінеті» and the reason dialog's body sentences true.
 *
 * Read from the shelter-facing verification only (`ShelterFacingVerification`:
 * status, date, reason), which carries no moderator id and no evidence, and
 * nothing about adopters, ever (commitment #2). The code labels are the
 * operator's own list (`operator.codes`), one set for both sides, so the
 * shelter reads the same words the operator picked.
 *
 * Every other status renders nothing: pending and under review are the
 * chip's to say, verified needs no notice, and a pause is the shelter's own
 * (`PausedStatus`).
 *
 * The note's label is his «Пояснення від {operator}:» with «від {operator}»
 * left out (`noteLabelOf`).
 */
/**
 * «Пояснення:», from his «Пояснення від {operator}:». «від» takes the
 * genitive, and the operator's display name is configured in the nominative
 * only (RS-Q2), so filling it in reads «від Олексій Колотенко», which is not
 * Ukrainian. Until a genitive form of the name exists (a new configuration
 * value, Oleksii's to add), the label drops «від {operator}»: a narrowing of
 * his string, never new wording (decision AW-R3-1). His full string stays in
 * the catalogue for that day; the test pins what renders, so a change to it
 * that this no longer matches fails there, never on a shelter's screen.
 */
export const noteLabelOf = (template: string): string =>
  template.replace(/\s+від \{operator\}/u, "");

export function VerificationDecision({
  verification,
}: {
  verification: KabinetShelterView["verification"];
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
          <figcaption className={CAPTION}>{noteLabelOf(t.noteLabel)}</figcaption>
          <blockquote className={`${INNER} ${BODY} whitespace-pre-wrap`}>{note}</blockquote>
        </figure>
      ) : null}
      <p className={CAPTION}>{t.contact}</p>
    </section>
  );
}
