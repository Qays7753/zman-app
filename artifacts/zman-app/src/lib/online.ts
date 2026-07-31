/**
 * Issue #5 — Assert that the browser is online before performing a mutating
 * server call. Throws a synchronous Error("offline") if navigator.onLine is
 * false. Callers should catch with `e instanceof Error && e.message === "offline"`
 * and show a toast, then abort the submit.
 *
 * Safe on the client only. The only call sites in Round 4 are inside
 * client-side form submit handlers.
 */
export function assertOnline(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("offline");
  }
}
