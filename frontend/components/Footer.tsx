import Link from "next/link";

const productLinks = [
  { href: "/upload" as const, label: "Upload" },
  { href: "/viewer" as const, label: "3D Viewer" },
  { href: "/export" as const, label: "Export" },
  { href: "/patient" as const, label: "Patient Mode" }
];

const complianceItems = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5 7V5a3 3 0 0 1 6 0v2" />
      </svg>
    ),
    label: "End-to-end encryption"
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1.5L2 4v4c0 3.5 2.5 6 6 7.5 3.5-1.5 6-4 6-7.5V4L8 1.5z" />
        <path d="M6 8l1.5 1.5L10 7" />
      </svg>
    ),
    label: "HIPAA-aware workflows"
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h12M2 8h12M2 4h12" />
        <circle cx="5" cy="4" r="1" fill="currentColor" />
        <circle cx="10" cy="8" r="1" fill="currentColor" />
        <circle cx="7" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
    label: "Full audit trail"
  }
];

export function Footer() {
  return (
    <footer className="relative border-t border-slate/[0.06]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
      <div className="mx-auto w-full max-w-7xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[2fr,1fr,1fr]">
          <div className="space-y-4">
            <p className="text-base font-semibold tracking-tight text-ink">
              Ortho<span className="text-accent">Genesis</span>AI
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-slate/60">
              AI-powered 3D bone reconstruction for orthopedic planning,
              patient education, and surgical preparation. Built for clinical-grade
              precision and security.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate/40">
              Product
            </p>
            <nav className="flex flex-col gap-2">
              {productLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-slate/60 transition-colors hover:text-ink"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate/40">
              Compliance
            </p>
            <div className="flex flex-col gap-2.5">
              {complianceItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-slate/50">
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate/[0.06] pt-6 md:flex-row">
          <p className="text-xs text-slate/40">
            © {new Date().getFullYear()} OrthoGenesisAI. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="badge-blue">Research Use</span>
            <span className="badge-teal">SOC 2 Ready</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
