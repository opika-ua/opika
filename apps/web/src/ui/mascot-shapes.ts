// Shapes only, cleaned from the brand Figma export (Maskot page): no wrapper groups, same-colour
// shapes merged into one path, whole-pixel coordinates. A fill is a colour token name (globals.css).
// An eyes-as-holes path keeps its even-odd rule.
export type MascotShape = {
  /** Viewbox size; the height is the asset's own, `size` scales it. */
  w: number;
  h: number;
  /** [token, path data, evenOdd?] in paint order. */
  paths: readonly (readonly [token: string, d: string, evenOdd?: true])[];
};

export const MASCOT_SHAPES = {
  "cat-lie": {
    w: 380,
    h: 164,
    paths: [
      [
        "accent",
        "M316 117h-24v-46h25v-34h26v-34h36v23h-13v34h-25v34h-25zM27 0l71 30h-71zM169 0v30h-71zM0 144h71v20h-71z",
      ],
      ["accent", "M27 29h266v135h-266zM67 71h12v45h-12zM117 71h12v45h-12z", true],
      [
        "mascot-cat-stripe",
        "M78 44h7v17h-7zM97 44h7v17h-7zM116 44h7v17h-7zM178 30h9v47h-9zM209 30h9v47h-9zM240 30h9v47h-9zM271 30h9v47h-9z",
      ],
    ],
  },
  "cat-sit-collar": {
    w: 302,
    h: 337,
    paths: [
      [
        "accent",
        "M0 29h214v295h-214zM20 281h55v56h-55zM129 281h55v56h-55zM0 0l107 29h-107zM214 0v29h-107zM248 286h-34v-65h35v-48h52v34h-18v48h-35z",
      ],
      ["mascot-cat-stripe", "M57 47h9v31h-9zM82 47h9v31h-9zM106 47h9v31h-9zM214 165v17h-213v-17z"],
      ["mascot-tag", "M115 181v16h-16v-16z"],
      ["on-ink", "M42 96h18v38h-18zM111 96h18v38h-18z"],
    ],
  },
  "cat-sit": {
    w: 302,
    h: 337,
    paths: [
      [
        "accent",
        "M0 29h214v295h-214zM20 281h55v56h-55zM129 281h55v56h-55zM0 0l107 29h-107zM214 0v29h-107zM248 286h-34v-65h35v-48h52v34h-18v48h-35z",
      ],
      ["mascot-cat-stripe", "M57 47h9v31h-9zM82 47h9v31h-9zM106 47h9v31h-9z"],
      ["on-ink", "M42 96h18v38h-18zM111 96h18v38h-18z"],
    ],
  },
  "cat-stand-tail": {
    w: 364,
    h: 200,
    paths: [
      [
        "accent",
        "M0 42l74 16h-74zM147 42v16h-73zM22 185h40v15h-40zM108 185h39v15h-39zM202 185h39v15h-39zM263 185h40v15h-40zM327 79h-24v-46h24v-33h37v24h-13v33h-24z",
      ],
      ["accent", "M0 58h303v127h-303z", true],
      ["on-ink", "M33 97h14v48h-14zM88 97h13v48h-13z"],
      ["mascot-cat-stripe", "M179 58h9v47h-9zM210 58h9v47h-9zM241 58h9v47h-9zM271 58h10v47h-10z"],
      ["mascot-tag", "M22 194h40v6h-40zM108 194h39v6h-39zM202 194h39v6h-39zM263 194h40v6h-40z"],
    ],
  },
  "cat-stand": {
    w: 354,
    h: 164,
    paths: [
      [
        "accent",
        "M316 98l-26-8l16-52l18-14l-3-19l26-5l6 35l-24 19zM0 6l74 15h-74zM148 6v15h-74zM22 149h40v15h-40zM108 149h39v15h-39zM202 149h39v15h-39zM263 149h40v15h-40z",
      ],
      ["accent", "M0 21h303v128h-303z", true],
      [
        "mascot-cat-stripe",
        "M47 33h7v23h-7zM66 33h7v23h-7zM85 33h7v23h-7zM179 21h9v48h-9zM210 21h9v48h-9zM241 21h9v48h-9zM271 21h10v48h-10z",
      ],
      ["on-ink", "M33 68h14v33h-14zM88 68h13v33h-13z"],
      ["mascot-tag", "M22 158h40v6h-40zM108 158h39v6h-39zM202 158h39v6h-39zM263 158h40v6h-40z"],
    ],
  },
  "dog-lie": {
    w: 400,
    h: 180,
    paths: [
      [
        "mascot-dog",
        "M28 8l52 14l-24 94l-52-14zM256 102l-52 14l-24-94l52-14zM346 62l42-11l11 42l-42 11zM55 30h305v135h-305zM20 150h76v22h-76z",
      ],
      ["species-dog", "M86 52h64v70h-64z"],
      ["on-ink", "M104 66h26v38h-26zM168 66h26v38h-26z"],
      ["mascot-dog-light", "M104 110h90v36h-90z"],
      ["on-ink", "M137 116h24v14h-24z"],
    ],
  },
  "dog-sit": {
    w: 416,
    h: 399,
    paths: [
      [
        "mascot-dog",
        "M28 0l53 14l-28 106l-53-14zM344 292l13-48l48 13l-13 48zM387 2l28 106l-53 14l-28-106zM63 341h57v57h-57zM295 341h58v57h-58z",
      ],
      ["mascot-dog", "M63 2h290v383h-290z", true],
      ["species-dog", "M113 176v-111h96v111zM63 234h290v19h-290z"],
      ["on-ink", "M141 150v-59h40v59zM235 150v-59h41v59z"],
      ["mascot-dog-light", "M141 157h135v52h-135z", true],
      ["on-ink", "M190 165h37v22h-37z"],
      ["mascot-tag", "M198 253h19v19h-19z"],
    ],
  },
  "dog-stand": {
    w: 420,
    h: 260,
    paths: [
      [
        "mascot-dog",
        "M28 8l52 14l-24 94l-52-14zM256 102l-52 14l-24-94l52-14zM372 56l40-10l10 40l-40 10zM55 10h150v160h-150zM150 80h235v130h-235zM165 210h45v40h-45zM225 210h45v40h-45zM290 210h45v40h-45zM345 210h40v40h-40z",
      ],
      ["species-dog", "M80 40h60v70h-60zM150 140h55v16h-55z"],
      ["on-ink", "M96 54h24v38h-24zM150 54h24v38h-24z"],
      ["mascot-dog-light", "M96 100h84v36h-84z"],
      ["on-ink", "M126 106h24v14h-24z"],
      ["mascot-tag", "M168 156h16v16h-16z"],
    ],
  },
} as const satisfies Record<string, MascotShape>;

export type MascotShapeKey = keyof typeof MASCOT_SHAPES;
