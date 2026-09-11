"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/*
 * A number field here holds a figure somebody decided — a percentage, a rate, a
 * width. The browser's stepper arrows and its scroll-to-change behaviour turn a
 * misplaced click or a scroll over the form into a silent edit of that figure,
 * which is how a schedule or a rate moves without anyone typing. The field
 * still takes numbers; only the two ways of changing one without typing go.
 */
export const NO_STEPPER =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onWheel, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          type === "number" && NO_STEPPER,
          className
        )}
        ref={ref}
        onWheel={(e) => {
          // A wheel over a focused number field edits it. Let the page scroll.
          if (type === "number") e.currentTarget.blur();
          onWheel?.(e);
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
