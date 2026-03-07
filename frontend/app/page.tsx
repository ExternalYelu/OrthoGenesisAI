import { BonePreview } from "@/components/BonePreview";
import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { AnimatedStats } from "@/components/AnimatedStats";

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <line x1="12" y1="22" x2="12" y2="12" />
      </svg>
    ),
    title: "Multi-view reconstruction",
    desc: "AP, lateral, and oblique inputs combine into a high-fidelity 3D bone model with calibrated confidence."
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "Interactive planning",
    desc: "Rotate, measure, annotate, and compare models directly in the browser with clinical-grade tools."
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v18" /><path d="M18 3v18" />
        <path d="M6 9h12" /><path d="M6 15h12" />
        <path d="M2 3h4" /><path d="M18 3h4" />
        <path d="M2 21h4" /><path d="M18 21h4" />
      </svg>
    ),
    title: "3D-print ready",
    desc: "Export watertight STL/OBJ/GLTF with printer-safe topology, configurable tolerances, and quality presets."
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "End-to-end encryption",
    desc: "Data is encrypted in transit and at rest. Role-based access controls protect every file and action."
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "HIPAA-aware workflows",
    desc: "Built-in DICOM de-identification, audit logging, PHI controls, and retention policy enforcement."
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: "Confidence mapping",
    desc: "Per-vertex uncertainty coloring distinguishes observed, adjusted, and inferred geometry at a glance."
  }
];

const stats = [
  { value: 98.2, suffix: "%", label: "Mean reconstruction accuracy" },
  { value: 3, suffix: " min", label: "Average reconstruction time" },
  { value: 100, suffix: "%", label: "HIPAA audit coverage" }
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-60" />
          <div className="absolute inset-0 bg-hero-mesh" />
          <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 py-20 lg:flex-row lg:items-center lg:gap-16 lg:py-28">
            <div className="flex-1 space-y-8 animate-fade-up">
              <div className="flex items-center gap-3">
                <span className="badge-blue">Clinical AI</span>
                <span className="badge-teal">Open Beta</span>
              </div>
              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight md:text-[3.4rem]">
                <span className="gradient-text-hero">
                  Turn multi-view X-rays into surgical-grade 3D bone models.
                </span>
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-slate/70">
                OrthoGenesisAI reconstructs precise, 3D-printable anatomy for
                orthopedic planning, patient education, and personalized care.
                Secure, fast, and built for clinical workflows.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button href="/upload" label="Upload X-rays" size="lg" icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                } />
                <Button href="/viewer" label="Explore Demo" variant="outline" size="lg" />
              </div>
            </div>
            <div className="flex-1 animate-fade-up" style={{ animationDelay: "200ms" }}>
              <BonePreview />
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="border-y border-slate/[0.06] bg-white/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-7xl px-6 py-12">
            <AnimatedStats stats={stats} />
          </div>
        </section>

        {/* ── Features ── */}
        <section className="mx-auto w-full max-w-7xl space-y-12 px-6 py-20">
          <SectionHeader
            title="Capabilities"
            subtitle="Clinical-grade precision from upload to export."
            align="center"
          />
          <div className="stagger-children grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <SurfaceCard key={item.title} variant="gradient">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/[0.07] text-accent">
                  {item.icon}
                </div>
                <p className="text-[15px] font-semibold text-ink">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate/60">{item.desc}</p>
              </SurfaceCard>
            ))}
          </div>
        </section>

        {/* ── Workflow ── */}
        <section className="bg-ink text-white">
          <div className="mx-auto w-full max-w-7xl px-6 py-20">
            <div className="mb-12 flex flex-col items-center text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-light/70">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl">
                From X-ray to 3D model in three steps
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Upload",
                  desc: "Drag and drop your AP, lateral, and oblique X-rays. DICOM files are automatically de-identified."
                },
                {
                  step: "02",
                  title: "Reconstruct",
                  desc: "Our AI pipeline extracts bone geometry, aligns multi-view data, and generates a confidence-mapped mesh."
                },
                {
                  step: "03",
                  title: "Review & Export",
                  desc: "Inspect in the 3D viewer, add annotations, measure geometry, then export STL/OBJ for printing or planning."
                }
              ].map((item) => (
                <div key={item.step} className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 transition-colors hover:bg-white/[0.06]">
                  <p className="text-5xl font-bold text-accent/20">{item.step}</p>
                  <p className="mt-4 text-lg font-semibold">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.04] via-transparent to-teal/[0.04]" />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold text-ink md:text-4xl">
              Ready to transform your imaging workflow?
            </h2>
            <p className="max-w-lg text-sm text-slate/60">
              Start with a free reconstruction. No credit card required. HIPAA-aware
              from day one.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button href="/upload" label="Get Started" size="lg" />
              <Button href="/auth" label="Sign In" variant="outline" size="lg" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
