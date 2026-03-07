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
          badge="Encrypted"
        />
        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <SurfaceCard variant="elevated">
            <AuthPanel />
          </SurfaceCard>
          <div className="space-y-6">
            <SurfaceCard variant="gradient">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/[0.07] text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">JWT Authentication</p>
              <p className="mt-2 text-xs leading-relaxed text-slate/60">
                Sessions are secured with signed tokens. Passwords are hashed with bcrypt.
              </p>
            </SurfaceCard>
            <SurfaceCard variant="gradient">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">Role-based access</p>
              <p className="mt-2 text-xs leading-relaxed text-slate/60">
                Doctor, researcher, admin, and patient roles control endpoint and UI access.
              </p>
            </SurfaceCard>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
