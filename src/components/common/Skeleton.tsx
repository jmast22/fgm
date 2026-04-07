import { cn } from "../../lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-surface-800/60 border border-surface-700/50",
        className
      )}
    />
  );
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-full bg-surface-800/60 border border-surface-700/50",
        className
      )}
    />
  );
}
