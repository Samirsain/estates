// A dropped database connection is not a failed command. Supabase's pooler
// resets idle and long-lived connections; a command caught by one rolled back
// whole (one transaction), and its idempotency key makes a second try safe —
// it either runs again from clean or replays what had already committed.

const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1017", "P2024", "P2028"]);
const TRANSIENT_TEXT = /ConnectionReset|Server has closed the connection|Can't reach database server|Transaction already closed/i;

/** A connection-level failure worth one more try; never a business refusal or a constraint. */
export function isTransientDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  if (typeof code === "string" && code !== "") return false;
  return TRANSIENT_TEXT.test(error.message);
}

/** Runs `work`, waiting and trying again after each transient failure, once per wait. */
export async function retryTransient<T>(work: () => Promise<T>, waitsMs: readonly number[] = [2_000, 5_000, 10_000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= waitsMs.length || !isTransientDbError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, waitsMs[attempt]));
    }
  }
}
