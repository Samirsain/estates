"use client";

// The Customer closer's own conditions — Business Model v2.1 §22, §77.
// A Sold By Customer's Loyalty is paid only once their Aadhaar is Verified.
// The service decides who may act.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { verifyAadhaarAction } from "../actions";

const newKey = () => `closer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
