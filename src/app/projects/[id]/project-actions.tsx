"use client";

// Edit Project and Update (PLC versions · Change status · Public Portal · Edit commission) on
// the Project's own page (owner, 28 Oct 2026). The dialogs and actions are the
// Projects list's own, so a change made here is the change made there.

import React from "react";
import { safely } from "@/lib/safely";
import { ModalError } from "@/components/ui/modal";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe, Layers, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  publishPlcVersionAction,
  revisePlcRulesAction,
  savePlcDraftAction,
  setProjectStatusAction,
  setPublicPortalAction,
  updateProjectAction,
  type ActionResult,
} from "../actions";
import { EditProjectDialog, PlcDialog, StatusDialog, type ProjectRowView } from "../projects-client";
import { OPEN_COMMISSION_FORM } from "./commission-settings";

export default function ProjectActions({
  project,
  canEditCommission,
}: {
  project: ProjectRowView;
  /** MD prepares commission versions; the item opens that form on this page. */
  canEditCommission: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<"EDIT" | "PLC" | "STATUS" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const newKey = () => globalThis.crypto.randomUUID();

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await safely(action);
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setOpen(null);
      router.refresh();
    }
  }

  return (
    // The refusal shows inside the open dialog; behind it, nobody saw it.
    <ModalError.Provider value={notice && !notice.ok ? notice.error : null}>
    <>
      <div className="relative flex flex-col items-end gap-1">
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen("EDIT")}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Project
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Update <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!project.isExternalResaleGroup && (
                <DropdownMenuItem onSelect={() => setOpen("PLC")}>
                  <Layers className="mr-2 h-3.5 w-3.5" /> PLC versions
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setOpen("STATUS")}>Change status</DropdownMenuItem>
              {/* Every Project is on the Public Project Portal unless removed
                  here (owner, 29 Oct 2026); a resale group has no Plots to show.
                  No confirmation line: the item's own wording flipping between
                  Add and Remove says it worked. Only a failure is shown. */}
              {!project.isExternalResaleGroup && (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={async () => {
                    setNotice(null);
                    const result = await setPublicPortalAction(project.id, !project.publicPortal, newKey());
                    if (result.ok) router.refresh();
                    else setNotice(result);
                  }}
                >
                  <Globe className="mr-2 h-3.5 w-3.5" />
                  {project.publicPortal ? "Remove from Public Portal" : "Add to Public Portal"}
                </DropdownMenuItem>
              )}
              {canEditCommission && !project.isExternalResaleGroup && (
                <DropdownMenuItem
                  onSelect={() => {
                    window.dispatchEvent(new Event(OPEN_COMMISSION_FORM));
                    document.getElementById("commission")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Edit commission
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Only a refusal, and out of the flow: a line under the buttons grew
            the header row and moved them (owner, 11 Nov 2026). The Public
            Portal item has no dialog, so its refusal needs this line. */}
        {notice && !notice.ok && (
          <p className="absolute right-0 top-full mt-1 w-max max-w-xs text-right text-xs text-red-700">
            {notice.error}
          </p>
        )}
      </div>

      {open === "EDIT" && (
        <EditProjectDialog
          project={project}
          busy={busy}
          onClose={() => setOpen(null)}
          onSubmit={(input, reason) => run(() => updateProjectAction(project.id, input, reason, newKey()))}
        />
      )}
      {open === "PLC" && (
        <PlcDialog
          project={project}
          busy={busy}
          onClose={() => setOpen(null)}
          onSubmit={(components, reason) => run(() => revisePlcRulesAction(project.id, components, reason, newKey()))}
          onDraft={(components, reason) => run(() => savePlcDraftAction(project.id, components, reason, newKey()))}
          onPublish={(versionId) => run(() => publishPlcVersionAction(versionId, newKey()))}
        />
      )}
      {open === "STATUS" && (
        <StatusDialog
          project={project}
          busy={busy}
          onClose={() => setOpen(null)}
          onSubmit={(next, reason) => run(() => setProjectStatusAction(project.id, next, reason, newKey()))}
        />
      )}
    </>
    </ModalError.Provider>
  );
}
