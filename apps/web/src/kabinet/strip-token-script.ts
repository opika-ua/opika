/**
 * Oleksii, 2026-10-20, verbatim: "Address bar: after the page reads the token, remove it with
 * history.replaceState. The form carries it in a hidden field." The server has put the token in
 * the form's hidden field before the page arrives, so the page's first script takes it out of
 * the address bar and the history entry. Inline, so the page still loads nothing from anywhere
 * (IN-T6); without JS the form works as before and the token stays in the bar. Its own module so
 * the kabinet's CSP (`security-headers.ts`) can hash it without loading the auth stack.
 */
export const STRIP_TOKEN_FROM_ADDRESS_BAR =
  'if(location.search){history.replaceState(null,"",location.pathname)}';
