import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { ExportPanel } from "@/components/ExportPanel";

export default function ExportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Export & Share"
          subtitle="Format presets, units, tolerances, and ZIP bundle manifests."
          badge="Traceable"
        />
        <SurfaceCard variant="elevated">
          <ExportPanel />
        </SurfaceCard>

        <SurfaceCard variant="gradient">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/[0.07] text-accent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Secure sharing</p>
              <p className="mt-1 text-xs leading-relaxed text-slate/60">
                Generate time-limited links for clinicians and collaborators. Links expire after 72 hours and are logged in the audit trail.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate/[0.12] bg-white/60 px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-accent/30 hover:text-accent">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Generate Share Link
                </button>
                <span className="text-xs text-slate/40">Valid for 72 hours</span>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/[0.04] px-5 py-4">
          <svg className="mt-0.5 flex-shrink-0 text-warning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs leading-relaxed text-slate/70">
            <span className="font-semibold text-ink">Research use only.</span>{" "}
            Exported files are for planning, printing, and communication workflows—not standalone diagnosis.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
