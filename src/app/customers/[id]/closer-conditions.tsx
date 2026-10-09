"use client";

// The Customer closer's own conditions — Business Model v2.1 §22, §77.
// A Sold By Customer's Loyalty is paid only once their Aadhaar is Verified and
// their Customer Terms acceptance is recorded. The service decides who may act.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { recordCustomerTermsAction, verifyAadhaarAction } from "../actions";

const newKey = () => `closer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const today = () => new Date().toISOString().slice(0, 10);

export function RecordTermsButton({ customerProfileId }: { customerProfileId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState("");
  const [on, setOn] = React.useState(today());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    const result = await recordCustomerTermsAction(customerProfileId, version, on, newKey());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        Record acceptance
      </Button>
      {open && (
        <Modal
          title="Customer Terms accepted"
          description="Required before this Customer can earn Customer-closing Loyalty."
          onClose={() => setOpen(false)}
        >
          <Field label="Terms version">
            <input className={inputClass} value={version} placeholder="e.g. CT-2026-10" onChange={(e) => setVersion(e.target.value)} />
          </Field>
          <Field label="Accepted on">
            <input className={inputClass} type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} />
          </Field>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !version.trim() || !on} onClick={save}>
              Save
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function VerifyAadhaarButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="xs"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await verifyAadhaarAction(personId, newKey());
          setBusy(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
      >
        Mark Aadhaar Verified
      </Button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
