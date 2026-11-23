// The Project's layout plan, under the Plot list (owner, 21 and 23 Nov 2026).
//
// Drawn as a picture at the page's full width: a phone will not draw a PDF
// inside a page, and a picture scales to any screen. Tapped, it opens full
// size, where the phone's own pinch-zoom works; Download hands over the
// original file.

import { Download, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectLayoutDocument } from "@/lib/project-documents";

export default function LayoutDocumentPreview({ document }: { document: ProjectLayoutDocument }) {
  return (
    <section aria-label="Layout plan" className="overflow-hidden rounded-2xl border border-border/80 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        {/* The page heading already names the Project; this says what the card is. */}
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">Layout plan</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="xs" variant="outline" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs" asChild>
            <a href={document.imageUrl} target="_blank" rel="noreferrer">
              <Maximize2 className="h-3.5 w-3.5" />
              Full size
            </a>
          </Button>
          <Button size="xs" variant="secondary" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs" asChild>
            <a href={document.url} download={document.filename}>
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        </div>
      </div>
      <a href={document.imageUrl} target="_blank" rel="noreferrer" className="block bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static file shown as-is */}
        <img src={document.imageUrl} alt={document.title} loading="lazy" decoding="async" className="h-auto w-full" />
      </a>
    </section>
  );
}
