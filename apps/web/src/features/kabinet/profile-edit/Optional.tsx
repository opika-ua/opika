import { uk } from "@opika/i18n";

/** «(необовʼязково)» after a label: lighter than the label it follows, never the only thing that says a field is optional. */
export function Optional() {
  return <span className="font-normal text-ink-2">{uk.kabinet.profileEdit.donation.optional}</span>;
}
