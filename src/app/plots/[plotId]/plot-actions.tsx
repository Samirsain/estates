"use client";

// Not for Sale, Pledge and Edit Plot Details, from the Plot's own page.
//
// Owner, 28 Oct 2026: the top line keeps History, the one next step, one
// Restriction menu (Not for Sale, Pledge) and Edit Plot Details — nothing
// else; Hold is done from Plot Inventory. Edit stays in place while the Plot is locked (a Hold or a
// Booking holds it), disabled, so it says why it cannot be used. A restriction
// already on the Plot turns its own item into Remove.

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Modal } from "@/components/ui/modal";
import { RemarkSelect } from "@/components/ui/remark-select";
import { setRestrictionAction, updatePlotDetailsAction } from "../actions";
import { EditPlotDetailsDialog, type EditablePlot } from "../plots-client";

type Restriction = "NONE" | "NOT_FOR_SALE" | "PLEDGE";

const LABEL: Record<"NOT_FOR_SALE" | "PLEDGE", string> = { NOT_FOR_SALE: "Not for Sale", PLEDGE: "Pledge" };

export default function PlotActions({
  plot,
  components,
  restriction,
  canSetup,
  canEdit,
  canRestrict,
}: {
  plot: EditablePlot;
  components: Array<{ category: string; threshold: string | null; percent: string }>;
  /** The restriction on the Plot now. */
  restriction: string;
  /** The role may edit Plot details at all. */
  canSetup: boolean;
  /** False while a Hold or a Booking locks the Plot's details. */
  canEdit: boolean;
  /** The role may restrict, and the Plot is Available or Not Available. */
  canRestrict: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [target, setTarget] = React.useState<Restriction | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  function done(message: string) {
    setEditing(false);
    setTarget(null);
    setReason("");
    setNotice({ ok: true, text: message });
    router.refresh();
  }

  async function saveRestriction() {
    if (!target) return;
    setBusy(true);
    setNotice(null);
    const result = await setRestrictionAction(plot.id, target, reason, crypto.randomUUID());
    setBusy(false);
    if (result.ok) done(result.message ?? "Restriction updated.");
    else setNotice({ ok: false, text: result.error });
  }

  const current = restriction === "NOT_FOR_SALE" || restriction === "PLEDGE" ? restriction : null;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap justify-end gap-2">
          {canRestrict && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Restriction <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["NOT_FOR_SALE", "PLEDGE"] as const).map((r) => (
                  <DropdownMenuItem
                    key={r}
                    onSelect={() => {
                      setNotice(null);
                      setReason("");
                      setTarget(current === r ? "NONE" : r);
                    }}
                  >
                    {current === r ? `Remove ${LABEL[r]}` : LABEL[r]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canSetup && (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit}
              title={canEdit ? undefined : "Locked while a Hold or a Booking holds this Plot."}
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
            >
              Edit Plot Details
            </Button>
          )}
        </div>
        {notice && (
          <p className={`text-xs ${notice.ok ? "text-muted-foreground" : "text-amber-800"}`}>{notice.text}</p>
        )}
      </div>

      {editing && (
        <EditPlotDetailsDialog
          plot={plot}
          components={components}
          busy={busy}
          onClose={() => setEditing(false)}
          onSubmit={async (details, editReason) => {
            setBusy(true);
            setNotice(null);
            const result = await updatePlotDetailsAction(plot.id, details, editReason, crypto.randomUUID());
            setBusy(false);
            if (result.ok) done(result.message ?? "Plot details corrected.");
            else setNotice({ ok: false, text: result.error });
          }}
        />
      )}

      {target && (
        <Modal
          title={`${target === "NONE" && current ? `Remove ${LABEL[current]}` : LABEL[target as "NOT_FOR_SALE" | "PLEDGE"]} — ${plot.plotNumber}`}
          description={
            target === "NONE"
              ? "The restriction is lifted. A Not Available Plot still needs Make Available before it can be sold."
              : "Not for Sale and Pledge keep the Plot Not Available, including whenever it returns from a Hold or a cancelled Booking."
          }
          onClose={() => setTarget(null)}
        >
          <div className="space-y-3">
            {notice && !notice.ok && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                {notice.text}
              </p>
            )}
            <Field label="Reason — compulsory, kept in History">
              <RemarkSelect presets="plotRestriction" className="h-8" value={reason} onChange={setReason} required />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveRestriction} disabled={busy || reason.trim().length < 3}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
