"use client";

// The Plot detail page is a server component; Edit Plot Details is a dialog.
// This is the seam between them, and nothing more: it reuses the same dialog and
// the same action the Plot Inventory list uses, so there is one correction path.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updatePlotDetailsAction } from "../actions";
import { EditPlotDetailsDialog, type EditablePlot } from "../plots-client";

export default function EditPlotDetailsLauncher({
  plot,
  components,
}: {
  plot: EditablePlot;
  components: Array<{ category: string; threshold: string | null; percent: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit Plot Details
      </Button>

      {notice && (
        <p
          className={`w-full text-xs ${
            notice.kind === "ok" ? "text-muted-foreground" : "text-amber-800"
          }`}
        >
          {notice.text}
        </p>
      )}

      {open && (
        <EditPlotDetailsDialog
          plot={plot}
          components={components}
          busy={busy}
          onClose={() => setOpen(false)}
          onSubmit={async (details, reason) => {
            setBusy(true);
            const result = await updatePlotDetailsAction(
              plot.id,
              details,
              reason,
              crypto.randomUUID()
            );
            setBusy(false);
            if (result.ok) {
              setOpen(false);
              setNotice({ kind: "ok", text: result.message ?? "Plot details corrected." });
              router.refresh();
            } else {
              setNotice({ kind: "error", text: result.error });
            }
          }}
        />
      )}
    </>
  );
}
