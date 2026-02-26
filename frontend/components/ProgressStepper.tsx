"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { JobPayload, getJob, getJobStreamUrl, retryJob } from "@/lib/api";
import { Button } from "./Button";

const steps = [
  { key: "preprocessing", label: "Preprocessing", cutoff: 15 },
  { key: "alignment", label: "Image Alignment", cutoff: 35 },
  { key: "inference", label: "Model Inference", cutoff: 65 },
  { key: "refinement", label: "Mesh Refinement", cutoff: 85 },
  { key: "complete", label: "Ready", cutoff: 100 }
];

export function ProgressStepper() {
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<JobPayload | null>(null);
  const [message, setMessage] = useState("Enter a job ID from upload to track progress.");
  const [status, setStatus] = useState<"idle" | "tracking" | "error">("idle");
  const sourceRef = useRef<EventSource | null>(null);

  const close = () => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  };

  useEffect(() => () => close(), []);

  const handleTrack = async () => {
    if (!jobId.trim()) return;
    close();
    setStatus("tracking");
    setMessage("Connecting to live status stream...");

    try {
      const initial = await getJob(jobId.trim());
      setJob(initial);
    } catch {
      setStatus("error");
      setMessage("Job not found.");
      return;
    }

    const source = new EventSource(getJobStreamUrl(jobId.trim()));
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as JobPayload;
        setJob(payload);
        const eta = typeof payload.eta_seconds === "number" ? ` • ETA ${payload.eta_seconds}s` : "";
        setMessage(`${payload.stage} (${payload.progress}%)${eta}`);
        if (payload.status === "succeeded" || payload.status === "failed" || payload.status === "dead") {
          source.close();
          sourceRef.current = null;
          setStatus(payload.status === "succeeded" ? "idle" : "error");
        }
      } catch {
        setStatus("error");
        setMessage("Failed to parse live status payload.");
      }
    };
    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setStatus("error");
      setMessage("Stream disconnected. You can reconnect.");
    };
    sourceRef.current = source;
  };

  const handleRetry = async () => {
    if (!jobId.trim()) return;
    try {
      setStatus("tracking");
      setMessage("Retrying failed job...");
      await retryJob(jobId.trim());
      await handleTrack();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Retry failed.");
    }
  };

  const progress = job?.progress ?? 0;
  const canRetry = job?.status === "failed" || job?.status === "dead";
  const failureReason = job?.error;

  const stagePercent = useMemo(() => {
    const map: Record<string, number> = {};
    steps.forEach((step) => {
      map[step.key] = progress >= step.cutoff ? 100 : Math.max(0, ((progress - (step.cutoff - 20)) / 20) * 100);
    });
    return map;
  }, [progress]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="text-xs uppercase tracking-[0.28em] text-slate/60" htmlFor="job-id-input">
            Job ID
          </label>
          <input
            id="job-id-input"
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          />
        </div>
        <Button label="Track Job" onClick={handleTrack} />
        {canRetry ? <Button label="Retry" variant="outline" onClick={handleRetry} /> : null}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate/10">
        <div
          className="h-full bg-gradient-to-r from-[#1158cc] to-[#0ea5a5] transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {steps.map((step) => {
          const stepProgress = stagePercent[step.key];
          const isActive = stepProgress > 0;
          const isCurrent = job?.stage === step.key;
          return (
            <div
              key={step.key}
              className={clsx(
                "rounded-2xl border p-4",
                isActive ? "border-[#76a6ff] bg-white" : "border-slate/10 bg-white/70"
              )}
            >
              <p className="text-sm font-semibold text-ink">
                {step.label}
                {isCurrent ? <span className="ml-2 text-xs text-[#1158cc]">active</span> : null}
              </p>
              <p className="text-xs text-slate">
                {isActive ? `${Math.round(stepProgress)}%` : "pending"}
              </p>
            </div>
          );
        })}
      </div>

      <p className={clsx("text-sm", status === "error" ? "text-red-600" : "text-slate")}>{message}</p>
      {failureReason ? <p className="text-xs text-red-600">Failure reason: {failureReason}</p> : null}
    </div>
  );
}
