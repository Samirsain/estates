// My Account — prd-corrections.md §17.1.
// Staff land here to change their own password.

import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/security/current-actor";
import AccountClient from "./account-client";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const staff = await currentStaff();
  if (!staff) redirect("/login");

  return <AccountClient loginId={staff.staffAccountId} name={staff.name} role={staff.role} />;
}
