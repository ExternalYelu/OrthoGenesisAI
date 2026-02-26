"use client";

import { useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SectionHeader } from "@/components/SectionHeader";
import { SurfaceCard } from "@/components/SurfaceCard";
import { Button } from "@/components/Button";

const explainCards = [
  {
    title: "What am I seeing?",
    text: "This is a 3D shape built from your X-ray so your care team can explain the structure in plain language."
  },
  {
    title: "What changed?",
    text: "Highlighted regions show the area your care team is monitoring before or after treatment."
  },
  {
    title: "Why does this matter?",
    text: "A 3D view can make surgery planning, risk discussion, and recovery goals easier to understand."
  }
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
        />
        <SurfaceCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Your bone model</p>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate">
                Tools locked for patient mode
              </span>
            </div>
            <div className="h-[320px] rounded-2xl border border-slate-200 bg-[#eef2f8]" />
            <p className="text-sm text-slate">
              This model helps explain your anatomy and the planned procedure. You can rotate and
              zoom for a closer look. Editing and export actions are disabled in patient mode.
            </p>
          </div>
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-sm font-semibold text-ink">Guided Tour</p>
          <p className="mt-2 text-xs text-slate">Step {step + 1} of 3</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {step === 0 ? (
              <p className="text-sm text-slate">This is your anatomy model based on the uploaded imaging.</p>
            ) : null}
            {step === 1 ? (
              <p className="text-sm text-slate">These highlighted zones show where your care team is focused.</p>
            ) : null}
            {step === 2 ? (
              <p className="text-sm text-slate">Next, your clinician explains options and expected outcomes.</p>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              label="Back"
              variant="outline"
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            />
            <Button
              label={step === 2 ? "Restart" : "Next"}
              onClick={() => setStep((prev) => (prev === 2 ? 0 : prev + 1))}
            />
          </div>
        </SurfaceCard>
        <div className="grid gap-6 md:grid-cols-3">
          {explainCards.map((card, index) => (
            <SurfaceCard key={card.title}>
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <p className="mt-2 text-xs text-slate">{card.text}</p>
              <button
                className="mt-4 rounded-full border border-slate/20 px-4 py-2 text-xs font-semibold text-slate"
                onClick={() => setShowExplain((prev) => (prev === index ? null : index))}
              >
                {showExplain === index ? "Hide explanation" : "Explain this model"}
              </button>
              {showExplain === index ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate">
                  Your care team can use this part to answer questions in simple terms, review options, and confirm next steps.
                </p>
              ) : null}
            </SurfaceCard>
          ))}
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
          Not diagnostic: this view is educational and should be interpreted by a licensed clinician.
        </div>
      </main>
      <Footer />
    </div>
  );
}
