"use client";

// The Member's History, opened from the top bar instead of filling the bottom
// of the page. The rows are built on the server; this only shows them.

import React from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type HistoryRow = { at: string; title: string; detail?: string; by?: string };

export default function HistoryButton({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <History className="mr-1.5 h-3.5 w-3.5" />
        History
      </Button>
      {open && (
        <Modal title={`History (${rows.length})`} onClose={() => setOpen(false)} wide>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border/40 overflow-y-auto text-xs">
              {rows.map((h, index) => (
                <li key={index} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{h.title}</span>
                    {h.detail && <span className="block text-[11px] text-muted-foreground">{h.detail}</span>}
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground">
                    {h.at}
                    {h.by && <span className="block">{h.by}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
