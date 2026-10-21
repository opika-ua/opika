/**
 * The `@preview` slot when no drawer is open: a direct load, a reload, a
 * shared link and every route under `/tvaryny` other than an intercepted
 * animal page. Without it Next would 404 those routes on a hard load.
 */
export default function NoPreview() {
  return null;
}
