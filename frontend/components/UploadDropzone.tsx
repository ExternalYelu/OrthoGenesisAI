"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import {
  JobPayload,
  UploadPayload,
  getJob,
  getJobStreamUrl,
  getModel,
  reconstruct,
  retryJob,
  uploadXrays
} from "@/lib/api";

type StageInfo = {
  label: string;
  description: string;
};

type ViewSlot = "ap" | "lateral" | "oblique";
type RenderMode = "2_5d" | "3d";

type FileQuality = {
  fingerprint: string;
  blurScore: number;
  contrastScore: number;
  duplicate: boolean;
  previewUrl?: string;
};

const SLOT_ORDER: ViewSlot[] = ["ap", "lateral", "oblique"];

const STAGE_MAP: Record<string, StageInfo> = {
  queued: { label: "Queued", description: "Waiting for an available reconstruction worker." },
  starting: { label: "Starting", description: "Initializing reconstruction context." },
  preprocessing: { label: "Preprocessing", description: "Normalizing contrast and reducing scan noise." },
  alignment: { label: "Alignment", description: "Aligning geometry across required views." },
  inference: { label: "Model Inference", description: "Running depth inference and bone extraction." },
  refinement: { label: "Mesh Refinement", description: "Smoothing, repairing, and validating mesh quality." },
  complete: { label: "Complete", description: "Reconstruction complete and ready for viewing." },
  failed: { label: "Failed", description: "Processing failed. Review the reason and retry." },
  retry_pending: { label: "Retrying", description: "Job scheduled for another reconstruction attempt." }
};

function inferView(filename: string): ViewSlot | "unknown" {
  const lower = filename.toLowerCase();
  if (lower.includes("ap") || lower.includes("anteroposterior")) return "ap";
  if (lower.includes("lat") || lower.includes("lateral")) return "lateral";
  if (lower.includes("obl") || lower.includes("oblique")) return "oblique";
  return "unknown";
}

async function analyzeImageFile(file: File): Promise<Omit<FileQuality, "duplicate">> {
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;

  if (!previewUrl) {
    return {
      fingerprint,
      blurScore: 0,
      contrastScore: 0
    };
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load preview image"));
    img.src = previewUrl;
  });

  const canvas = document.createElement("canvas");
  const maxSide = 256;
  const scale = Math.min(maxSide / image.width, maxSide / image.height, 1);
  canvas.width = Math.max(24, Math.floor(image.width * scale));
  canvas.height = Math.max(24, Math.floor(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    return {
      fingerprint,
      blurScore: 0,
      contrastScore: 0,
      previewUrl
    };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const luminance = new Float32Array(canvas.width * canvas.height);

  for (let i = 0; i < luminance.length; i += 1) {
    const offset = i * 4;
    luminance[i] =
      0.2126 * imageData[offset] +
      0.7152 * imageData[offset + 1] +
      0.0722 * imageData[offset + 2];
  }

  let mean = 0;
  for (let i = 0; i < luminance.length; i += 1) mean += luminance[i];
  mean /= luminance.length;

  let variance = 0;
  for (let i = 0; i < luminance.length; i += 1) {
    const delta = luminance[i] - mean;
    variance += delta * delta;
  }
  const contrastScore = Math.sqrt(variance / luminance.length) / 255;

  let edgeEnergy = 0;
  let edgeCount = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const idx = y * canvas.width + x;
      const gx = luminance[idx + 1] - luminance[idx - 1];
      const gy = luminance[idx + canvas.width] - luminance[idx - canvas.width];
      edgeEnergy += gx * gx + gy * gy;
      edgeCount += 1;
    }
  }
  const blurScore = Math.sqrt(edgeEnergy / Math.max(edgeCount, 1)) / 255;

  return {
    fingerprint,
    blurScore,
    contrastScore,
    previewUrl
  };
}

export function UploadDropzone() {
  const [viewFiles, setViewFiles] = useState<Record<ViewSlot, File | null>>({
    ap: null,
    lateral: null,
    oblique: null
  });
  const [renderMode, setRenderMode] = useState<RenderMode>("2_5d");
  const [title, setTitle] = useState("Case A");
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [modelId, setModelId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobPayload | null>(null);
  const [qualityMap, setQualityMap] = useState<Partial<Record<ViewSlot, FileQuality>>>({});
  const [uploaded2DImages, setUploaded2DImages] = useState<UploadPayload["xrays"]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);

  const closeStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      closeStream();
      Object.values(qualityMap).forEach((value) => {
        if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      });
    };
  }, [qualityMap]);

  const visibleSlots = useMemo<ViewSlot[]>(
    () => (renderMode === "3d" ? SLOT_ORDER : ["ap"]),
    [renderMode]
  );

  const selectedSlots = useMemo(
    () => visibleSlots.filter((slot) => Boolean(viewFiles[slot])),
    [viewFiles, visibleSlots]
  );

  const qualityWarnings = useMemo(() => {
    return visibleSlots.flatMap((slot) => {
      const quality = qualityMap[slot];
      const file = viewFiles[slot];
      if (!quality || !file) return [];
      const warnings: string[] = [];
      if (quality.duplicate) warnings.push(`${slot.toUpperCase()}: possible duplicate image`);
      if (quality.blurScore < 0.035) warnings.push(`${slot.toUpperCase()}: appears blurry`);
      if (quality.contrastScore < 0.12) warnings.push(`${slot.toUpperCase()}: low contrast`);
      return warnings;
    });
  }, [qualityMap, viewFiles, visibleSlots]);

  const missingViews = useMemo(
    () => (renderMode === "3d" ? SLOT_ORDER.filter((slot) => !viewFiles[slot]) : []),
    [viewFiles, renderMode]
  );

  const updateDuplicateFlags = (next: Partial<Record<ViewSlot, FileQuality>>) => {
    const fingerprints = SLOT_ORDER.map((slot) => next[slot]?.fingerprint).filter(
      (value): value is string => Boolean(value)
    );
    const duplicates = new Set(
      fingerprints.filter((fingerprint, index) => fingerprints.indexOf(fingerprint) !== index)
    );
    SLOT_ORDER.forEach((slot) => {
      const entry = next[slot];
      if (entry) entry.duplicate = duplicates.has(entry.fingerprint);
    });
  };

  const assignFileToSlot = async (slot: ViewSlot, file: File | null) => {
    setUploaded2DImages([]);
    const previous = qualityMap[slot];
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);

    setViewFiles((prev) => ({ ...prev, [slot]: file }));

    if (!file) {
      setQualityMap((prev) => {
        const next = { ...prev };
        delete next[slot];
        updateDuplicateFlags(next);
        return next;
      });
      return;
    }

    const analyzed = await analyzeImageFile(file);
    setQualityMap((prev) => {
      const next: Partial<Record<ViewSlot, FileQuality>> = {
        ...prev,
        [slot]: { ...analyzed, duplicate: false }
      };
      updateDuplicateFlags(next);
      return next;
    });
  };

  const onSlotChange = async (slot: ViewSlot, files: FileList | null) => {
    const file = files?.[0] ?? null;
    await assignFileToSlot(slot, file);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (event) => {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files || []);
    if (renderMode === "2_5d") {
      if (dropped[0]) {
        await assignFileToSlot("ap", dropped[0]);
      }
      return;
    }
    for (const file of dropped) {
      const inferred = inferView(file.name);
      if (inferred !== "unknown") {
        await assignFileToSlot(inferred, file);
        continue;
      }
      const emptySlot = SLOT_ORDER.find((slot) => !viewFiles[slot]);
      if (emptySlot) {
        await assignFileToSlot(emptySlot, file);
      }
    }
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
  };

  const startStream = (activeJobId: string) => {
    closeStream();
    const source = new EventSource(getJobStreamUrl(activeJobId));
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as JobPayload;
        setJobState(payload);
        const stage = STAGE_MAP[payload.stage]?.label || payload.stage;
        const eta = typeof payload.eta_seconds === "number" ? ` • ETA ${payload.eta_seconds}s` : "";
        setMessage(`${stage} (${payload.progress}%)${eta}`);
        if (
          payload.status === "succeeded" ||
          payload.status === "dead" ||
          payload.status === "failed"
        ) {
          source.close();
          eventSourceRef.current = null;
        }
      } catch {
        setMessage("Streaming update error; falling back to polling.");
      }
    };
    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
    };
    eventSourceRef.current = source;
  };

  const waitForCompletion = async (activeJobId: string) => {
    const timeoutAt = Date.now() + 180000;
    while (Date.now() < timeoutAt) {
      const job = await getJob(activeJobId);
      setJobState(job);
      if (job.status === "dead" || job.status === "failed") {
        throw new Error(job.error || "Reconstruction job failed.");
      }
      if (job.status === "succeeded") return;
      await new Promise((resolve) => setTimeout(resolve, 1250));
    }
    throw new Error("Reconstruction timed out.");
  };

  const handleUpload = async () => {
    const is3D = renderMode === "3d";
    const minimumRequired = is3D ? 3 : 1;
    if (selectedSlots.length < minimumRequired) {
      setStatus("error");
      setMessage(
        is3D
          ? "Please upload AP, lateral, and oblique X-rays before reconstruction."
          : "Please upload at least one X-ray for 2D rendering."
      );
      return;
    }

    const form = new FormData();
    form.append("title", title);
    if (patientId) form.append("patient_id", patientId);
    form.append("render_mode", is3D ? "3d" : "2d");

    selectedSlots.forEach((slot) => {
      const file = viewFiles[slot];
      if (file) form.append("files", file);
    });
    if (is3D) {
      form.append("views", selectedSlots.join(","));
    }

    try {
      setStatus("uploading");
      setMessage("Uploading files...");
      const upload = await uploadXrays(form);

      setUploaded2DImages(upload.xrays || []);
      setMessage("Queueing reconstruction...");
      const reconstruction = await reconstruct(upload.case_id);
      setModelId(reconstruction.id);

      const jobMatch =
        typeof reconstruction.notes === "string"
          ? reconstruction.notes.match(/job:([a-f0-9]+)/i)
          : null;
      const activeJobId = jobMatch?.[1];
      if (!activeJobId) {
        throw new Error("Failed to track reconstruction job.");
      }

      setJobId(activeJobId);
      startStream(activeJobId);
      await waitForCompletion(activeJobId);

      const updated = await getModel(reconstruction.id);
      if (updated.status !== "complete") {
        throw new Error("Reconstruction is still running, please refresh in a moment.");
      }

      setStatus("done");
      setMessage(
        is3D
          ? "Multi-view 3D reconstruction complete. Open the viewer to inspect the model."
          : "Single-view 2.5D reconstruction complete. Open the viewer to inspect the model."
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload or reconstruction failed.");
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;
    try {
      setStatus("uploading");
      setMessage("Retrying reconstruction...");
      await retryJob(jobId);
      startStream(jobId);
      await waitForCompletion(jobId);
      setStatus("done");
      setMessage("Retry succeeded. Reconstruction complete.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Retry failed.");
    }
  };

  const currentStage = jobState ? STAGE_MAP[jobState.stage] : null;
  const canRetry = Boolean(
    jobState && (jobState.status === "dead" || jobState.status === "failed")
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <label className="text-xs uppercase tracking-[0.3em] text-slate" htmlFor="case-title">
            Case
          </label>
          <input
            id="case-title"
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm text-ink"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)" }}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <label className="text-xs uppercase tracking-[0.3em] text-slate" htmlFor="patient-id">
            Patient ID
          </label>
          <input
            id="patient-id"
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm text-ink"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)" }}
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        <p className="text-xs uppercase tracking-[0.3em] text-slate">Render Mode</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
              renderMode === "2_5d"
                ? "bg-gradient-to-r from-accent to-bio text-white shadow-sm"
                : "border text-slate hover:text-ink"
            }`}
            style={renderMode !== "2_5d" ? { borderColor: "var(--color-border)", background: "var(--color-surface-muted)" } : undefined}
            type="button"
            onClick={() => {
              closeStream();
              setRenderMode("2_5d");
              setStatus("idle");
              setMessage("");
              setJobState(null);
              setJobId(null);
              setModelId(null);
            }}
          >
            Single X-ray 2.5D
          </button>
          <button
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
              renderMode === "3d"
                ? "bg-gradient-to-r from-accent to-bio text-white shadow-sm"
                : "border text-slate hover:text-ink"
            }`}
            style={renderMode !== "3d" ? { borderColor: "var(--color-border)", background: "var(--color-surface-muted)" } : undefined}
            type="button"
            onClick={() => {
              closeStream();
              setRenderMode("3d");
              setUploaded2DImages([]);
              setStatus("idle");
              setMessage("");
            }}
          >
            3D Reconstruction (AP/Lateral/Oblique)
          </button>
        </div>
      </div>

      <div
        className="rounded-3xl border-2 border-dashed p-8 text-center transition-colors"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-ink">
          {renderMode === "3d"
            ? "Drop files to auto-place by filename (AP/Lateral/Oblique)"
            : "Drop one X-ray for single-view 2.5D reconstruction"}
        </p>
        <p className="mt-1 text-xs text-slate">
          {renderMode === "3d"
            ? "Or upload each required view directly in the boxes below."
            : "This mode creates a height-based 2.5D mesh from one image."}
        </p>
      </div>

      <div className={`grid gap-4 ${renderMode === "3d" ? "md:grid-cols-3" : "md:grid-cols-1"}`}>
        {visibleSlots.map((slot) => {
          const file = viewFiles[slot];
          const quality = qualityMap[slot];
          const ready = Boolean(file);
          return (
            <div
              key={slot}
              className={`rounded-2xl border p-4 transition-colors ${
                ready ? "border-bio/30 bg-bio/[0.04]" : "border-warning/30 bg-warning/[0.04]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                {renderMode === "3d" ? `${slot} view` : "primary view"}
              </p>
              <input
                className="mt-3 w-full text-xs text-ink"
                type="file"
                accept=".png,.jpg,.jpeg,.dcm,image/png,image/jpeg,application/dicom"
                onChange={(event) => onSlotChange(slot, event.target.files)}
              />

              <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                {file ? (
                  <div className="space-y-2">
                    <p className="truncate text-xs font-semibold text-ink">{file.name}</p>
                    <p className="text-[11px] text-slate">{(file.size / 1024).toFixed(1)} KB</p>
                    {quality?.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={quality.previewUrl}
                        alt={`${slot} preview`}
                        className="h-20 w-full rounded-lg border object-cover"
                        style={{ borderColor: "var(--color-border)" }}
                      />
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-lg border text-[11px] text-slate" style={{ borderColor: "var(--color-border)" }}>
                        DICOM selected
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full px-2 py-0.5 text-slate" style={{ background: "var(--color-surface-muted)" }}>
                        Blur {Math.round((quality?.blurScore ?? 0) * 100)}%
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-slate" style={{ background: "var(--color-surface-muted)" }}>
                        Contrast {Math.round((quality?.contrastScore ?? 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-warning">No file added yet.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        <p className="text-sm font-semibold text-ink">Pre-submit checks</p>
        <ul className="mt-2 space-y-1 text-xs text-slate">
          <li>
            Files selected:{" "}
            <span className="font-semibold text-ink">
              {selectedSlots.length}/{renderMode === "3d" ? 3 : 1}
            </span>
          </li>
          <li>
            Quality warnings: <span className={qualityWarnings.length ? "text-warning" : "text-bio"}>{qualityWarnings.length}</span>
          </li>
        </ul>
        {missingViews.length > 0 ? (
          <p className="mt-2 text-[11px] text-warning">
            Missing recommended views: {missingViews.map((view) => view.toUpperCase()).join(", ")}
          </p>
        ) : null}
        {qualityWarnings.length > 0 ? (
          <div className="mt-2 rounded-xl border border-warning/20 bg-warning/[0.06] p-3 text-[11px] text-warning">
            {qualityWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </div>

      {renderMode === "3d" && jobState ? (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{currentStage?.label || jobState.stage}</p>
            <p className="text-xs text-slate">{jobState.progress}%</p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-muted)" }}>
            <div
              className="h-2 rounded-full bg-gradient-to-r from-accent to-bio transition-all duration-300"
              style={{ width: `${jobState.progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate">{currentStage?.description || "Processing update received."}</p>
          {jobState.error ? <p className="mt-2 text-xs text-danger">Failure reason: {jobState.error}</p> : null}
        </div>
      ) : null}

      {renderMode === "2_5d" && uploaded2DImages.length > 0 ? (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <p className="text-sm font-semibold text-ink">Uploaded X-ray Preview</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {uploaded2DImages.map((xray) => (
              <div key={xray.id} className="rounded-xl border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate">{xray.view}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={xray.preview_url}
                  alt={`Uploaded ${xray.view}`}
                  className="mt-2 h-48 w-full rounded-lg border object-contain"
                  style={{ borderColor: "var(--color-border)" }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-xs ${status === "error" ? "text-danger" : "text-slate"}`}>{message}</p>
      ) : null}

      {/* ── Model ID result card (shown for both modes) ── */}
      {modelId && status === "done" ? (
        <div className="rounded-2xl border-2 border-bio/30 bg-gradient-to-r from-bio/5 to-accent/5 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bio/10 text-bio">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-ink">Reconstruction Complete</p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate">Model ID:</span>
                <code className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-1.5 font-mono text-lg font-bold text-accent">{modelId}</code>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-surface-muted)] p-1.5 text-slate transition-colors hover:text-ink"
                  onClick={() => navigator.clipboard?.writeText(String(modelId))}
                  aria-label="Copy Model ID"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate">
                Go to the{" "}
                <a href={`/viewer?model_id=${modelId}`} className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                  3D Viewer →
                </a>
                {" "}and enter this ID to inspect your model.
              </p>
            </div>
          </div>
        </div>
      ) : modelId && status !== "done" ? (
        <p className="text-xs text-slate">
          Model ID: <span className="font-mono font-semibold text-ink">{modelId}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          label={
            status === "uploading"
              ? "Processing..."
              : renderMode === "3d"
                ? "Upload & Reconstruct (3D)"
                : "Upload & Reconstruct (2.5D)"
          }
          onClick={handleUpload}
        />
        {canRetry ? <Button label="Retry Failed Job" variant="outline" onClick={handleRetry} /> : null}
      </div>
    </div>
  );
}
