import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface BentoGridProps extends React.HTMLAttributes<HTMLDivElement> {}

const BentoGrid = forwardRef<HTMLDivElement, BentoGridProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("bento-grid", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

BentoGrid.displayName = "BentoGrid";

interface BentoItemProps extends React.HTMLAttributes<HTMLDivElement> {
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
}

const BentoItem = forwardRef<HTMLDivElement, BentoItemProps>(
  ({ className, colSpan = 1, rowSpan = 1, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "stat-card",
          colSpan === 2 && "col-span-2",
          rowSpan === 2 && "row-span-2",
          className
        )}
        style={{
          gridColumn: colSpan > 1 ? `span ${colSpan}` : undefined,
          gridRow: rowSpan > 1 ? `span ${rowSpan}` : undefined,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

BentoItem.displayName = "BentoItem";

export { BentoGrid, BentoItem };
