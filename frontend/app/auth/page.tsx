import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { AuthPanel } from "@/components/AuthPanel";

export default function AuthPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Secure Access"
          subtitle="Authenticate and manage your clinical sessions."
        />
        <SurfaceCard>
          <AuthPanel />
        </SurfaceCard>
      </main>
      <Footer />
    </div>
  );
}
