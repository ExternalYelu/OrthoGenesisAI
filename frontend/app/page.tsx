import { BonePreview } from "@/components/BonePreview";
import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16 lg:flex-row lg:items-center">
          <div className="flex-1 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate/60">
              Clinical AI Reconstruction
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-ink md:text-5xl">
              Turn multi-view X-rays into surgical-grade 3D bone models.
            </h1>
            <p className="text-base text-slate">
              OrthoGenesisAI reconstructs precise, 3D-printable anatomy for orthopedic planning,
              patient education, and personalized care. Secure, fast, and validated for clinical
              workflows.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button href="/upload" label="Upload X-rays" />
              <Button href="/viewer" label="Explore Demo" variant="outline" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <SurfaceCard>
                <p className="text-2xl font-semibold text-ink">98.2%</p>
                <p className="text-xs text-slate">Mean reconstruction accuracy</p>
              </SurfaceCard>
              <SurfaceCard>
                <p className="text-2xl font-semibold text-ink">3 min</p>
                <p className="text-xs text-slate">Average reconstruction time</p>
              </SurfaceCard>
              <SurfaceCard>
                <p className="text-2xl font-semibold text-ink">HIPAA</p>
                <p className="text-xs text-slate">Audit-ready data handling</p>
              </SurfaceCard>
            </div>
          </div>
          <div className="flex-1">
            <BonePreview />
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-8 px-6 py-16">
          <SectionHeader title="Precision" subtitle="Clinical workflow built for confidence." />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Multi-view reconstruction",
                desc: "AP, lateral, and oblique inputs reconstruct a high-fidelity model."
              },
              {
                title: "Interactive planning",
                desc: "Rotate, slice, and annotate directly in the browser."
              },
              {
                title: "3D-print ready",
                desc: "Export STL/OBJ/GLTF with printer-safe topology."
              }
            ].map((item) => (
              <SurfaceCard key={item.title}>
                <p className="text-lg font-semibold text-ink">{item.title}</p>
                <p className="mt-2 text-sm text-slate">{item.desc}</p>
              </SurfaceCard>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-8 px-6 py-16">
          <SectionHeader title="Security" subtitle="Trusted by hospitals and research teams." />
          <div className="grid gap-6 md:grid-cols-2">
            <SurfaceCard>
              <p className="text-lg font-semibold text-ink">End-to-end encryption</p>
              <p className="mt-2 text-sm text-slate">
                Data is encrypted in transit and at rest with role-based access controls.
              </p>
            </SurfaceCard>
            <SurfaceCard>
              <p className="text-lg font-semibold text-ink">Audit-ready analytics</p>
              <p className="mt-2 text-sm text-slate">
                Trace every model, export, and clinical decision for compliance and quality.
              </p>
            </SurfaceCard>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
