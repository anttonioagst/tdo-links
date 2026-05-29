import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-zinc-700/40 text-zinc-200 ring-zinc-500/40",
        success: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
        warning: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
        danger: "bg-rose-500/15 text-rose-300 ring-rose-400/20",
        muted: "bg-zinc-800 text-zinc-300 ring-zinc-700",
        outline: "border border-zinc-700 text-zinc-300 ring-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
