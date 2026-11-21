"use client";

// Layout Document Preview (owner, 21 Nov 2026).
// High-resolution preview for project layout maps and architectural plans (PDF & JPEG),
// providing responsive zoom, pan, fullscreen modal inspection, and download options
// for customers and staff on the Public Portal.

import React from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProjectLayoutDocument } from "@/lib/project-documents";

const ZOOM_STEPS = [0.75, 1, 1.35, 1.75, 2.25, 3];

export default function LayoutDocumentPreview({
  document,
  className,
}: {
  document: ProjectLayoutDocument;
  className?: string;
}) {
  const [zoomIndex, setZoomIndex] = React.useState(1);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  const zoom = ZOOM_STEPS[zoomIndex];

  const handleZoomIn = () => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_STEPS.length - 1));
  };

  const handleZoomOut = () => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleResetZoom = () => {
    setZoomIndex(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Container Card */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-secondary/40 px-3.5 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {document.type === "pdf" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-xs font-bold text-foreground sm:text-sm">
                {document.title}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {document.type === "pdf" ? "Architectural Blueprint (PDF)" : "High-Resolution Layout Map"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {document.type === "image" && (
              <div className="mr-1 flex items-center rounded-lg border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomIndex === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                  aria-label="Zoom out"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-10 px-1 text-center text-[11px] font-semibold tabular-nums text-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomIndex === ZOOM_STEPS.length - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                  aria-label="Zoom in"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Fit to view"
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Fit to view"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            )}

            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={() => setIsFullscreen(true)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fullscreen</span>
            </Button>

            <Button
              size="xs"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              asChild
            >
              <a href={document.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Tab</span>
              </a>
            </Button>

            <Button
              size="xs"
              variant="secondary"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              asChild
            >
              <a href={document.url} download={document.filename}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            </Button>
          </div>
        </div>

        {/* Viewer Viewport */}
        <div className="relative min-h-[380px] sm:min-h-[520px] md:min-h-[620px] bg-neutral-950/90 overflow-hidden flex items-center justify-center select-none">
          {document.type === "image" ? (
            <div
              className={`relative flex h-full w-full items-center justify-center p-2 sm:p-4 overflow-hidden ${
                zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
              }`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={(e) => {
                if (zoom <= 1) setIsFullscreen(true);
              }}
            >
              <div
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                  transition: isDragging ? "none" : "transform 0.15s ease-out",
                }}
                className="max-h-[75vh] max-w-full flex items-center justify-center"
              >
                <img
                  src={document.url}
                  alt={document.title}
                  draggable={false}
                  className="max-h-[70vh] w-auto rounded-lg object-contain shadow-2xl"
                />
              </div>

              {zoom === 1 && (
                <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-3.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                  Click to expand · Use + / - to zoom
                </div>
              )}
            </div>
          ) : (
            <div className="h-[520px] sm:h-[650px] md:h-[750px] w-full flex flex-col">
              <iframe
                src={`${document.url}#toolbar=0&navpanes=0`}
                className="h-full w-full border-0 bg-white"
                title={document.title}
              />
              <div className="flex items-center justify-between border-t border-border/60 bg-card px-3.5 py-2 text-xs text-muted-foreground">
                <span className="truncate">
                  Viewing official layout blueprint for customer review
                </span>
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
                >
                  Open PDF full size <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal Dialog */}
      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in-0 duration-150"
        >
          {/* Modal Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {document.type === "pdf" ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
              </span>
              <div>
                <h2 className="text-sm font-bold text-foreground sm:text-base">
                  {document.title}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Customer Layout Preview
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                asChild
              >
                <a href={document.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Open File</span>
                </a>
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                asChild
              >
                <a href={document.url} download={document.filename}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </Button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Close fullscreen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Modal Content */}
          <div className="relative flex-1 overflow-auto bg-neutral-950 p-2 sm:p-4 flex items-center justify-center">
            {document.type === "image" ? (
              <img
                src={document.url}
                alt={document.title}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <iframe
                src={document.url}
                className="h-full w-full rounded-lg border-0 bg-white"
                title={document.title}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

