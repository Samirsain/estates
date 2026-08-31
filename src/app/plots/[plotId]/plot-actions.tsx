"use client";

// One place for everything you can do to a Plot from its own page.
//
// This replaces two launchers that each drew their own button in a different
// part of the page — Edit Plot Details up in the header beside the badges,
// Change Restriction buried in the middle of the Status list, next to the value
// it changes. Two actions, two places, and no way to tell from either one that
// the other existed.
//
// The page is a server component and these are dialogs, so a client seam has to
// exist. Making it one seam rather than two also puts the two dialogs' busy and
// error state in one place instead of duplicating it.

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setRestrictionAction, updatePlotDetailsAction } from "../actions";
import { EditPlotDetailsDialog, type EditablePlot } from "../plots-client";

type Restriction = "NONE" | "NOT_YET_RELEASED" | "NOT_FOR_SALE" | "PLEDGE";

const RESTRICTIONS: { value: Restriction; label: string }[] = [
  // Named for what the Plot becomes, not for the flag being cleared — and
  // "Unreleased" is the word a Project already uses for the same state.
  { value: "NONE", label: "Available" },
  { value: "NOT_YET_RELEASED", label: "Unreleased" },
  { value: "NOT_FOR_SALE", label: "Not for Sale" },
  { value: "PLEDGE", label: "Pledge" },
];

export default function PlotActions({
  plot,
  components,
  currentRestriction,
  canEditDetails,
  canRestrict,
}: {
  plot: EditablePlot;
  components: Array<{ category: string; threshold: string | null; percent: string }>;
  currentRestriction: string;
  canEditDetails: boolean;
  canRestrict: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"DETAILS" | "RESTRICTION" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  const [restriction, setRestriction] = React.useState(currentRestriction);
  const [reason, setReason] = React.useState("");

  // Nothing to offer, so nothing is drawn — not a menu that opens on emptiness.
  if (!canEditDetails && !canRestrict) return null;

  function done(message: string) {
    setDialog(null);
    setReason("");
    setNotice({ ok: true, text: message });
    router.refresh();
  }

  async function saveRestriction() {
    setBusy(true);
    setNotice(null);
    const result = await setRestrictionAction(
      plot.id,
      restriction as Restriction,
      reason,
      crypto.randomUUID()
    );
    setBusy(false);
    if (result.ok) done(result.message ?? "Restriction updated.");
    else setNotice({ ok: false, text: result.error });
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Actions <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEditDetails && (
              <DropdownMenuItem onSelect={() => setDialog("DETAILS")}>
                Edit Plot Details
              </DropdownMenuItem>
            )}
            {canRestrict && (
              <DropdownMenuItem onSelect={() => setDialog("RESTRICTION")}>
                Change restriction
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {notice && (
          <p className={`text-xs ${notice.ok ? "text-muted-foreground" : "text-amber-800"}`}>
            {notice.text}
          </p>
        )}
      </div>

      {dialog === "DETAILS" && (
        <EditPlotDetailsDialog
          plot={plot}
          components={components}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={async (details, editReason) => {
            setBusy(true);
            setNotice(null);
            const result = await updatePlotDetailsAction(
              plot.id,
              details,
              editReason,
              crypto.randomUUID()
            );
            setBusy(false);
            if (result.ok) done(result.message ?? "Plot details corrected.");
            else setNotice({ ok: false, text: result.error });
          }}
        />
      )}

      {dialog === "RESTRICTION" && (
        <Modal
          title={`Change restriction — ${plot.plotNumber}`}
          description="Not for Sale and Pledge keep the Plot Not Available, including whenever it returns from a Hold or a cancelled Booking."
          onClose={() => setDialog(null)}
        >
          <div className="space-y-3">
            {notice && !notice.ok && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                {notice.text}
              </p>
            )}

            <Field label="Restriction">
              <select
                className={`${inputClass} h-8`}
                value={restriction}
                onChange={(e) => setRestriction(e.target.value)}
              >
                {RESTRICTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reason — compulsory, kept in History">
              <Input
                className="h-8"
                value={reason}
                minLength={3}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveRestriction} disabled={busy || reason.trim().length < 3}>
                {busy ? "Saving…" : "Save restriction"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
