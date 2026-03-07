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
      "border bg-[var(--color-surface)] shadow-card",
      hover && "hover:shadow-card-hover hover:-translate-y-[2px]"
    ),
    elevated: clsx(
      "bg-[var(--color-surface)] shadow-soft-lg",
      hover && "hover:shadow-glow hover:-translate-y-[2px]"
    ),
    bordered: clsx(
      "gradient-border bg-[var(--color-surface)]/60 backdrop-blur-sm",
      hover && "hover:bg-[var(--color-surface)]/80 hover:-translate-y-[1px]"
    ),
    gradient: clsx(
      "border bg-[var(--color-surface)]",
      hover && "hover:shadow-card-hover hover:-translate-y-[2px]"
    )
  };

  return (
    <div className={clsx(base, variants[variant], className)} style={{ borderColor: "var(--color-border)" }}>
      {children}
    </div>
  );
}
