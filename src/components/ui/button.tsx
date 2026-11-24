import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // apple-design-reference.md — the pill is the action shape, and chrome carries no shadow.
  // text-center because a Button rendered asChild is an <a>, and only <button>
  // gets centred text from the browser. Same box, same label, same alignment.
  // A press gives a little under the finger (owner, 24 Nov 2026): 0.97 in 75ms,
  // back on the house curve. Only the press moves — a hover lift would slide
  // the button out from under the pointer — and reduced motion keeps the colour.
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-center text-sm font-normal transition-[color,background-color,border-color,opacity,transform] duration-150 ease-house motion-safe:active:scale-[0.97] motion-safe:active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-ring",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-card text-primary hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Text, not a pill: it does not give under a press.
        link: "text-primary underline-offset-4 hover:underline motion-safe:active:scale-100",
        gradient: "bg-primary text-primary-foreground hover:bg-ring",
      },
      size: {
        default: "h-10 px-[22px]",
        sm: "h-8 px-3.5 text-xs",
        xs: "h-7 px-2.5 text-[11px] font-medium rounded-lg",
        lg: "h-12 px-7 text-base font-light",
        icon: "h-10 w-10",
        "icon-sm": "h-7 w-7 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
