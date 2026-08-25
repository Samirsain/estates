"use client";

// Client-side submit button providing instant feedback and animated spinner during login.
import React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TermsBlock } from "@/lib/terms";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full transition-all" disabled={pending}>
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
          Signing in…
        </span>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

/**
 * Terms §2.1 — the Member accepts the Terms and Privacy Notice.
 *
 * The document is put in front of the Member rather than linked past: the box
 * cannot be ticked until the panel has been read to the end. A link alone lets
 * someone accept a document they never opened, which is the thing acceptance is
 * supposed to mean.
 */
export function TermsGate({ blocks, version }: { blocks: TermsBlock[]; version: string }) {
  const panel = React.useRef<HTMLDivElement>(null);
  const [read, setRead] = React.useState(false);

  const check = React.useCallback(() => {
    const el = panel.current;
    if (!el) return;
    // A panel with nothing to scroll has already been read in full.
    if (el.scrollHeight - el.clientHeight <= 4) return setRead(true);
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setRead(true);
  }, []);

  React.useEffect(check, [check]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Terms and Privacy Notice</p>
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Open in a new tab
        </a>
      </div>

      <div
        ref={panel}
        onScroll={check}
        tabIndex={0}
        role="article"
        aria-label={`Terms and Privacy Notice, version ${version}`}
        className="h-56 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-secondary px-3 py-2.5 text-[11px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {blocks.map((block, i) => {
          if (block.kind === "heading") {
            return (
              <p
                key={i}
                className={
                  block.level === 1
                    ? "pt-3 text-xs font-semibold text-foreground"
                    : "pt-2 text-[11px] font-semibold text-foreground"
                }
              >
                {block.text}
              </p>
            );
          }
          if (block.kind === "bullets") {
            return (
              <ul key={i} className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-muted-foreground">
              {block.text}
            </p>
          );
        })}
      </div>

      <label
        className={`flex items-start gap-2.5 text-xs leading-relaxed ${
          read ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <input
          type="checkbox"
          name="acceptTerms"
          required
          disabled={!read}
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <span>
          I have read and accept the Member Terms and Privacy Notice.
          {!read && (
            <span className="block text-[11px] text-muted-foreground">
              Scroll to the end of the document to continue.
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
