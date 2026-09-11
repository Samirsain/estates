"use client";

// Approve or Reject a Member Hold Request from the Plot's own page — the same
// compulsory remark and the same server action Plot Inventory uses.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { decideHoldRequestAction } from "../actions";

export default function HoldRequestDecision({ requestId, buyer }: { requestId: string; buyer: string }) {
  const router = useRouter();
  const [approve, setApprove] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // One key per opened form, so a double submit is one decision, not two.
  const [key, setKey] = React.useState("");

  const open = (value: boolean) => {
    setError(null);
    setKey(globalThis.crypto.randomUUID());
    setApprove(value);
  };

  return (
    <>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => open(false)}>
          Reject
        </Button>
        <Button type="button" size="sm" onClick={() => open(true)}>
          Approve
        </Button>
      </div>
      {approve !== null && (
        <Modal
          title={approve ? "Approve Member Hold Request" : "Reject Member Hold Request"}
          description={`For ${buyer}`}
          onClose={() => setApprove(null)}
        >
          <p className="text-xs text-muted-foreground">
            {approve
              ? "Approval creates a 72-hour Hold for the named buyer and freezes the Plot's PLC snapshot. The buyer's three open Plot positions are re-checked now."
              : "The remark is shown to the Member. The Plot stays as it is."}
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get("note"));
              setBusy(true);
              const result = await decideHoldRequestAction(requestId, approve, note, key);
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setApprove(null);
              router.refresh();
            }}
          >
            <Field label="Remark — compulsory">
              <Input name="note" required minLength={3} />
            </Field>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setApprove(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Processing…" : approve ? "Confirm approval" : "Confirm rejection"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
