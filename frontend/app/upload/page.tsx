import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { UploadDropzone } from "@/components/UploadDropzone";

export default function UploadPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Secure Upload"
          subtitle="Upload multi-view X-rays for AI reconstruction."
        />
        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <SurfaceCard>
            <UploadDropzone />
          </SurfaceCard>
          <div className="space-y-6">
            <SurfaceCard>
              <p className="text-sm font-semibold text-ink">Validation checklist</p>
              <ul className="mt-3 space-y-2 text-xs text-slate">
                <li>Minimum three views per case</li>
                <li>Consistent patient positioning</li>
                <li>Clear bone boundaries</li>
              </ul>
            </SurfaceCard>
            <SurfaceCard>
              <p className="text-sm font-semibold text-ink">Security</p>
              <p className="mt-2 text-xs text-slate">
                All uploads are encrypted and logged for HIPAA-aware auditing.
              </p>
            </SurfaceCard>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
