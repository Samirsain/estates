// A wrong or stale link. Says so plainly and offers the way back — DESIGN §5.4.

import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-lg space-y-3 p-4">
        <h1 className="text-sm font-semibold">That page does not exist</h1>
        <p className="text-xs text-muted-foreground">
          The link may be out of date, or the record may have been closed or merged. Old Customer and
          Member IDs stay searchable, so try searching for the reference instead.
        </p>
        <a href="/dashboard" className="text-xs text-primary hover:underline">
          Back to Dashboard
        </a>
      </Card>
    </main>
  );
}
