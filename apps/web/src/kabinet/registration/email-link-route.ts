import type {
  ApplicationDeletionOutcome,
  ApplicationSummary,
  EmailConfirmOutcome,
  RegistrantApplication,
  RegistrationTokenPurpose,
} from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { OPERATOR_CONTACT } from "../../brand";
import { SHELTER_HOME } from "../../features/kabinet/routes";
import type { KabinetAuthAvailability } from "../auth-route";
import { CONFIRM_HEADERS, isSameOriginPost, STRIP_TOKEN_FROM_ADDRESS_BAR } from "../confirm-route";
import {
  hashRegistrationToken,
  REGISTRATION_LINK_PATHS,
  REGISTRATION_TOKEN,
} from "./registration-links";

/**
 * The confirmation email's two links (owner, 2026-11-18): mail clients and scanners open links,
 * so a GET only checks the link and shows one button; only that button's POST acts, with the token
 * in the form body and the same Origin check as the magic link's page (login CSRF, IN-T7).
 */
export type RegistrationLinkDeps = {
  availability: KabinetAuthAvailability;
  enabled: boolean;
  now: Date;
  repo: {
    tokenUser: (
      purpose: RegistrationTokenPurpose,
      tokenHash: string,
      now: Date,
    ) => Promise<string | null>;
    useToken: (purpose: RegistrationTokenPurpose, tokenHash: string, now: Date) => Promise<boolean>;
    confirmEmail: (tokenHash: string, now: Date) => Promise<EmailConfirmOutcome>;
    applicationOf: (userId: string) => Promise<RegistrantApplication | null>;
    recordNotMeAfterApproval: (tokenHash: string, historyId: string, now: Date) => Promise<boolean>;
  };
  newId: () => string;
  /** The funnel's `email_confirmed` and the operator's email; a failure never changes the answer. */
  afterConfirm: (confirmed: {
    userId: string;
    application: ApplicationSummary | null;
  }) => Promise<void>;
  /** The deletion service (`applicationDeletionRepo`), for «Це не я». */
  deleteApplication: (shelterId: ShelterId, now: Date) => Promise<ApplicationDeletionOutcome>;
};

export type RegistrationLinkState =
  /** `email`: the confirm link's own address, for its sentence (never logged); null for «Це не я». */
  | { kind: "form"; token: string; email: string | null }
  | { kind: "expired" }
  | { kind: "confirmed" }
  | { kind: "withdrawn" }
  /** «Це не я» once the operator approved: nothing is deleted, the operator sees the click. */
  | { kind: "approved" };

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** `{email}` as a mailto link to the operator, the rest escaped (owner, 2026-11-19). */
function withOperatorAddress(template: string): string {
  const [before = "", after = ""] = template.split("{email}");
  const address = escapeHtml(OPERATOR_CONTACT.email);
  return `${escapeHtml(before)}<a href="mailto:${address}">${address}</a>${escapeHtml(after)}`;
}

/** The sentence above a live link's button; none on a confirm link whose address is unknown. */
function linkPrompt(purpose: RegistrationTokenPurpose, email: string | null): string | null {
  if (purpose === "not_me") return uk.registration.notMePrompt;
  return email === null ? null : fillTemplate(uk.registration.confirmEmailPrompt, { email });
}

const formPrompt = (purpose: RegistrationTokenPurpose, email: string | null) => {
  const text = linkPrompt(purpose, email);
  return text === null ? "" : `<p>${escapeHtml(text)}</p>\n`;
};

function page(
  purpose: RegistrationTokenPurpose,
  state: RegistrationLinkState,
  status: number,
): Response {
  const email = uk.kabinet.email.applicationConfirm;
  const heading = purpose === "confirm_email" ? email.action : email.notYouAction;
  const kabinetLink = `<p><a href="${SHELTER_HOME}">${escapeHtml(uk.forShelters.signInLink)}</a></p>`;
  const body = (() => {
    switch (state.kind) {
      case "form":
        return `${formPrompt(purpose, state.email)}<form method="post" action="${REGISTRATION_LINK_PATHS[purpose]}">
<input type="hidden" name="token" value="${escapeHtml(state.token)}">
<button type="submit">${escapeHtml(heading)}</button>
</form>`;
      case "expired":
        return purpose === "not_me"
          ? `<p role="alert">${withOperatorAddress(uk.registration.notMeLinkExpired)}</p>`
          : `<p role="alert">${escapeHtml(uk.registration.confirmLinkExpired)}</p>\n${kabinetLink}`;
      case "confirmed":
        return `<p role="status">${escapeHtml(uk.registration.emailConfirmed)}</p>\n${kabinetLink}`;
      case "approved":
        return `<p role="alert">${withOperatorAddress(uk.registration.notMeAfterApproval)}</p>`;
      case "withdrawn":
        return `<p role="status">${withOperatorAddress(uk.registration.notMeDone)}</p>`;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
      default: {
        const unreachable: never = state;
        return unreachable;
      }
    }
  })();
  // Self-contained, as the magic link's page: nothing loaded from anywhere, system colours only.
  const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(heading)}</title>
<script>${STRIP_TOKEN_FROM_ADDRESS_BAR}</script>
<style>
body{margin:0;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;background:Canvas;color:CanvasText}
main{max-width:400px;margin:0 auto;padding:48px 16px}
button{min-height:48px;width:100%;font:inherit;font-weight:600;cursor:pointer}
a{display:inline-flex;align-items:center;min-height:48px}
button:focus-visible,a:focus-visible{outline:3px solid CanvasText;outline-offset:3px}
</style>
</head>
<body><main><h1>${escapeHtml(heading)}</h1>
${body}
</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { ...CONFIRM_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}

const plain = (text: string, status: number) =>
  new Response(text, { status, headers: CONFIRM_HEADERS });

/** Off with the flag, and wherever sign-in is unavailable, like every kabinet page. */
export const registrationLinkNotFound = (): Response => plain("Not Found", 404);

/** What a link request comes to: the decisions, apart from how the page is drawn. */
export type RegistrationLinkOutcome =
  | { kind: "page"; state: RegistrationLinkState; status: 200 | 400 }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "method_not_allowed" };

const shown = (state: RegistrationLinkState, status: 200 | 400): RegistrationLinkOutcome => ({
  kind: "page",
  state,
  status,
});

export async function handleRegistrationLink(
  request: Request,
  purpose: RegistrationTokenPurpose,
  deps: RegistrationLinkDeps,
): Promise<Response> {
  const outcome = await registrationLinkOutcome(request, purpose, deps);
  switch (outcome.kind) {
    case "page":
      return page(purpose, outcome.state, outcome.status);
    case "not_found":
      return registrationLinkNotFound();
    case "forbidden":
      return plain("Forbidden", 403);
    case "method_not_allowed":
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...CONFIRM_HEADERS, allow: "GET, POST" },
      });
  }
}

export async function registrationLinkOutcome(
  request: Request,
  purpose: RegistrationTokenPurpose,
  deps: RegistrationLinkDeps,
): Promise<RegistrationLinkOutcome> {
  if (deps.availability.kind === "unavailable" || !deps.enabled) return { kind: "not_found" };

  if (request.method === "GET") {
    // A read only: whatever the token, nothing is used up, confirmed or deleted.
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!REGISTRATION_TOKEN.test(token)) return shown({ kind: "expired" }, 400);
    const userId = await deps.repo.tokenUser(purpose, hashRegistrationToken(token), deps.now);
    if (userId === null) return shown({ kind: "expired" }, 400);
    const email =
      purpose === "confirm_email" ? ((await deps.repo.applicationOf(userId))?.email ?? null) : null;
    return shown({ kind: "form", token, email }, 200);
  }
  if (request.method !== "POST") {
    return { kind: "method_not_allowed" };
  }
  if (!isSameOriginPost(request.headers.get("origin"), deps.availability.baseURL)) {
    return { kind: "forbidden" };
  }

  let token: unknown;
  try {
    token = (await request.formData()).get("token");
  } catch {
    return shown({ kind: "expired" }, 400);
  }
  if (typeof token !== "string" || !REGISTRATION_TOKEN.test(token)) {
    return shown({ kind: "expired" }, 400);
  }
  const tokenHash = hashRegistrationToken(token);

  if (purpose === "confirm_email") {
    const confirmed = await deps.repo.confirmEmail(tokenHash, deps.now);
    if (confirmed.kind === "unusable") return shown({ kind: "expired" }, 400);
    await deps
      .afterConfirm({ userId: confirmed.userId, application: confirmed.application })
      .catch(() => undefined);
    return shown({ kind: "confirmed" }, 200);
  }

  const userId = await deps.repo.tokenUser("not_me", tokenHash, deps.now);
  if (userId === null) return shown({ kind: "expired" }, 400);
  const application = await deps.repo.applicationOf(userId);
  // Only an application is withdrawn. A refused one has nothing left to withdraw.
  if (application === null || application.status === "rejected") {
    await deps.repo.useToken("not_me", tokenHash, deps.now);
    return shown({ kind: "expired" }, 400);
  }
  // Approved: never deleted from a link; the operator is told someone denies the address.
  if (application.status !== "application") {
    await deps.repo.recordNotMeAfterApproval(tokenHash, deps.newId(), deps.now);
    return shown({ kind: "approved" }, 200);
  }
  const outcome = await deps.deleteApplication(application.shelterId, deps.now);
  if (outcome.kind === "not_due") {
    await deps.repo.useToken("not_me", tokenHash, deps.now);
    return shown({ kind: "expired" }, 400);
  }
  return shown({ kind: "withdrawn" }, 200);
}
