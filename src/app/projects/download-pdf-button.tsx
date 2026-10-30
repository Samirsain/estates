"use client";

// Download PDF — writes the Project Information Sheet (lib/pdf/project-sheet.ts)
// straight to the browser's downloads. More info on the Projects list and the
// Public Project Portal both use it (owner, 29 Oct 2026), so the sheet a
// visitor takes away is the one the office hands out.

import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadProjectSheet, type ProjectSheet } from "@/lib/pdf/project-sheet";

export default function DownloadPdfButton({ sheet }: { sheet: ProjectSheet }) {
  const [saving, setSaving] = React.useState(false);

  return (
    <Button
      size="xs"
      variant="outline"
      className="rounded-full"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          await downloadProjectSheet(sheet);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Download className="mr-1 h-3 w-3" />
      {saving ? "Preparing…" : "Download PDF"}
    </Button>
  );
}
