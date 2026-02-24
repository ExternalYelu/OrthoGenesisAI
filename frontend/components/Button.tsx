import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";

type ButtonProps = {
  href?: Route;
  label: string;
  variant?: "primary" | "ghost" | "outline";
  className?: string;
  onClick?: () => void;
};

export function Button({
  href,
  label,
  variant = "primary",
  className,
  onClick
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200";
  const styles = {
    primary:
      "bg-accent text-white shadow-glow hover:-translate-y-0.5 hover:shadow-soft",
    ghost: "text-ink hover:text-accent",
    outline:
      "border border-slate/20 text-ink hover:border-accent hover:text-accent"
  };
  const classes = clsx(base, styles[variant], className);

  if (href) {
    return (
      <Link className={classes} href={href}>
        {label}
      </Link>
    );
  }

  return (
    <button className={classes} onClick={onClick} type="button">
      {label}
    </button>
  );
}
