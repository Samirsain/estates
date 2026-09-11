"use client";

// Add Task, from the Member's page. The Dashboard's own form and action, with
// the task linked to this Member so it opens from the task and shows in History.

import React from "react";
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
  /** "Follow-up" on a Plot's Booking; "Add Task" everywhere else. */
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [now] = React.useState(() => new Date());

  return (
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
      {notice && (
        <p className={`w-full text-right text-xs ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>
          {notice.text}
        </p>
      )}
      {open && (
        <AddTaskDialog
          now={now}
          record={record}
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            const result = await addTaskAction(input, globalThis.crypto.randomUUID());
            setOpen(false);
            setNotice(result.ok ? { ok: true, text: "Task added." } : { ok: false, text: result.error });
            if (result.ok) router.refresh();
          }}
        />
      )}
    </>
  );
}
