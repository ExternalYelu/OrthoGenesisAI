import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ProgressStepper } from "@/components/ProgressStepper";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";

export default function ProcessingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Reconstruction"
          subtitle="Track live stage, ETA, and retry failed jobs."
        />
        <SurfaceCard>
          <ProgressStepper />
        </SurfaceCard>
        <div className="grid gap-6 md:grid-cols-3">
          <SurfaceCard>
            <p className="text-sm font-semibold text-ink">Preprocessing</p>
            <p className="mt-2 text-xs text-slate">Noise reduction and normalization.</p>
          </SurfaceCard>
          <SurfaceCard>
            <p className="text-sm font-semibold text-ink">Model Inference</p>
            <p className="mt-2 text-xs text-slate">GPU-accelerated 3D inference.</p>
          </SurfaceCard>
          <SurfaceCard>
            <p className="text-sm font-semibold text-ink">Mesh Refinement</p>
            <p className="mt-2 text-xs text-slate">Artifact removal and smoothing.</p>
          </SurfaceCard>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
          Not diagnostic: reconstruction progress and outputs are for planning support.
        </div>
      </main>
      <Footer />
    </div>
  );
}
