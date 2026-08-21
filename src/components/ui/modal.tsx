"use client";

// The one dialog and the one labelled field, shared by every module.
// Uses the native <dialog> element, so focus trapping, Escape and the backdrop
// come from the platform rather than from a dependency (DESIGN §18).

import React from "react";

export function Modal({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wide is for grids and side-by-side comparisons. */
  wide?: boolean;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`${
        wide ? "w-[min(64rem,95vw)]" : "w-[min(36rem,92vw)]"
      } rounded-2xl border border-border/60 bg-card p-0 text-foreground backdrop:bg-black/60`}
    >
      <div className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Shared input styling for the plain selects and number fields in forms. */
export const inputClass =
  "h-10 w-full rounded-xl border border-input bg-slate-900/60 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
