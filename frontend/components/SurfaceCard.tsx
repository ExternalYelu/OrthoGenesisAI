import { ReactNode } from "react";
import clsx from "clsx";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "bordered" | "gradient";
  hover?: boolean;
};

export function SurfaceCard({
  children,
  className,
  variant = "default",
  hover = true
}: SurfaceCardProps) {
  const base = "rounded-2xl p-6 transition-all duration-300 ease-out-expo";
  const variants = {
    default: clsx(
      "border border-white/60 bg-white/80 shadow-card backdrop-blur-sm",
      hover && "hover:shadow-card-hover hover:-translate-y-[2px]"
    ),
    elevated: clsx(
      "bg-white shadow-soft-lg",
      hover && "hover:shadow-glow hover:-translate-y-[2px]"
    ),
    bordered: clsx(
      "gradient-border bg-white/60 backdrop-blur-sm",
      hover && "hover:bg-white/80 hover:-translate-y-[1px]"
    ),
    gradient: clsx(
      "border border-accent/[0.08] bg-gradient-to-br from-white via-white to-accent/[0.03]",
      hover && "hover:shadow-card-hover hover:-translate-y-[2px]"
    )
  };

  return (
    <div className={clsx(base, variants[variant], className)}>
      {children}
    </div>
  );
}
