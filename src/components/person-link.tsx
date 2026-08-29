import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A person's name is a way into their profile, everywhere it is printed.
 *
 * It resolves through /people/[personId] rather than a profile route, so a
 * screen that has the Person can link them without also having to know which
 * profile they hold. Without an id it degrades to the plain name — a name that
 * cannot be resolved is still a name, not a dead link.
 */
export function PersonLink({
  personId,
  name,
  as,
  className,
}: {
  personId?: string | null;
  name: string;
  /** Which profile the caller meant, when the Person could hold both. */
  as?: "member" | "customer";
  className?: string;
}) {
  if (!personId) return <>{name}</>;
  return (
    <Link
      href={as === "member" ? `/people/${personId}?as=member` : `/people/${personId}`}
      className={cn("text-primary hover:underline", className)}
    >
      {name}
    </Link>
  );
}
