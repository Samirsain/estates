"use client";

// The client seam for Prepare Inventory: it owns the busy flag, the result
// message and the return to the list. The form itself is the one the Plot list
// already had, so there is one place inventory is prepared.

import React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { prepareInventoryAction } from "../actions";
import { PrepareInventoryForm, type ProjectView } from "../plots-client";

export default function PrepareInventoryClient({ projects }: { projects: ProjectView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Card className="p-3">
      {error && (
        <p className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <PrepareInventoryForm
        projects={projects}
        busy={busy}
        onCancel={() => router.push("/plots")}
        onSubmit={async (projectId, rows) => {
          setBusy(true);
          setError(null);
          const result = await prepareInventoryAction(
            projectId,
            rows,
            crypto.randomUUID()
          );
          setBusy(false);
          // On success the Plots the session created are the thing to look at,
          // so it goes there rather than leaving a filled form behind.
          if (result.ok) router.push("/plots");
          else setError(result.error);
        }}
      />
    </Card>
  );
}
