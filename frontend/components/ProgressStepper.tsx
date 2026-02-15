"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const steps = [
  { key: "preprocessing", label: "Preprocessing" },
  { key: "alignment", label: "Image alignment" },
  { key: "inference", label: "Model inference" },
  { key: "refinement", label: "Mesh refinement" }
];

export function ProgressStepper() {
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => (prev < 100 ? prev + 5 : 100));
    }, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate/10">
        <div
          className="h-full bg-gradient-to-r from-accent to-teal transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => {
          const stepProgress = (index + 1) * 25;
          const isActive = progress >= stepProgress;
          return (
            <div
              key={step.key}
              className={clsx(
                "rounded-2xl border p-4",
                isActive
                  ? "border-accent/40 bg-white"
                  : "border-slate/10 bg-white/70"
              )}
            >
              <p className="text-sm font-semibold text-ink">{step.label}</p>
              <p className="text-xs text-slate">
                {isActive ? "Complete" : "In progress"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-slate">Estimated time remaining: 3 minutes</p>
    </div>
  );
}
