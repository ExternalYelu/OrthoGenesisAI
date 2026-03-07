"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "./Button";
import { BrandMark } from "./BrandMark";
import { useTheme } from "./ThemeProvider";

const navLinks = [
  { href: "/upload", label: "Upload" },
  { href: "/processing", label: "Processing" },
  { href: "/viewer", label: "Viewer" },
  { href: "/export", label: "Export" },
  { href: "/patient", label: "Patient Mode" }
] as const;

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] text-slate transition-all duration-200 hover:bg-[var(--color-surface-muted)] hover:text-ink"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "glass-strong border-b shadow-sm"
          : "bg-transparent"
      )}
      style={{ borderColor: scrolled ? "var(--color-border)" : "transparent" }}
    >
      <div className="bg-[#020617] px-6 py-1.5 text-center text-[11px] font-medium tracking-wide text-white/60">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-bio animate-pulse" />
        Research-use software · Not for standalone clinical diagnosis
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-xl transition-transform duration-300 group-hover:scale-105" />
          <span className="text-lg font-semibold tracking-tight text-ink">
            Ortho<span className="text-accent">Genesis</span><span className="text-bio">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "relative rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                  isActive
                    ? "text-accent bg-accent/[0.06]"
                    : "text-slate hover:text-ink hover:bg-[var(--color-surface-muted)]"
                )}
              >
                {link.label}
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-[2px] rounded-full bg-gradient-to-r from-accent to-bio" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden md:block">
            <Button href="/upload" label="Upload X-rays" size="sm" />
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate transition-colors hover:bg-[var(--color-surface-muted)] hover:text-ink md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {mobileOpen ? (
                <>
                  <line x1="4" y1="4" x2="16" y2="16" />
                  <line x1="16" y1="4" x2="4" y2="16" />
                </>
              ) : (
                <>
                  <line x1="3" y1="5" x2="17" y2="5" />
                  <line x1="3" y1="10" x2="17" y2="10" />
                  <line x1="3" y1="15" x2="17" y2="15" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="glass-strong animate-fade-down border-t px-6 pb-4 pt-2 md:hidden" style={{ borderColor: "var(--color-border)" }}>
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-accent/[0.08] text-accent" : "text-slate hover:bg-[var(--color-surface-muted)] hover:text-ink"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-2">
              <Button href="/upload" label="Upload X-rays" className="w-full" size="sm" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
