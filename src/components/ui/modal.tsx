"use client";

// The one dialog and the one labelled field, shared by every module.
// Uses the native <dialog> element, so focus trapping, Escape and the backdrop
// come from the platform rather than from a dependency (DESIGN §18).

import React from "react";
import { X } from "lucide-react";
import { NO_STEPPER } from "./input";

export function Modal({
  title,
  description,
  onClose,
  children,
  wide,
  width,
  centerTitle,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wide is for grids and side-by-side comparisons. */
  wide?: boolean;
  /** A width class, where a sheet sits between the two standard sizes. */
  width?: string;
  /** A form that reads top to bottom centres its heading over the column. */
  centerTitle?: boolean;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // text-left: a dialog opened from a centred table cell (a Payout button)
      // is that cell's DOM child and would otherwise centre every label in it.
      className={`text-left ${
        width ?? (wide ? "w-[min(72rem,96vw)]" : "w-[min(40rem,94vw)]")
      } rounded-[20px] border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-xs`}
    >
      <div className="relative space-y-3.5 p-5">
        {/* Every dialog can be closed from its corner, not only by Escape.
            close() fires the dialog's own close event, so onClose runs once. */}
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X className="h-4 w-4" />
        </button>
        {title && (
          <div className={`pr-8 ${centerTitle ? "pl-8 text-center" : ""}`}>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        )}
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

/**
 * Shared input styling for the plain selects and number fields in forms. The
 * stepper arrows are off for the same reason they are off in `Input`: a figure
 * on these forms is typed, never nudged by a stray click.
 */
export const inputClass =
  `h-9 w-full rounded-lg border border-input bg-card px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${NO_STEPPER}`;
