import { Suspense } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ModelViewer } from "@/components/ModelViewer";

export default function ViewerPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-14">
        <section className="relative overflow-hidden rounded-2xl border border-slate/[0.06] bg-white p-8 shadow-card">
          <div className="absolute inset-0 bg-hero-mesh opacity-50" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-gradient-to-r from-accent/40 to-transparent" />
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent/70">
                3D Viewer
              </p>
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-4xl">
              Clinical viewer with tools, annotations, and comparison.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate/60">
              Load reconstructed models, inspect with canonical camera views, measure geometry,
              annotate findings, and compare pre/post side by side with difference heatmaps.
            </p>
          </div>
        </section>
        <Suspense fallback={<div className="flex h-96 items-center justify-center text-slate/40">Loading viewer…</div>}>
          <ModelViewer />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
