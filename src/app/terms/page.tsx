// The published Terms and Privacy Notice — Terms §2.1.
//
// Public on purpose: the Member login links here before anyone has signed in,
// and a person is entitled to read what they are being asked to accept without
// first handing over credentials.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MEMBER_TERMS_VERSION, readTerms } from "@/lib/terms";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Terms and Privacy Notice — 3% Club",
  description: "Member and Customer Terms, FAQs and the Privacy Notice.",
};

export default function TermsPage() {
  const blocks = readTerms();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-10">
      <Link
        href="/portal/login"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>

      <header className="mt-4 border-b border-border/60 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Terms and Privacy Notice</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Published version {MEMBER_TERMS_VERSION}
        </p>
      </header>

      <article className="mt-6 space-y-4 text-sm leading-relaxed text-foreground">
        {blocks.map((block, i) => {
          if (block.kind === "heading") {
            return block.level === 1 ? (
              <h2
                key={i}
                className="border-b border-border/60 pb-2 pt-8 text-lg font-semibold tracking-tight"
              >
                {block.text}
              </h2>
            ) : (
              <h3 key={i} className="pt-4 text-sm font-semibold text-foreground">
                {block.text}
              </h3>
            );
          }
          if (block.kind === "bullets") {
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 text-muted-foreground">
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
      </article>
    </main>
  );
}
