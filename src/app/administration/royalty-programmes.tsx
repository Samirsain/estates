"use client";

// Royalty Gift Programme Versions — SSOT §76, §77, §101; Change Pack §7.4, §65.
// The catalogue lives outside the CRM; a version carries its references. Admin
// prepares and sends; MD approves, confirming the economics review, or rejects.

import React from "react";
import { useRouter } from "next/navigation";
import { formatIst } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import {
  decideRoyaltyProgrammeAction,
  prepareRoyaltyProgrammeAction,
  sendRoyaltyProgrammeAction,
  type ActionResult,
} from "./royalty-actions";

export type RoyaltyProgrammeView = {
  id: string;
  version: number;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED";
  programmeRef: string;
  catalogueVersion: string;
  termsVersion: string;
  reason: string;
  decisionNote: string | null;
  effectiveFrom: string | null;
  economicsReviewedAt: string | null;
};

const STATUS: Record<RoyaltyProgrammeView["status"], { label: string; variant: "success" | "warning" | "outline" | "destructive" | "info" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  PENDING_APPROVAL: { label: "Waiting for MD", variant: "warning" },
  APPROVED: { label: "Approved", variant: "info" },
  ACTIVE: { label: "Live", variant: "success" },
  SUPERSEDED: { label: "Superseded", variant: "outline" },
  REJECTED: { label: "Rejected", variant: "destructive" },
};

const newKey = () => `rgp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function RoyaltyProgrammes({ role, versions }: { role: string; versions: RoyaltyProgrammeView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [deciding, setDeciding] = React.useState<boolean | null>(null);

  const live = versions.find((v) => v.status === "ACTIVE") ?? null;
  const open = versions.find((v) => ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(v.status)) ?? null;
  const history = versions.filter((v) => v !== live && v !== open);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setEditing(false);
      setDeciding(null);
      router.refresh();
    }
  }

  const line = (v: RoyaltyProgrammeView) => (
    <dl className="space-y-1 text-xs">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Catalogue / Terms</dt>
        <dd>
          {v.catalogueVersion} · {v.termsVersion}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Effective from</dt>
        <dd>{v.effectiveFrom ? formatIst(v.effectiveFrom) : "On MD approval"}</dd>
      </div>
      {v.economicsReviewedAt && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Economics reviewed</dt>
          <dd>{formatIst(v.economicsReviewedAt)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Reason</dt>
        <dd className="text-right">{v.reason}</dd>
      </div>
    </dl>
  );

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Royalty Gift Programme</h2>
          <p className="text-xs text-muted-foreground">
            One Royalty Credit is one catalogue Gift. No Gift is promised until a dated Programme Version is live.
          </p>
        </div>
        {role === "ADMIN" && !open && (
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            Prepare new version
          </Button>
        )}
      </div>

      {notice && (
        <p className={`text-xs ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.ok ? notice.message : notice.error}</p>
      )}

      {live ? (
        <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold">
              v{live.version} · {live.programmeRef}
            </span>
            <Badge variant="success">Live</Badge>
          </div>
          {line(live)}
        </div>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800">
          No Royalty Gift Programme is live, so no Royalty Credit can be earned yet.
        </p>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">
              v{open.version} · {open.programmeRef}
            </span>
            <Badge variant={STATUS[open.status].variant}>{STATUS[open.status].label}</Badge>
            <div className="ml-auto flex gap-1.5">
              {role === "ADMIN" && open.status === "DRAFT" && (
                <>
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button size="xs" disabled={busy} onClick={() => run(() => sendRoyaltyProgrammeAction(open.id, newKey()))}>
                    Send to MD
                  </Button>
                </>
              )}
              {role === "MD" && open.status === "PENDING_APPROVAL" && (
                <>
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => setDeciding(false)}>
                    Reject
                  </Button>
                  <Button size="xs" disabled={busy} onClick={() => setDeciding(true)}>
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
          {line(open)}
        </div>
      )}

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">History ({history.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {history.map((v) => (
              <li key={v.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">v{v.version}</span>
                <span>{STATUS[v.status].label}</span>
                <span className="text-muted-foreground">
                  {v.programmeRef} · {v.catalogueVersion}
                </span>
                {v.decisionNote && <span className="text-muted-foreground">— {v.decisionNote}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <ProgrammeForm
          start={open?.status === "DRAFT" ? open : live}
          busy={busy}
          onClose={() => setEditing(false)}
          onSubmit={(input) => run(() => prepareRoyaltyProgrammeAction(input, newKey()))}
        />
      )}
      {deciding !== null && open && (
        <DecisionForm
          approve={deciding}
          version={open.version}
          busy={busy}
          onClose={() => setDeciding(null)}
          onSubmit={(note, economicsReviewed) =>
            run(() => decideRoyaltyProgrammeAction({ versionId: open.id, approve: deciding, note, economicsReviewed }, newKey()))
          }
        />
      )}
    </Card>
  );
}

function ProgrammeForm({
  start,
  busy,
  onClose,
  onSubmit,
}: {
  start: RoyaltyProgrammeView | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { programmeRef: string; catalogueVersion: string; termsVersion: string; reason: string; effectiveFrom: string | null }) => void;
}) {
  const [programmeRef, setProgrammeRef] = React.useState(start?.status === "DRAFT" ? start.programmeRef : "");
  const [catalogueVersion, setCatalogueVersion] = React.useState(start?.status === "DRAFT" ? start.catalogueVersion : "");
  const [termsVersion, setTermsVersion] = React.useState(start?.status === "DRAFT" ? start.termsVersion : "");
  const [reason, setReason] = React.useState(start?.status === "DRAFT" ? start.reason : "");
  const [effectiveFrom, setEffectiveFrom] = React.useState("");
  const problem =
    !programmeRef.trim() || !catalogueVersion.trim() || !termsVersion.trim() || !reason.trim()
      ? "Every field except Effective from is required."
      : effectiveFrom && new Date(effectiveFrom) <= new Date()
        ? "Effective from must be in the future, or left empty."
        : null;

  return (
    <Modal title="Royalty Gift Programme Version" description="Saved as a Draft. Nothing changes until MD approves it." onClose={onClose}>
      <div className="space-y-3">
        <Field label="Programme Version reference, e.g. RGP-01">
          <input className={inputClass} value={programmeRef} onChange={(e) => setProgrammeRef(e.target.value)} />
        </Field>
        <Field label="Approved Catalogue Version">
          <input className={inputClass} value={catalogueVersion} onChange={(e) => setCatalogueVersion(e.target.value)} />
        </Field>
        <Field label="Royalty Gift Terms version">
          <input className={inputClass} value={termsVersion} onChange={(e) => setTermsVersion(e.target.value)} />
        </Field>
        <Field label="Effective from — optional; empty takes effect on MD approval">
          <input type="datetime-local" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
        <Field label="Reason for this version">
          <textarea className={`${inputClass} h-16 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {problem && <p className="text-xs text-red-700">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || problem !== null}
            onClick={() =>
              onSubmit({
                programmeRef,
                catalogueVersion,
                termsVersion,
                reason,
                effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
              })
            }
          >
            Save Draft
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DecisionForm({
  approve,
  version,
  busy,
  onClose,
  onSubmit,
}: {
  approve: boolean;
  version: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string, economicsReviewed: boolean) => void;
}) {
  const [note, setNote] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);
  return (
    <Modal
      title={approve ? `Approve version ${version}` : `Reject version ${version}`}
      description={approve ? "It goes live at its Effective from — now, if none was set." : "The live version stays in force."}
      onClose={onClose}
    >
      {approve && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          The Programme&apos;s economics (Gift cost against margin) were reviewed outside the CRM.
        </label>
      )}
      <Field label="Note (compulsory)">
        <textarea className={`${inputClass} h-16 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={approve ? "default" : "destructive"}
          disabled={busy || !note.trim() || (approve && !reviewed)}
          onClick={() => onSubmit(note, reviewed)}
        >
          {approve ? "Approve" : "Reject"}
        </Button>
      </div>
    </Modal>
  );
}
