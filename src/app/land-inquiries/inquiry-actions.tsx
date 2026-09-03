"use client";

// The Land Inquiry action bar — Land Inquiry spec §21, §22, §26.8 – §26.11.
//
// Each action names the reason it needs before it opens, because the reason is
// the record: a stage that moved with nothing said is a stage nobody can
// explain later.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal, Field, inputClass } from "@/components/ui/modal";
import {
  STAGE_LABEL,
  WORKING_STAGES,
  stageIndex,
  type LandInquiryStage,
  type LandInquiryStatus,
} from "@/lib/domain/land-inquiry";
import {
  archiveLandInquiryAction,
  changeLandInquiryStageAction,
  changeLandInquiryStatusAction,
  reassignLandInquiryAction,
} from "./actions";

type Kind = "STAGE" | "CLOSE" | "REOPEN" | "REASSIGN" | "ARCHIVE";

const newKey = () => globalThis.crypto.randomUUID();

export default function InquiryActions({
  id,
  version,
  status,
  stage,
  assignedToId,
  archived,
  canManage,
  canReopen,
  canArchive,
  canReassign,
  staff,
}: {
  id: string;
  version: number;
  status: LandInquiryStatus;
  stage: LandInquiryStage;
  assignedToId: string | null;
  archived: boolean;
  canManage: boolean;
  canReopen: boolean;
  canArchive: boolean;
  canReassign: boolean;
  staff: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Kind | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [nextStage, setNextStage] = React.useState<LandInquiryStage>(stage);
  const [assignee, setAssignee] = React.useState(assignedToId ?? "");

  function close() {
    setOpen(null);
    setError(null);
    setReason("");
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Action failed.");
      return;
    }
    close();
    router.refresh();
  }

  // Spec §21 — one step forward is ordinary; a skip or a step back is a
  // decision. The form says which before anything is typed.
  const step = stageIndex(nextStage) - stageIndex(stage);
  const stageReasonRequired = nextStage === "REJECTED_CLOSED" || step !== 1;

  if (archived) {
    return (
      <p className="text-xs text-muted-foreground">
        This inquiry is archived. Its history is kept in full and nothing about it can be changed.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && status === "WORKING" && (
        <>
          <Link href={`/land-inquiries/${id}/edit`}>
            <Button size="sm" variant="outline">
              Edit
            </Button>
          </Link>
          <Button size="sm" variant="outline" onClick={() => setOpen("STAGE")}>
            Change Stage
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen("CLOSE")}>
            Close Inquiry
          </Button>
        </>
      )}
      {canReopen && status === "CLOSED" && (
        <Button size="sm" variant="outline" onClick={() => setOpen("REOPEN")}>
          Reopen
        </Button>
      )}
      {canReassign && (
        <Button size="sm" variant="ghost" onClick={() => setOpen("REASSIGN")}>
          Reassign
        </Button>
      )}
      {canArchive && (
        <Button size="sm" variant="ghost" onClick={() => setOpen("ARCHIVE")}>
          Archive
        </Button>
      )}
      {status === "WORKING" && stage === "APPROVED_FOR_ACQUISITION" && (
        <span className="text-[11px] text-muted-foreground">
          Approved for Acquisition. Raising the acquisition itself stays a separate, explicit step
          in Buyback / Resale — nothing is created from this stage.
        </span>
      )}

      {open && (
        <Modal
          title={
            open === "STAGE"
              ? "Change Inquiry Stage"
              : open === "CLOSE"
                ? "Close Inquiry"
                : open === "REOPEN"
                  ? "Reopen Inquiry"
                  : open === "REASSIGN"
                    ? "Reassign Inquiry"
                    : "Archive Inquiry"
          }
          onClose={close}
        >
          <div className="space-y-3">
            {open === "STAGE" && (
              <Field label="New stage">
                <select
                  className={inputClass}
                  value={nextStage}
                  onChange={(e) => setNextStage(e.target.value as LandInquiryStage)}
                >
                  {[...WORKING_STAGES, "REJECTED_CLOSED" as const].map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {open === "REOPEN" && stage === "REJECTED_CLOSED" && (
              <Field label="Reopen at stage">
                <select
                  className={inputClass}
                  value={WORKING_STAGES.includes(nextStage) ? nextStage : "NEW"}
                  onChange={(e) => setNextStage(e.target.value as LandInquiryStage)}
                >
                  {WORKING_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {open === "REASSIGN" && (
              <Field label="Assign to">
                <select
                  className={inputClass}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field
              label={
                open === "CLOSE"
                  ? "Close reason (compulsory)"
                  : open === "STAGE" && !stageReasonRequired
                    ? "Reason (optional for a single step forward)"
                    : open === "REASSIGN"
                      ? "Reason (optional)"
                      : "Reason (compulsory)"
              }
            >
              <textarea
                className={`${inputClass} h-16 py-2`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-destructive/10 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (open === "STAGE") {
                    return run(() =>
                      changeLandInquiryStageAction(
                        { id, version, stage: nextStage, reason },
                        newKey()
                      )
                    );
                  }
                  if (open === "CLOSE") {
                    return run(() =>
                      changeLandInquiryStatusAction(
                        { id, version, status: "CLOSED", reason },
                        newKey()
                      )
                    );
                  }
                  if (open === "REOPEN") {
                    return run(() =>
                      changeLandInquiryStatusAction(
                        {
                          id,
                          version,
                          status: "WORKING",
                          reason,
                          restoredStage: WORKING_STAGES.includes(nextStage) ? nextStage : "NEW",
                        },
                        newKey()
                      )
                    );
                  }
                  if (open === "REASSIGN") {
                    return run(() =>
                      reassignLandInquiryAction(
                        { id, version, assignedToId: assignee || null, reason },
                        newKey()
                      )
                    );
                  }
                  return run(() => archiveLandInquiryAction({ id, version, reason }, newKey()));
                }}
              >
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
