// Edit a Land Inquiry — Land Inquiry spec §23.7.
//
// A Closed inquiry is read-only. Admin or MD must reopen it first, which is a
// recorded decision rather than a quiet edit.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/security/current-actor";
import { formatIstDate } from "@/lib/tasks";
import { getLandInquiry } from "@/lib/services/land-inquiry-service";
import LandInquiryForm from "../../land-inquiry-form";
import { loadFormOptions, toFormInput } from "../../form-options";

export const dynamic = "force-dynamic";

export default async function EditLandInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff("LAND_INQUIRY_MANAGE");
  const { id } = await params;
  const inquiry = await getLandInquiry(id);
  if (!inquiry) notFound();
  if (inquiry.status === "CLOSED" || inquiry.archivedAt) redirect(`/land-inquiries/${id}`);

  const options = await loadFormOptions();

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-3">
        <header>
          <Link
            href={`/land-inquiries/${id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {inquiry.inquiryNo}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Edit {inquiry.inquiryNo}</h1>
        </header>
        <LandInquiryForm
          mode="edit"
          id={inquiry.id}
          version={inquiry.version}
          initial={toFormInput(inquiry)}
          options={options}
          inquiryNo={inquiry.inquiryNo}
          inquiryDate={formatIstDate(inquiry.inquiryDate)}
        />
      </div>
    </AppShell>
  );
}
