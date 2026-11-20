import { Window } from "happy-dom";

/**
 * Tests only: a rendered email read the way a client reads it, through a DOM parser rather than
 * patterns over the markup. Outlook's conditional comments hold markup too (the VML button, the
 * head block), so each comment's text is parsed again and read with the rest.
 */
const window = new Window();
const parser = new window.DOMParser();

type Doc = ReturnType<typeof parser.parseFromString>;
type El = ReturnType<Doc["querySelectorAll"]>[number];

const COMMENT_NODE = 8;

function commentsUnder(node: { childNodes: ArrayLike<unknown> }): string[] {
  const found: string[] = [];
  for (const child of Array.from(node.childNodes) as {
    nodeType: number;
    textContent: string | null;
    childNodes: ArrayLike<unknown>;
  }[]) {
    if (child.nodeType === COMMENT_NODE) found.push(child.textContent ?? "");
    else found.push(...commentsUnder(child));
  }
  return found;
}

/** The document and every document hidden in its conditional comments, recursively. */
function documentsOf(html: string): Doc[] {
  const doc = parser.parseFromString(html, "text/html");
  return [
    doc,
    ...commentsUnder(doc).flatMap((text) => (text.trim() === "" ? [] : documentsOf(text))),
  ];
}

/** Every element of the email, Outlook-only markup included. */
export function elementsOf(html: string): El[] {
  return documentsOf(html).flatMap((doc) => Array.from(doc.querySelectorAll("*")));
}

/** What a reader sees in the email's body: text only, no stylesheet, no comments. */
export function visibleTextOf(html: string): string {
  const doc = parser.parseFromString(html, "text/html");
  for (const style of Array.from(doc.querySelectorAll("style"))) style.remove();
  return doc.body?.textContent ?? "";
}

const CSS_URL = /url\(\s*(["']?)([^"')]*)\1\s*\)/g;

const cssUrls = (css: string): string[] =>
  [...css.matchAll(CSS_URL)].map((match) => (match[2] ?? "").trim());

/** A `srcset` value's URLs, without their width or density descriptors. */
const srcsetUrls = (value: string): string[] =>
  value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter((url) => url !== "");

/**
 * Every reference a client may load without a click: `src`, `srcset`, `background` and
 * `<link href>` on any element, and `url()` in style blocks and inline styles, Outlook's markup
 * included. A link a reader clicks (`<a href>`, the VML button's `href`) is not one.
 */
export function remoteReferencesOf(html: string): string[] {
  const found: string[] = [];
  for (const element of elementsOf(html)) {
    for (const name of ["src", "background"]) {
      const value = element.getAttribute(name);
      if (value !== null) found.push(value.trim());
    }
    const srcset = element.getAttribute("srcset");
    if (srcset !== null) found.push(...srcsetUrls(srcset));
    if (element.tagName.toLowerCase() === "link") {
      const href = element.getAttribute("href");
      if (href !== null) found.push(href.trim());
    }
    const style = element.getAttribute("style");
    if (style !== null) found.push(...cssUrls(style));
    if (element.tagName.toLowerCase() === "style")
      found.push(...cssUrls(element.textContent ?? ""));
  }
  return found;
}

/** Every link a reader can click, as the client resolves the attribute: entities decoded. */
export function hrefsOf(html: string): string[] {
  return elementsOf(html)
    .filter((element) => element.tagName.toLowerCase() !== "link")
    .flatMap((element) => {
      const href = element.getAttribute("href");
      return href === null ? [] : [href];
    });
}

/** The visible text of every `<a>`, Outlook's markup included. */
export function anchorTextsOf(html: string): string[] {
  return elementsOf(html)
    .filter((element) => element.tagName.toLowerCase() === "a")
    .map((element) => (element.textContent ?? "").trim());
}

/** The URL the fallback line under a button shows, as a reader copies it. */
export function fallbackUrlOf(html: string, label: string): string | undefined {
  const line = elementsOf(html).find(
    (element) =>
      element.tagName.toLowerCase() === "p" && (element.textContent ?? "").startsWith(label),
  );
  return line?.querySelector("span")?.textContent ?? undefined;
}

/** The one file a branded email may load: the versioned logo, fixed, on the site itself (owner, 2026-11-20). */
export const BRAND_ASSET_URLS = ["https://opika.org.ua/email/logo@2x-v1.png"] as const;

/** The distinct remote references, sorted, for an exact comparison by string equality. */
export const remoteReferenceSetOf = (html: string): string[] =>
  [...new Set(remoteReferencesOf(html))].sort();
