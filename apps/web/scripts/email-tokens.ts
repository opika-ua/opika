// Regenerates src/kabinet/emails/tokens.generated.json from app/globals.css (the token bridge, src/kabinet/emails/token-bridge.ts).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { emailTokensFromCss, emailTokensJson } from "../src/kabinet/emails/token-bridge";

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");
const target = fileURLToPath(
  new URL("../src/kabinet/emails/tokens.generated.json", import.meta.url),
);
writeFileSync(target, emailTokensJson(emailTokensFromCss(css)));
process.stdout.write(`wrote ${target}\n`);
