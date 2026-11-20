import { Fragment } from "react";

/** A catalogue string whose `\n` is a line break (the `{operator}` signature under a sentence). */
export function Lines(props: { text: string }) {
  const lines = props.text.split("\n");
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}
