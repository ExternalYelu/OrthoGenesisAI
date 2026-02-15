"use client";

import { useEffect, useState } from "react";
import { exportModel } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Button } from "./Button";

const formats = [
  { name: "STL", desc: "3D printing" },
  { name: "OBJ", desc: "Simulation & CAD" },
  { name: "GLTF", desc: "Web sharing" }
];

export function ExportPanel() {
  const [modelId, setModelId] = useState("1");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const stored = getToken();
    if (stored) setToken(stored);
  }, []);

  const handleExport = async (format: string) => {
    try {
      setStatus(`Exporting ${format}...`);
      const response = await exportModel(Number(modelId), format.toLowerCase(), token || undefined);
      window.open(response.download_url, "_blank");
      setStatus("Export ready. Download opened.");
    } catch (error) {
      setStatus("Export failed. Check token and model id.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Model ID</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Auth Token</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={token}
            onChange={(event) => setToken(event.target.value)}
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
