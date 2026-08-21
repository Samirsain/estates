"use client";

// The last line of defence — DESIGN.md §5.4.
//
// A user sees what went wrong in plain words and what they can do next. The
// stack trace stays on the server: it names table and column structure, and this
// application holds Aadhaar, PAN and bank data. The digest is shown so a support
// call can be matched to the server log without exposing anything.

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-lg space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-700" />
          </div>
          <h1 className="text-sm font-semibold">Something went wrong</h1>
        </div>

        <p className="text-xs text-muted-foreground">
          The action did not complete. Nothing was half-saved — a command either finishes completely
          or is rolled back, so your records are as they were before you tried.
        </p>

        <p className="text-xs text-muted-foreground">
          Try again. If it keeps happening, give your administrator the reference below so they can
          find it in the server log.
        </p>

        {error.digest && (
          <p className="rounded-xl border border-border/60 bg-secondary p-3 font-mono text-xs">
            {error.digest}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </Card>
    </main>
  );
}
