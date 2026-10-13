// Who invited whom — the pure rule (docss/11 §3).

/**
 * Would recording `inviterId` as the inviter of `memberId` close a loop?
 * Walks up from the proposed inviter. Meeting the Member is a loop; meeting an
 * already-seen Member is a loop that exists already, refused rather than walked
 * forever.
 */
export function createsInviteCycle(memberId: string, inviterId: string, inviterOf: (id: string) => string | null): boolean {
  const seen = new Set<string>();
  for (let at: string | null = inviterId; at; at = inviterOf(at)) {
    if (at === memberId || seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}
