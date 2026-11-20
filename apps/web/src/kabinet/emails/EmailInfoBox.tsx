import { Lines } from "./Lines";
import type { InfoBoxKind } from "./model";
import { DARK_CLASS } from "./styles";
import { LIGHT, RADIUS, TYPE } from "./theme";

/** A tinted box for one aside: information (lavender), success (mint) or warning (peach). */
export function EmailInfoBox(props: { kind: InfoBoxKind; text: string }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "0 0 20px" }}
    >
      <tbody>
        <tr>
          <td
            className={DARK_CLASS.box(props.kind)}
            style={{
              backgroundColor: LIGHT[props.kind],
              borderRadius: RADIUS.box,
              padding: "16px 20px",
            }}
          >
            <p
              className={DARK_CLASS.text}
              style={{
                margin: 0,
                fontSize: TYPE.body.size,
                lineHeight: TYPE.body.lineHeight,
                color: LIGHT.ink,
              }}
            >
              <Lines text={props.text} />
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
