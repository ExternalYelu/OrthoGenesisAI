import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";

export default function PatientPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Patient Mode"
          subtitle="A clear, simplified view for patient education."
        />
        <SurfaceCard>
          <div className="space-y-4">
            <p className="text-sm font-semibold text-ink">Your bone model</p>
            <div className="h-[320px] rounded-2xl bg-grid-fade" />
            <p className="text-sm text-slate">
              This model helps explain your anatomy and the planned procedure. You can rotate and
              zoom for a closer look.
            </p>
          </div>
        </SurfaceCard>
        <div className="grid gap-6 md:grid-cols-2">
          <SurfaceCard>
            <p className="text-sm font-semibold text-ink">Key labels</p>
            <p className="mt-2 text-xs text-slate">
              Important areas are highlighted for easy explanation.
            </p>
          </SurfaceCard>
          <SurfaceCard>
            <p className="text-sm font-semibold text-ink">Trusted guidance</p>
            <p className="mt-2 text-xs text-slate">
              No editing tools are available in patient mode.
            </p>
          </SurfaceCard>
        </div>
      </main>
      <Footer />
    </div>
  );
}
