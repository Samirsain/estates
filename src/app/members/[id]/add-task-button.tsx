"use client";

// Add Task, from the Member's page. The Dashboard's own form and action, with
// the task linked to this Member so it opens from the task and shows in History.

import React from "react";
import { safely } from "@/lib/safely";
import { ModalError } from "@/components/ui/modal";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddTaskDialog } from "@/app/dashboard/dashboard-client";
import { addTaskAction } from "@/app/dashboard/actions";

export function AddTaskButton({
  record,
  label = "Add Task",
}: {
  record: { kind: string; id: string; name: string };
  /** "Follow-Up" on a Plot's Booking; "Add Task" everywhere else. */
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [now] = React.useState(() => new Date());

  return (
    // A refused task shows inside the open dialog, not on the page behind it.
    <ModalError.Provider value={notice && !notice.ok ? notice.text : null}>
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>
      {/* No "Task added." line: it wrapped onto a new row of the header and
          moved every button (owner, 11 Nov 2026). The dialog closes only on
          success; a refusal shows inside it. */}
      {open && (
        <AddTaskDialog
          now={now}
          record={record}
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            const result = await safely(() => addTaskAction(input, globalThis.crypto.randomUUID()));
            setNotice(result.ok ? { ok: true, text: "Task added." } : { ok: false, text: result.error });
            // Closed only on success: closed first, a refusal threw away what
            // was typed and showed its reason on the page instead.
            if (result.ok) {
              setOpen(false);
              router.refresh();
            }
          }}
        />
      )}
    </>
    </ModalError.Provider>
  );
}
