// My Account — PRD.md §17.1.
// Staff and Members both land here to change their own password.

import { redirect } from "next/navigation";
import { currentMember, currentStaff } from "@/lib/security/current-actor";
import AccountClient from "./account-client";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const staff = await currentStaff();
  const member = staff ? null : await currentMember();
  if (!staff && !member) redirect("/login");

  return (
    <AccountClient
      loginId={staff?.staffAccountId ?? member!.memberId}
      name={staff?.name ?? member!.name}
      role={staff?.role ?? "MEMBER"}
      context={staff ? "STAFF" : "MEMBER"}
    />
  );
}
