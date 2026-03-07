import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";

type ButtonProps = {
  href?: Route;
  label: string;
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
};

export function Button({
  href,
  label,
  variant = "primary",
  size = "md",
  className,
  onClick,
  disabled,
  loading,
  icon
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 ease-out-expo select-none";

  const sizes = {
    sm: "rounded-lg px-4 py-2 text-[13px]",
    md: "rounded-xl px-6 py-3 text-sm",
    lg: "rounded-xl px-8 py-3.5 text-[15px]"
  };

  const styles = {
    primary: clsx(
      "bg-accent text-white shadow-sm",
      "hover:bg-accent-dark hover:shadow-md hover:-translate-y-[1px]",
      "active:translate-y-0 active:shadow-sm"
    ),
    ghost: "text-slate/70 hover:text-ink hover:bg-slate/[0.05]",
    outline: clsx(
      "border border-slate/[0.12] text-ink bg-white/60",
      "hover:border-accent/30 hover:text-accent hover:bg-accent/[0.03]"
    ),
    danger: clsx(
      "bg-danger text-white shadow-sm",
      "hover:bg-red-700 hover:shadow-md hover:-translate-y-[1px]"
    )
  };

  const classes = clsx(
    base,
    sizes[size],
    styles[variant],
    (disabled || loading) && "pointer-events-none opacity-50",
    className
  );

  const content = (
    <>
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {label}
    </>
  );

  if (href && !disabled) {
    return (
      <Link className={classes} href={href}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} onClick={onClick} disabled={disabled || loading} type="button">
      {content}
    </button>
  );
}
