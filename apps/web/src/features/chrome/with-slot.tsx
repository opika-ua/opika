import { Fragment, type ReactNode } from "react";

/** A catalogue string with its one `{slot}` replaced by a node (a link), the text kept as it is. */
export function withSlot(template: string, slot: string, node: ReactNode): ReactNode {
  const marker = `{${slot}}`;
  const at = template.indexOf(marker);
  if (at < 0) throw new Error(`"${marker}" is missing from: ${template}`);
  return (
    <Fragment>
      {template.slice(0, at)}
      {node}
      {template.slice(at + marker.length)}
    </Fragment>
  );
}
