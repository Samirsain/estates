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
  centerTitle,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wide is for grids and side-by-side comparisons. */
  wide?: boolean;
  /** A form that reads top to bottom centres its heading over the column. */
  centerTitle?: boolean;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`${
        wide ? "w-[min(72rem,96vw)]" : "w-[min(40rem,94vw)]"
      } rounded-[20px] border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-xs`}
    >
      <div className="space-y-3.5 p-5">
        <div className={centerTitle ? "text-center" : undefined}>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
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
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
