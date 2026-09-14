"use client";

// PRD RD-05, ARCHITECTURE §9.3 — Aadhaar, PAN and the bank account number are
// masked on every screen. MD and Admin may read them in full, and each read is
// its own audited event, so the values are fetched on demand rather than sent
// down with the page. These two components are the profile's side of that: the
// masked row anyone sees, and the button the permitted roles get beside it.

import * as React from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Row } from "@/components/fact-row";
import { revealIdentityAction } from "@/app/administration/actions";
import { revealBankAccountAction } from "@/app/members/actions";

/** Aadhaar and PAN together: one click, one audit row, both values. */
export function IdentityFacts({
  personId,
  canReveal,
  aadhaarMasked,
  aadhaarHint,
  panMasked,
  panHint,
}: {
  personId: string;
  canReveal: boolean;
  aadhaarMasked: string;
  aadhaarHint?: string;
  panMasked: string;
  panHint?: string;
}) {
  const [full, setFull] = React.useState<{ aadhaar: string | null; pan: string | null } | null>(
    null
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <Row
        label="Aadhaar"
        value={full?.aadhaar ?? aadhaarMasked}
        hint={aadhaarHint}
      />
      <Row label="PAN" value={full?.pan ?? panMasked} hint={panHint} />
      {error && (
        <p role="alert" className="pt-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
      {canReveal && !full && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const outcome = await revealIdentityAction(personId);
              if (outcome.ok) setFull(outcome.reveal);
              else setError(outcome.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Eye className="mr-1 h-3 w-3" />
          {busy ? "Revealing…" : "Reveal in full"}
        </Button>
      )}
      {full && (
        <p className="pt-2 text-[11px] text-muted-foreground">
          This read is recorded in the Activity History.
        </p>
      )}
    </>
  );
}

/**
 * Aadhaar or PAN on its own, for a page that files them in different cards.
 * The reveal is the same audited read as `IdentityFacts`; this shows the one
 * value its row is about.
 */
export function IdentityValue({
  personId,
  field,
  masked,
  canReveal,
}: {
  personId: string;
  field: "aadhaar" | "pan";
  masked: string;
  canReveal: boolean;
}) {
  const [full, setFull] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {full ?? masked}
      {canReveal && !full && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          disabled={busy}
          aria-label={field === "aadhaar" ? "Reveal Aadhaar in full" : "Reveal PAN in full"}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const outcome = await revealIdentityAction(personId);
              if (outcome.ok) setFull(outcome.reveal[field] ?? "Not recorded");
              else setError(outcome.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Eye className="h-3 w-3" />
        </Button>
      )}
      {error && (
        <span role="alert" className="text-[11px] font-normal text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/** One bank account's number: last four, or the whole of it on request. */
export function AccountNumber({
  bankDetailId,
  lastFour,
  canReveal,
}: {
  bankDetailId: string;
  lastFour: string;
  canReveal: boolean;
}) {
  const [full, setFull] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {full ?? `•••• ${lastFour}`}
      {canReveal && !full && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const outcome = await revealBankAccountAction(bankDetailId);
              if (outcome.ok) setFull(outcome.accountNumber);
              else setError(outcome.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Eye className="h-3 w-3" />
        </Button>
      )}
      {error && (
        <span role="alert" className="text-[11px] font-normal text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
