import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/20",
        success: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
        warning: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
        danger: "bg-rose-500/15 text-rose-300 ring-rose-400/20",
        cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/20",
        muted: "bg-slate-800 text-slate-300 ring-slate-700",
        outline: "border border-slate-700 text-slate-300 ring-0",
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
