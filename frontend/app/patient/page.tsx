"use client";

import { useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { Button } from "@/components/Button";

const explainCards = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    title: "What am I seeing?",
    text: "This is a 3D shape built from your X-ray so your care team can explain the structure in plain language."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: "What changed?",
    text: "Highlighted regions show the area your care team is monitoring before or after treatment."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Why does this matter?",
    text: "A 3D view can make surgery planning, risk discussion, and recovery goals easier to understand."
  }
];

const tourSteps = [
  "This is your anatomy model based on the uploaded imaging. You can rotate and zoom it.",
  "These highlighted zones show where your care team is focused. Colors indicate areas of interest.",
  "Next, your clinician will explain your options and expected outcomes using this model."
];

export default function PatientPage() {
  const [step, setStep] = useState(0);
  const [showExplain, setShowExplain] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <SectionHeader
          title="Patient Mode"
          subtitle="A guided, simplified experience for understanding your model."
          badge="Simplified View"
        />

        <SurfaceCard variant="elevated">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-ink">Your bone model</p>
              <span className="badge-blue">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Tools locked
              </span>
            </div>
            <div className="flex h-[360px] items-center justify-center rounded-2xl border border-slate/[0.06] bg-gradient-to-br from-[#f0f5fc] via-[#f7fafd] to-[#eef6f5]">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/[0.07]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2E7DF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate/40">3D model loads here</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate/60">
              This model helps explain your anatomy and the planned procedure. You can rotate and
              zoom for a closer look. Editing and export actions are disabled in patient mode.
            </p>
          </div>
        </SurfaceCard>

        <SurfaceCard variant="gradient">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-ink">Guided Tour</p>
              <div className="mt-1 flex items-center gap-2">
                {tourSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === step ? "w-6 bg-accent" : i < step ? "w-3 bg-accent/30" : "w-3 bg-slate/10"
                    }`}
                  />
                ))}
              </div>
            </div>
            <span className="text-xs font-medium text-slate/40">
              Step {step + 1} of {tourSteps.length}
            </span>
          </div>
          <div className="mt-5 rounded-xl border border-slate/[0.06] bg-surface-muted p-5">
            <p className="text-sm leading-relaxed text-slate/70">{tourSteps[step]}</p>
          </div>
          <div className="mt-5 flex gap-3">
            <Button
              label="Back"
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            />
            <Button
              label={step === tourSteps.length - 1 ? "Restart" : "Next"}
              size="sm"
              onClick={() => setStep((prev) => (prev === tourSteps.length - 1 ? 0 : prev + 1))}
            />
          </div>
        </SurfaceCard>

        <div className="stagger-children grid gap-6 md:grid-cols-3">
          {explainCards.map((card, index) => (
            <SurfaceCard key={card.title} variant="gradient">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/[0.07] text-accent">
                {card.icon}
              </div>
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate/60">{card.text}</p>
              <button
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate/[0.12] bg-white/60 px-3 py-2 text-xs font-semibold text-slate/70 transition-colors hover:border-accent/30 hover:text-accent"
                onClick={() => setShowExplain((prev) => (prev === index ? null : index))}
              >
                {showExplain === index ? "Hide" : "Explain"}
              </button>
              {showExplain === index && (
                <div className="mt-3 animate-fade-up rounded-xl border border-slate/[0.06] bg-surface-muted p-4">
                  <p className="text-xs leading-relaxed text-slate/60">
                    Your care team can use this part to answer questions in simple terms, review options, and confirm next steps.
                  </p>
                </div>
              )}
            </SurfaceCard>
          ))}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/[0.04] px-5 py-4">
          <svg className="mt-0.5 flex-shrink-0 text-warning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs leading-relaxed text-slate/70">
            <span className="font-semibold text-ink">Educational only.</span>{" "}
            This view should be interpreted by a licensed clinician.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
