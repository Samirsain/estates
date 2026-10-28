// The Bank card on the Customer and Member profiles: the first account, and
// the rest under the Member profile's orange "Show N more" arrow, opened in
// place below it.

import React from "react";
import { Banknote } from "lucide-react";
import { Section } from "@/components/record-section";
import ShowMore from "@/app/members/[id]/show-more";

export function BankAccounts({ accounts }: { accounts: { id: string; body: React.ReactNode }[] }) {
  const [first, ...rest] = accounts;
  return (
    <Section fill title="Bank" icon={<Banknote className="h-3.5 w-3.5" />}>
      {!first ? (
        <p className="text-xs text-muted-foreground">No bank details recorded.</p>
      ) : rest.length === 0 ? (
        first.body
      ) : (
        <ShowMore count={rest.length}>
          {first.body}
          {rest.map((a) => (
            <div key={a.id} className="mt-3 hidden border-t border-border/60 pt-3 group-data-[open]/more:block">
              {a.body}
            </div>
          ))}
        </ShowMore>
      )}
    </Section>
  );
}
