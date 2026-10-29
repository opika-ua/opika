import { ukPublic as uk } from "@opika/i18n/public";
import { Container } from "../../ui/Container";
import { Text } from "../../ui/Text";
import { SiteFooterGate } from "./SiteFooterGate";

/**
 * The one footer of the public site, drawn by the root layout so no page repeats it. For now it
 * carries only the settlement-list attribution; the privacy link joins it later (H5).
 */
export function SiteFooter() {
  return (
    <SiteFooterGate>
      <Container as="footer" className="py-6">
        <Text look="hint">{uk.footer.dataCredit}</Text>
      </Container>
    </SiteFooterGate>
  );
}
