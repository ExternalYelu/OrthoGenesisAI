"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import {
  JobPayload,
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
  const [title, setTitle] = useState("Case A");
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [modelId, setModelId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobPayload | null>(null);
  const [qualityMap, setQualityMap] = useState<Partial<Record<ViewSlot, FileQuality>>>({});

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

  const selectedSlots = useMemo(
    () => SLOT_ORDER.filter((slot) => Boolean(viewFiles[slot])),
    [viewFiles]
  );

  const qualityWarnings = useMemo(() => {
    return SLOT_ORDER.flatMap((slot) => {
      const quality = qualityMap[slot];
      const file = viewFiles[slot];
      if (!quality || !file) return [];
      const warnings: string[] = [];
      if (quality.duplicate) warnings.push(`${slot.toUpperCase()}: possible duplicate image`);
      if (quality.blurScore < 0.035) warnings.push(`${slot.toUpperCase()}: appears blurry`);
      if (quality.contrastScore < 0.12) warnings.push(`${slot.toUpperCase()}: low contrast`);
      return warnings;
    });
  }, [qualityMap, viewFiles]);

  const missingViews = useMemo(
    () => SLOT_ORDER.filter((slot) => !viewFiles[slot]),
    [viewFiles]
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
    if (selectedSlots.length < 1) {
      setStatus("error");
      setMessage("Upload at least one X-ray file.");
      return;
    }

    const form = new FormData();
    form.append("title", title);
    if (patientId) form.append("patient_id", patientId);

    selectedSlots.forEach((slot) => {
      const file = viewFiles[slot];
      if (file) form.append("files", file);
    });
    form.append("views", selectedSlots.join(","));

    try {
      setStatus("uploading");
      setMessage("Uploading files...");
      const upload = await uploadXrays(form);
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
      setMessage("Reconstruction complete. Open the viewer to inspect the model.");
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
  const canRetry = Boolean(jobState && (jobState.status === "dead" || jobState.status === "failed"));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <label className="text-xs uppercase tracking-[0.3em] text-slate/50" htmlFor="case-title">
            Case
          </label>
          <input
            id="case-title"
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <label className="text-xs uppercase tracking-[0.3em] text-slate/50" htmlFor="patient-id">
            Patient ID
          </label>
          <input
            id="patient-id"
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
          />
        </div>
      </div>

      <div
        className="rounded-3xl border border-dashed border-slate/30 bg-white/70 p-6 text-center"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <p className="text-sm font-semibold text-ink">Drop files to auto-place by filename (AP/Lateral/Oblique)</p>
        <p className="text-xs text-slate">Or upload each view directly in the boxes below.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SLOT_ORDER.map((slot) => {
          const file = viewFiles[slot];
          const quality = qualityMap[slot];
          const ready = Boolean(file);
          return (
            <div
              key={slot}
              className={`rounded-2xl border p-4 ${
                ready ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{slot} view</p>
              <input
                className="mt-3 w-full text-xs"
                type="file"
                accept=".png,.jpg,.jpeg,.dcm,image/png,image/jpeg,application/dicom"
                onChange={(event) => onSlotChange(slot, event.target.files)}
              />

              <div className="mt-3 rounded-xl border border-slate/10 bg-white p-3">
                {file ? (
                  <div className="space-y-2">
                    <p className="truncate text-xs font-semibold text-ink">{file.name}</p>
                    <p className="text-[11px] text-slate">{(file.size / 1024).toFixed(1)} KB</p>
                    {quality?.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={quality.previewUrl}
                        alt={`${slot} preview`}
                        className="h-20 w-full rounded-lg border border-slate/20 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-lg border border-slate/20 text-[11px] text-slate">
                        DICOM selected
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate">
                        Blur {Math.round((quality?.blurScore ?? 0) * 100)}%
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate">
                        Contrast {Math.round((quality?.contrastScore ?? 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700">No file added yet.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ink">Pre-submit checks</p>
        <ul className="mt-2 space-y-1 text-xs text-slate">
          <li>
            View slots filled: <span className="font-semibold text-ink">{selectedSlots.length}/3</span>
          </li>
          <li>
            Quality warnings: <span className={qualityWarnings.length ? "text-amber-700" : "text-emerald-700"}>{qualityWarnings.length}</span>
          </li>
        </ul>
        {missingViews.length > 0 ? (
          <p className="mt-2 text-[11px] text-amber-700">
            Missing recommended views: {missingViews.map((view) => view.toUpperCase()).join(", ")}
          </p>
        ) : null}
        {qualityWarnings.length > 0 ? (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            {qualityWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </div>

      {jobState ? (
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{currentStage?.label || jobState.stage}</p>
            <p className="text-xs text-slate">{jobState.progress}%</p>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-[#1f6feb] transition-all duration-300"
              style={{ width: `${jobState.progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate">{currentStage?.description || "Processing update received."}</p>
          {jobState.error ? <p className="mt-2 text-xs text-red-600">Failure reason: {jobState.error}</p> : null}
        </div>
      ) : null}

      {message ? (
        <p className={`text-xs ${status === "error" ? "text-red-600" : "text-slate"}`}>{message}</p>
      ) : null}

      {modelId ? (
        <p className="text-xs text-slate">
          Model ID: <span className="font-semibold text-ink">{modelId}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button label={status === "uploading" ? "Processing..." : "Upload & Reconstruct"} onClick={handleUpload} />
        {canRetry ? <Button label="Retry Failed Job" variant="outline" onClick={handleRetry} /> : null}
      </div>
    </div>
  );
}
