import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ProgressStepper } from "@/components/ProgressStepper";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";

const pipelineSteps = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: "Preprocessing",
    desc: "Noise reduction, normalization, and quality validation."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
    title: "Model Inference",
    desc: "GPU-accelerated depth estimation and bone extraction."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
    title: "Mesh Refinement",
    desc: "Taubin smoothing, artifact removal, and topology repair."
  }
];

export default function ProcessingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Reconstruction"
          subtitle="Track live stage, ETA, and retry failed jobs."
          badge="Live"
        />
        <SurfaceCard variant="elevated">
          <ProgressStepper />
        </SurfaceCard>
        <div className="stagger-children grid gap-6 md:grid-cols-3">
          {pipelineSteps.map((step) => (
            <SurfaceCard key={step.title} variant="gradient">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/[0.07] text-accent">
                {step.icon}
              </div>
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate/60">{step.desc}</p>
            </SurfaceCard>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/[0.04] px-5 py-4">
          <svg className="mt-0.5 flex-shrink-0 text-warning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs leading-relaxed text-slate/70">
            <span className="font-semibold text-ink">Research use only.</span>{" "}
            Reconstruction progress and outputs are for planning support, not standalone diagnosis.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
