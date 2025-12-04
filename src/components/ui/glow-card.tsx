import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  animated?: boolean;
}

const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(
  ({ className, animated = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          animated ? "glow-border-animated" : "glow-card",
          "bg-card",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlowCard.displayName = "GlowCard";

export { GlowCard };
