"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "./Button";
import { BrandMark } from "./BrandMark";

const navLinks = [
  { href: "/upload", label: "Upload" },
  { href: "/processing", label: "Processing" },
  { href: "/viewer", label: "Viewer" },
  { href: "/export", label: "Export" },
  { href: "/patient", label: "Patient Mode" },
  { href: "/auth", label: "Auth" }
] as const;

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
          ? "glass-strong border-b border-slate/[0.06] shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="bg-ink px-6 py-1.5 text-center text-[11px] font-medium tracking-wide text-white/70">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
        Research-use software · Not for standalone clinical diagnosis
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-xl transition-transform duration-300 group-hover:scale-105" />
          <span className="text-lg font-semibold tracking-tight text-ink">
            Ortho<span className="text-accent">Genesis</span>AI
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "relative rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200",
                  isActive
                    ? "text-accent"
                    : "text-slate/70 hover:text-ink hover:bg-slate/[0.04]"
                )}
              >
                {link.label}
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-[2px] rounded-full bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <Button href="/upload" label="Upload X-rays" size="sm" />
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate/60 transition-colors hover:bg-slate/[0.06] hover:text-ink md:hidden"
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
        <div className="glass-strong animate-fade-down border-t border-slate/[0.06] px-6 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-accent/[0.06] text-accent" : "text-slate/70 hover:bg-slate/[0.04] hover:text-ink"
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
