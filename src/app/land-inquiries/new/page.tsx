// New Land Inquiry — Land Inquiry spec §23.5.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/security/current-actor";
import { formatIstDate } from "@/lib/tasks";
import LandInquiryForm, { emptyInput } from "../land-inquiry-form";
import { loadFormOptions } from "../form-options";

export const dynamic = "force-dynamic";

export default async function NewLandInquiryPage() {
  const actor = await requireStaff("LAND_INQUIRY_MANAGE");
  const options = await loadFormOptions();

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-3">
        <header>
          <Link
            href="/land-inquiries"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Land Inquiries
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">New Land Inquiry</h1>
        </header>
        <LandInquiryForm
          mode="create"
          initial={emptyInput()}
          options={options}
          inquiryDate={formatIstDate(new Date())}
        />
      </div>
    </AppShell>
  );
}
