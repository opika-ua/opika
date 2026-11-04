import fs from "node:fs";
import { createRequire } from "node:module";

const req = createRequire("D:/opika-worktrees/batch2/apps/web/package.json");
const { chromium } = req(
  "D:/opika-worktrees/batch2/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core",
);
const axe = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const tab = (l, bad) =>
  `<button role="tab" aria-selected="false" aria-controls="p"><span>${l}</span>${bad ? `<span aria-hidden="true" style="margin-left:8px">!</span><span class="sr-only">, потрібно доповнити</span>` : ""}</button>`;
const html = `<!doctype html><html lang="uk"><head><title>t</title><style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style></head><body><main><div role="tablist" aria-label="x">${tab("Основне", 1)}${tab("Фото", 1)}${tab("Про тварину", 1)}${tab("Здоровʼя", 0)}</div><div id="p" role="tabpanel">p</div></main></body></html>`;
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(html);
await p.addScriptTag({ content: axe });
const r = await p.evaluate(() => axe.run());
console.log(
  r.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.html.slice(0, 60)).join("|")),
);
console.log(JSON.stringify(await p.locator("[role=tablist]").ariaSnapshot()));
await b.close();
