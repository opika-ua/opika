/**
 * Shared by the two CSP specs (`kabinet-csp`, `public-csp`): reading a response's policies and the
 * scripts its HTML carries, without running anything.
 */
import { createHash } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import { Window } from "happy-dom";

/** The site-wide enforced policy (audit F5), on every response. */
export const SITE_WIDE_CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

/** Every value of a header on the response, duplicates included. */
export const valuesOf = (response: APIResponse, name: string): string[] =>
  response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === name)
    .map((header) => header.value);

/** The directives of a policy, by name. */
export function directivesOf(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

/** The nonce a policy's `script-src` names, or "" when it names none. */
export const nonceOf = (policy: string): string =>
  /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)?.[1] ?? "";

/** Every `<script>` in a document, as an HTML parser reads it; nothing in it runs or loads. */
export function scriptsOf(html: string) {
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  try {
    const document = new window.DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll("script")].map((script) => ({
      nonce: script.getAttribute("nonce"),
      src: script.getAttribute("src"),
      type: script.getAttribute("type"),
      body: script.textContent ?? "",
    }));
  } finally {
    void window.happyDOM.close();
  }
}

export const sha256 = (text: string) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
