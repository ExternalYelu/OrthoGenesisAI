import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ModelViewer } from "@/components/ModelViewer";

export default function ViewerPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-9 px-6 py-14">
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate/60">3D Viewer</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-ink md:text-5xl">
            Clinical viewer with tools, annotations, and comparison.
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate">
            Load reconstructed models, inspect with canonical camera views, measure geometry, annotate findings, and compare pre/post side by side.
          </p>
        </section>
        <ModelViewer />
      </main>
      <Footer />
    </div>
  );
}
