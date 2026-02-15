"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { uploadXrays } from "@/lib/api";
import { getToken } from "@/lib/auth";

const requiredViews = ["AP", "Lateral", "Oblique"];

export function UploadDropzone() {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("Case A");
  const [patientId, setPatientId] = useState("");
  const [views, setViews] = useState("ap,lateral,oblique");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(Array.from(newFiles));
  };

  useEffect(() => {
    const stored = getToken();
    if (stored) setToken(stored);
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) {
      setStatus("error");
      setMessage("Select files before uploading.");
      return;
    }

    const form = new FormData();
    form.append("title", title);
    if (patientId) form.append("patient_id", patientId);
    form.append("views", views);
    files.forEach((file) => form.append("files", file));

    try {
      setStatus("uploading");
      setMessage("Uploading...");
      await uploadXrays(form, token || undefined);
      setStatus("done");
      setMessage("Upload complete. Ready for reconstruction.");
    } catch (error) {
      setStatus("error");
      setMessage("Upload failed. Check token and file validity.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
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
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Views</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={views}
            onChange={(event) => setViews(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-slate/30 bg-white/70 p-8 text-center">
        <p className="text-sm font-semibold text-ink">Drag and drop X-rays</p>
        <p className="text-xs text-slate">
          DICOM, PNG, JPEG. Minimum 3 angles required.
        </p>
        <input
          className="mt-4 w-full text-sm"
          type="file"
          multiple
          accept=".dcm,image/png,image/jpeg"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate/50">
          Required Views
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {requiredViews.map((view) => (
            <span
              key={view}
              className="rounded-full bg-mist px-3 py-1 text-xs font-medium text-slate"
            >
              {view}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Auth Token</p>
        <input
          className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Bearer token"
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

      <div className="flex flex-wrap items-center gap-4">
        <Button
          label={status === "uploading" ? "Uploading..." : "Validate & Upload"}
          onClick={handleUpload}
        />
      </div>
    </div>
  );
}
