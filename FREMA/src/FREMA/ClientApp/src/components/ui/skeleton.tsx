import { cn } from "@/lib/utils";

/** A placeholder block in the shape of content that is still loading. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      // A tint of the text colour rather than the "muted" surface, which is almost white and
      // disappears on white cards.
      className={cn("bg-foreground/[0.12] animate-pulse rounded-md motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
