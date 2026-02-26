import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { ExportPanel } from "@/components/ExportPanel";

export default function ExportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Export & Share"
          subtitle="Format presets, units, tolerances, and ZIP bundle manifests."
        />
        <SurfaceCard>
          <ExportPanel />
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-sm font-semibold text-ink">Secure sharing</p>
          <p className="mt-2 text-xs text-slate">
            Generate time-limited links for clinicians and collaborators.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button className="rounded-full border border-slate/20 px-4 py-2 text-xs font-semibold text-slate">
              Generate Share Link
            </button>
            <span className="text-xs text-slate">Valid for 72 hours</span>
          </div>
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-xs text-red-700">
            Not diagnostic: exported files are for planning, printing, and communication workflows.
          </p>
        </SurfaceCard>
      </main>
      <Footer />
    </div>
  );
}
