/** An expected failure whose message is safe to show the user (Next.js redacts thrown
 * Server Action errors in production, so actions return these as `{ ok: false, error }`). */
export class UserFacingError extends Error {}

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export function actionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UserFacingError) return { ok: false, error: err.message };
  console.error(fallback, err);
  return { ok: false, error: fallback };
}
