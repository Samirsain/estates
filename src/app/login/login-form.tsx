"use client";

// Client-side submit button providing instant feedback and animated spinner during login.
import React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full transition-all" disabled={pending}>
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-white" />
          Signing in…
        </span>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}
