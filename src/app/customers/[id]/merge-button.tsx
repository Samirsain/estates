"use client";

// Merge with another Person, from the profile. The form is Administration's
// own — same search, same compulsory reason, same MD decision afterwards — with
// this profile already offered as the identity that remains.

import React from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RaiseMergeModal } from "@/app/administration/administration-client";
import type { ActionResult, PersonOption } from "@/app/administration/actions";

/**
 * Temporarily off on the profiles, by request. Administration keeps its own
 * Merge, so nothing about merging is actually removed — only the shortcut from
 * a Customer's and a Member's own page. Flip this back to true to restore it;
 * nothing else has to change.
 */
const MERGE_ON_PROFILE = false;

export function MergeButton({ person }: { person: PersonOption }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult | null>(null);

  if (!MERGE_ON_PROFILE) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        <Merge className="mr-1.5 h-3.5 w-3.5" />
        Merge
      </Button>
      {result && (
        <p className={`w-full text-right text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      {open && (
        <RaiseMergeModal
          initial={person}
          onClose={() => setOpen(false)}
          onResult={(outcome) => {
            setResult(outcome);
            if (outcome.ok) router.refresh();
          }}
        />
      )}
    </>
  );
}
