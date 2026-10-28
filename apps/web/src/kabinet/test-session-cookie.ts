/**
 * For tests that inject the principal through `resolve`: a session cookie gets
 * a request past the route's presence check (audit F9). Its value is never
 * looked up; `resolve` decides who the caller is.
 */
export const TEST_SESSION_COOKIE = "kabinet.session_token=test-session";
