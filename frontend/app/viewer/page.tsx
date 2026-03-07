import { Suspense } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ModelViewer } from "@/components/ModelViewer";

export default function ViewerPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--color-frost)" }}>
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-10">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent/10 to-bio/10 text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.29 7 12 12 20.71 7" />
                  <line x1="12" y1="22" x2="12" y2="12" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-ink">3D Viewer</h1>
                <p className="text-sm text-slate">
                  Load a model by ID, then inspect, measure, annotate, and compare.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Enter a Model ID (from Upload page) to load your reconstruction
          </div>
        </div>

        {/* Viewer */}
        <Suspense fallback={
          <div className="flex h-[500px] items-center justify-center rounded-2xl border text-slate" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading viewer…
            </div>
          </div>
        }>
          <ModelViewer />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
