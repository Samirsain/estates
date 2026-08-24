"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { setRestrictionAction } from "../actions";

export default function EditPlotRestrictionLauncher({
  plotId,
  currentRestriction,
  currentReason,
}: {
  plotId: string;
  currentRestriction: string;
  currentReason: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [restriction, setRestriction] = React.useState(currentRestriction);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await setRestrictionAction(
      plotId,
      restriction as any,
      reason,
      crypto.randomUUID()
    );
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setReason("");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Change Restriction
      </Button>

      {open && (
        <Modal
          title="Update Plot Restriction"
          description="Update safety or legal restrictions on this plot (PRD §8.5)."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-3.5 text-left">
            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <Field label="Restriction status">
              <select
                className={inputClass}
                value={restriction}
                onChange={(e) => setRestriction(e.target.value)}
              >
                <option value="NONE">None (Unrestricted)</option>
                <option value="NOT_YET_RELEASED">Not Yet Released</option>
                <option value="NOT_FOR_SALE">Not For Sale</option>
                <option value="PLEDGE">Pledge</option>
              </select>
            </Field>

            <Field label="Compulsory reason">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this restriction status being updated?"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !reason.trim()}>
                {busy ? "Saving…" : "Save Restriction"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
