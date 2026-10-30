/**
 * TEST-ONLY. Lets the Playwright harness reach the gallery error card, which no real URL reaches
 * since `?stor=` clamps. Inert unless the process has OPIKA_TEST_FAIL_GALLERY=1 (only the harness
 * webServer sets it), is not on Vercel (NODE_ENV is "production" under the harness's `next start`,
 * so it cannot be the guard; Vercel is, as in `api/per-ip-budgets.ts`), and the request carries
 * `?opika_test_fail=1`. Do not reuse for anything else.
 */
export const GALLERY_TEST_FAIL_PARAM = "opika_test_fail";

type Env = Readonly<Record<string, string | undefined>>;

export function galleryTestFailureRequested(
  env: Env,
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): boolean {
  if (env.VERCEL || env.VERCEL_ENV) return false;
  if (env.OPIKA_TEST_FAIL_GALLERY !== "1") return false;
  return searchParams[GALLERY_TEST_FAIL_PARAM] === "1";
}

export function throwIfGalleryTestFailure(
  env: Env,
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): void {
  if (galleryTestFailureRequested(env, searchParams)) {
    throw new Error("gallery test failure (harness only)");
  }
}
