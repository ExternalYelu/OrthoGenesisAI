import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { UploadDropzone } from "@/components/UploadDropzone";

const sidebarCards = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    color: "accent",
    title: "Validation checklist",
    items: [
      "2.5D mode: one X-ray → depth-style mesh",
      "3D mode: AP, lateral, and oblique required",
      "Consistent patient positioning",
      "Clear bone boundaries"
    ]
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    color: "teal",
    title: "Security",
    text: "All uploads are encrypted in transit and at rest with full audit trail logging."
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    color: "warning",
    title: "Important",
    text: "Not diagnostic: upload results support planning and clinical communication only."
  }
];

export default function UploadPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Secure Upload"
          subtitle="Choose single-view 2.5D or full multi-view 3D reconstruction."
          badge="Encrypted"
        />
        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <SurfaceCard variant="elevated">
            <UploadDropzone />
          </SurfaceCard>
          <div className="stagger-children space-y-5">
            {sidebarCards.map((card) => (
              <SurfaceCard key={card.title} variant="gradient">
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${
                  card.color === "accent" ? "bg-accent/[0.07] text-accent" :
                  card.color === "teal" ? "bg-teal/10 text-teal" :
                  "bg-warning/10 text-warning"
                }`}>
                  {card.icon}
                </div>
                <p className="text-sm font-semibold text-ink">{card.title}</p>
                {card.items ? (
                  <ul className="mt-3 space-y-2">
                    {card.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-slate/60">
                        <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent/40" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-slate/60">{card.text}</p>
                )}
              </SurfaceCard>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
