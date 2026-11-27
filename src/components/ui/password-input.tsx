"use client";

// A password field you can read back before submitting.
//
// There is no native control for this — Chrome dropped the one Edge shipped —
// so it is a button that flips the input's type. It starts hidden, and it never
// carries the value anywhere: the toggle is local state and the input stays an
// ordinary named field, so every form using it posts exactly as before.

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  disabled,
  visibilityLabel = "password",
  ...props
}: Omit<InputProps, "type"> & { visibilityLabel?: string }) {
  const [shown, setShown] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={shown ? "text" : "password"}
        // Room for the button, so a long password never runs under it.
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShown((v) => !v)}
        aria-label={`${shown ? "Hide" : "Show"} ${visibilityLabel}`}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
