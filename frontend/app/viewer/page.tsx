import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ModelViewer } from "@/components/ModelViewer";
import { SectionHeader } from "@/components/SectionHeader";

export default function ViewerPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader title="3D Viewer" subtitle="Inspect models with clinical tools." />
        <ModelViewer />
      </main>
      <Footer />
    </div>
  );
}
