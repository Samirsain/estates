// Finding one Person in a list of several hundred, on the client.
//
// Every screen already ships its whole people list, so this is a filter over
// an array rather than a query. It lives in domain/ and not in the picker
// component because the ranking rule is the interesting part and a check has
// to be able to import it without pulling in React.

export type PickerOption = { id: string; label: string };

/**
 * The one label every picker shows. An id leads it, because that is the fact
 * staff carry in their head and type in full — and because `matchPeople` ranks
 * a label that starts with what was typed above everything else. The name and
 * mobile follow so the pick can be confirmed by eye before it counts.
 *
 * `lead` is the field's own heading: a picker headed Member leads with the
 * Member ID, so that typing MEM-0012 into it lands at the top. A Person who is
 * both still shows both ids — only the order changes.
 */
export const personLabel = (
  p: {
    fullName: string;
    mobileMasked?: string | null;
    primaryMobile?: string | null;
    customerId?: string | null;
    memberId?: string | null;
  },
  lead: "CUSTOMER" | "MEMBER" = "CUSTOMER"
): string =>
  [
    ...(lead === "MEMBER" ? [p.memberId, p.customerId] : [p.customerId, p.memberId]),
    p.fullName,
    p.mobileMasked ?? p.primaryMobile,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Every word has to appear somewhere in the label, in any order: "sain 9876"
 * and "9876 sain" find the same Person. An ID typed in full then wins the top
 * of the list, because the label starts with it.
 *
 * `limit` exists because a list of three hundred is a scroll nobody finishes —
 * one more character narrows it faster than reaching the bottom would.
 */
export function matchPeople(
  options: readonly PickerOption[],
  query: string,
  limit = 50
): PickerOption[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = options.filter((o) => {
    const hay = o.label.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });

  if (terms.length) {
    const first = terms[0];
    // Stable: two rows that both start with the term, or neither, keep the
    // order they were given — which is the caller's own sort by name.
    found.sort(
      (a, b) =>
        Number(b.label.toLowerCase().startsWith(first)) -
        Number(a.label.toLowerCase().startsWith(first))
    );
  }

  return found.slice(0, limit);
}
