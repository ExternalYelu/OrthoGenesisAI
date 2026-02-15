import { ReactNode } from "react";
import clsx from "clsx";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

export function SurfaceCard({ children, className }: SurfaceCardProps) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/60 bg-white/80 p-6 shadow-soft backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
