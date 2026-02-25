"use client";

import { useState } from "react";
import { exportModel, getJob } from "@/lib/api";
import { Button } from "./Button";

const formats = [
  { name: "STL", desc: "3D printing" },
  { name: "OBJ", desc: "Simulation & CAD" },
  { name: "GLTF", desc: "Web sharing" }
];

export function ExportPanel() {
  const [modelId, setModelId] = useState("1");
  const [status, setStatus] = useState("");

  const handleExport = async (format: string) => {
    try {
      setStatus(`Exporting ${format}...`);
      const response = await exportModel(Number(modelId), format.toLowerCase(), undefined, true);
      const jobMatch = typeof response.download_url === "string" ? response.download_url.match(/\/jobs\/([a-f0-9]+)/i) : null;
      if (!jobMatch) {
        window.open(response.download_url, "_blank");
        setStatus("Export ready. Download opened.");
        return;
      }

      const jobId = jobMatch[1];
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        const job = await getJob(jobId);
        if (job.status === "dead" || job.status === "failed") {
          throw new Error(job.error || "Export job failed.");
        }
        if (job.status === "succeeded") {
          const url = job.result_json?.download_url;
          if (!url) throw new Error("Export completed but download URL was missing.");
          const resolved = url.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || "/api"}${url}` : url;
          window.open(resolved, "_blank");
          setStatus("Export ready. Download opened.");
          return;
        }
        setStatus(`Exporting ${format}... (${job.attempts}/${job.max_attempts})`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      throw new Error("Export timed out. Please retry.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed. Check model id.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-1">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Model ID</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {formats.map((format) => (
          <div key={format.name} className="rounded-2xl border border-slate/10 bg-white/80 p-4">
            <p className="text-lg font-semibold text-ink">{format.name}</p>
            <p className="mt-1 text-xs text-slate">{format.desc}</p>
            <Button
              className="mt-4 w-full"
              label={`Download ${format.name}`}
              onClick={() => handleExport(format.name)}
            />
          </div>
        ))}
      </div>

      {status ? <p className="text-xs text-slate">{status}</p> : null}
    </div>
  );
}
