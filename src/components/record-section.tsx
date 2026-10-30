/**
 * The two blocks every record profile is built from — Customer, Member, Plot.
 *
 * They used to be copied into each page, and had already drifted: one grew an
 * `aside`, one grew `h-full`, one grew `min-w-0`, and the three headers were
 * styled three slightly different ways. One definition, so a change to how a
 * record reads is made once.
 *
 * The title is a plain sentence, not the small uppercase label it was. Ten of
 * those stacked down a page stop being a heading and become a texture — every
 * block announces itself the same way, so none of them stands out. A hairline
 * under the header does the separating instead, which is the house rule
 * anyway (apple-design-reference.md: hairlines, never elevation).
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Section({
  title,
  icon,
  aside,
  fill,
  below,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  /** Right of the title: a count, a link, one small action. */
  aside?: React.ReactNode;
  /** Stretch to the tallest cell of its grid row, body included, so the content
   *  can centre itself in the height. Off by default: a short card next to a
   *  long one stays short rather than ending in empty space. */
  fill?: boolean;
  /** A second part under a hairline. Cards side by side share their rows
   *  (subgrid), so the hairline sits at the same height in each of them. */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "p-4 md:p-5",
        fill && "flex h-full flex-col",
        below !== undefined && "md:row-span-3 md:grid md:grid-rows-subgrid md:gap-y-0"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {aside}
      </div>
      <div className={cn("mt-3 min-w-0", fill && "flex-1")}>{children}</div>
      {below !== undefined && <div className="mt-4 min-w-0 border-t border-border/60 pt-3">{below}</div>}
    </Card>
  );
}

/**
 * One answer in the summary row at the top of a profile. This label stays
 * uppercase: it is a field name sitting directly above its value, not a
 * section heading, and the four of them read as one row rather than as four
 * announcements. The value carries the weight.
 */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 md:px-4 md:first:pl-0", className)}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold leading-tight text-foreground">{value}</dd>
      {hint && <dd className="mt-0.5 text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}
