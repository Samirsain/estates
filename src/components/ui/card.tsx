import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // card-surface sets background and border, at the same specificity as a
      // Tailwind utility but later in the file, so it won both: bg-card/60 and
      // border-border/50 were here without ever rendering. backdrop-blur-md did
      // apply and did nothing, having an opaque background to blur through.
      //
      // shadow-xl rendered, against the rule written directly above card-surface
      // in globals.css: chrome is separated by a hairline and a change of
      // canvas, never by elevation. It is the one line here that was visible,
      // and the one that should not have been.
      //
      // hover:border-border/80 stays — a pseudo-class outranks card-surface on
      // specificity, so unlike the rest it does what it says.
      "rounded-2xl text-card-foreground card-surface transition-colors duration-200 hover:border-border/80",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export { Card };
