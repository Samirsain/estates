// A server action that throws — a permission refused before its own try, a
// dropped connection, a server error — used to reject the screen's run(): busy
// stayed true, every Confirm stayed on "Processing…", and nothing said why.
// Through this it reads as a refusal like any other, so the screen recovers.

export const ACTION_FAILED =
  "This could not be done. Your sign-in may have ended or this needs a permission you do not have. Refresh the page and try again.";

export async function safely<T extends { ok: boolean }>(
  action: () => Promise<T>
): Promise<T | { ok: false; error: string }> {
  try {
    return await action();
  } catch (error) {
    console.error(error);
    return { ok: false, error: ACTION_FAILED };
  }
}
