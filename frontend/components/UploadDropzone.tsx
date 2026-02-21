"use client";

import { useState } from "react";
import { Button } from "./Button";
import { reconstruct, uploadXrays } from "@/lib/api";

export function UploadDropzone() {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("Case A");
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [modelId, setModelId] = useState<number | null>(null);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(Array.from(newFiles));
  };

  const handleUpload = async () => {
    if (files.length !== 1) {
      setStatus("error");
      setMessage("Select exactly one X-ray image.");
      return;
    }

    const form = new FormData();
    form.append("title", title);
    if (patientId) form.append("patient_id", patientId);
    files.forEach((file) => form.append("files", file));

    try {
      setStatus("uploading");
      setMessage("Uploading...");
      const upload = await uploadXrays(form);
      setMessage("Reconstructing...");
      const reconstruction = await reconstruct(upload.case_id);
      setModelId(reconstruction.id);
      setStatus("done");
      setMessage("Reconstruction complete. Open the viewer to inspect the model.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload or reconstruction failed. Try another image.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Case</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Patient ID</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-slate/30 bg-white/70 p-8 text-center">
        <p className="text-sm font-semibold text-ink">Drag and drop X-rays</p>
        <p className="text-xs text-slate">
          PNG or JPEG. Single image test mode.
        </p>
        <input
          className="mt-4 w-full text-sm"
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ink">Selected files</p>
        <p className="text-xs text-slate">
          {files.length > 0
            ? `${files.length} files ready for validation.`
            : "No files selected yet."}
        </p>
      </div>

      {message ? (
        <p className={`text-xs ${status === "error" ? "text-red-600" : "text-slate"}`}>
          {message}
        </p>
      ) : null}

      {modelId ? (
        <p className="text-xs text-slate">
          Model ID: <span className="font-semibold text-ink">{modelId}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          label={status === "uploading" ? "Processing..." : "Upload & Reconstruct"}
          onClick={handleUpload}
        />
      </div>
    </div>
  );
}
